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
  ClaimsCaseSchema,
  buildClaimsCaseEvent,
  createDraftClaimsCase,
  transitionClaimsCase,
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

function persistCase(repo: InsuranceRepository, c: ClaimsCase): void {
  repo.saveClaimsCase(c);
}

function persistTransition(
  repo: InsuranceRepository,
  from: ClaimsCase,
  to: ClaimsCase,
  actor: string,
  reasonCode: string,
  payload: unknown = {},
): ClaimsCaseEvent {
  const event = buildClaimsCaseEvent(from, to, actor, reasonCode, payload);
  repo.appendClaimsCaseEvent(event);
  persistCase(repo, to);
  return event;
}

/** Stay in REVIEW while updating determination fields + audit (no illegal self-transition). */
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
  persistCase(repo, next);
  return next;
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

/**
 * Idempotent draft creation. Replays return the existing case for the same key.
 */
export function openClaimsCase(
  repo: InsuranceRepository,
  input: CreateDraftClaimsCaseInput & {
    incidentId?: string | null;
  },
): ClaimsCase {
  const key = IdempotencyKeySchema.parse(input.idempotencyKey);
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

    const policy = repo.getPolicy(input.policyId);
    if (!policy || (policy.status !== 'active' && policy.status !== 'bound')) {
      throw new ValidationError('ClaimsCase requires an active or bound policy');
    }
    const exposures = repo.listExposures(policy.id);
    const exposure = exposures.find((e) => e.id === input.exposureId);
    if (!exposure) {
      throw new ValidationError('ClaimsCase requires a registered exposure on the policy');
    }

    let draft = createDraftClaimsCase({ ...input, idempotencyKey: key });
    draft = {
      ...draft,
      incidentId: input.incidentId ?? null,
      remainingLimitMicros: exposure.limitMicros,
      lossCapMicros: policy.terms.limitMicros,
      deductibleMicros: policy.terms.deductibleMicros,
    };
    persistCase(repo, draft);
    repo.insertAudit('claims_case', draft.id, 'claims_case.opened', {
      syntheticDemo: draft.syntheticDemo,
      actor: input.actor,
    });
    return draft;
  });
}

export function submitClaimsCase(
  repo: InsuranceRepository,
  input: { caseId: string; actor: string; reasonCode?: string },
): ClaimsCase {
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    const next = transitionClaimsCase(current, {
      to: 'SUBMITTED',
      actor: input.actor,
      reasonCode: input.reasonCode ?? 'CASE_SUBMITTED',
    });
    persistTransition(repo, current, next, input.actor, input.reasonCode ?? 'CASE_SUBMITTED');
    return next;
  });
}

export function beginEvidenceCollection(
  repo: InsuranceRepository,
  input: { caseId: string; actor: string },
): ClaimsCase {
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    const next = transitionClaimsCase(current, {
      to: 'COLLECTING_EVIDENCE',
      actor: input.actor,
      reasonCode: 'EVIDENCE_COLLECTION_STARTED',
    });
    persistTransition(repo, current, next, input.actor, 'EVIDENCE_COLLECTION_STARTED');
    return next;
  });
}

export type EvidenceManifestInput = {
  caseId: string;
  actor: string;
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
): { case: ClaimsCase; inserted: boolean; digest: string } {
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
      persistCase(repo, patched);
      return { case: patched, inserted, digest };
    }
    return { case: current, inserted, digest };
  });
}

export function completeEvidenceOrReview(
  repo: InsuranceRepository,
  input: {
    caseId: string;
    actor: string;
    /** When false, forces REVIEW for missing independent evidence. */
    evidenceComplete: boolean;
  },
): ClaimsCase {
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    const manifests = repo.listEvidenceManifests(current.id);
    if (!input.evidenceComplete || manifests.length === 0) {
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor: input.actor,
        reasonCode: 'INCOMPLETE_EVIDENCE',
        patch: {
          coverageDetermination: 'review_required',
          reviewReasonCode: 'INCOMPLETE_EVIDENCE',
        },
      });
      persistTransition(repo, current, next, input.actor, 'INCOMPLETE_EVIDENCE');
      return next;
    }
    const next = transitionClaimsCase(current, {
      to: 'INVESTIGATING',
      actor: input.actor,
      reasonCode: 'MANIFEST_COMPLETE',
    });
    persistTransition(repo, current, next, input.actor, 'MANIFEST_COMPLETE');
    return next;
  });
}

