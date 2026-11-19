import {
  IdempotencyConflictError,
  IdempotencyKeySchema,
  ValidationError,
  newId,
  type UsdcMicros,
} from '@arcuex/domain';
import type { InsuranceRepository } from '@arcuex/persistence';
import { createHash } from 'node:crypto';
import {
  assertClaimsRole,
  claimsActorId,
  normalizeWallet,
  type ClaimsPrincipal,
} from './claims-auth';
import {
  ClaimsCaseSchema,
  buildClaimsCaseEvent,
  createDraftClaimsCase,
  transitionClaimsCase,
  type AdjudicationBinding,
  type ClaimsCase,
  type ClaimsCaseEvent,
  type CreateDraftClaimsCaseInput,
  type EvidenceAuthenticity,
  type CoverageDetermination,
} from './claims-case';
import { deriveCanonicalClaimsLossKey } from './canonical-loss-key';
import { intakeObservedEvent } from './claims-pipeline';
import { checkClaimAdjudication, type ContractualReview } from './claim-adjudication-checks';
import { computeNetLossPayable } from './net-loss';

function toCase(row: NonNullable<ReturnType<InsuranceRepository['getClaimsCase']>>): ClaimsCase {
  return ClaimsCaseSchema.parse(row);
}

function jsonSafe(payload: unknown): string {
  return JSON.stringify(payload, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

function persistNewCase(repo: InsuranceRepository, c: ClaimsCase): void {
  repo.saveClaimsCase(c);
}

function persistUpdatedCase(
  repo: InsuranceRepository,
  from: ClaimsCase,
  to: ClaimsCase,
): ClaimsCase {
  const next = ClaimsCaseSchema.parse({
    ...to,
    rowVersion: from.rowVersion + 1,
  });
  const ok = repo.updateClaimsCaseOptimistic(next, from.rowVersion);
  if (!ok) {
    throw new ValidationError('ClaimsCase concurrency conflict — reload and retry');
  }
  return next;
}

function persistTransition(
  repo: InsuranceRepository,
  from: ClaimsCase,
  to: ClaimsCase,
  actor: string,
  reasonCode: string,
  payload: unknown = {},
): { case: ClaimsCase; event: ClaimsCaseEvent } {
  const saved = persistUpdatedCase(repo, from, to);
  const event = buildClaimsCaseEvent(from, saved, actor, reasonCode, payload);
  repo.appendClaimsCaseEvent(event);
  return { case: saved, event };
}

function remainInReview(
  repo: InsuranceRepository,
  current: ClaimsCase,
  actor: string,
  reasonCode: string,
  patch: Parameters<typeof transitionClaimsCase>[1]['patch'],
): ClaimsCase {
  const now = new Date().toISOString();
  const next = ClaimsCaseSchema.parse({
    ...current,
    ...patch,
    status: 'REVIEW',
    settlementAuthorization: 'none',
    payableMicros: null,
    reviewReasonCode: patch?.reviewReasonCode ?? reasonCode,
    updatedAt: now,
  });
  const saved = persistUpdatedCase(repo, current, next);
  repo.appendClaimsCaseEvent({
    id: newId(),
    caseId: current.id,
    fromStatus: current.status,
    toStatus: 'REVIEW',
    actor,
    reasonCode,
    payloadJson: jsonSafe(patch ?? {}),
    createdAt: now,
  });
  return saved;
}

function computeEvidenceRoot(manifests: Array<{ rawEvidenceDigest: string }>): string {
  const digests = manifests.map((m) => m.rawEvidenceDigest).sort();
  return `sha256:${createHash('sha256').update(digests.join('|')).digest('hex')}`;
}

export function canAccessClaimsPolicy(
  repo: InsuranceRepository,
  principal: ClaimsPrincipal,
  policyId: string,
): boolean {
  const context = repo.claimsPolicyContext(policyId);
  if (!context) return false;
  if (principal.role !== 'claimant')
    return ['reviewer', 'authority', 'system'].includes(principal.role);
  if (principal.agentId && principal.walletAddress) {
    const policy = repo.getProcurementPolicy(policyId);
    const agent = repo.getProcurementAgent(principal.agentId);
    if (
      policy &&
      policy.terms.agentId === agent?.id &&
      agent?.id === principal.agentId &&
      agent.owner.toLowerCase() === policy.terms.owner.toLowerCase() &&
      agent.signer.toLowerCase() === normalizeWallet(principal.walletAddress)
    )
      return true;
  }
  if (principal.walletAddress && context.owner === normalizeWallet(principal.walletAddress))
    return true;
  return (
    context.source === 'legacy' &&
    !!principal.policyholderId &&
    principal.policyholderId === context.policyholderId
  );
}
export function assertClaimsCaseAccess(
  repo: InsuranceRepository,
  principal: ClaimsPrincipal,
  c: ClaimsCase,
): void {
  if (!canAccessClaimsPolicy(repo, principal, c.policyId))
    throw new ValidationError('ClaimsCase not found or not owned by authenticated wallet');
}
function assertPolicyOwnership(
  repo: InsuranceRepository,
  principal: ClaimsPrincipal,
  policyId: string,
) {
  const policy = repo.claimsPolicyContext(policyId);
  if (!policy || !policy.confirmed)
    throw new ValidationError('ClaimsCase requires an active or bound policy');
  if (
    !['claimant', 'system'].includes(principal.role) ||
    !canAccessClaimsPolicy(repo, principal, policyId)
  )
    throw new ValidationError(
      'Claimant is not the policyholder or authorized agent for this policy',
    );
  if (!policy.beneficiary)
    throw new ValidationError('Policyholder wallet required for settlement binding');
  return { policy, payoutTo: normalizeWallet(policy.beneficiary) };
}
/** Atomic intake into the existing ClaimsCase engine. No copied policy or exposure model. */
export function intakeClaimsCase(
  repo: InsuranceRepository,
  input: CreateDraftClaimsCaseInput & { observedEventRef: string; observedAt: string },
  principal: ClaimsPrincipal,
): ClaimsCase {
  return repo.runInTransaction(() => {
    assertClaimsRole(principal, ['claimant', 'system']);
    const { policy } = assertPolicyOwnership(repo, principal, input.policyId);
    if (!policy.exposures.some((e) => e.id === input.exposureId))
      throw new ValidationError('Unknown policy exposure');
    const at = Date.parse(input.observedAt) / 1000;
    if (
      !Number.isFinite(at) ||
      at < policy.effectiveAt ||
      at > policy.expiresAt ||
      at > Date.now() / 1000
    )
      throw new ValidationError(
        'Incident must occur within the bound coverage window and cannot be in the future',
      );
    if (!input.observedEventRef.trim() || input.observedEventRef.length > 240)
      throw new ValidationError('Canonical observed event reference required');
    const existing = repo.getClaimsCaseByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (
        existing.policyId !== input.policyId ||
        existing.exposureId !== input.exposureId ||
        repo.getIncident(existing.incidentId ?? '')?.observedEventRef !==
          input.observedEventRef.trim()
      )
        throw new IdempotencyConflictError(
          'Claims intake key reused with different policy/exposure/event',
        );
      return getClaimsCase(repo, existing.id)!;
    }
    const event = {
      policyId: input.policyId,
      exposureId: input.exposureId,
      observedEventRef: input.observedEventRef.trim(),
      observedAt: input.observedAt,
      source: 'claims-case-intake',
    };
    const incident =
      policy.source === 'procurement'
        ? repo.procurementIncident(event)
        : (repo.canonicalLegacyIncident(input.policyId, input.exposureId, event.observedEventRef) ??
          intakeObservedEvent(repo, {
            ...event,
            idempotencyKey: `incident:${input.idempotencyKey}`,
          }));
    const opened = openClaimsCase(
      repo,
      { ...input, incidentId: incident.id, syntheticDemo: policy.synthetic || input.syntheticDemo },
      principal,
    );
    const submitted = submitClaimsCase(repo, { caseId: opened.id }, principal);
    return beginEvidenceCollection(
      repo,
      { caseId: submitted.id },
      { role: 'system', subject: 'intake' },
    );
  });
}

export function getClaimsCase(repo: InsuranceRepository, id: string): ClaimsCase | null {
  const row = repo.getClaimsCase(id);
  return row ? toCase(row) : null;
}

export function listClaimsCases(
  repo: InsuranceRepository,
  opts?: { limit?: number; status?: string },
): ClaimsCase[] {
  return repo.listClaimsCases(opts?.limit ?? 50, opts?.status).map(toCase);
}

export function listClaimsCaseTimeline(
  repo: InsuranceRepository,
  caseId: string,
): ClaimsCaseEvent[] {
  return repo.listClaimsCaseEvents(caseId).map((e) => ({
    id: e.id,
    caseId: e.caseId,
    fromStatus: e.fromStatus as ClaimsCaseEvent['fromStatus'],
    toStatus: e.toStatus as ClaimsCaseEvent['toStatus'],
    actor: e.actor,
    reasonCode: e.reasonCode,
    payloadJson: e.payloadJson,
    createdAt: e.createdAt,
  }));
}

export function openClaimsCase(
  repo: InsuranceRepository,
  input: CreateDraftClaimsCaseInput & {
    incidentId?: string | null;
  },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['claimant', 'system']);
  const key = IdempotencyKeySchema.parse(input.idempotencyKey);
  assertPolicyOwnership(repo, principal, input.policyId);
  const actor = claimsActorId(principal);

  return repo.runInTransaction(() => {
    const existing = repo.getClaimsCaseByIdempotencyKey(key);
    if (existing) {
      const same =
        existing.policyId === input.policyId &&
        existing.exposureId === input.exposureId &&
        existing.claimantRef === input.claimantRef;
      if (!same) {
        throw new IdempotencyConflictError(
          `ClaimsCase key ${key} reused with different policy/exposure/claimant`,
        );
      }
      return toCase(existing);
    }

    const { policy, payoutTo } = assertPolicyOwnership(repo, principal, input.policyId);
    const exposures = policy.exposures;
    const exposure = exposures.find((e) => e.id === input.exposureId);
    if (!exposure) {
      throw new ValidationError('ClaimsCase requires a registered exposure on the policy');
    }

    if (
      input.incidentId &&
      !repo.incidentMatchesPolicy(input.incidentId, input.policyId, input.exposureId)
    )
      throw new ValidationError('Incident does not belong to policy/exposure');
    let draft = createDraftClaimsCase({
      ...input,
      syntheticDemo: policy.synthetic || input.syntheticDemo,
      idempotencyKey: key,
      actor,
    });
    draft = {
      ...draft,
      incidentId: input.incidentId ?? null,
      remainingLimitMicros: exposure.limitMicros,
      lossCapMicros: policy.limitMicros,
      deductibleMicros: policy.deductibleMicros,
      payoutTo,
    };
    persistNewCase(repo, draft);
    repo.insertAudit('claims_case', draft.id, 'claims_case.opened', {
      syntheticDemo: draft.syntheticDemo,
      actor,
      role: principal.role,
    });
    return draft;
  });
}

