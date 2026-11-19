import {
  IdempotencyKeySchema,
  InvalidTransitionError,
  ValidationError,
  newId,
  type EntityId,
  type IdempotencyKey,
  type UsdcMicros,
} from '@arcuex/domain';
import { z } from 'zod';
import type { ContractualReview } from './claim-adjudication-checks';

export const CLAIMS_CASE_SCHEMA_VERSION = 1 as const;

export const ClaimsCaseStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'COLLECTING_EVIDENCE',
  'INVESTIGATING',
  'REVIEW',
  'APPROVED',
  'DENIED',
  'SETTLEMENT_PENDING',
  'PAID',
  'SETTLEMENT_FAILED',
]);
export type ClaimsCaseStatus = z.infer<typeof ClaimsCaseStatusSchema>;

export const EvidenceAuthenticitySchema = z.enum([
  'unverified',
  'synthetic_fixture',
  'verified_independent',
  'failed',
]);
export type EvidenceAuthenticity = z.infer<typeof EvidenceAuthenticitySchema>;

export const CoverageDeterminationSchema = z.enum([
  'unknown',
  'covered',
  'not_covered',
  'review_required',
]);
export type CoverageDetermination = z.infer<typeof CoverageDeterminationSchema>;

export const SettlementAuthorizationSchema = z.enum([
  'none',
  'pending_authority',
  'authorized',
  'rejected',
]);
export type SettlementAuthorization = z.infer<typeof SettlementAuthorizationSchema>;

const UsdcMicrosOrNull = z.union([z.bigint().nonnegative(), z.null()]);

export const ClaimsCaseSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.literal(CLAIMS_CASE_SCHEMA_VERSION),
  status: ClaimsCaseStatusSchema,
  policyId: z.string().uuid(),
  exposureId: z.string().uuid(),
  incidentId: z.string().uuid().nullable(),
  claimId: z.string().uuid().nullable(),
  claimantRef: z.string().min(1),
  idempotencyKey: IdempotencyKeySchema,
  syntheticDemo: z.boolean(),
  evidenceAuthenticity: EvidenceAuthenticitySchema,
  coverageDetermination: CoverageDeterminationSchema,
  settlementAuthorization: SettlementAuthorizationSchema,
  verifiedLossMicros: UsdcMicrosOrNull,
  deductibleMicros: z.bigint().nonnegative(),
  priorCompensationMicros: z.bigint().nonnegative(),
  recoveriesMicros: UsdcMicrosOrNull,
  remainingLimitMicros: UsdcMicrosOrNull,
  lossCapMicros: UsdcMicrosOrNull,
  payableMicros: UsdcMicrosOrNull,
  lossKey: z.string().nullable(),
  denialReasonCode: z.string().nullable(),
  reviewReasonCode: z.string().nullable(),
  authorityActor: z.string().nullable(),
  settlementPrepId: z.string().nullable(),
  /** Frozen beneficiary at approval — settlement must match. */
  payoutTo: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .nullable(),
  /** Merkle/hash root of evidence digests frozen at approval. */
  evidenceRoot: z.string().nullable(),
  /** Immutable JSON snapshot of payable/lossKey/policy/evidence/payout binding. */
  adjudicationBindingJson: z.string().nullable(),
  rowVersion: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClaimsCase = z.infer<typeof ClaimsCaseSchema>;

export type AdjudicationBinding = {
  caseId?: string;
  incidentId?: string;
  verificationId?: string;
  verificationContextDigest?: string;
  reviewer?: {
    actor: string;
    role: string;
    contractualReview: ContractualReview;
  };
  asset?: { symbol: 'USDC'; scale: 6 };
  deductibleMicros?: string;
  priorCompensationMicros?: string;
  netCoveredLossMicros?: string;
  coverageLimitMicros?: string;
  policyId: string;
  exposureId: string;
  payableMicros: string;
  lossKey: string;
  evidenceRoot: string;
  payoutTo: string;
  verifiedLossMicros: string;
  recoveriesMicros: string;
  coverageDetermination: 'covered';
  evidenceAuthenticity: EvidenceAuthenticity;
};

export const ClaimsCaseEventSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  fromStatus: ClaimsCaseStatusSchema,
  toStatus: ClaimsCaseStatusSchema,
  actor: z.string().min(1),
  reasonCode: z.string().min(1),
  payloadJson: z.string(),
  createdAt: z.string().datetime(),
});
export type ClaimsCaseEvent = z.infer<typeof ClaimsCaseEventSchema>;

export const CLAIMS_CASE_TRANSITIONS: Record<ClaimsCaseStatus, readonly ClaimsCaseStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['COLLECTING_EVIDENCE'],
  COLLECTING_EVIDENCE: ['INVESTIGATING', 'REVIEW'],
  INVESTIGATING: ['REVIEW', 'APPROVED', 'DENIED'],
  REVIEW: ['INVESTIGATING', 'APPROVED', 'DENIED'],
  APPROVED: ['SETTLEMENT_PENDING'],
  DENIED: [],
  SETTLEMENT_PENDING: ['PAID', 'SETTLEMENT_FAILED'],
  PAID: [],
  SETTLEMENT_FAILED: ['SETTLEMENT_PENDING'],
};

export function assertClaimsCaseTransition(from: ClaimsCaseStatus, to: ClaimsCaseStatus): void {
  if (!CLAIMS_CASE_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidTransitionError('ClaimsCase', from, to);
  }
}

export type CreateDraftClaimsCaseInput = {
  policyId: EntityId;
  exposureId: EntityId;
  claimantRef: string;
  idempotencyKey: IdempotencyKey | string;
  syntheticDemo: boolean;
  actor: string;
  nowIso?: string;
  id?: EntityId;
};

