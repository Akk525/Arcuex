import { describe, it, expect } from 'vitest';
import { newId, PROCUREMENT_PRODUCT, type ProcurementPolicy } from '@arcuex/domain';
import { openDatabase, InsuranceRepository, ProcurementStore } from '@arcuex/persistence';
import {
  intakeClaimsCase,
  attachEvidenceManifest,
  completeEvidenceOrReview,
  adjudicateClaimsCase,
  authorizeSettlementPreparation,
} from './claims-case-service';
const owner = '0x1111111111111111111111111111111111111111',
  beneficiary = '0x2222222222222222222222222222222222222222';
const claimant = { role: 'claimant' as const, subject: owner, walletAddress: owner };
const foreign = {
  role: 'claimant' as const,
  subject: 'foreign',
  walletAddress: '0x3333333333333333333333333333333333333333',
};
const reviewer = { role: 'reviewer' as const, subject: 'reviewer' };
function fixture(confirmed = true) {
  const db = openDatabase(),
    repo = new InsuranceRepository(db),
    store = new ProcurementStore(db),
    now = Math.floor(Date.now() / 1000),
    policyId = newId(),
    agentId = newId();
  const p: ProcurementPolicy = {
    state: 'prepared',
    payer: owner,
    delegationId: null,
    bindTx: null,
    confirmedAt: null,
    digest: `0x${'ab'.repeat(32)}`,
    terms: {
      version: 1,
      policyId,
      quoteId: newId(),
      productCode: PROCUREMENT_PRODUCT.code,
      agentId,
      owner,
      beneficiary,
      exposure: {
        chainId: 5042002,
        protocol: PROCUREMENT_PRODUCT.protocol,
        position: 'synthetic-position',
        notionalMicros: '1000000',
      },
      eligibility: {
        positionHealthy: true,
        noKnownIncident: true,
        syntheticOnly: true,
        ownerAttestsControl: true,
      },
      premiumMicros: '10000',
      limitMicros: '1000000',
      deductibleMicros: '100000',
      effectiveAt: now - 2000,
      expiresAt: now + 86400,
      quoteExpiresAt: now - 2300,
      insuredEvent: PROCUREMENT_PRODUCT.event,
      exclusions: PROCUREMENT_PRODUCT.exclusions,
      synthetic: true,
    },
  };
  store.insertPolicy(p);
  if (confirmed) store.confirm(policyId, `0x${'cd'.repeat(32)}`, now - 2400);
  const input = {
    policyId,
    exposureId: agentId,
    claimantRef: owner,
    idempotencyKey: 'proc-claim-1',
    syntheticDemo: false,
    actor: 'ignored',
    observedEventRef: 'synthetic:oracle:lot-1',
    observedAt: new Date((now - 100) * 1000).toISOString(),
  };
  return { db, repo, store, p, input };
}
function investigate(f: ReturnType<typeof fixture>, key: string) {
  const c = intakeClaimsCase(f.repo, { ...f.input, idempotencyKey: key }, claimant);
  attachEvidenceManifest(
    f.repo,
    {
      caseId: c.id,
      source: 'fixture',
      provenance: 'synthetic',
      rawEvidence: 'loss fixture',
      verificationMethod: 'fixture_consistency',
      sourceReliability: 'demo_only',
      syntheticFixture: true,
    },
    claimant,
  );
  return completeEvidenceOrReview(f.repo, { caseId: c.id, evidenceComplete: true }, claimant);
}
describe('canonical procurement → ClaimsCase integration', () => {
  it('links the original immutable policy/exposure and freezes its beneficiary without copying a policy', () => {
    const f = fixture(),
      c = intakeClaimsCase(f.repo, f.input, claimant);
    expect(c.syntheticDemo).toBe(true);
    expect(c.payoutTo).toBe(beneficiary);
    expect(c.deductibleMicros).toBe(100000n);
    expect(f.repo.getPolicy(f.p.terms.policyId)).toBeNull();
    expect(
      f.db.prepare('SELECT procurement_policy_id FROM claims_cases WHERE id=?').get(c.id),
    ).toEqual({ procurement_policy_id: f.p.terms.policyId });
  });
  it('rejects foreign ownership even on replay and does not write unauthorized incidents', () => {
    const f = fixture();
    expect(() => intakeClaimsCase(f.repo, f.input, foreign)).toThrow('not the policyholder');
    expect(f.repo.listIncidents()).toHaveLength(0);
    intakeClaimsCase(f.repo, f.input, claimant);
    expect(() => intakeClaimsCase(f.repo, f.input, foreign)).toThrow();
  });
  it('rejects unbound policies, invented exposures, pre-coverage and future incident times', () => {
    const unbound = fixture(false);
    expect(() => intakeClaimsCase(unbound.repo, unbound.input, claimant)).toThrow(
      'active or bound',
    );
    const f = fixture();
    for (const patch of [
      { exposureId: newId() },
      { observedAt: new Date((f.p.terms.effectiveAt - 1) * 1000).toISOString() },
      { observedAt: new Date(Date.now() + 60000).toISOString() },
    ])
      expect(() => intakeClaimsCase(f.repo, { ...f.input, ...patch }, claimant)).toThrow();
  });
  it('deduplicates economic incidents across intake keys and rejects changed-event retries', () => {
    const f = fixture();
    const a = intakeClaimsCase(f.repo, f.input, claimant),
      b = intakeClaimsCase(f.repo, { ...f.input, idempotencyKey: 'other-key' }, claimant);
    expect(a.incidentId).toBe(b.incidentId);
    expect(() =>
      intakeClaimsCase(f.repo, { ...f.input, observedEventRef: 'changed' }, claimant),
    ).toThrow('different');
  });
  it('rejects foreign evidence writes and claimant assertions of independent verification', () => {
    const f = fixture(),
      c = intakeClaimsCase(f.repo, f.input, claimant);
    const evidence = {
      caseId: c.id,
      source: 'client',
      provenance: 'client',
      rawEvidence: 'client',
      verificationMethod: 'independent_chain_verify',
      sourceReliability: 'independent',
      syntheticFixture: false,
    };
    expect(() => attachEvidenceManifest(f.repo, evidence, foreign)).toThrow('not owned');
    const attached = attachEvidenceManifest(f.repo, evidence, claimant);
    expect(attached.case.evidenceAuthenticity).toBe('unverified');
    const review = completeEvidenceOrReview(
      f.repo,
      { caseId: c.id, evidenceComplete: false },
      claimant,
    );
    expect(review.status).toBe('REVIEW');
    expect(review.payableMicros).toBeNull();
  });
  it('preserves canonical keys, frozen bindings, synthetic restrictions and same-loss pending commitments', () => {
    const f = fixture(),
      a = investigate(f, 'first-001'),
      b = investigate(f, 'second-001');
    const adjudicate = (id: string) =>
      adjudicateClaimsCase(
        f.repo,
        {
          caseId: id,
          coverageDetermination: 'covered',
          verifiedLossMicros: 1000000n,
          recoveriesMicros: 0n,
          requestedMicros: 600000n,
        },
        reviewer,
      );
    const aa = adjudicate(a.id),
      bb = adjudicate(b.id);
    expect(aa.lossKey).toBe(bb.lossKey);
    expect(aa.payoutTo).toBe(beneficiary);
    const input = {
      caseId: aa.id,
      confirmedRecipient: beneficiary,
      confirmedAmountMicros: aa.payableMicros!,
      confirmedLossKey: aa.lossKey!,
      confirmedEvidenceRoot: aa.evidenceRoot!,
      settlementPrepId: 'prep-first',
    };
    expect(() =>
      authorizeSettlementPreparation(f.repo, input, { role: 'authority', subject: 'auth' }),
    ).toThrow('Synthetic');
    authorizeSettlementPreparation(f.repo, input, {
      role: 'authority',
      subject: 'auth',
      allowSyntheticSettlementPrep: true,
    });
    expect(() =>
      authorizeSettlementPreparation(
        f.repo,
        {
          ...input,
          caseId: bb.id,
          confirmedAmountMicros: bb.payableMicros!,
          confirmedEvidenceRoot: bb.evidenceRoot!,
        },
        { role: 'authority', subject: 'auth', allowSyntheticSettlementPrep: true },
      ),
    ).toThrow('committed payouts');
  });
});