export function submitClaimsCase(
  repo: InsuranceRepository,
  input: { caseId: string; reasonCode?: string },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['claimant', 'system']);
  const actor = claimsActorId(principal);
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    const next = transitionClaimsCase(current, {
      to: 'SUBMITTED',
      actor,
      reasonCode: input.reasonCode ?? 'CASE_SUBMITTED',
    });
    return persistTransition(repo, current, next, actor, input.reasonCode ?? 'CASE_SUBMITTED').case;
  });
}

export function beginEvidenceCollection(
  repo: InsuranceRepository,
  input: { caseId: string },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['claimant', 'system', 'reviewer']);
  const actor = claimsActorId(principal);
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    const next = transitionClaimsCase(current, {
      to: 'COLLECTING_EVIDENCE',
      actor,
      reasonCode: 'EVIDENCE_COLLECTION_STARTED',
    });
    return persistTransition(repo, current, next, actor, 'EVIDENCE_COLLECTION_STARTED').case;
  });
}

export type EvidenceManifestInput = {
  caseId: string;
  source: string;
  chain?: string | null;
  blockHash?: string | null;
  transactionHash?: string | null;
  provenance: string;
  rawEvidence: string;
  verificationMethod: string;
  sourceReliability: string;
  syntheticFixture: boolean;
};