export function createDraftClaimsCase(input: CreateDraftClaimsCaseInput): ClaimsCase {
  const now = input.nowIso ?? new Date().toISOString();
  const key = IdempotencyKeySchema.parse(input.idempotencyKey);
  if (!input.actor.trim()) {
    throw new ValidationError('actor required to create ClaimsCase');
  }
  return ClaimsCaseSchema.parse({
    id: input.id ?? newId(),
    schemaVersion: CLAIMS_CASE_SCHEMA_VERSION,
    status: 'DRAFT',
    policyId: input.policyId,
    exposureId: input.exposureId,
    incidentId: null,
    claimId: null,
    claimantRef: input.claimantRef,
    idempotencyKey: key,
    syntheticDemo: input.syntheticDemo,
    evidenceAuthenticity: 'unverified',
    coverageDetermination: 'unknown',
    settlementAuthorization: 'none',
    verifiedLossMicros: null,
    deductibleMicros: 0n,
    priorCompensationMicros: 0n,
    recoveriesMicros: null,
    remainingLimitMicros: null,
    lossCapMicros: null,
    payableMicros: null,
    lossKey: null,
    denialReasonCode: null,
    reviewReasonCode: null,
    authorityActor: null,
    settlementPrepId: null,
    payoutTo: null,
    evidenceRoot: null,
    adjudicationBindingJson: null,
    rowVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
}

export type TransitionClaimsCaseInput = {
  to: ClaimsCaseStatus;
  actor: string;
  reasonCode: string;
  nowIso?: string;
  patch?: Partial<
    Pick<
      ClaimsCase,
      | 'incidentId'
      | 'claimId'
      | 'evidenceAuthenticity'
      | 'coverageDetermination'
      | 'settlementAuthorization'
      | 'verifiedLossMicros'
      | 'deductibleMicros'
      | 'priorCompensationMicros'
      | 'recoveriesMicros'
      | 'remainingLimitMicros'
      | 'lossCapMicros'
      | 'payableMicros'
      | 'lossKey'
      | 'denialReasonCode'
      | 'reviewReasonCode'
      | 'authorityActor'
      | 'settlementPrepId'
      | 'payoutTo'
      | 'evidenceRoot'
      | 'adjudicationBindingJson'
    >
  >;
};

/**
 * Pure transition. Callers persist the case and append an audit event.
 * REVIEW never carries authorized settlement or a payable amount.
 */
export function transitionClaimsCase(
  current: ClaimsCase,
  input: TransitionClaimsCaseInput,
): ClaimsCase {
  assertClaimsCaseTransition(current.status, input.to);
  if (!input.actor.trim()) {
    throw new ValidationError('actor required for ClaimsCase transition');
  }
  if (!input.reasonCode.trim()) {
    throw new ValidationError('reasonCode required for ClaimsCase transition');
  }

  const now = input.nowIso ?? new Date().toISOString();
  const next: ClaimsCase = {
    ...current,
    ...input.patch,
    status: input.to,
    updatedAt: now,
  };

  if (input.to === 'REVIEW') {
    next.settlementAuthorization = 'none';
    next.payableMicros = null;
    next.reviewReasonCode = input.patch?.reviewReasonCode ?? input.reasonCode;
  }

  if (input.to === 'DENIED') {
    next.settlementAuthorization = 'rejected';
    next.payableMicros = null;
    next.denialReasonCode = input.patch?.denialReasonCode ?? input.reasonCode;
  }

  if (input.to === 'APPROVED') {
    if (next.coverageDetermination !== 'covered') {
      throw new ValidationError('APPROVED requires coverageDetermination=covered');
    }
    if (
      next.evidenceAuthenticity !== 'verified_independent' &&
      next.evidenceAuthenticity !== 'synthetic_fixture'
    ) {
      throw new ValidationError(
        'APPROVED requires synthetic_fixture or verified_independent evidence',
      );
    }
    if (next.payableMicros === null || next.payableMicros <= 0n) {
      throw new ValidationError('APPROVED requires positive payableMicros from net-loss');
    }
    next.settlementAuthorization = 'pending_authority';
    next.authorityActor = input.actor;
  }

  if (input.to === 'SETTLEMENT_PENDING') {
    const auth = input.patch?.settlementAuthorization ?? next.settlementAuthorization;
    if (auth !== 'authorized') {
      throw new ValidationError('SETTLEMENT_PENDING requires settlementAuthorization=authorized');
    }
    next.settlementAuthorization = 'authorized';
    next.authorityActor = input.actor;
  }

  if (input.to === 'PAID' && (next.payableMicros === null || next.payableMicros <= 0n)) {
    throw new ValidationError('PAID requires positive payableMicros');
  }

  return ClaimsCaseSchema.parse(next);
}

export function buildClaimsCaseEvent(
  from: ClaimsCase,
  to: ClaimsCase,
  actor: string,
  reasonCode: string,
  payload: unknown = {},
): ClaimsCaseEvent {
  return ClaimsCaseEventSchema.parse({
    id: newId(),
    caseId: to.id,
    fromStatus: from.status,
    toStatus: to.status,
    actor,
    reasonCode,
    payloadJson: JSON.stringify(payload, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
    createdAt: to.updatedAt,
  });
}

/** Guard: payable amounts must never come solely from untrusted claimant input. */
export function assertPayableNotFromClaimantAlone(args: {
  requestedByClaimantMicros: UsdcMicros;
  payableMicros: UsdcMicros;
  verifiedLossMicros: UsdcMicros;
}): void {
  if (args.payableMicros > args.verifiedLossMicros) {
    throw new ValidationError('payableMicros cannot exceed verifiedLossMicros');
  }
  if (args.payableMicros > args.requestedByClaimantMicros) {
    throw new ValidationError('payableMicros cannot exceed claimant request');
  }
}
