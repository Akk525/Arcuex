import {
  checkClaimAdjudication,
  claimVerificationContext,
  outstandingProofRequests,
  type AdjudicationBinding,
  type ClaimsCase,
  type PersistedClaimVerification,
} from '@arcuex/insurance';
import type { InsuranceRepository } from '@arcuex/persistence';
import {
  reviewBlockerMessage,
  settlementBlockerMessage,
  type CaseTriage,
  type ReviewReadiness,
  type VerificationState,
} from '@/lib/claims/investigation-presentation';

export const workbenchStatuses = new Set([
  'SUBMITTED',
  'COLLECTING_EVIDENCE',
  'INVESTIGATING',
  'REVIEW',
  'APPROVED',
  'SETTLEMENT_PENDING',
  'SETTLEMENT_FAILED',
]);

export function projectReviewReadiness(
  repo: InsuranceRepository,
  claim: ClaimsCase,
  records: PersistedClaimVerification[],
) {
  const digest = records.length ? claimVerificationContext(repo, claim.id) : null;
  const now = Date.now();
  const verifications = records.map((v) => {
    const stale =
      v.contextDigest !== digest ||
      ('validUntilMs' in v && typeof v.validUntilMs === 'number' && v.validUntilMs <= now);
    const reviewState: VerificationState = stale
      ? 'stale'
      : v.executionStatus === 'completed' && v.evidenceSufficiency === 'sufficient'
        ? 'current'
        : 'failed';
    return { ...v, reviewState };
  });
  const candidate = verifications.filter((v) => v.reviewState === 'current').at(-1);
  const reviewReadiness: ReviewReadiness = { verificationId: null, blocker: null };
  if (['SUBMITTED', 'COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(claim.status)) {
    const checked = checkClaimAdjudication(repo, claim, {
      verificationId: candidate?.id,
      verifiedLossMicros: null,
      recoveriesMicros: null,
    });
    let blocker = checked.reason;
    if (blocker === 'CONTRACTUAL_REVIEW_REQUIRED') {
      if (!candidate?.lossAssessment?.recoveriesResolved) blocker = 'UNRESOLVED_RECOVERIES';
      else if (claim.syntheticDemo && claim.evidenceAuthenticity !== 'synthetic_fixture')
        blocker = 'FIXTURE_AUTHENTICITY_REQUIRED';
      else blocker = null;
    }
    if (!candidate && blocker === 'PERSISTED_VERIFICATION_REQUIRED' && verifications.length) {
      blocker = verifications.some((v) => v.reviewState === 'failed')
        ? 'INSUFFICIENT_VERIFICATION_EVIDENCE'
        : 'STALE_VERIFICATION_CONTEXT';
    }
    reviewReadiness.blocker = blocker;
    if (!blocker) reviewReadiness.verificationId = candidate?.id ?? null;
  }
  const verificationStates = Object.fromEntries(
    verifications.map(({ id, reviewState }) => [id, reviewState]),
  );
  return { verificationStates, reviewReadiness };
}

/** Stored evidence preflight only. Preparation still checks canonical chain state and financial gates. */
export function settlementVerificationBlocker(repo: InsuranceRepository, claim: ClaimsCase) {
  if (!claim.adjudicationBindingJson) return 'SETTLEMENT_BINDING_MISSING';
  let binding: AdjudicationBinding | null;
  try {
    binding = JSON.parse(claim.adjudicationBindingJson) as AdjudicationBinding | null;
  } catch {
    return 'SETTLEMENT_BINDING_MISSING';
  }
  if (
    !binding?.verificationId ||
    binding.caseId !== claim.id ||
    binding.incidentId !== claim.incidentId
  )
    return 'SETTLEMENT_BINDING_MISSING';
  const checked = checkClaimAdjudication(repo, claim, {
    verificationId: binding.verificationId,
    contractualReview: binding.reviewer?.contractualReview,
    verifiedLossMicros: claim.verifiedLossMicros,
    recoveriesMicros: claim.recoveriesMicros,
    priorCompensationMicros: claim.priorCompensationMicros,
  });
  if (checked.reason) return checked.reason;
  return checked.verification?.contextDigest === binding.verificationContextDigest
    ? null
    : 'STALE_VERIFICATION_CONTEXT';
}

export function projectClaimTriage(
  repo: InsuranceRepository,
  claim: ClaimsCase,
  role: string,
  fixtureMode: boolean,
): CaseTriage {
  if (['APPROVED', 'SETTLEMENT_PENDING', 'SETTLEMENT_FAILED'].includes(claim.status)) {
    let reason = 'An authorized settlement session is required to prepare payment.';
    if (fixtureMode || claim.syntheticDemo || claim.evidenceAuthenticity === 'synthetic_fixture')
      reason = 'Synthetic fixture. Settlement is blocked and there is no payment action.';
    else if (claim.status === 'SETTLEMENT_PENDING')
      reason = 'Await a confirmed settlement receipt and reconcile it before closing the case.';
    else if (role === 'authority') {
      const blocker = settlementVerificationBlocker(repo, claim);
      reason = blocker
        ? settlementBlockerMessage(blocker)
        : 'Review the frozen decision and request settlement preparation. Chain checks run before preparation.';
    }
    return { section: 'settlement', reason };
  }
  const open = outstandingProofRequests(repo, claim.id);
  if (open.length) {
    const responses = new Set(
      repo
        .listInvestigationEntries(claim.id)
        .filter((entry) => entry.kind === 'proof_submission')
        .map((entry) => (JSON.parse(entry.payloadJson) as { requestId?: string }).requestId),
    );
    return open.some((entry) => responses.has(entry.id))
      ? {
          section: 'awaiting_human',
          reason: 'Review the linked claimant response and resolve its request.',
        }
      : {
          section: 'awaiting_evidence',
          reason: 'Waiting for proof linked to an open evidence request.',
        };
  }
  const records = repo
    .listClaimVerifications(claim.id)
    .map((row) => JSON.parse(row.recordJson) as PersistedClaimVerification);
  const { reviewReadiness } = projectReviewReadiness(repo, claim, records);
  if (reviewReadiness.verificationId && ['INVESTIGATING', 'REVIEW'].includes(claim.status))
    return {
      section: 'ready',
      reason: 'Review policy applicability and exclusions, then record a human determination.',
    };
  const blocker = reviewReadiness.blocker;
  if (
    blocker &&
    records.length &&
    (blocker.includes('VERIFICATION') || blocker === 'UNSUPPORTED_EVIDENCE_REQUIRES_REVIEW')
  )
    return { section: 'verification_attention', reason: reviewBlockerMessage(blocker) };
  return {
    section: 'awaiting_human',
    reason: blocker
      ? reviewBlockerMessage(blocker)
      : 'Review the intake record before opening adjudication.',
  };
}