export function attachEvidenceManifest(
  repo: InsuranceRepository,
  input: EvidenceManifestInput,
  principal: ClaimsPrincipal,
): { case: ClaimsCase; inserted: boolean; digest: string } {
  assertClaimsRole(principal, ['claimant', 'system', 'reviewer']);
  const digest = `sha256:${createHash('sha256').update(input.rawEvidence).digest('hex')}`;
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    if (
      current.status !== 'COLLECTING_EVIDENCE' &&
      current.status !== 'INVESTIGATING' &&
      current.status !== 'REVIEW'
    ) {
      throw new ValidationError(
        `Evidence can only be attached in COLLECTING_EVIDENCE|INVESTIGATING|REVIEW (was ${current.status})`,
      );
    }

    const { inserted } = repo.saveEvidenceManifest({
      id: newId(),
      caseId: current.id,
      source: input.source,
      chain: input.chain ?? null,
      blockHash: input.blockHash ?? null,
      transactionHash: input.transactionHash ?? null,
      provenance: input.provenance,
      rawEvidenceDigest: digest,
      verificationMethod: input.verificationMethod,
      sourceReliability: input.sourceReliability,
      syntheticFixture: input.syntheticFixture,
      createdAt: new Date().toISOString(),
    });

    let authenticity: EvidenceAuthenticity = current.evidenceAuthenticity;
    if (input.syntheticFixture) {
      authenticity = 'synthetic_fixture';
    } else if (
      input.verificationMethod === 'independent_chain_verify' &&
      principal.role !== 'claimant'
    ) {
      authenticity = 'verified_independent';
    }

    if (authenticity !== current.evidenceAuthenticity) {
      const patched = ClaimsCaseSchema.parse({
        ...current,
        evidenceAuthenticity: authenticity,
        updatedAt: new Date().toISOString(),
      });
      return {
        case: persistUpdatedCase(repo, current, patched),
        inserted,
        digest,
      };
    }
    return { case: current, inserted, digest };
  });
}