export type AdjudicateInput = {
  caseId: string;
  actor: string;
  coverageDetermination: CoverageDetermination;
  verifiedLossMicros: UsdcMicros | null;
  recoveriesMicros: UsdcMicros | null;
  priorCompensationMicros?: UsdcMicros;
  requestedMicros: UsdcMicros;
  /** Durable loss identity — never a claimant-controlled arbitrary id alone. */
  lossKey: string | null;
  forceReviewReason?: string;
};

/**
 * Separates coverage + net-loss from payout authorization.
 * Missing evidence authenticity / unknown recoveries → REVIEW (never silent approve/deny).
 */
export function adjudicateClaimsCase(
  repo: InsuranceRepository,
  input: AdjudicateInput,
): ClaimsCase {
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
        return remainInReview(repo, current, input.actor, 'EVIDENCE_NOT_AUTHENTICATED', reviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor: input.actor,
        reasonCode: 'EVIDENCE_NOT_AUTHENTICATED',
        patch: reviewPatch,
      });
      persistTransition(repo, current, next, input.actor, 'EVIDENCE_NOT_AUTHENTICATED');
      return next;
    }

    if (input.forceReviewReason) {
      if (current.status === 'REVIEW') {
        return remainInReview(repo, current, input.actor, input.forceReviewReason, reviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor: input.actor,
        reasonCode: input.forceReviewReason,
        patch: reviewPatch,
      });
      persistTransition(repo, current, next, input.actor, input.forceReviewReason);
      return next;
    }

    if (input.coverageDetermination === 'not_covered') {
      const next = transitionClaimsCase(current, {
        to: 'DENIED',
        actor: input.actor,
        reasonCode: 'NOT_COVERED',
        patch: {
          coverageDetermination: 'not_covered',
          verifiedLossMicros: input.verifiedLossMicros,
          recoveriesMicros: input.recoveriesMicros,
          lossKey: input.lossKey,
          denialReasonCode: 'NOT_COVERED',
        },
      });
      persistTransition(repo, current, next, input.actor, 'NOT_COVERED');
      return next;
    }

    if (input.coverageDetermination === 'review_required' || input.coverageDetermination === 'unknown') {
      if (current.status === 'REVIEW') {
        return remainInReview(repo, current, input.actor, 'COVERAGE_REVIEW_REQUIRED', reviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor: input.actor,
        reasonCode: 'COVERAGE_REVIEW_REQUIRED',
        patch: reviewPatch,
      });
      persistTransition(repo, current, next, input.actor, 'COVERAGE_REVIEW_REQUIRED');
      return next;
    }

    const alreadyPaid = input.lossKey ? repo.sumPaidForLossKey(input.lossKey) : 0n;
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
        return remainInReview(repo, current, input.actor, net.reasonCode, netReviewPatch);
      }
      const next = transitionClaimsCase(current, {
        to: 'REVIEW',
        actor: input.actor,
        reasonCode: net.reasonCode,
        patch: netReviewPatch,
      });
      persistTransition(repo, current, next, input.actor, net.reasonCode);
      return next;
    }

    if (net.outcome === 'DENIED') {
      const next = transitionClaimsCase(current, {
        to: 'DENIED',
        actor: input.actor,
        reasonCode: net.reasonCode,
        patch: {
          coverageDetermination: 'covered',
          verifiedLossMicros: input.verifiedLossMicros,
          recoveriesMicros: input.recoveriesMicros,
          lossKey: input.lossKey,
          denialReasonCode: net.reasonCode,
          payableMicros: null,
        },
      });
      persistTransition(repo, current, next, input.actor, net.reasonCode);
      return next;
    }

    if (net.payableMicros === 0n) {
      const next = transitionClaimsCase(current, {
        to: 'DENIED',
        actor: input.actor,
        reasonCode: 'NET_LOSS_ZERO',
        patch: {
          coverageDetermination: 'covered',
          verifiedLossMicros: input.verifiedLossMicros,
          recoveriesMicros: input.recoveriesMicros,
          lossKey: input.lossKey,
          payableMicros: 0n,
          denialReasonCode: 'NET_LOSS_ZERO',
        },
      });
      persistTransition(repo, current, next, input.actor, 'NET_LOSS_ZERO');
      return next;
    }

    const next = transitionClaimsCase(current, {
      to: 'APPROVED',
      actor: input.actor,
      reasonCode: net.reasonCode,
      patch: {
        coverageDetermination: 'covered',
        verifiedLossMicros: input.verifiedLossMicros,
        recoveriesMicros: input.recoveriesMicros,
        priorCompensationMicros:
          input.priorCompensationMicros ?? current.priorCompensationMicros,
        lossKey: input.lossKey,
        payableMicros: net.payableMicros,
      },
    });
    persistTransition(repo, current, next, input.actor, net.reasonCode, {
      payableMicros: net.payableMicros.toString(),
      alreadyPaidForLossMicros: alreadyPaid.toString(),
    });
    return next;
  });
}

