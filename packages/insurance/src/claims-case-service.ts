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

function computeEvidenceRoot(
  manifests: Array<{ rawEvidenceDigest: string }>,
): string {
  const digests = manifests.map((m) => m.rawEvidenceDigest).sort();
  return `sha256:${createHash('sha256').update(digests.join('|')).digest('hex')}`;
}

function assertPolicyOwnership(
  repo: InsuranceRepository,
  principal: ClaimsPrincipal,
  policyId: string,
): { policy: NonNullable<ReturnType<InsuranceRepository['getPolicy']>>; payoutTo: string } {
  const policy = repo.getPolicy(policyId);
  if (!policy || (policy.status !== 'active' && policy.status !== 'bound')) {
    throw new ValidationError('ClaimsCase requires an active or bound policy');
  }
  const holder = repo.getPolicyholder(policy.policyholderId);
  if (!holder) throw new ValidationError('Policyholder missing for policy');

  if (principal.role === 'system') {
    const payoutTo = holder.walletAddress
      ? normalizeWallet(holder.walletAddress)
      : null;
    if (!payoutTo) {
      throw new ValidationError('Policyholder wallet required for settlement binding');
    }
    return { policy, payoutTo };
  }

  if (principal.role !== 'claimant') {
    throw new ValidationError('Only claimant (or system) may open a ClaimsCase');
  }

  const ownedByPolicyholder =
    principal.policyholderId === policy.policyholderId ||
    (principal.walletAddress &&
      holder.walletAddress &&
      normalizeWallet(principal.walletAddress) === normalizeWallet(holder.walletAddress));

  const ownedByAgent =
    principal.agentId !== undefined && principal.agentId === policy.agentId;

  if (!ownedByPolicyholder && !ownedByAgent) {
    throw new ValidationError('Claimant is not the policyholder or authorized agent for this policy');
  }

  const payoutTo = holder.walletAddress
    ? normalizeWallet(holder.walletAddress)
    : principal.walletAddress
      ? normalizeWallet(principal.walletAddress)
      : null;
  if (!payoutTo) {
    throw new ValidationError('Policyholder wallet required to bind settlement beneficiary');
  }
  return { policy, payoutTo };
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
    const exposures = repo.listExposures(policy.id);
    const exposure = exposures.find((e) => e.id === input.exposureId);
    if (!exposure) {
      throw new ValidationError('ClaimsCase requires a registered exposure on the policy');
    }

    let draft = createDraftClaimsCase({
      ...input,
      idempotencyKey: key,
      actor,
    });
    draft = {
      ...draft,
      incidentId: input.incidentId ?? null,
      remainingLimitMicros: exposure.limitMicros,
      lossCapMicros: policy.terms.limitMicros,
      deductibleMicros: policy.terms.deductibleMicros,
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
    const next = transitionClaimsCase(current, {
      to: 'SUBMITTED',
      actor,
      reasonCode: input.reasonCode ?? 'CASE_SUBMITTED',
    });
    return persistTransition(
      repo,
      current,
      next,
      actor,
      input.reasonCode ?? 'CASE_SUBMITTED',
    ).case;
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
    } else if (input.verificationMethod === 'independent_chain_verify') {
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
  caseId: string;
  coverageDetermination: CoverageDetermination;
  verifiedLossMicros: UsdcMicros | null;
  recoveriesMicros: UsdcMicros | null;
  priorCompensationMicros?: UsdcMicros;
  requestedMicros: UsdcMicros;
  /** Must be a 0x-prefixed 32-byte hex loss key (canonical). */
  lossKey: string;
  forceReviewReason?: string;
};

export function adjudicateClaimsCase(
  repo: InsuranceRepository,
  input: AdjudicateInput,
  principal: ClaimsPrincipal,
): ClaimsCase {
  assertClaimsRole(principal, ['reviewer', 'authority']);
  const actor = claimsActorId(principal);

  if (!/^0x[a-fA-F0-9]{64}$/.test(input.lossKey)) {
    throw new ValidationError('lossKey must be 0x-prefixed 32-byte hex');
  }

  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    if (current.status !== 'INVESTIGATING' && current.status !== 'REVIEW') {
      throw new ValidationError(
        `Adjudication requires INVESTIGATING or REVIEW (was ${current.status})`,
      );
    }

    const reviewPatch = {
      coverageDetermination: 'review_required' as const,
      verifiedLossMicros: input.verifiedLossMicros,
      recoveriesMicros: input.recoveriesMicros,
      lossKey: input.lossKey,
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
          lossKey: input.lossKey,
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

    const alreadyPaid = repo.sumPaidForLossKey(input.lossKey);
    const net = computeNetLossPayable({
      verifiedLossMicros: input.verifiedLossMicros,
      deductibleMicros: current.deductibleMicros,
      priorCompensationMicros: input.priorCompensationMicros ?? current.priorCompensationMicros,
      recoveriesMicros: input.recoveriesMicros,
      remainingLimitMicros: current.remainingLimitMicros ?? 0n,
      lossCapMicros: current.lossCapMicros ?? 0n,
      alreadyPaidForLossMicros: alreadyPaid,
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
          lossKey: input.lossKey,
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

    const binding: AdjudicationBinding = {
      policyId: current.policyId,
      exposureId: current.exposureId,
      payableMicros: net.payableMicros.toString(),
      lossKey: input.lossKey,
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
        priorCompensationMicros:
          input.priorCompensationMicros ?? current.priorCompensationMicros,
        lossKey: input.lossKey,
        payableMicros: net.payableMicros,
        payoutTo: binding.payoutTo,
        evidenceRoot,
        adjudicationBindingJson: jsonSafe(binding),
      },
    });
    return persistTransition(repo, current, next, actor, net.reasonCode, {
      binding,
      alreadyPaidForLossMicros: alreadyPaid.toString(),
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
    if (current.status !== 'APPROVED' && current.status !== 'SETTLEMENT_FAILED') {
      throw new ValidationError(
        `Settlement prep requires APPROVED or SETTLEMENT_FAILED (was ${current.status})`,
      );
    }
    if (!current.adjudicationBindingJson || !current.payableMicros || !current.lossKey) {
      throw new ValidationError('Missing frozen adjudication binding');
    }
    if (
      current.syntheticDemo ||
      current.evidenceAuthenticity === 'synthetic_fixture'
    ) {
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

    const alreadyPaid = repo.sumPaidForLossKey(binding.lossKey);
    if (alreadyPaid + current.payableMicros > (current.lossCapMicros ?? 0n)) {
      throw new ValidationError('Same-loss payout would exceed loss cap');
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
