import { PROCUREMENT_PRODUCT, SYNTHETIC_PRODUCT_CODE } from '@arcuex/domain';
import type { InsuranceRepository } from '@arcuex/persistence';
import type { ClaimsCase } from './claims-case';
import {
  claimVerificationContext,
  CLAIM_FIXTURE,
  type ClaimVerificationRecord,
} from './claim-verification';

export type ContractualReview = {
  eventApplies: boolean;
  exclusionsResolved: boolean;
  rationale: string;
};

/** Human contractual determination remains separate from fixture consistency. */
export function checkClaimAdjudication(
  repo: InsuranceRepository,
  c: ClaimsCase,
  input: {
    verificationId?: string;
    contractualReview?: ContractualReview;
    verifiedLossMicros: bigint | null;
    recoveriesMicros: bigint | null;
    priorCompensationMicros?: bigint;
  },
) {
  const records = repo.listClaimVerifications(c.id);
  const record = records.find(
    (r) => (JSON.parse(r.recordJson) as ClaimVerificationRecord).id === input.verificationId,
  );
  const verification = record ? (JSON.parse(record.recordJson) as ClaimVerificationRecord) : null;
  const fail = (reason: string) => ({ reason, verification });
  if (!verification) return fail('PERSISTED_VERIFICATION_REQUIRED');
  if (
    verification.caseId !== c.id ||
    verification.contextDigest !== claimVerificationContext(repo, c.id)
  )
    return fail('STALE_VERIFICATION_CONTEXT');
  // A later contradictory or incomplete execution cannot be hidden by selecting an older success.
  if (
    records.some((r) => {
      const v = JSON.parse(r.recordJson) as ClaimVerificationRecord;
      return (
        v.contextDigest === verification.contextDigest &&
        (v.executionStatus !== 'completed' || v.evidenceSufficiency !== 'sufficient')
      );
    })
  )
    return fail('UNRESOLVED_VERIFICATION_FINDINGS');
  if (
    verification.executionStatus !== 'completed' ||
    verification.evidenceSufficiency !== 'sufficient'
  )
    return fail('INSUFFICIENT_VERIFICATION_EVIDENCE');
  if (
    verification.fixtureReference !== CLAIM_FIXTURE.reference ||
    verification.fixtureDigest !== CLAIM_FIXTURE.digest ||
    verification.authenticity !== 'synthetic_fixture' ||
    verification.independentlyAuthenticated !== false
  )
    return fail('UNSUPPORTED_VERIFICATION');
  const manifests = repo.listEvidenceManifests(c.id);
  if (!manifests.length) return fail('MISSING_FIXTURE_MANIFEST');
  if (
    manifests.some(
      (m) =>
        !m.syntheticFixture ||
        m.rawEvidenceDigest !== CLAIM_FIXTURE.digest ||
        m.verificationMethod !== 'fixture_consistency',
    )
  )
    return fail('UNSUPPORTED_EVIDENCE_REQUIRES_REVIEW');
  const policy = repo.claimsPolicyContext(c.policyId);
  const incident = c.incidentId ? repo.getIncident(c.incidentId) : null;
  const exposure = policy?.exposures.find((e) => e.id === c.exposureId);
  if (
    !policy?.confirmed ||
    !policy.synthetic ||
    !incident ||
    !exposure ||
    !repo.incidentMatchesPolicy(incident.id, c.policyId, c.exposureId)
  )
    return fail('POLICY_INCIDENT_NOT_ELIGIBLE');
  const at = Date.parse(incident.observedAt) / 1000;
  const procurement = repo.getProcurementPolicy(c.policyId);
  const legacy = repo.getPolicy(c.policyId);
  const waitingPeriod = legacy?.terms.waitingPeriodSeconds ?? 0;
  if (
    !Number.isFinite(at) ||
    at < policy.effectiveAt + waitingPeriod ||
    at > policy.expiresAt ||
    at > Date.now() / 1000
  )
    return fail('INCIDENT_OUTSIDE_COVERAGE');
  if (
    policy.deductibleMicros !== c.deductibleMicros ||
    policy.limitMicros !== c.lossCapMicros ||
    exposure.limitMicros !== c.remainingLimitMicros ||
    policy.beneficiary?.toLowerCase() !== c.payoutTo?.toLowerCase()
  )
    return fail('POLICY_BINDING_CHANGED');
  if (
    procurement
      ? procurement.terms.version !== 1 ||
        procurement.terms.exposure.chainId !== 5042002 ||
        procurement.terms.productCode !== PROCUREMENT_PRODUCT.code ||
        procurement.terms.insuredEvent !== PROCUREMENT_PRODUCT.event ||
        JSON.stringify(procurement.terms.exclusions) !==
          JSON.stringify(PROCUREMENT_PRODUCT.exclusions) ||
        procurement.terms.exposure.protocol !== PROCUREMENT_PRODUCT.protocol
      : legacy?.terms.productCode !== SYNTHETIC_PRODUCT_CODE ||
        legacy.terms.coveredEventClass !== 'financial_loss'
  )
    return fail('UNSUPPORTED_CONTRACTUAL_TERMS');
  const review = input.contractualReview;
  if (
    review?.eventApplies !== true ||
    review.exclusionsResolved !== true ||
    typeof review.rationale !== 'string' ||
    !review.rationale.trim() ||
    review.rationale.length > 4000
  )
    return fail('CONTRACTUAL_REVIEW_REQUIRED');
  const loss = verification.lossAssessment;
  if (!loss || loss.recoveriesResolved !== true || input.recoveriesMicros === null)
    return fail('UNRESOLVED_RECOVERIES');
  if (
    input.verifiedLossMicros?.toString() !== loss.grossLossMicros ||
    input.recoveriesMicros.toString() !== loss.recoveriesMicros ||
    (input.priorCompensationMicros ?? c.priorCompensationMicros).toString() !==
      loss.priorCompensationMicros
  )
    return fail('LOSS_ASSESSMENT_MISMATCH');
  if (!c.syntheticDemo || c.evidenceAuthenticity !== 'synthetic_fixture')
    return fail('FIXTURE_AUTHENTICITY_REQUIRED');
  return { reason: null, verification };
}