const AI_AUTHORITY_PATTERN = /ai[_-]?majority|llm[_-]?vote|model[_-]?consensus/i;

/**
 * Authenticated claims authority gates settlement preparation.
 * Claimant / frontend / LLM / webhook alone cannot authorize transfer.
 */
export function authorizeSettlementPreparation(
  repo: InsuranceRepository,
  input: {
    caseId: string;
    authorityActor: string;
    confirmedRecipient: string;
    confirmedAmountMicros: UsdcMicros;
    settlementPrepId: string;
  },
): ClaimsCase {
  if (AI_AUTHORITY_PATTERN.test(input.authorityActor)) {
    throw new ValidationError(
      'AI majority votes / LLM results cannot authorize settlement',
    );
  }
  if (!input.authorityActor.startsWith('authority:')) {
    throw new ValidationError(
      'Settlement authorization requires authenticated authority:* actor',
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.confirmedRecipient)) {
    throw new ValidationError('confirmedRecipient must be a 0x address');
  }

  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    if (current.status !== 'APPROVED' && current.status !== 'SETTLEMENT_FAILED') {
      throw new ValidationError(
        `Settlement prep requires APPROVED or SETTLEMENT_FAILED (was ${current.status})`,
      );
    }
    if (current.payableMicros === null) {
      throw new ValidationError('Cannot prepare settlement without payableMicros');
    }
    if (input.confirmedAmountMicros !== current.payableMicros) {
      throw new ValidationError('confirmedAmountMicros must match case payableMicros');
    }

    const next = transitionClaimsCase(current, {
      to: 'SETTLEMENT_PENDING',
      actor: input.authorityActor,
      reasonCode: 'SETTLEMENT_PREPARED',
      patch: {
        settlementAuthorization: 'authorized',
        authorityActor: input.authorityActor,
        settlementPrepId: input.settlementPrepId,
      },
    });
    persistTransition(repo, current, next, input.authorityActor, 'SETTLEMENT_PREPARED', {
      confirmedRecipient: input.confirmedRecipient,
      confirmedAmountMicros: input.confirmedAmountMicros.toString(),
      settlementPrepId: input.settlementPrepId,
      notice:
        current.syntheticDemo
          ? 'SYNTHETIC DEMO — fixture consistency only; not independently verified real-world loss. No broadcast from this path.'
          : 'Settlement prepared; broadcast requires separate explicit authorization.',
    });
    return next;
  });
}

export function markClaimsCasePaid(
  repo: InsuranceRepository,
  input: { caseId: string; actor: string; receiptRef: string },
): ClaimsCase {
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    const next = transitionClaimsCase(current, {
      to: 'PAID',
      actor: input.actor,
      reasonCode: 'SETTLEMENT_RECONCILED',
      patch: {},
    });
    persistTransition(repo, current, next, input.actor, 'SETTLEMENT_RECONCILED', {
      receiptRef: input.receiptRef,
    });
    return next;
  });
}

export function markClaimsCaseSettlementFailed(
  repo: InsuranceRepository,
  input: { caseId: string; actor: string; reasonCode: string; detail?: string },
): ClaimsCase {
  return repo.runInTransaction(() => {
    const current = getClaimsCase(repo, input.caseId);
    if (!current) throw new ValidationError('Unknown ClaimsCase');
    const next = transitionClaimsCase(current, {
      to: 'SETTLEMENT_FAILED',
      actor: input.actor,
      reasonCode: input.reasonCode,
    });
    persistTransition(repo, current, next, input.actor, input.reasonCode, {
      detail: input.detail ?? null,
    });
    return next;
  });
}
