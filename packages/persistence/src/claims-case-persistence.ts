/**
 * Additive persistence shapes for ClaimsCase (owned by @arcuex/insurance).
 * Kept here as structural records so persistence does not import insurance.
 */

export type PersistedClaimsCase = {
  id: string;
  schemaVersion: number;
  status: string;
  policyId: string;
  exposureId: string;
  incidentId: string | null;
  claimId: string | null;
  claimantRef: string;
  idempotencyKey: string;
  syntheticDemo: boolean;
  evidenceAuthenticity: string;
  coverageDetermination: string;
  settlementAuthorization: string;
  verifiedLossMicros: bigint | null;
  deductibleMicros: bigint;
  priorCompensationMicros: bigint;
  recoveriesMicros: bigint | null;
  remainingLimitMicros: bigint | null;
  lossCapMicros: bigint | null;
  payableMicros: bigint | null;
  lossKey: string | null;
  denialReasonCode: string | null;
  reviewReasonCode: string | null;
  authorityActor: string | null;
  settlementPrepId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedClaimsCaseEvent = {
  id: string;
  caseId: string;
  fromStatus: string;
  toStatus: string;
  actor: string;
  reasonCode: string;
  payloadJson: string;
  createdAt: string;
};

export type PersistedEvidenceManifest = {
  id: string;
  caseId: string;
  source: string;
  chain: string | null;
  blockHash: string | null;
  transactionHash: string | null;
  provenance: string;
  rawEvidenceDigest: string;
  verificationMethod: string;
  sourceReliability: string;
  syntheticFixture: boolean;
  createdAt: string;
};

function microsOrNull(value: unknown): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  return BigInt(String(value));
}

export function mapPersistedClaimsCase(row: Record<string, unknown>): PersistedClaimsCase {
  return {
    id: String(row.id),
    schemaVersion: Number(row.schema_version),
    status: String(row.status),
    policyId: String(row.policy_id),
    exposureId: String(row.exposure_id),
    incidentId: row.incident_id ? String(row.incident_id) : null,
    claimId: row.claim_id ? String(row.claim_id) : null,
    claimantRef: String(row.claimant_ref),
    idempotencyKey: String(row.idempotency_key),
    syntheticDemo: Number(row.synthetic_demo) === 1,
    evidenceAuthenticity: String(row.evidence_authenticity),
    coverageDetermination: String(row.coverage_determination),
    settlementAuthorization: String(row.settlement_authorization),
    verifiedLossMicros: microsOrNull(row.verified_loss_micros),
    deductibleMicros: BigInt(String(row.deductible_micros)),
    priorCompensationMicros: BigInt(String(row.prior_compensation_micros)),
    recoveriesMicros: microsOrNull(row.recoveries_micros),
    remainingLimitMicros: microsOrNull(row.remaining_limit_micros),
    lossCapMicros: microsOrNull(row.loss_cap_micros),
    payableMicros: microsOrNull(row.payable_micros),
    lossKey: row.loss_key ? String(row.loss_key) : null,
    denialReasonCode: row.denial_reason_code ? String(row.denial_reason_code) : null,
    reviewReasonCode: row.review_reason_code ? String(row.review_reason_code) : null,
    authorityActor: row.authority_actor ? String(row.authority_actor) : null,
    settlementPrepId: row.settlement_prep_id ? String(row.settlement_prep_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapPersistedClaimsCaseEvent(
  row: Record<string, unknown>,
): PersistedClaimsCaseEvent {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    fromStatus: String(row.from_status),
    toStatus: String(row.to_status),
    actor: String(row.actor),
    reasonCode: String(row.reason_code),
    payloadJson: String(row.payload_json),
    createdAt: String(row.created_at),
  };
}

export function mapPersistedEvidenceManifest(
  row: Record<string, unknown>,
): PersistedEvidenceManifest {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    source: String(row.source),
    chain: row.chain ? String(row.chain) : null,
    blockHash: row.block_hash ? String(row.block_hash) : null,
    transactionHash: row.transaction_hash ? String(row.transaction_hash) : null,
    provenance: String(row.provenance),
    rawEvidenceDigest: String(row.raw_evidence_digest),
    verificationMethod: String(row.verification_method),
    sourceReliability: String(row.source_reliability),
    syntheticFixture: Number(row.synthetic_fixture) === 1,
    createdAt: String(row.created_at),
  };
}