export function completeEvidenceOrReview(
  repo: InsuranceRepository,
  input: {
    caseId: string;
    evidenceComplete: boolean;
  },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['claimant', 'system', 'reviewer']);
  const actor = claimsActorId(principal);
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    // Claimants may add evidence while a reviewer resolves REVIEW, but cannot
    // use the completion endpoint to bypass reviewer-only reopening.
    if (current.status === 'REVIEW' && principal.role === 'claimant') return current;
    if (current.status === 'INVESTIGATING' && input.evidenceComplete) return current;
    const manifests = repo.listEvidenceManifests(current.id);
    if (!input.evidenceComplete || manifests.length === 0) {
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor,
        reasonCode: 'INCOMPLETE_EVIDENCE',
        patch: {
          coverageDetermination: 'review_required',
          reviewReasonCode: 'INCOMPLETE_EVIDENCE',
        },
      });
      return persistTransition(repo, current, next, actor, 'INCOMPLETE_EVIDENCE').case;
    }
    const next = transitionClaimsCase(current, {
      to: 'INVESTIGATING',
      actor,
      reasonCode: 'MANIFEST_COMPLETE',
    });
    return persistTransition(repo, current, next, actor, 'MANIFEST_COMPLETE').case;
  });
}

export type AdjudicateInput = {
  verificationId?: string;
  contractualReview?: ContractualReview;
  caseId: string;
  coverageDetermination: CoverageDetermination;
  verifiedLossMicros: UsdcMicros | null;
  recoveriesMicros: UsdcMicros | null;
  priorCompensationMicros?: UsdcMicros;
  requestedMicros: UsdcMicros;
  /**
   * @deprecated Ignored — lossKey is derived server-side from policy/exposure/incident.
   * Kept optional for API compat; inventing alternate keys is rejected.
   */
  lossKey?: string;
  forceReviewReason?: string;
};

