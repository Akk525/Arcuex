import { ValidationError, parseUsdcDecimal } from '@arcuex/domain';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { describe, expect, it } from 'vitest';
import type { ClaimsPrincipal } from './claims-auth';
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

const WALLET = '0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760';
const LOSS_KEY = '0x' + 'ab'.repeat(32);

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
  let c = openClaimsCase(
    repo,
    {
      policyId: policy.id,
      exposureId: exposure.id,
      claimantRef: `policyholder:${holder.id}`,
      idempotencyKey: `case-${Math.random().toString(16).slice(2)}`,
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
      rawEvidence: JSON.stringify({ lossUsdc: '1.0' }),
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
  return { case: c, policy, exposure, holder, principal };
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
          verifiedLossMicros: parseUsdcDecimal('1.000000'),
          recoveriesMicros: 0n,
          requestedMicros: parseUsdcDecimal('1.000000'),
          lossKey: LOSS_KEY,
        },
        claimant,
      ),
    ).toThrow(/requires role/);
    expect(() =>
      authorizeSettlementPreparation(
        repo,
        {
          caseId: c.id,
          confirmedRecipient: WALLET,
          confirmedAmountMicros: 1_000_000n,
          confirmedLossKey: LOSS_KEY,
          confirmedEvidenceRoot: 'x',
          settlementPrepId: 'prep',
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

  it('freezes binding and rejects settlement tampering / synthetic without flag', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { case: opened } = await openInvestigating(repo);

    const approved = adjudicateClaimsCase(
      repo,
      {
        caseId: opened.id,
        coverageDetermination: 'covered',
        verifiedLossMicros: parseUsdcDecimal('1.000000'),
        recoveriesMicros: 0n,
        requestedMicros: parseUsdcDecimal('1.000000'),
        lossKey: LOSS_KEY,
      },
      reviewer,
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.adjudicationBindingJson).toBeTruthy();
    expect(approved.payoutTo?.toLowerCase()).toBe(WALLET.toLowerCase());
    const binding = JSON.parse(approved.adjudicationBindingJson!) as {
      evidenceRoot: string;
      payableMicros: string;
    };

    expect(() =>
      authorizeSettlementPreparation(
        repo,
        {
          caseId: approved.id,
          confirmedRecipient: WALLET,
          confirmedAmountMicros: 1_000_000n,
          confirmedLossKey: LOSS_KEY,
          confirmedEvidenceRoot: binding.evidenceRoot,
          settlementPrepId: 'prep-1',
        },
        authorityNoSynthetic,
      ),
    ).toThrow(/Synthetic\/fixture/);

    expect(() =>
      authorizeSettlementPreparation(
        repo,
        {
          caseId: approved.id,
          confirmedRecipient: '0x1111111111111111111111111111111111111111',
          confirmedAmountMicros: 1_000_000n,
          confirmedLossKey: LOSS_KEY,
          confirmedEvidenceRoot: binding.evidenceRoot,
          settlementPrepId: 'prep-2',
        },
        authority,
      ),
    ).toThrow(/payoutTo/);

    expect(() =>
      authorizeSettlementPreparation(
        repo,
        {
          caseId: approved.id,
          confirmedRecipient: WALLET,
          confirmedAmountMicros: 2_000_000n,
          confirmedLossKey: LOSS_KEY,
          confirmedEvidenceRoot: binding.evidenceRoot,
          settlementPrepId: 'prep-3',
        },
        authority,
      ),
    ).toThrow(/payable/);

    const pending = authorizeSettlementPreparation(
      repo,
      {
        caseId: approved.id,
        confirmedRecipient: WALLET,
        confirmedAmountMicros: BigInt(binding.payableMicros),
        confirmedLossKey: LOSS_KEY,
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
    expect(failed.status).toBe('SETTLEMENT_FAILED');

    const retried = authorizeSettlementPreparation(
      repo,
      {
        caseId: failed.id,
        confirmedRecipient: WALLET,
        confirmedAmountMicros: BigInt(binding.payableMicros),
        confirmedLossKey: LOSS_KEY,
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

  it('forces REVIEW for unknown recoveries and rejects unpaid mark_paid', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { case: c } = await openInvestigating(repo);
    const reviewed = adjudicateClaimsCase(
      repo,
      {
        caseId: c.id,
        coverageDetermination: 'covered',
        verifiedLossMicros: parseUsdcDecimal('1.000000'),
        recoveriesMicros: null,
        requestedMicros: parseUsdcDecimal('1.000000'),
        lossKey: LOSS_KEY,
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
