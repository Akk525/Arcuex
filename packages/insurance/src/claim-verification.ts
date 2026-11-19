import { createHash } from 'node:crypto';
import { z } from 'zod';
import { newId, ValidationError } from '@arcuex/domain';
import type { InsuranceRepository } from '@arcuex/persistence';
import { assertClaimsRole, claimsActorId, type ClaimsPrincipal } from './claims-auth';
import { canAccessClaimsPolicy, getClaimsCase } from './claims-case-service';
import type { IndependentLiquidationVerification } from './independent-liquidation';
import {
  isWithinClaimWindow,
  parseClaimTimestamp,
  readClaimChronology,
  type ClaimChronology,
} from './claim-chronology';
import {
  createSyntheticOracleEvidenceProvider,
  createSyntheticOracleVerifier,
  SYNTHETIC_ORACLE_WEDGE_ID,
  type SyntheticOracleFixture,
} from './synthetic-oracle-wedge';

const jsonSafe = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
export const verificationDigest = (text: string) =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`;
// Server-owned, versioned catalog: callers cannot supply facts, outcomes, or verifiers.
const fixture: SyntheticOracleFixture & {
  recoveriesMicros: string;
  priorCompensationMicros: string;
  recoveriesResolved: boolean;
} = Object.freeze({
  expectedOutcome: 'VERIFIED',
  adapterRatioBps: 100,
  canonicalRatioBps: 200,
  wouldRemainHealthy: true,
  seizedMicros: '2000000',
  debtExtinguishedMicros: '500000',
  deductibleMicros: '100000',
  recoveriesMicros: '0',
  priorCompensationMicros: '0',
  recoveriesResolved: true,
});
export const CLAIM_FIXTURE = Object.freeze({
  reference: `${SYNTHETIC_ORACLE_WEDGE_ID}:wrongful-liquidation:v2`,
  raw: JSON.stringify(fixture),
  digest: verificationDigest(JSON.stringify(fixture)),
});
const Envelope = z
  .object({
    revision: z.number().int().positive().optional(),
    fixtureRef: z.string(),
    fixtureDigest: z.string(),
    policyId: z.string(),
    incidentId: z.string(),
    observedAt: z.string().refine((value) => parseClaimTimestamp(value) !== null),
  })
  .strict();
export function claimVerificationContext(repo: InsuranceRepository, caseId: string): string {
  const c = repo.getClaimsCase(caseId);
  const proof = repo
    .listInvestigationEntries(caseId)
    .filter((e) => e.kind === 'proof_submission')
    .map((e) => ({ id: e.id, recordHash: e.recordHash }));
  return verificationDigest(
    jsonSafe({
      incident: c?.incidentId ? repo.getIncident(c.incidentId) : null,
      policy: c ? repo.claimsPolicyContext(c.policyId) : null,
      terms: c
        ? (repo.getProcurementPolicy(c.policyId)?.terms ?? repo.getPolicy(c.policyId)?.terms)
        : null,
      manifests: repo.listEvidenceManifests(caseId),
      ...(proof.length ? { investigationProof: proof } : {}),
    }),
  );
}
// Explicit synthetic scenario assumptions, never inferred from the absence of evidence.
export const FIXTURE_LOSS_ASSESSMENT = Object.freeze({
  grossLossMicros: (
    BigInt(fixture.seizedMicros) - BigInt(fixture.debtExtinguishedMicros)
  ).toString(),
  recoveriesMicros: fixture.recoveriesMicros,
  priorCompensationMicros: fixture.priorCompensationMicros,
  recoveriesResolved: fixture.recoveriesResolved,
  asset: 'USDC',
  scale: 6,
  basis: 'server-owned synthetic scenario; no external economic authentication',
});
export type ClaimVerificationRecord = {
  id: string;
  caseId: string;
  requestDigest: string;
  actor: string;
  createdAt: string;
  verifierVersion: string;
  fixtureReference: string | null;
  fixtureDigest: string | null;
  contextDigest: string;
  inputs: unknown;
  chronology?: ClaimChronology;
  fixtureInputs: SyntheticOracleFixture;
  lossAssessment?: typeof FIXTURE_LOSS_ASSESSMENT;
  facts: unknown[];
  findings: string[];
  executionStatus: 'completed' | 'rejected' | 'failed';
  evidenceSufficiency: 'sufficient' | 'missing' | 'contradictory' | 'invalid';
  authenticity: 'synthetic_fixture';
  independentlyAuthenticated: false;
};
export type PersistedClaimVerification =
  ClaimVerificationRecord | IndependentLiquidationVerification;

function accessible(repo: InsuranceRepository, caseId: string, principal: ClaimsPrincipal) {
  assertClaimsRole(principal, ['claimant', 'system', 'reviewer', 'authority']);
  const c = getClaimsCase(repo, caseId);
  if (!c || !canAccessClaimsPolicy(repo, principal, c.policyId))
    throw new ValidationError('ClaimsCase not found or not owned');
  return c;
}
export function listClaimVerifications(
  repo: InsuranceRepository,
  caseId: string,
  principal: ClaimsPrincipal,
) {
  accessible(repo, caseId, principal);
  return repo
    .listClaimVerifications(caseId)
    .map((row) => JSON.parse(row.recordJson) as PersistedClaimVerification);
}

/** Fixture consistency only. Never transitions a case or creates an approval/payment. */
export async function verifyClaimFixture(
  repo: InsuranceRepository,
  caseId: string,
  input: unknown,
  principal: ClaimsPrincipal,
): Promise<ClaimVerificationRecord> {
  const current = accessible(repo, caseId, principal);
  if (!current.syntheticDemo)
    throw new ValidationError('Synthetic fixture cannot verify an independent claim');
  if (!['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(current.status))
    throw new ValidationError('Verification requires an open evidence investigation');
  const raw = JSON.stringify(input);
  if (!raw || raw.length > 16000) throw new ValidationError('Invalid verification envelope');
  const requestDigest = verificationDigest(raw);
  const incident = current.incidentId ? repo.getIncident(current.incidentId) : null;
  const policy = repo.claimsPolicyContext(current.policyId);
  const contextDigest = claimVerificationContext(repo, caseId);
  const chronology = readClaimChronology(repo, current);
  const previous = listClaimVerifications(repo, caseId, principal).find(
    (r): r is ClaimVerificationRecord => 'fixtureInputs' in r && r.requestDigest === requestDigest,
  );
  if (previous) {
    if (previous.contextDigest !== contextDigest)
      throw new ValidationError('Verification context changed; replay is unsafe');
    if (
      previous.evidenceSufficiency === 'sufficient' &&
      !isWithinClaimWindow(chronology, Date.now())
    )
      throw new ValidationError(
        'Persisted verification has unresolved or ineligible chronology; use a new verification revision',
      );
    return previous;
  }
  const parsed = Envelope.safeParse(JSON.parse(raw));
  const record: ClaimVerificationRecord = {
    id: newId(),
    caseId,
    requestDigest,
    actor: claimsActorId(principal),
    createdAt: new Date().toISOString(),
    verifierVersion: `${SYNTHETIC_ORACLE_WEDGE_ID}:verifier:integration-v2`,
    fixtureReference: parsed.success ? parsed.data.fixtureRef : null,
    fixtureDigest: parsed.success ? parsed.data.fixtureDigest : null,
    contextDigest,
    inputs: JSON.parse(raw),
    chronology,
    fixtureInputs: fixture,
    facts: [],
    findings: [],
    executionStatus: 'rejected',
    evidenceSufficiency: 'invalid',
    authenticity: 'synthetic_fixture',
    independentlyAuthenticated: false,
  };
  if (!parsed.success) {
    record.evidenceSufficiency = parsed.error.issues.some(
      (i) => i.code === 'invalid_type' && i.received === 'undefined',
    )
      ? 'missing'
      : 'invalid';
    record.findings.push(
      'Required envelope missing or invalid. External attestations, facts and outcomes are unsupported.',
    );
  } else if (
    !incident ||
    !policy ||
    !policy.confirmed ||
    !policy.synthetic ||
    !repo.incidentMatchesPolicy(incident.id, current.policyId, current.exposureId)
  ) {
    record.findings.push('Trusted synthetic policy/incident association unavailable');
  } else if (
    parsed.data.policyId !== current.policyId ||
    parsed.data.incidentId !== incident.id ||
    parsed.data.observedAt !== incident.observedAt
  ) {
    record.evidenceSufficiency = 'contradictory';
    record.findings.push('Envelope contradicts the linked policy/incident');
  } else if (!isWithinClaimWindow(chronology, Date.now())) {
    record.findings.push(
      'Incident chronology is unresolved, outside the policy window, or in the future',
    );
  } else if (
    parsed.data.fixtureRef !== CLAIM_FIXTURE.reference ||
    parsed.data.fixtureDigest !== CLAIM_FIXTURE.digest ||
    verificationDigest(CLAIM_FIXTURE.raw) !== CLAIM_FIXTURE.digest
  ) {
    record.findings.push('Unsupported fixture reference or untrusted digest');
  } else {
    try {
      const { facts } = await createSyntheticOracleEvidenceProvider(fixture).collect({ incident });
      record.facts = facts;
      const result = await createSyntheticOracleVerifier().verify({ incident, facts });
      record.findings.push(result.reason);
      record.executionStatus = 'completed';
      if (result.verified && result.outcome === 'VERIFIED')
        record.lossAssessment = FIXTURE_LOSS_ASSESSMENT;
      record.evidenceSufficiency =
        result.verified && result.outcome === 'VERIFIED'
          ? 'sufficient'
          : result.outcome === 'REVIEW'
            ? 'missing'
            : 'contradictory';
    } catch {
      record.executionStatus = 'failed';
      record.evidenceSufficiency = 'invalid';
      record.findings.push('Verifier execution failed; no verification established');
    }
  }
  record.findings.push(
    'Synthetic fixture consistency only; policy applicability, external event, causal truth and economic loss remain independently unverified. No decision or settlement authorization.',
  );
  return repo.runInTransaction(() => {
    const latest = accessible(repo, caseId, principal);
    if (
      latest.rowVersion !== current.rowVersion ||
      claimVerificationContext(repo, caseId) !== contextDigest
    )
      throw new ValidationError('Investigation changed during verification; retry');
    const duplicate = listClaimVerifications(repo, caseId, principal).find(
      (r): r is ClaimVerificationRecord =>
        'fixtureInputs' in r && r.requestDigest === requestDigest,
    );
    if (duplicate) return duplicate;
    repo.saveClaimVerification({
      id: record.id,
      caseId,
      requestDigest,
      recordJson: JSON.stringify(record),
    });
    repo.insertAudit('claims_case', caseId, 'fixture.verification', {
      verificationId: record.id,
      requestDigest,
    });
    return record;
  });
}