export function adjudicateClaimsCase(
  repo: InsuranceRepository,
  input: AdjudicateInput,
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['reviewer', 'authority']);
  if (
    !['covered', 'not_covered', 'review_required', 'unknown'].includes(input.coverageDetermination)
  )
    throw new ValidationError('Invalid coverage determination');
  const actor = claimsActorId(principal);

  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    if (current.status !== 'INVESTIGATING' && current.status !== 'REVIEW') {
      throw new ValidationError(
        `Adjudication requires INVESTIGATING or REVIEW (was ${current.status})`,
      );
    }
    if (!current.incidentId) {
      throw new ValidationError('ClaimsCase requires linked incidentId for canonical lossKey');
    }
    const incident = repo.getIncident(current.incidentId);
    if (!incident) throw new ValidationError('Linked incident not found');

    if (!repo.incidentMatchesPolicy(incident.id, current.policyId, current.exposureId))
      throw new ValidationError('Incident policy/exposure mismatch');
    const derivedLossKey = deriveCanonicalClaimsLossKey({
      policyEntityId: current.policyId,
      exposureId: current.exposureId,
      incidentId: incident.id,
      observedEventRef: incident.observedEventRef,
    });
    if (input.lossKey && input.lossKey.toLowerCase() !== derivedLossKey.toLowerCase()) {
      throw new ValidationError('Client lossKey does not match canonical derived loss identity');
    }
    const lossKey = derivedLossKey;

    const reviewPatch = {
      coverageDetermination: 'review_required' as const,
      verifiedLossMicros: input.verifiedLossMicros,
      recoveriesMicros: input.recoveriesMicros,
      lossKey,
    };

    if (
      current.evidenceAuthenticity === 'unverified' ||
      current.evidenceAuthenticity === 'failed'
    ) {
      if (current.status === 'REVIEW') {
        return remainInReview(repo, current, actor, 'EVIDENCE_NOT_AUTHENTICATED', reviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor,
        reasonCode: 'EVIDENCE_NOT_AUTHENTICATED',
        patch: reviewPatch,
      });
      return persistTransition(repo, current, next, actor, 'EVIDENCE_NOT_AUTHENTICATED').case;
    }

    if (input.forceReviewReason) {
      if (current.status === 'REVIEW') {
        return remainInReview(repo, current, actor, input.forceReviewReason, reviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor,
        reasonCode: input.forceReviewReason,
        patch: reviewPatch,
      });
      return persistTransition(repo, current, next, actor, input.forceReviewReason).case;
    }

    if (input.coverageDetermination === 'not_covered') {
      const next = transitionClaimsCase(current, {
        to: 'DENIED',
        actor,
        reasonCode: 'NOT_COVERED',
        patch: {
          coverageDetermination: 'not_covered',
          verifiedLossMicros: input.verifiedLossMicros,
          recoveriesMicros: input.recoveriesMicros,
          lossKey,
          denialReasonCode: 'NOT_COVERED',
        },
      });
      return persistTransition(repo, current, next, actor, 'NOT_COVERED').case;
    }

    if (
      input.coverageDetermination === 'review_required' ||
      input.coverageDetermination === 'unknown'
    ) {
      if (current.status === 'REVIEW') {
        return remainInReview(repo, current, actor, 'COVERAGE_REVIEW_REQUIRED', reviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor,
        reasonCode: 'COVERAGE_REVIEW_REQUIRED',
        patch: reviewPatch,
      });
      return persistTransition(repo, current, next, actor, 'COVERAGE_REVIEW_REQUIRED').case;
    }

    const checked = checkClaimAdjudication(repo, current, input);
    if (checked.reason) {
      if (current.status === 'REVIEW')
        return remainInReview(repo, current, actor, checked.reason, reviewPatch);
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor,
        reasonCode: checked.reason,
        patch: reviewPatch,
      });
      return persistTransition(repo, current, next, actor, checked.reason, {
        verificationId: input.verificationId ?? null,
        contractualReview: input.contractualReview ?? null,
      }).case;
    }

    const alreadyPaid = repo.sumPaidForLossKey(lossKey);
    const committed = repo.sumCommittedForLossKey(lossKey, current.id);
    const net = computeNetLossPayable({
      verifiedLossMicros: input.verifiedLossMicros,
      deductibleMicros: current.deductibleMicros,
      priorCompensationMicros: input.priorCompensationMicros ?? current.priorCompensationMicros,
      recoveriesMicros: input.recoveriesMicros,
      remainingLimitMicros: current.remainingLimitMicros ?? 0n,
      lossCapMicros: current.lossCapMicros ?? 0n,
      alreadyPaidForLossMicros: alreadyPaid > committed ? alreadyPaid : committed,
      requestedMicros: input.requestedMicros,
    });

    if (net.outcome === 'REVIEW') {
      const netReviewPatch = {
        ...reviewPatch,
        payableMicros: null as null,
        reviewReasonCode: net.reasonCode,
      };
      if (current.status === 'REVIEW') {
        return remainInReview(repo, current, actor, net.reasonCode, netReviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor,
        reasonCode: net.reasonCode,
        patch: netReviewPatch,
      });
      return persistTransition(repo, current, next, actor, net.reasonCode).case;
    }

    if (net.outcome === 'DENIED' || net.payableMicros === 0n) {
      const reason = net.outcome === 'DENIED' ? net.reasonCode : 'NET_LOSS_ZERO';
      const next = transitionClaimsCase(current, {
        to: 'DENIED',
        actor,
        reasonCode: reason,
        patch: {
          coverageDetermination: 'covered',
          verifiedLossMicros: input.verifiedLossMicros,
          recoveriesMicros: input.recoveriesMicros,
          lossKey,
          denialReasonCode: reason,
          payableMicros: net.outcome === 'payable' ? 0n : null,
        },
      });
      return persistTransition(repo, current, next, actor, reason).case;
    }

    if (!current.payoutTo) {
      throw new ValidationError('Cannot approve without frozen payoutTo from policy ownership');
    }

    const manifests = repo.listEvidenceManifests(current.id);
    if (manifests.length === 0) {
      throw new ValidationError('Cannot approve without evidence manifests');
    }
    const evidenceRoot = computeEvidenceRoot(manifests);

    if (committed + net.payableMicros > (current.lossCapMicros ?? 0n)) {
      throw new ValidationError('Same-loss committed payouts would exceed loss cap');
    }

    const afterDeductions =
      input.verifiedLossMicros! -
      current.deductibleMicros -
      input.recoveriesMicros! -
      (input.priorCompensationMicros ?? current.priorCompensationMicros);
    const binding: AdjudicationBinding = {
      caseId: current.id,
      incidentId: incident.id,
      verificationId: checked.verification!.id,
      verificationContextDigest: checked.verification!.contextDigest,
      reviewer: { actor, role: principal.role, contractualReview: input.contractualReview! },
      asset: { symbol: 'USDC', scale: 6 },
      deductibleMicros: current.deductibleMicros.toString(),
      priorCompensationMicros: (
        input.priorCompensationMicros ?? current.priorCompensationMicros
      ).toString(),
      netCoveredLossMicros: (afterDeductions > 0n ? afterDeductions : 0n).toString(),
      coverageLimitMicros: current.lossCapMicros!.toString(),
      policyId: current.policyId,
      exposureId: current.exposureId,
      payableMicros: net.payableMicros.toString(),
      lossKey,
      evidenceRoot,
      payoutTo: normalizeWallet(current.payoutTo),
      verifiedLossMicros: (input.verifiedLossMicros ?? 0n).toString(),
      recoveriesMicros: (input.recoveriesMicros ?? 0n).toString(),
      coverageDetermination: 'covered',
      evidenceAuthenticity: current.evidenceAuthenticity,
    };

    const next = transitionClaimsCase(current, {
      to: 'APPROVED',
      actor,
      reasonCode: net.reasonCode,
      patch: {
        coverageDetermination: 'covered',
        verifiedLossMicros: input.verifiedLossMicros,
        recoveriesMicros: input.recoveriesMicros,
        priorCompensationMicros: input.priorCompensationMicros ?? current.priorCompensationMicros,
        lossKey,
        payableMicros: net.payableMicros,
        payoutTo: binding.payoutTo,
        evidenceRoot,
        adjudicationBindingJson: jsonSafe(binding),
      },
    });
    return persistTransition(repo, current, next, actor, net.reasonCode, {
      binding,
      alreadyPaidForLossMicros: alreadyPaid.toString(),
      committedForLossMicros: committed.toString(),
    }).case;
  });
}

