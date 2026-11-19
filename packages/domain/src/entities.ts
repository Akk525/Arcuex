import { z } from 'zod';
import { EntityIdSchema, IdempotencyKeySchema } from './ids';
import { UsdcMicrosSchema } from './money';
import { CoverageTermsSchema } from './terms';

export const PolicyholderSchema = z.object({
  id: EntityIdSchema,
  displayName: z.string().min(1),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  createdAt: z.string().datetime(),
});
export type Policyholder = z.infer<typeof PolicyholderSchema>;

export const AgentSchema = z.object({
  id: EntityIdSchema,
  policyholderId: EntityIdSchema,
  externalRef: z.string().min(1),
  label: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const CoverageProductSchema = z.object({
  id: EntityIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  coveredEventClass: z.string().min(1),
  synthetic: z.boolean(),
  active: z.boolean(),
  description: z.string(),
});
export type CoverageProduct = z.infer<typeof CoverageProductSchema>;

export const QuoteStatusSchema = z.enum([
  'draft',
  'offered',
  'accepted',
  'expired',
  'rejected',
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const QuoteSchema = z.object({
  id: EntityIdSchema,
  productId: EntityIdSchema,
  policyholderId: EntityIdSchema,
  agentId: EntityIdSchema,
  status: QuoteStatusSchema,
  terms: CoverageTermsSchema,
  idempotencyKey: IdempotencyKeySchema,
  offeredAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const PolicyStatusSchema = z.enum([
  'pending_funding',
  'bound',
  'active',
  'cancelled',
  'expired',
  'exhausted',
]);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

export const PolicySchema = z.object({
  id: EntityIdSchema,
  quoteId: EntityIdSchema,
  productId: EntityIdSchema,
  policyholderId: EntityIdSchema,
  agentId: EntityIdSchema,
  status: PolicyStatusSchema,
  terms: CoverageTermsSchema,
  fundingVerifiedAt: z.string().datetime().nullable(),
  boundAt: z.string().datetime().nullable(),
  activatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const CoveredExposureSchema = z.object({
  id: EntityIdSchema,
  policyId: EntityIdSchema,
  exposureKey: z.string().min(1),
  description: z.string(),
  limitMicros: UsdcMicrosSchema,
  createdAt: z.string().datetime(),
});
export type CoveredExposure = z.infer<typeof CoveredExposureSchema>;

export const IncidentStatusSchema = z.enum([
  'received',
  'associated',
  'evidenced',
  'validated',
  'rejected',
]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentSchema = z.object({
  id: EntityIdSchema,
  status: IncidentStatusSchema,
  /** Observed chain/system activity — not yet a verified covered event. */
  observedEventRef: z.string().min(1),
  observedAt: z.string().datetime({ offset: true }),
  policyId: EntityIdSchema.nullable(),
  exposureId: EntityIdSchema.nullable(),
  source: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Incident = z.infer<typeof IncidentSchema>;

export const EvidenceFactSchema = z.object({
  id: EntityIdSchema,
  bundleId: EntityIdSchema,
  key: z.string().min(1),
  value: z.string(),
  provenance: z.string().min(1),
  observedAt: z.string().datetime(),
});
export type EvidenceFact = z.infer<typeof EvidenceFactSchema>;

export const EvidenceBundleSchema = z.object({
  id: EntityIdSchema,
  incidentId: EntityIdSchema,
  collector: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export const ClaimStatusSchema = z.enum([
  'submitted',
  'assessing',
  'authorized',
  'denied',
  'settling',
  'settled',
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const ClaimSchema = z.object({
  id: EntityIdSchema,
  policyId: EntityIdSchema,
  incidentId: EntityIdSchema,
  status: ClaimStatusSchema,
  requestedMicros: UsdcMicrosSchema,
  authorizedMicros: UsdcMicrosSchema.nullable(),
  idempotencyKey: IdempotencyKeySchema,
  createdAt: z.string().datetime(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const AssessmentDecisionSchema = z.enum(['authorize', 'deny']);
export type AssessmentDecision = z.infer<typeof AssessmentDecisionSchema>;

export const AssessmentSchema = z.object({
  id: EntityIdSchema,
  claimId: EntityIdSchema,
  decision: AssessmentDecisionSchema,
  authorizedMicros: UsdcMicrosSchema.nullable(),
  /** Human/rule authority — never an AI majority vote alone. */
  authority: z.string().min(1),
  rationale: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const CapitalPoolSchema = z.object({
  id: EntityIdSchema,
  name: z.string().min(1),
  /** Total USDC deposited (micros). */
  depositedMicros: UsdcMicrosSchema,
  /** Outstanding claim/settlement liabilities. */
  outstandingLiabilityMicros: UsdcMicrosSchema,
  /** Shares outstanding (1 share = 1 micro initially for full collateralization). */
  sharesOutstanding: z.bigint().nonnegative(),
  createdAt: z.string().datetime(),
});
export type CapitalPool = z.infer<typeof CapitalPoolSchema>;

export const CapitalReservationStatusSchema = z.enum([
  'reserved',
  'released',
  'consumed',
]);
export type CapitalReservationStatus = z.infer<typeof CapitalReservationStatusSchema>;

export const CapitalReservationSchema = z.object({
  id: EntityIdSchema,
  poolId: EntityIdSchema,
  claimId: EntityIdSchema.nullable(),
  amountMicros: UsdcMicrosSchema,
  status: CapitalReservationStatusSchema,
  createdAt: z.string().datetime(),
});
export type CapitalReservation = z.infer<typeof CapitalReservationSchema>;

export const SettlementStatusSchema = z.enum(['prepared', 'executed', 'failed']);
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;

export const SettlementSchema = z.object({
  id: EntityIdSchema,
  claimId: EntityIdSchema,
  poolId: EntityIdSchema,
  amountMicros: UsdcMicrosSchema,
  status: SettlementStatusSchema,
  idempotencyKey: IdempotencyKeySchema,
  createdAt: z.string().datetime(),
});
export type Settlement = z.infer<typeof SettlementSchema>;

export const AuditEventSchema = z.object({
  id: EntityIdSchema,
  aggregateType: z.string().min(1),
  aggregateId: EntityIdSchema,
  eventType: z.string().min(1),
  payloadJson: z.string(),
  createdAt: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
