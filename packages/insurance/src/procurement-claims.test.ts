import { CLAIM_FIXTURE, verifyClaimFixture } from './claim-verification';
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
function fixture(confirmed = true, reconciled = confirmed, limitMicros = '1000000') {
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
      limitMicros,
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
  if (reconciled) {
    db.transaction(() => {
      db.prepare(
        "INSERT OR REPLACE INTO policy_reconciliation_scopes(scope,healthy,checked_at) VALUES ('fixture',1,?)",
      ).run(Math.floor(Date.now() / 1000));
      db.prepare(
        "INSERT INTO policy_bind_events VALUES (?, 'fixture', ?, ?, 'VERIFIED_LINKED', 1, '1', 'fixture', '{}')",
      ).run(policyId, policyId, policyId);
    })();
  }
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
async function investigate(f: ReturnType<typeof fixture>, key: string) {
  const c = intakeClaimsCase(f.repo, { ...f.input, idempotencyKey: key }, claimant);
  attachEvidenceManifest(
    f.repo,
    {
      caseId: c.id,
      source: 'fixture',
      provenance: 'synthetic',
      rawEvidence: CLAIM_FIXTURE.raw,
      verificationMethod: 'fixture_consistency',
      sourceReliability: 'demo_only',
      syntheticFixture: true,
    },
    claimant,
  );
  const investigating = completeEvidenceOrReview(
    f.repo,
    { caseId: c.id, evidenceComplete: true },
    claimant,
  );
  const incident = f.repo.getIncident(c.incidentId!)!;
  await verifyClaimFixture(
    f.repo,
    c.id,
    {
      fixtureRef: CLAIM_FIXTURE.reference,
      fixtureDigest: CLAIM_FIXTURE.digest,
      policyId: c.policyId,
      incidentId: incident.id,
      observedAt: incident.observedAt,
    },
    claimant,
  );
  return investigating;
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
  it('blocks claims and replay when canonical evidence is missing, incomplete, stale or unhealthy', () => {
    const missing = fixture(true, false);
    expect(() => intakeClaimsCase(missing.repo, missing.input, claimant)).toThrow(
      'active or bound',
    );
    expect(() =>
      intakeClaimsCase(missing.repo, missing.input, { role: 'system', subject: 'system' }),
    ).toThrow('active or bound');
    expect(missing.repo.listIncidents()).toHaveLength(0);
    missing.db.close();
    for (const invalidation of [
      "UPDATE policy_bind_events SET status='INCOMPLETE'",
      "UPDATE policy_bind_events SET canonical=0,status='ORPHANED'",
      'UPDATE policy_reconciliation_scopes SET healthy=0',
      'UPDATE policy_reconciliation_scopes SET checked_at=0',
    ]) {
      const f = fixture();
      const existing = intakeClaimsCase(f.repo, f.input, claimant);
      f.db.transaction(() => f.db.exec(invalidation))();
      expect(() => intakeClaimsCase(f.repo, f.input, claimant)).toThrow('active or bound');
      expect(f.repo.getClaimsCase(existing.id)?.id).toBe(existing.id);
      expect(f.repo.listIncidents()).toHaveLength(1);
      f.db.close();
    }
  });
  it('deduplicates economic incidents across intake keys and rejects changed-event retries', () => {
    const f = fixture();
    const a = intakeClaimsCase(f.repo, f.input, claimant),
      b = intakeClaimsCase(f.repo, { ...f.input, idempotencyKey: 'other-key' }, claimant);
    expect(a.incidentId).toBe(b.incidentId);
    expect(() =>
      intakeClaimsCase(f.repo, { ...f.input, observedEventRef: 'changed' }, claimant),
    ).toThrow('different');
    const incident = f.repo.getIncident(a.incidentId!)!;
    const shifted = new Date(Date.parse(incident.observedAt) + 1).toISOString();
    expect(() => intakeClaimsCase(f.repo, { ...f.input, observedAt: shifted }, claimant)).toThrow(
      'different',
    );
    expect(() =>
      intakeClaimsCase(
        f.repo,
        {
          ...f.input,
          idempotencyKey: 'different-clock',
          observedAt: shifted,
        },
        claimant,
      ),
    ).toThrow('persisted incident timestamp');
    const equivalentOffset = incident.observedAt.replace('Z', '+00:00');
    expect(
      intakeClaimsCase(f.repo, { ...f.input, observedAt: equivalentOffset }, claimant).id,
    ).toBe(a.id);
    expect(f.repo.getIncident(a.incidentId!)?.observedAt).toBe(incident.observedAt);
    f.db.close();
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
    expect(
      completeEvidenceOrReview(f.repo, { caseId: c.id, evidenceComplete: true }, claimant).status,
    ).toBe('REVIEW');
  });
  it('preserves canonical keys, frozen bindings, synthetic restrictions and same-loss pending commitments', async () => {
    const f = fixture(),
      a = await investigate(f, 'first-001'),
      b = await investigate(f, 'second-001');
    const adjudicate = (id: string) =>
      adjudicateClaimsCase(
        f.repo,
        {
          caseId: id,
          coverageDetermination: 'covered',
          verifiedLossMicros: 1500000n,
          verificationId: JSON.parse(f.repo.listClaimVerifications(id)[0]!.recordJson).id,
          contractualReview: {
            eventApplies: true,
            exclusionsResolved: true,
            rationale: 'Human reviewed synthetic terms and exclusions',
          },
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

it('blocks separately approved partials that together exceed frozen net loss below the policy cap', async () => {
  const f = fixture(true, true, '2000000'),
    a = await investigate(f, 'partial-first'),
    b = await investigate(f, 'partial-second');
  const approve = (id: string, requestedMicros: bigint) =>
    adjudicateClaimsCase(
      f.repo,
      {
        caseId: id,
        coverageDetermination: 'covered',
        verifiedLossMicros: 1500000n,
        verificationId: JSON.parse(f.repo.listClaimVerifications(id)[0]!.recordJson).id,
        contractualReview: {
          eventApplies: true,
          exclusionsResolved: true,
          rationale: 'Human reviewed synthetic terms and exclusions',
        },
        recoveriesMicros: 0n,
        requestedMicros,
      },
      reviewer,
    );
  const aa = approve(a.id, 600000n),
    bb = approve(b.id, 850000n);
  const authority = {
    role: 'authority' as const,
    subject: 'test',
    allowSyntheticSettlementPrep: true,
  };
  const prep = (c: typeof aa) =>
    authorizeSettlementPreparation(
      f.repo,
      {
        caseId: c.id,
        confirmedRecipient: c.payoutTo!,
        confirmedAmountMicros: c.payableMicros!,
        confirmedLossKey: c.lossKey!,
        confirmedEvidenceRoot: c.evidenceRoot!,
        settlementPrepId: 'test-prep',
      },
      authority,
    );
  prep(aa);
  expect(() => prep(bb)).toThrow('frozen net economic loss');
  expect(f.repo.getClaimsCase(bb.id)?.status).toBe('APPROVED');
});

it('counts pending commitments across different loss keys against the same policy limit', async () => {
  const f = fixture();
  const a = await investigate(f, 'policy-first');
  f.input.observedEventRef = 'synthetic:oracle:another-event';
  const b = await investigate(f, 'policy-second');
  const approve = (id: string) =>
    adjudicateClaimsCase(
      f.repo,
      {
        caseId: id,
        coverageDetermination: 'covered',
        verifiedLossMicros: 1500000n,
        verificationId: JSON.parse(f.repo.listClaimVerifications(id)[0]!.recordJson).id,
        contractualReview: {
          eventApplies: true,
          exclusionsResolved: true,
          rationale: 'Human reviewed synthetic terms and exclusions',
        },
        recoveriesMicros: 0n,
        requestedMicros: 600000n,
      },
      reviewer,
    );
  const aa = approve(a.id),
    bb = approve(b.id);
  expect(aa.lossKey).not.toBe(bb.lossKey);
  const prepare = (c: typeof aa) =>
    authorizeSettlementPreparation(
      f.repo,
      {
        caseId: c.id,
        confirmedRecipient: c.payoutTo!,
        confirmedAmountMicros: c.payableMicros!,
        confirmedLossKey: c.lossKey!,
        confirmedEvidenceRoot: c.evidenceRoot!,
        settlementPrepId: 'policy-prep',
      },
      { role: 'authority', subject: 'test', allowSyntheticSettlementPrep: true },
    );
  prepare(aa);
  expect(() => prepare(bb)).toThrow('Policy committed payouts');
});

const contractualReview = {
  eventApplies: true,
  exclusionsResolved: true,
  rationale: 'Reviewer checked synthetic event, registered position, timing and each exclusion.',
};
function decision(f: ReturnType<typeof fixture>, id: string) {
  return {
    caseId: id,
    verificationId: JSON.parse(f.repo.listClaimVerifications(id)[0]!.recordJson).id as string,
    contractualReview,
    coverageDetermination: 'covered' as const,
    verifiedLossMicros: 1500000n,
    recoveriesMicros: 0n,
    requestedMicros: 1000000n,
  };
}
describe('Sprint 2 verification-to-adjudication boundary', () => {
  it('requires a human decision after fixture consistency, persists economics and reviewer identity, and cannot grant settlement authority', async () => {
    const f = fixture(),
      c = await investigate(f, 'sprint2-eligible');
    expect(f.repo.getClaimsCase(c.id)?.status).toBe('INVESTIGATING');
    expect(f.repo.getClaimsCase(c.id)?.coverageDetermination).toBe('unknown');
    const approved = adjudicateClaimsCase(f.repo, decision(f, c.id), reviewer);
    expect(approved.payableMicros).toBe(1000000n); // min(1.5 - .1, 1.0 policy limit, 1.0 request)
    expect(approved.settlementAuthorization).toBe('pending_authority');
    const binding = JSON.parse(approved.adjudicationBindingJson!);
    expect(binding).toMatchObject({
      caseId: c.id,
      incidentId: c.incidentId,
      verifiedLossMicros: '1500000',
      recoveriesMicros: '0',
      deductibleMicros: '100000',
      priorCompensationMicros: '0',
      netCoveredLossMicros: '1400000',
      coverageLimitMicros: '1000000',
      reviewer: { actor: 'reviewer:reviewer', role: 'reviewer', contractualReview },
      asset: { symbol: 'USDC', scale: 6 },
      evidenceAuthenticity: 'synthetic_fixture',
    });
    const event = f.repo.listClaimsCaseEvents(c.id).at(-1)!;
    expect(JSON.parse(event.payloadJson).binding).toEqual(binding);
    const prep = {
      caseId: c.id,
      confirmedRecipient: beneficiary,
      confirmedAmountMicros: approved.payableMicros!,
      confirmedLossKey: approved.lossKey!,
      confirmedEvidenceRoot: approved.evidenceRoot!,
      settlementPrepId: 'offline-only',
    };
    expect(() => authorizeSettlementPreparation(f.repo, prep, reviewer)).toThrow('requires role');
    expect(() =>
      authorizeSettlementPreparation(f.repo, prep, { role: 'authority', subject: 'auth' }),
    ).toThrow('Synthetic');
    f.db.close();
  });
  it.each([
    ['missing verification', { verificationId: undefined }, 'PERSISTED_VERIFICATION_REQUIRED'],
    ['wrong verification', { verificationId: 'other-case' }, 'PERSISTED_VERIFICATION_REQUIRED'],
    ['arbitrary gross loss', { verifiedLossMicros: 99999999n }, 'LOSS_ASSESSMENT_MISMATCH'],
    ['arbitrary recovery', { recoveriesMicros: 1n }, 'LOSS_ASSESSMENT_MISMATCH'],
    ['unresolved recovery', { recoveriesMicros: null }, 'UNRESOLVED_RECOVERIES'],
    ['unresolved compensation', { priorCompensationMicros: 1n }, 'LOSS_ASSESSMENT_MISMATCH'],
    [
      'unresolved exclusions',
      { contractualReview: { ...contractualReview, exclusionsResolved: false } },
      'CONTRACTUAL_REVIEW_REQUIRED',
    ],
    [
      'missing rationale',
      { contractualReview: { ...contractualReview, rationale: '' } },
      'CONTRACTUAL_REVIEW_REQUIRED',
    ],
    [
      'wrong event',
      { contractualReview: { ...contractualReview, eventApplies: false } },
      'CONTRACTUAL_REVIEW_REQUIRED',
    ],
  ])('keeps %s in human REVIEW', async (_label, patch, reason) => {
    const f = fixture(),
      c = await investigate(f, 'sprint2-fail-closed');
    const reviewed = adjudicateClaimsCase(f.repo, { ...decision(f, c.id), ...patch }, reviewer);
    expect(reviewed.status).toBe('REVIEW');
    expect(reviewed.payableMicros).toBeNull();
    expect(reviewed.reviewReasonCode).toBe(reason);
    expect(reviewed.settlementAuthorization).toBe('none');
    f.db.close();
  });
  it.each([
    { fixtureDigest: undefined },
    { policyId: 'wrong' },
    { incidentId: 'wrong' },
    { observedAt: '2020-01-01T00:00:00.000Z' },
  ])(
    'cannot cherry-pick success around unresolved contradictory/missing evidence %j',
    async (patch) => {
      const f = fixture(),
        c = await investigate(f, 'sprint2-contradiction');
      const incident = f.repo.getIncident(c.incidentId!)!;
      await verifyClaimFixture(
        f.repo,
        c.id,
        {
          fixtureRef: CLAIM_FIXTURE.reference,
          fixtureDigest: CLAIM_FIXTURE.digest,
          policyId: c.policyId,
          incidentId: incident.id,
          observedAt: incident.observedAt,
          ...patch,
        },
        claimant,
      );
      const reviewed = adjudicateClaimsCase(f.repo, decision(f, c.id), reviewer);
      expect(reviewed.status).toBe('REVIEW');
      expect(reviewed.reviewReasonCode).toBe('UNRESOLVED_VERIFICATION_FINDINGS');
      f.db.close();
    },
  );
  it.each([
    'UPDATE policy_reconciliation_scopes SET checked_at=0',
    'UPDATE policy_reconciliation_scopes SET healthy=0',
  ])('rejects stale or unhealthy reconciliation at adjudication and preparation', async (sql) => {
    for (const afterApproval of [false, true]) {
      const f = fixture(),
        c = await investigate(f, 'sprint2-stale-reconciliation');
      const approved = afterApproval
        ? adjudicateClaimsCase(f.repo, decision(f, c.id), reviewer)
        : null;
      f.db.transaction(() => f.db.exec(sql))();
      if (approved) {
        expect(() =>
          authorizeSettlementPreparation(
            f.repo,
            {
              caseId: c.id,
              confirmedRecipient: beneficiary,
              confirmedAmountMicros: approved.payableMicros!,
              confirmedLossKey: approved.lossKey!,
              confirmedEvidenceRoot: approved.evidenceRoot!,
              settlementPrepId: 'stale',
            },
            { role: 'authority', subject: 'offline', allowSyntheticSettlementPrep: true },
          ),
        ).toThrow('no longer current');
      } else
        expect(adjudicateClaimsCase(f.repo, decision(f, c.id), reviewer).status).toBe('REVIEW');
      f.db.close();
    }
  });
  it('rejects changed evidence, unauthorized reviewers, repeated decisions and repeated settlement preparation', async () => {
    const f = fixture(),
      c = await investigate(f, 'sprint2-identity');
    for (const column of ['policy_id', 'exposure_id', 'incident_id'])
      expect(() =>
        f.db.prepare(`UPDATE claims_cases SET ${column}=? WHERE id=?`).run(newId(), c.id),
      ).toThrow('immutable');
    expect(() => adjudicateClaimsCase(f.repo, decision(f, c.id), claimant)).toThrow(
      'requires role',
    );
    const approved = adjudicateClaimsCase(f.repo, decision(f, c.id), reviewer);
    expect(() => adjudicateClaimsCase(f.repo, decision(f, c.id), reviewer)).toThrow(
      'requires INVESTIGATING',
    );
    const prep = {
      caseId: c.id,
      confirmedRecipient: beneficiary,
      confirmedAmountMicros: approved.payableMicros!,
      confirmedLossKey: approved.lossKey!,
      confirmedEvidenceRoot: approved.evidenceRoot!,
      settlementPrepId: 'repeat',
    };
    const auth = {
      role: 'authority' as const,
      subject: 'offline',
      allowSyntheticSettlementPrep: true,
    };
    for (const patch of [
      { confirmedRecipient: owner },
      { confirmedAmountMicros: 1n },
      { confirmedLossKey: 'wrong' },
      { confirmedEvidenceRoot: 'wrong' },
    ])
      expect(() => authorizeSettlementPreparation(f.repo, { ...prep, ...patch }, auth)).toThrow(
        'binding',
      );
    authorizeSettlementPreparation(f.repo, prep, auth);
    expect(() => authorizeSettlementPreparation(f.repo, prep, auth)).toThrow('requires APPROVED');
    f.db.close();
    const changed = fixture(),
      collecting = await investigate(changed, 'sprint2-stale-evidence');
    attachEvidenceManifest(
      changed.repo,
      {
        caseId: collecting.id,
        source: 'additional',
        provenance: 'client',
        rawEvidence: 'contradictory extra evidence',
        verificationMethod: 'fixture_consistency',
        sourceReliability: 'demo_only',
        syntheticFixture: true,
      },
      claimant,
    );
    expect(
      adjudicateClaimsCase(changed.repo, decision(changed, collecting.id), reviewer)
        .reviewReasonCode,
    ).toBe('STALE_VERIFICATION_CONTEXT');
    changed.db.close();
  });
});