export function reopenInvestigation(
  repo: InsuranceRepository,
  input: { caseId: string },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['reviewer', 'authority']);
  const actor = claimsActorId(principal);
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    const next = transitionClaimsCase(current, {
      to: 'INVESTIGATING',
      actor,
      reasonCode: 'REOPEN_INVESTIGATION',
      patch: {
        settlementAuthorization: 'none',
        payableMicros: null,
        adjudicationBindingJson: null,
        evidenceRoot: null,
      },
    });
    return persistTransition(repo, current, next, actor, 'REOPEN_INVESTIGATION').case;
  });
}

/**
 * Authority-gated settlement preparation. Client cannot forge role via actor strings.
 * Synthetic/fixture cases cannot authorize unless principal.allowSyntheticSettlementPrep.
 */
export function authorizeSettlementPreparation(
  repo: InsuranceRepository,
  input: {
    caseId: string;
    confirmedRecipient: string;
    confirmedAmountMicros: UsdcMicros;
    confirmedLossKey: string;
    confirmedEvidenceRoot: string;
    settlementPrepId: string;
  },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['authority']);
  const actor = claimsActorId(principal);
  const recipient = normalizeWallet(input.confirmedRecipient);

  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    if (current.status !== 'APPROVED' && current.status !== 'SETTLEMENT_FAILED') {
      throw new ValidationError(
        `Settlement prep requires APPROVED or SETTLEMENT_FAILED (was ${current.status})`,
      );
    }
    if (!current.adjudicationBindingJson || !current.payableMicros || !current.lossKey) {
      throw new ValidationError('Missing frozen adjudication binding');
    }
    if (current.syntheticDemo || current.evidenceAuthenticity === 'synthetic_fixture') {
      if (!principal.allowSyntheticSettlementPrep) {
        throw new ValidationError(
          'Synthetic/fixture evidence cannot authorize settlement preparation',
        );
      }
    } else if (current.evidenceAuthenticity !== 'verified_independent') {
      throw new ValidationError(
        'Settlement preparation requires verified_independent evidence authenticity',
      );
    }

    const binding = JSON.parse(current.adjudicationBindingJson) as AdjudicationBinding;
    if (binding.verificationId) {
      const checked = checkClaimAdjudication(repo, current, {
        verificationId: binding.verificationId,
        contractualReview: binding.reviewer?.contractualReview,
        verifiedLossMicros: current.verifiedLossMicros,
        recoveriesMicros: current.recoveriesMicros,
        priorCompensationMicros: current.priorCompensationMicros,
      });
      if (checked.reason)
        throw new ValidationError(`Adjudication no longer current: ${checked.reason}`);
      if (binding.caseId !== current.id || binding.incidentId !== current.incidentId)
        throw new ValidationError('Binding case/incident mismatch');
    }
    if (binding.policyId !== current.policyId) {
      throw new ValidationError('Binding policyId mismatch');
    }
    if (input.confirmedAmountMicros.toString() !== binding.payableMicros) {
      throw new ValidationError('confirmedAmountMicros must match frozen binding payable');
    }
    if (current.payableMicros.toString() !== binding.payableMicros) {
      throw new ValidationError('Case payableMicros diverged from frozen binding');
    }
    if (input.confirmedLossKey !== binding.lossKey || current.lossKey !== binding.lossKey) {
      throw new ValidationError('confirmedLossKey must match frozen binding lossKey');
    }
    if (
      input.confirmedEvidenceRoot !== binding.evidenceRoot ||
      current.evidenceRoot !== binding.evidenceRoot
    ) {
      throw new ValidationError('confirmedEvidenceRoot must match frozen binding');
    }
    if (recipient !== normalizeWallet(binding.payoutTo)) {
      throw new ValidationError('confirmedRecipient must match frozen binding payoutTo');
    }

    const liveRoot = computeEvidenceRoot(repo.listEvidenceManifests(current.id));
    if (liveRoot !== binding.evidenceRoot) {
      throw new ValidationError('Evidence manifests changed after adjudication binding');
    }

    const policyCommitted = repo.sumCommittedForPolicy(current.policyId, current.id);
    if (
      policyCommitted + current.payableMicros >
      (repo.claimsPolicyContext(current.policyId)?.limitMicros ?? 0n)
    )
      throw new ValidationError('Policy committed payouts would exceed immutable policy limit');
    const committed = repo.sumCommittedForLossKey(binding.lossKey, current.id);
    const netEconomic =
      BigInt(binding.verifiedLossMicros) -
      current.deductibleMicros -
      current.priorCompensationMicros -
      BigInt(binding.recoveriesMicros);
    if (committed + current.payableMicros > netEconomic)
      throw new ValidationError(
        'Same-loss committed payouts would exceed frozen net economic loss',
      );
    if (committed + current.payableMicros > (current.lossCapMicros ?? 0n)) {
      throw new ValidationError('Same-loss committed payouts would exceed loss cap');
    }

    const next = transitionClaimsCase(current, {
      to: 'SETTLEMENT_PENDING',
      actor,
      reasonCode: 'SETTLEMENT_PREPARED',
      patch: {
        settlementAuthorization: 'authorized',
        authorityActor: actor,
        settlementPrepId: input.settlementPrepId,
      },
    });
    return persistTransition(repo, current, next, actor, 'SETTLEMENT_PREPARED', {
      binding,
      settlementPrepId: input.settlementPrepId,
      notice: current.syntheticDemo
        ? 'SYNTHETIC DEMO settlement prep only — not independently verified real-world loss. No broadcast.'
        : 'Settlement prepared; broadcast requires separate explicit authorization.',
    }).case;
  });
}

