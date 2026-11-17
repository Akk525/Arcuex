import { formatUsdc, type UsdcMicros } from '@arcuex/domain';
import type { ClaimsCase, ClaimsCaseEvent } from '@arcuex/insurance';

function microsField(value: UsdcMicros | bigint | null): {
  micros: string | null;
  usdc: string | null;
} {
  if (value === null) return { micros: null, usdc: null };
  return { micros: value.toString(), usdc: formatUsdc(value) };
}

export function serializeClaimsCase(c: ClaimsCase) {
  return {
    id: c.id,
    schemaVersion: c.schemaVersion,
    status: c.status,
    policyId: c.policyId,
    exposureId: c.exposureId,
    incidentId: c.incidentId,
    claimId: c.claimId,
    claimantRef: c.claimantRef,
    idempotencyKey: c.idempotencyKey,
    syntheticDemo: c.syntheticDemo,
    evidenceAuthenticity: c.evidenceAuthenticity,
    coverageDetermination: c.coverageDetermination,
    settlementAuthorization: c.settlementAuthorization,
    verifiedLoss: microsField(c.verifiedLossMicros),
    deductible: microsField(c.deductibleMicros),
    priorCompensation: microsField(c.priorCompensationMicros),
    recoveries: microsField(c.recoveriesMicros),
    remainingLimit: microsField(c.remainingLimitMicros),
    lossCap: microsField(c.lossCapMicros),
    payable: microsField(c.payableMicros),
    lossKey: c.lossKey,
    denialReasonCode: c.denialReasonCode,
    reviewReasonCode: c.reviewReasonCode,
    authorityActor: c.authorityActor,
    settlementPrepId: c.settlementPrepId,
    payoutTo: c.payoutTo,
    evidenceRoot: c.evidenceRoot,
    adjudicationBindingJson: c.adjudicationBindingJson,
    rowVersion: c.rowVersion,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    labels: {
      synthetic:
        c.syntheticDemo || c.evidenceAuthenticity === 'synthetic_fixture'
          ? 'SYNTHETIC FIXTURE — consistency only; not independently verified real-world loss'
          : null,
    },
  };
}

export function serializeCaseEvent(e: ClaimsCaseEvent) {
  return {
    id: e.id,
    caseId: e.caseId,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    actor: e.actor,
    reasonCode: e.reasonCode,
    payload: JSON.parse(e.payloadJson) as unknown,
    createdAt: e.createdAt,
  };
}
