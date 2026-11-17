import { ValidationError, parseUsdcDecimal } from '@arcuex/domain';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { describe, expect, it } from 'vitest';
import {
  adjudicateClaimsCase,
  attachEvidenceManifest,
  authorizeSettlementPreparation,
  beginEvidenceCollection,
  completeEvidenceOrReview,
  listClaimsCaseTimeline,
  markClaimsCasePaid,
  markClaimsCaseSettlementFailed,
  openClaimsCase,
  submitClaimsCase,
} from './claims-case-service';
import { acceptAndBindPolicy, requestCoverageQuote } from './quote-to-bind';

async function seed(repo: InsuranceRepository) {
  const quote = requestCoverageQuote(repo, {
    idempotencyKey: `q-${Math.random().toString(16).slice(2)}`,
    policyholder: { displayName: 'Holder' },
    agent: { externalRef: 'agent', label: 'Agent' },
  });
  return acceptAndBindPolicy(repo, {
    quoteId: quote.id,
    idempotencyKey: `b-${Math.random().toString(16).slice(2)}`,
    fundingVerified: true,
  });
}

describe('ClaimsCase service', () => {
  it('runs intake → evidence → adjudication → authority settle prep → paid', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { policy, exposure } = await seed(repo);

    const opened = openClaimsCase(repo, {
      policyId: policy.id,
      exposureId: exposure.id,
      claimantRef: 'claimant:demo',
      idempotencyKey: 'case-svc-001',
      syntheticDemo: true,
      actor: 'claimant:demo',
    });
    expect(opened.status).toBe('DRAFT');
    expect(openClaimsCase(repo, {
      policyId: policy.id,
      exposureId: exposure.id,
      claimantRef: 'claimant:demo',
      idempotencyKey: 'case-svc-001',
      syntheticDemo: true,
      actor: 'claimant:demo',
    }).id).toBe(opened.id);

    let c = submitClaimsCase(repo, { caseId: opened.id, actor: 'claimant:demo' });
    c = beginEvidenceCollection(repo, { caseId: c.id, actor: 'system:intake' });
    const attached = attachEvidenceManifest(repo, {
      caseId: c.id,
      actor: 'system:evidence',
      source: 'synthetic-fixture',
      chain: 'arc-testnet',
      blockHash: '0x' + '11'.repeat(32),
      transactionHash: '0x' + '22'.repeat(32),
      provenance: 'demo-fixture',
      rawEvidence: JSON.stringify({ lossUsdc: '1.0' }),
      verificationMethod: 'fixture_consistency',
      sourceReliability: 'demo_only',
      syntheticFixture: true,
    });
    expect(attached.inserted).toBe(true);
    expect(attached.case.evidenceAuthenticity).toBe('synthetic_fixture');

    c = completeEvidenceOrReview(repo, {
      caseId: c.id,
      actor: 'system:evidence',
      evidenceComplete: true,
    });
    expect(c.status).toBe('INVESTIGATING');

    c = adjudicateClaimsCase(repo, {
      caseId: c.id,
      actor: 'reviewer:ops',
      coverageDetermination: 'covered',
      verifiedLossMicros: parseUsdcDecimal('1.000000'),
      recoveriesMicros: 0n,
      requestedMicros: parseUsdcDecimal('1.000000'),
      lossKey: '0x' + 'ab'.repeat(32),
    });
    expect(c.status).toBe('APPROVED');
    expect(c.payableMicros).toBe(1_000_000n);
    expect(c.settlementAuthorization).toBe('pending_authority');

    expect(() =>
      authorizeSettlementPreparation(repo, {
        caseId: c.id,
        authorityActor: 'ai_majority_vote',
        confirmedRecipient: '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760',
        confirmedAmountMicros: 1_000_000n,
        settlementPrepId: 'prep-1',
      }),
    ).toThrow(ValidationError);

    expect(() =>
      authorizeSettlementPreparation(repo, {
        caseId: c.id,
        authorityActor: 'claimant:demo',
        confirmedRecipient: '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760',
        confirmedAmountMicros: 1_000_000n,
        settlementPrepId: 'prep-1',
      }),
    ).toThrow(/authority:/);

    c = authorizeSettlementPreparation(repo, {
      caseId: c.id,
      authorityActor: 'authority:claims',
      confirmedRecipient: '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760',
      confirmedAmountMicros: 1_000_000n,
      settlementPrepId: 'prep-1',
    });
    expect(c.status).toBe('SETTLEMENT_PENDING');
    expect(c.settlementAuthorization).toBe('authorized');

    c = markClaimsCaseSettlementFailed(repo, {
      caseId: c.id,
      actor: 'authority:claims',
      reasonCode: 'TX_FAILED',
      detail: 'simulated',
    });
    expect(c.status).toBe('SETTLEMENT_FAILED');

    c = authorizeSettlementPreparation(repo, {
      caseId: c.id,
      authorityActor: 'authority:claims',
      confirmedRecipient: '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760',
      confirmedAmountMicros: 1_000_000n,
      settlementPrepId: 'prep-1-retry',
    });
    expect(c.status).toBe('SETTLEMENT_PENDING');

    c = markClaimsCasePaid(repo, {
      caseId: c.id,
      actor: 'authority:claims',
      receiptRef: '0x83130e95f5dfb2209a5382524a1ef749dd2f90a605fcf892cf80b333ef3d89c7',
    });
    expect(c.status).toBe('PAID');

    const timeline = listClaimsCaseTimeline(repo, c.id);
    expect(timeline.length).toBeGreaterThanOrEqual(6);
    expect(timeline.every((e) => e.actor.length > 0 && e.reasonCode.length > 0)).toBe(true);
  });

  it('forces REVIEW for unknown recoveries and incomplete evidence', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { policy, exposure } = await seed(repo);
    let c = openClaimsCase(repo, {
      policyId: policy.id,
      exposureId: exposure.id,
      claimantRef: 'claimant:demo',
      idempotencyKey: 'case-review-001',
      syntheticDemo: true,
      actor: 'claimant:demo',
    });
    c = submitClaimsCase(repo, { caseId: c.id, actor: 'claimant:demo' });
    c = beginEvidenceCollection(repo, { caseId: c.id, actor: 'system:intake' });
    c = completeEvidenceOrReview(repo, {
      caseId: c.id,
      actor: 'system:evidence',
      evidenceComplete: false,
    });
    expect(c.status).toBe('REVIEW');
    expect(c.payableMicros).toBeNull();
    expect(c.settlementAuthorization).toBe('none');

    // reopen investigate after attaching evidence
    attachEvidenceManifest(repo, {
      caseId: c.id,
      actor: 'system:evidence',
      source: 'synthetic-fixture',
      provenance: 'demo',
      rawEvidence: '{}',
      verificationMethod: 'fixture_consistency',
      sourceReliability: 'demo_only',
      syntheticFixture: true,
    });
    // from REVIEW → INVESTIGATING via completeEvidenceOrReview only works from COLLECTING;
    // adjudicate with unknown recoveries while in REVIEW
    c = adjudicateClaimsCase(repo, {
      caseId: c.id,
      actor: 'reviewer:ops',
      coverageDetermination: 'covered',
      verifiedLossMicros: parseUsdcDecimal('1.000000'),
      recoveriesMicros: null,
      requestedMicros: parseUsdcDecimal('1.000000'),
      lossKey: '0x' + 'cd'.repeat(32),
    });
    expect(c.status).toBe('REVIEW');
    expect(c.reviewReasonCode).toBe('UNKNOWN_RECOVERIES');
  });

  it('denies unregistered exposure at open', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { policy } = await seed(repo);
    expect(() =>
      openClaimsCase(repo, {
        policyId: policy.id,
        exposureId: '00000000-0000-4000-8000-000000000099',
        claimantRef: 'claimant:demo',
        idempotencyKey: 'case-bad-exp',
        syntheticDemo: true,
        actor: 'claimant:demo',
      }),
    ).toThrow(ValidationError);
  });
});