export function markClaimsCasePaid(
  repo: InsuranceRepository,
  input: { caseId: string; receiptRef: string },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['authority']);
  const actor = claimsActorId(principal);
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    if (current.settlementAuthorization !== 'authorized') {
      throw new ValidationError('PAID requires prior authorized settlement preparation');
    }
    const next = transitionClaimsCase(current, {
      to: 'PAID',
      actor,
      reasonCode: 'SETTLEMENT_RECONCILED',
    });
    return persistTransition(repo, current, next, actor, 'SETTLEMENT_RECONCILED', {
      receiptRef: input.receiptRef,
    }).case;
  });
}

export function markClaimsCaseSettlementFailed(
  repo: InsuranceRepository,
  input: { caseId: string; reasonCode: string; detail?: string },
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['authority']);
  const actor = claimsActorId(principal);
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    assertClaimsCaseAccess(repo, principal, current);
    const next = transitionClaimsCase(current, {
      to: 'SETTLEMENT_FAILED',
      actor,
      reasonCode: input.reasonCode,
    });
    return persistTransition(repo, current, next, actor, input.reasonCode, {
      detail: input.detail ?? null,
    }).case;
  });
}

/** Human escalation changes investigation state only; it never creates financial authority. */
export function escalateClaimsInvestigation(
  repo: InsuranceRepository,
  caseId: string,
  principal: ClaimsPrincipal,
) {
  assertClaimsRole(principal, ['reviewer', 'authority']);
  return repo.runInTransaction(() => {
    const c = getClaimsCase(repo, caseId);
    if (!c || !['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(c.status))
      throw new ValidationError('Investigation is closed');
    assertClaimsCaseAccess(repo, principal, c);
    return remainInReview(repo, c, claimsActorId(principal), 'HUMAN_ESCALATION', {
      coverageDetermination: 'review_required',
      reviewReasonCode: 'HUMAN_ESCALATION',
    });
  });
}
