import { CLAIM_FIXTURE, verifyClaimFixture } from './claim-verification';
import { ValidationError, parseUsdcDecimal } from '@arcuex/domain';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { describe, expect, it } from 'vitest';
import type { ClaimsPrincipal } from './claims-auth';
import { deriveCanonicalClaimsLossKey } from './canonical-loss-key';
import {
  adjudicateClaimsCase,
  intakeClaimsCase,
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
import { intakeObservedEvent } from './claims-pipeline';
import { acceptAndBindPolicy, requestCoverageQuote } from './quote-to-bind';

const WALLET = '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760';

const claimant: ClaimsPrincipal = {
  role: 'claimant',
  subject: 'holder',
  walletAddress: WALLET,
};

const reviewer: ClaimsPrincipal = {
  role: 'reviewer',
  subject: 'ops',
};

const authority: ClaimsPrincipal = {
  role: 'authority',
  subject: 'claims',
  allowSyntheticSettlementPrep: true,
};

const authorityNoSynthetic: ClaimsPrincipal = {
  role: 'authority',
  subject: 'claims',
  allowSyntheticSettlementPrep: false,
};

async function seed(repo: InsuranceRepository) {
  const quote = requestCoverageQuote(repo, {
    idempotencyKey: `q-${Math.random().toString(16).slice(2)}`,
    policyholder: { displayName: 'Holder', walletAddress: WALLET },
    agent: { externalRef: 'agent', label: 'Agent' },
  });
  const bound = acceptAndBindPolicy(repo, {
    quoteId: quote.id,
    idempotencyKey: `b-${Math.random().toString(16).slice(2)}`,
    fundingVerified: true,
  });
  const holder = repo.getPolicyholder(bound.policy.policyholderId)!;
  return { ...bound, holder };
}

async function openInvestigating(repo: InsuranceRepository) {
  const { policy, exposure, holder } = await seed(repo);
  const principal: ClaimsPrincipal = {
    ...claimant,
    policyholderId: holder.id,
    walletAddress: WALLET,
  };
  const stamp = Math.random().toString(16).slice(2);
  const incident = intakeObservedEvent(repo, {
    idempotencyKey: `evt-${stamp}`,
    observedEventRef: `tx:0x${stamp}`,
    observedAt: new Date().toISOString(),
    source: 'test',
    policyId: policy.id,
    exposureId: exposure.id,
  });
  let c = openClaimsCase(
    repo,
    {
      policyId: policy.id,
      exposureId: exposure.id,
      incidentId: incident.id,
      claimantRef: `policyholder:${holder.id}`,
      idempotencyKey: `case-${stamp}`,
      syntheticDemo: true,
      actor: 'ignored',
    },
    principal,
  );
  c = submitClaimsCase(repo, { caseId: c.id }, principal);
  c = beginEvidenceCollection(repo, { caseId: c.id }, { role: 'system', subject: 'intake' });
  attachEvidenceManifest(
    repo,
    {
      caseId: c.id,
      source: 'synthetic-fixture',
      chain: 'arc-testnet',
      provenance: 'demo-fixture',
      rawEvidence: CLAIM_FIXTURE.raw,
      verificationMethod: 'fixture_consistency',
      sourceReliability: 'demo_only',
      syntheticFixture: true,
    },
    { role: 'system', subject: 'evidence' },
  );
  c = completeEvidenceOrReview(
    repo,
    { caseId: c.id, evidenceComplete: true },
    { role: 'system', subject: 'evidence' },
  );
  await verifyClaimFixture(
    repo,
    c.id,
    {
      fixtureRef: CLAIM_FIXTURE.reference,
      fixtureDigest: CLAIM_FIXTURE.digest,
      policyId: policy.id,
      incidentId: incident.id,
      observedAt: incident.observedAt,
    },
    principal,
  );
  const expectedLossKey = deriveCanonicalClaimsLossKey({
    policyEntityId: policy.id,
    exposureId: exposure.id,
    incidentId: incident.id,
    observedEventRef: incident.observedEventRef,
  });
  return { case: c, policy, exposure, holder, principal, incident, expectedLossKey };
}

describe('ClaimsCase service security', () => {
  it('rejects claimant impersonation of reviewer/authority via role', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { case: c } = await openInvestigating(repo);
    expect(() =>
      adjudicateClaimsCase(
        repo,
        {
          caseId: c.id,
          coverageDetermination: 'covered',
          verifiedLossMicros: parseUsdcDecimal('1.500000'),
          verificationId: JSON.parse(repo.listClaimVerifications(c.id)[0]!.recordJson).id,
          contractualReview: {
            eventApplies: true,
            exclusionsResolved: true,
            rationale: 'Human reviewed synthetic terms and exclusions',
          },
          recoveriesMicros: 0n,
          requestedMicros: parseUsdcDecimal('1.000000'),
        },
        claimant,
      ),
    ).toThrow(/requires role/);
  });

  it('rejects claim open on another policyholder policy', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { policy, exposure } = await seed(repo);
    expect(() =>
      openClaimsCase(
        repo,
        {
          policyId: policy.id,
          exposureId: exposure.id,
          claimantRef: 'attacker',
          idempotencyKey: 'case-steal',
          syntheticDemo: true,
          actor: 'x',
        },
        {
          role: 'claimant',
          subject: 'attacker',
          policyholderId: '00000000-0000-4000-8000-000000000099',
          walletAddress: '0x1111111111111111111111111111111111111111',
        },
      ),
    ).toThrow(/not the policyholder/);
  });

  it('rejects invented loss keys and freezes canonical binding', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { case: opened, expectedLossKey } = await openInvestigating(repo);

    expect(() =>
      adjudicateClaimsCase(
        repo,
        {
          caseId: opened.id,
          coverageDetermination: 'covered',
          verifiedLossMicros: parseUsdcDecimal('1.500000'),
          verificationId: JSON.parse(repo.listClaimVerifications(opened.id)[0]!.recordJson).id,
          contractualReview: {
            eventApplies: true,
            exclusionsResolved: true,
            rationale: 'Human reviewed synthetic terms and exclusions',
          },
          recoveriesMicros: 0n,
          requestedMicros: parseUsdcDecimal('1.000000'),
          lossKey: '0x' + '11'.repeat(32),
        },
        reviewer,
      ),
    ).toThrow(/canonical/);

    const approved = adjudicateClaimsCase(
      repo,
      {
        caseId: opened.id,
        coverageDetermination: 'covered',
        verifiedLossMicros: parseUsdcDecimal('1.500000'),
        verificationId: JSON.parse(repo.listClaimVerifications(opened.id)[0]!.recordJson).id,
        contractualReview: {
          eventApplies: true,
          exclusionsResolved: true,
          rationale: 'Human reviewed synthetic terms and exclusions',
        },
        recoveriesMicros: 0n,
        requestedMicros: parseUsdcDecimal('1.000000'),
      },
      reviewer,
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.lossKey?.toLowerCase()).toBe(expectedLossKey.toLowerCase());
    const binding = JSON.parse(approved.adjudicationBindingJson!) as {
      evidenceRoot: string;
      payableMicros: string;
      lossKey: string;
    };
    expect(binding.lossKey.toLowerCase()).toBe(expectedLossKey.toLowerCase());

    expect(() =>
      authorizeSettlementPreparation(
        repo,
        {
          caseId: approved.id,
          confirmedRecipient: WALLET,
          confirmedAmountMicros: 1_000_000n,
          confirmedLossKey: expectedLossKey,
          confirmedEvidenceRoot: binding.evidenceRoot,
          settlementPrepId: 'prep-1',
        },
        authorityNoSynthetic,
      ),
    ).toThrow(/Synthetic\/fixture/);

    const pending = authorizeSettlementPreparation(
      repo,
      {
        caseId: approved.id,
        confirmedRecipient: WALLET,
        confirmedAmountMicros: BigInt(binding.payableMicros),
        confirmedLossKey: expectedLossKey,
        confirmedEvidenceRoot: binding.evidenceRoot,
        settlementPrepId: 'prep-ok',
      },
      authority,
    );
    expect(pending.status).toBe('SETTLEMENT_PENDING');

    const failed = markClaimsCaseSettlementFailed(
      repo,
      { caseId: pending.id, reasonCode: 'TX_FAILED' },
      authority,
    );
    const retried = authorizeSettlementPreparation(
      repo,
      {
        caseId: failed.id,
        confirmedRecipient: WALLET,
        confirmedAmountMicros: BigInt(binding.payableMicros),
        confirmedLossKey: expectedLossKey,
        confirmedEvidenceRoot: binding.evidenceRoot,
        settlementPrepId: 'prep-retry',
      },
      authority,
    );
    const paid = markClaimsCasePaid(
      repo,
      { caseId: retried.id, receiptRef: '0x' + '99'.repeat(32) },
      authority,
    );
    expect(paid.status).toBe('PAID');
    expect(listClaimsCaseTimeline(repo, paid.id).length).toBeGreaterThan(5);
  });

  it('forces REVIEW for unknown recoveries', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { case: c } = await openInvestigating(repo);
    const reviewed = adjudicateClaimsCase(
      repo,
      {
        caseId: c.id,
        coverageDetermination: 'covered',
        verifiedLossMicros: parseUsdcDecimal('1.500000'),
        verificationId: JSON.parse(repo.listClaimVerifications(c.id)[0]!.recordJson).id,
        contractualReview: {
          eventApplies: true,
          exclusionsResolved: true,
          rationale: 'Human reviewed synthetic terms and exclusions',
        },
        recoveriesMicros: null,
        requestedMicros: parseUsdcDecimal('1.000000'),
      },
      reviewer,
    );
    expect(reviewed.status).toBe('REVIEW');
    expect(reviewed.payableMicros).toBeNull();
    expect(() =>
      markClaimsCasePaid(repo, { caseId: reviewed.id, receiptRef: '0xabc' }, authority),
    ).toThrow(ValidationError);
  });

  it('rejects optimistic updates when row_version is stale', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { case: c } = await openInvestigating(repo);
    const row = repo.getClaimsCase(c.id)!;
    expect(
      repo.updateClaimsCaseOptimistic(
        { ...row, rowVersion: row.rowVersion + 1, updatedAt: new Date().toISOString() },
        row.rowVersion,
      ),
    ).toBe(true);
    expect(
      repo.updateClaimsCaseOptimistic(
        { ...row, rowVersion: row.rowVersion + 2, updatedAt: new Date().toISOString() },
        row.rowVersion,
      ),
    ).toBe(false);
  });
});

it('reuses canonical legacy incidents across different customer intake keys', async () => {
  const repo = new InsuranceRepository(openDatabase());
  const { policy, exposure } = await seed(repo);
  const input = {
    policyId: policy.id,
    exposureId: exposure.id,
    idempotencyKey: 'legacy-first-key',
    claimantRef: WALLET,
    syntheticDemo: true,
    actor: 'ignored',
    observedEventRef: 'synthetic:legacy:one-event',
    observedAt: new Date().toISOString(),
  };
  const a = intakeClaimsCase(repo, input, claimant),
    b = intakeClaimsCase(repo, { ...input, idempotencyKey: 'legacy-second-key' }, claimant);
  expect(a.incidentId).toBe(b.incidentId);
});
