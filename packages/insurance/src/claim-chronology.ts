import { z } from 'zod';
import type { InsuranceRepository } from '@arcuex/persistence';

export const COVERAGE_RELATIONS = [
  'before_inception',
  'at_inception',
  'during_coverage',
  'at_expiry',
  'after_expiry',
  'unresolved',
] as const;
type CoverageRelation = (typeof COVERAGE_RELATIONS)[number];

const timestampWithOffset = z.string().datetime({ offset: true });
const millisTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** Explicit, known offset and at most millisecond precision. Never infer local time. */
export function parseClaimTimestamp(raw: unknown): number | null {
  if (
    typeof raw !== 'string' ||
    !millisTimestamp.test(raw) ||
    raw.endsWith('-00:00') ||
    !timestampWithOffset.safeParse(raw).success
  )
    return null;
  const epochMs = Date.parse(raw);
  return Number.isFinite(epochMs) ? epochMs : null;
}

type PolicyWindow =
  | {
      source: 'procurement_terms' | 'legacy_terms';
      start: number | string | null;
      end: number | string | null;
      waitingSeconds: number | null;
    }
  | { source: 'missing_policy' | 'ambiguous_policy'; start: null; end: null; waitingSeconds: null };

export function readClaimPolicyWindow(repo: InsuranceRepository, policyId: string): PolicyWindow {
  const procurement = repo.getProcurementPolicy(policyId);
  const legacy = repo.getPolicy(policyId);
  if (procurement && legacy)
    return { source: 'ambiguous_policy', start: null, end: null, waitingSeconds: null };
  if (procurement)
    return {
      source: 'procurement_terms',
      start: procurement.terms?.effectiveAt ?? null,
      end: procurement.terms?.expiresAt ?? null,
      waitingSeconds: 0,
    };
  if (legacy)
    return {
      source: 'legacy_terms',
      start: legacy.terms.coverageStartsAt ?? null,
      end: legacy.terms.coverageEndsAt ?? null,
      waitingSeconds: legacy.terms.waitingPeriodSeconds ?? 0,
    };
  return { source: 'missing_policy', start: null, end: null, waitingSeconds: null };
}

const unixSecondsToMs = (value: unknown) => {
  if (typeof value !== 'number') return null;
  const ms = value * 1000;
  return Number.isSafeInteger(value) && Number.isSafeInteger(ms) && Math.abs(ms) <= 8.64e15
    ? ms
    : null;
};

export function computeClaimChronology(
  policyId: string,
  window: PolicyWindow,
  observation: { id: string | null; source: string; raw: string | null },
  linked: boolean,
) {
  const parsePolicyTimestamp =
    window.source === 'procurement_terms' ? unixSecondsToMs : parseClaimTimestamp;
  const startMs = parsePolicyTimestamp(window.start);
  const endMs = parsePolicyTimestamp(window.end);
  const observedMs = parseClaimTimestamp(observation.raw);
  const waitingMs = (window.waitingSeconds ?? 0) * 1000;
  let issue: string | null = null;
  if (window.source === 'missing_policy' || window.source === 'ambiguous_policy')
    issue = window.source;
  else if (window.start === null || window.end === null) issue = 'missing_policy_timestamp';
  else if (
    startMs === null ||
    endMs === null ||
    endMs <= startMs ||
    !Number.isSafeInteger(window.waitingSeconds) ||
    !Number.isSafeInteger(waitingMs) ||
    waitingMs < 0 ||
    !Number.isSafeInteger(startMs + waitingMs)
  )
    issue = 'invalid_policy_window';
  else if (observation.raw === null) issue = 'missing_incident_timestamp';
  else if (observedMs === null) issue = 'invalid_incident_timestamp';
  else if (!linked) issue = 'unlinked_incident';
  let relation: CoverageRelation = 'unresolved';
  if (!issue && observedMs !== null && startMs !== null && endMs !== null) {
    if (observedMs < startMs) relation = 'before_inception';
    else if (observedMs === startMs) relation = 'at_inception';
    else if (observedMs < endMs) relation = 'during_coverage';
    else if (observedMs === endMs) relation = 'at_expiry';
    else relation = 'after_expiry';
  }
  return {
    policyId,
    policySource: window.source,
    startsAt: { raw: window.start, epochMs: startMs },
    endsAt: { raw: window.end, epochMs: endMs },
    incident: { ...observation, epochMs: observedMs },
    relation,
    issue,
    boundary: 'inclusive' as const,
    waitingSeconds: window.waitingSeconds,
    waitingPeriodSatisfied:
      !issue && observedMs !== null && startMs !== null ? observedMs >= startMs + waitingMs : null,
  };
}

export type ClaimChronology = ReturnType<typeof computeClaimChronology>;

export function readClaimChronology(
  repo: InsuranceRepository,
  claim: { policyId: string; incidentId: string | null; exposureId: string },
) {
  const incident = claim.incidentId ? repo.getIncident(claim.incidentId) : null;
  return computeClaimChronology(
    claim.policyId,
    readClaimPolicyWindow(repo, claim.policyId),
    {
      id: incident?.id ?? claim.incidentId,
      source: incident?.source ?? 'missing_incident',
      raw: incident?.observedAt ?? null,
    },
    !!incident &&
      (incident.policyId === null || incident.policyId === claim.policyId) &&
      (incident.exposureId === null || incident.exposureId === claim.exposureId) &&
      repo.incidentMatchesPolicy(incident.id, claim.policyId, claim.exposureId),
  );
}

export function isWithinClaimWindow(chronology: ClaimChronology, nowMs: number) {
  return (
    (chronology.relation === 'at_inception' ||
      chronology.relation === 'during_coverage' ||
      chronology.relation === 'at_expiry') &&
    chronology.incident.epochMs !== null &&
    chronology.incident.epochMs <= nowMs
  );
}
