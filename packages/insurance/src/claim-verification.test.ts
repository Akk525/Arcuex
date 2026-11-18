import { afterEach, describe, expect, it, vi } from 'vitest';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { acceptAndBindPolicy, requestCoverageQuote } from './quote-to-bind';
import { intakeClaimsCase } from './claims-case-service';
import { CLAIM_FIXTURE, listClaimVerifications, verifyClaimFixture } from './claim-verification';
import * as oracle from './synthetic-oracle-wedge';

const owner = '0x1111111111111111111111111111111111111111';
const principal = { role: 'claimant' as const, subject: owner, walletAddress: owner };
const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  databases.splice(0).forEach((db) => db.close());
});
function setup() {
  const db = openDatabase();
  databases.push(db);
  const repo = new InsuranceRepository(db);
  const quote = requestCoverageQuote(repo, {
    idempotencyKey: 'quote-fixture-1',
    policyholder: { displayName: 'Fixture', walletAddress: owner },
    agent: { externalRef: 'agent', label: 'Fixture agent' },
  });
  const { policy, exposure } = acceptAndBindPolicy(repo, {
    quoteId: quote.id,
    idempotencyKey: 'bind-fixture-1',
    fundingVerified: true,
  });
  const c = intakeClaimsCase(
    repo,
    {
      policyId: policy.id,
      exposureId: exposure.id,
      claimantRef: owner,
      idempotencyKey: 'case-fixture-1',
      syntheticDemo: true,
      actor: 'ignored',
      observedEventRef: 'synthetic:oracle:wrongful-liquidation',
      observedAt: new Date().toISOString(),
    },
    principal,
  );
  const incident = repo.getIncident(c.incidentId!)!;
  const input = {
    fixtureRef: CLAIM_FIXTURE.reference,
    fixtureDigest: CLAIM_FIXTURE.digest,
    policyId: policy.id,
    incidentId: incident.id,
    observedAt: incident.observedAt,
  };
  return { db, repo, c, incident, input };
}
describe('server synthetic ClaimsCase verification', () => {
  it('executes the existing verifier, persists exact inputs and deduplicates without a state/authority change', async () => {
    const f = setup();
    const before = f.repo.getClaimsCase(f.c.id);
    const a = await verifyClaimFixture(f.repo, f.c.id, f.input, principal);
    const b = await verifyClaimFixture(f.repo, f.c.id, f.input, principal);
    expect(a).toEqual(b);
    expect(a.executionStatus).toBe('completed');
    expect(a.evidenceSufficiency).toBe('sufficient');
    expect(a.independentlyAuthenticated).toBe(false);
    expect(a.inputs).toEqual(f.input);
    expect(a.facts).toHaveLength(11);
    expect(listClaimVerifications(f.repo, f.c.id, principal)).toEqual([a]);
    expect(f.repo.getClaimsCase(f.c.id)).toEqual(before);
    expect(f.repo.listEvidenceManifests(f.c.id)).toEqual([]);
    expect(() => f.db.prepare('UPDATE claim_verifications SET record_json=?').run('{}')).toThrow(
      'immutable',
    );
    expect(() => f.db.prepare('DELETE FROM claim_verifications').run()).toThrow('immutable');
  });
  it.each([
    [{ fixtureDigest: 'sha256:manipulated' }, 'invalid'],
    [{ fixtureRef: 'unknown' }, 'invalid'],
    [{ policyId: 'wrong-policy' }, 'contradictory'],
    [{ incidentId: 'wrong-incident' }, 'contradictory'],
    [{ observedAt: 'invalid-timestamp' }, 'invalid'],
    [{ observedAt: '2020-01-01T00:00:00.000Z' }, 'contradictory'],
    [{ fixtureDigest: undefined }, 'missing'],
    [{ facts: [{ key: 'expected_outcome', value: 'VERIFIED' }] }, 'invalid'],
    [{ attestation: { issuedAt: '2000-01-01T00:00:00.000Z', signature: 'stale' } }, 'invalid'],
  ])('fails closed for manipulated/missing/unsupported evidence %j', async (patch, sufficiency) => {
    const f = setup();
    const r = await verifyClaimFixture(f.repo, f.c.id, { ...f.input, ...patch }, principal);
    expect(r.executionStatus).toBe('rejected');
    expect(r.evidenceSufficiency).toBe(sufficiency);
    expect(r.facts).toEqual([]);
    expect(f.repo.getClaimsCase(f.c.id)?.settlementAuthorization).toBe('none');
  });
  it('does not trust future or out-of-window stored incident times', async () => {
    for (const observedAt of ['2099-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z', 'bad']) {
      const f = setup();
      f.repo.runInTransaction(() => f.repo.saveIncident({ ...f.incident, observedAt }));
      const r = await verifyClaimFixture(f.repo, f.c.id, { ...f.input, observedAt }, principal);
      expect(r.executionStatus).toBe('rejected');
    }
  });
  it('rejects unauthorized execution, reads and duplicate replays without writing', async () => {
    const f = setup();
    const foreign = { ...principal, walletAddress: '0x2222222222222222222222222222222222222222' };
    await expect(verifyClaimFixture(f.repo, f.c.id, f.input, foreign)).rejects.toThrow('not owned');
    expect(f.repo.listClaimVerifications(f.c.id)).toEqual([]);
    await verifyClaimFixture(f.repo, f.c.id, f.input, principal);
    await expect(verifyClaimFixture(f.repo, f.c.id, f.input, foreign)).rejects.toThrow();
    expect(() => listClaimVerifications(f.repo, f.c.id, foreign)).toThrow();
  });
  it('persists verifier failures as invalid without leaking exception details', async () => {
    const f = setup();
    vi.spyOn(oracle, 'createSyntheticOracleVerifier').mockReturnValue({
      id: 'failed',
      verify: async () => {
        throw new Error('internal detail');
      },
    });
    const r = await verifyClaimFixture(f.repo, f.c.id, f.input, principal);
    expect(r.executionStatus).toBe('failed');
    expect(r.evidenceSufficiency).toBe('invalid');
    expect(JSON.stringify(r)).not.toContain('internal detail');
    expect(f.repo.getClaimsCase(f.c.id)?.status).toBe(f.c.status);
  });
  it('rejects a concurrent investigation change rather than binding stale results', async () => {
    const f = setup();
    vi.spyOn(oracle, 'createSyntheticOracleVerifier').mockReturnValue({
      id: 'concurrent',
      verify: async () => {
        f.repo.runInTransaction(() =>
          f.repo.saveIncident({ ...f.incident, observedEventRef: 'changed' }),
        );
        return { verified: true, outcome: 'VERIFIED', reason: 'fixture' };
      },
    });
    await expect(verifyClaimFixture(f.repo, f.c.id, f.input, principal)).rejects.toThrow('changed');
    expect(f.repo.listClaimVerifications(f.c.id)).toEqual([]);
  });
  it('refuses a previously successful replay after provenance changes', async () => {
    const f = setup();
    await verifyClaimFixture(f.repo, f.c.id, f.input, principal);
    f.repo.runInTransaction(() =>
      f.repo.saveIncident({ ...f.incident, observedEventRef: 'tampered' }),
    );
    await expect(verifyClaimFixture(f.repo, f.c.id, f.input, principal)).rejects.toThrow(
      'context changed',
    );
    expect(f.repo.listClaimVerifications(f.c.id)).toHaveLength(1);
  });
  it.each([
    [false, 'REVIEW', 'missing'],
    [false, 'REJECTED', 'contradictory'],
    [false, 'VERIFIED', 'contradictory'],
  ] as const)(
    'does not turn verifier negative/indeterminate results into success',
    async (verified, outcome, sufficiency) => {
      const f = setup();
      vi.spyOn(oracle, 'createSyntheticOracleVerifier').mockReturnValue({
        id: 'negative',
        verify: async () => ({ verified, outcome, reason: 'Fixture not sufficient' }),
      });
      const r = await verifyClaimFixture(f.repo, f.c.id, f.input, principal);
      expect(r.evidenceSufficiency).toBe(sufficiency);
      expect(f.repo.getClaimsCase(f.c.id)?.settlementAuthorization).toBe('none');
    },
  );
});
