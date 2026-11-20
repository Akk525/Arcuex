import {
  outstandingProofRequests,
  type ClaimsCase,
  type PersistedClaimVerification,
} from '@arcuex/insurance';
import type { InsuranceRepository } from '@arcuex/persistence';
import { PROCUREMENT_OFFERINGS } from '@arcuex/domain/procurement';
import { projectReviewReadiness } from './claims-review-projection';

export type ClaimListContext = {
  /** Product name of the linked policy, when recorded. */
  product: string | null;
  /** Insured agent label and position from the procured policy, when recorded. */
  insured: { label: string | null; position: string | null };
  incident: { ref: string; observedAt: string } | null;
  openRequests: number;
  /** Open requests that already have a linked claimant response awaiting human review. */
  respondedRequests: number;
};

/** Read-only labels and counts for list views. Never changes a case or its eligibility. */
export function claimListContext(repo: InsuranceRepository, claim: ClaimsCase): ClaimListContext {
  const procurement = repo.getProcurementPolicy(claim.policyId);
  const terms = procurement?.terms;
  const agent = terms?.agentId ? repo.getProcurementAgent(terms.agentId) : null;
  const legacyExposure = terms
    ? null
    : repo.listExposures(claim.policyId).find((e) => e.id === claim.exposureId);
  const incident = claim.incidentId ? repo.getIncident(claim.incidentId) : null;
  const open = outstandingProofRequests(repo, claim.id);
  const responded = new Set(
    repo
      .listInvestigationEntries(claim.id)
      .filter((entry) => entry.kind === 'proof_submission')
      .map((entry) => (JSON.parse(entry.payloadJson) as { requestId?: string }).requestId),
  );
  return {
    product: terms
      ? (PROCUREMENT_OFFERINGS.find((o) => o.code === terms.productCode)?.name ?? null)
      : null,
    insured: {
      label: agent?.label ?? legacyExposure?.description ?? null,
      position: terms?.exposure?.position ?? null,
    },
    incident: incident ? { ref: incident.observedEventRef, observedAt: incident.observedAt } : null,
    openRequests: open.length,
    respondedRequests: open.filter((entry) => responded.has(entry.id)).length,
  };
}

export type VerificationFreshness = {
  state: 'current' | 'stale' | 'failed' | 'none';
  /** Latest verifier record time. */
  at: string | null;
  /** Expiry of the latest record's validity, when the verifier sets one. */
  validUntilMs: number | null;
  records: number;
};

/** Freshness of the latest persisted verifier record, using the same rule as review readiness. */
export function verificationFreshness(
  repo: InsuranceRepository,
  claim: ClaimsCase,
): VerificationFreshness {
  const records = repo
    .listClaimVerifications(claim.id)
    .map((row) => JSON.parse(row.recordJson) as PersistedClaimVerification);
  if (!records.length) return { state: 'none', at: null, validUntilMs: null, records: 0 };
  const { verificationStates } = projectReviewReadiness(repo, claim, records);
  const latest = records.at(-1)!;
  const raw = latest as PersistedClaimVerification & { createdAt?: string; validUntilMs?: number };
  return {
    state: verificationStates[latest.id] ?? 'failed',
    at: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    validUntilMs: typeof raw.validUntilMs === 'number' ? raw.validUntilMs : null,
    records: records.length,
  };
}
