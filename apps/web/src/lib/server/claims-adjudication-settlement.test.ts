import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, type PublicClient } from 'viem';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { insurancePoolAbi, toPolicyIdBytes32, toClaimIdBytes32 } from '@arcuex/onchain';
import {
  requestCoverageQuote,
  acceptAndBindPolicy,
  intakeClaimsCase,
  attachEvidenceManifest,
  completeEvidenceOrReview,
  verifyClaimFixture,
  CLAIM_FIXTURE,
  adjudicateClaimsCase,
  authorizeSettlementPreparation,
} from '@arcuex/insurance';
import { prepareClaimsTransaction } from './claims-chain';
vi.mock('./procurement-chain', () => ({
  procurementPool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  procurementClient: () => {
    throw new Error('Network access forbidden in offline test');
  },
}));
const owner = '0x1111111111111111111111111111111111111111';
const authority = '0x2222222222222222222222222222222222222222';
const principal = { role: 'claimant' as const, subject: owner, walletAddress: owner };
const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
async function approvedFixture() {
  const db = openDatabase();
  databases.push(db);
  const repo = new InsuranceRepository(db);
  const quote = requestCoverageQuote(repo, {
    idempotencyKey: 'offline-quote',
    policyholder: { displayName: 'offline', walletAddress: owner },
    agent: { externalRef: 'offline', label: 'offline' },
  });
  const { policy, exposure } = acceptAndBindPolicy(repo, {
    quoteId: quote.id,
    idempotencyKey: 'offline-bind',
    fundingVerified: true,
  });
  const c = intakeClaimsCase(
    repo,
    {
      policyId: policy.id,
      exposureId: exposure.id,
      claimantRef: owner,
      idempotencyKey: 'offline-intake',
      syntheticDemo: true,
      actor: 'ignored',
      observedEventRef: 'synthetic:oracle:offline',
      observedAt: new Date().toISOString(),
    },
    principal,
  );
  attachEvidenceManifest(
    repo,
    {
      caseId: c.id,
      source: 'catalog',
      provenance: CLAIM_FIXTURE.reference,
      rawEvidence: CLAIM_FIXTURE.raw,
      verificationMethod: 'fixture_consistency',
      sourceReliability: 'demo_only',
      syntheticFixture: true,
    },
    principal,
  );
  completeEvidenceOrReview(repo, { caseId: c.id, evidenceComplete: true }, principal);
  const incident = repo.getIncident(c.incidentId!)!;
  const v = await verifyClaimFixture(
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
  const approved = adjudicateClaimsCase(
    repo,
    {
      caseId: c.id,
      verificationId: v.id,
      contractualReview: {
        eventApplies: true,
        exclusionsResolved: true,
        rationale: 'Offline human reviewer checked synthetic policy and event.',
      },
      coverageDetermination: 'covered',
      verifiedLossMicros: 1500000n,
      recoveriesMicros: 0n,
      requestedMicros: 1000000n,
    },
    { role: 'reviewer', subject: 'human' },
  );
  const confirmed = {
    caseId: c.id,
    confirmedRecipient: owner,
    confirmedAmountMicros: approved.payableMicros!,
    confirmedLossKey: approved.lossKey!,
    confirmedEvidenceRoot: approved.evidenceRoot!,
    settlementPrepId: 'offline-test-intent',
  };
  expect(() =>
    authorizeSettlementPreparation(repo, confirmed, { role: 'authority', subject: 'operator' }),
  ).toThrow('Synthetic');
  const authorized = authorizeSettlementPreparation(repo, confirmed, {
    role: 'authority',
    subject: 'offline-only',
    allowSyntheticSettlementPrep: true,
  });
  return authorized;
}
function clientFor(
  c: Awaited<ReturnType<typeof approvedFixture>>,
  timestamp = 200n,
  patch: {
    beneficiary?: string;
    reserved?: bigint;
    lossPolicy?: string;
    lossCap?: bigint;
    chainId?: number;
  } = {},
) {
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === 'policies')
      return [
        '0x' + 'ab'.repeat(32),
        patch.beneficiary ?? owner,
        owner,
        c.lossCapMicros!,
        10000n,
        100n,
        300n,
        patch.reserved ?? c.lossCapMicros!,
        0n,
        true,
        false,
      ];
    if (functionName === 'losses')
      return [
        patch.lossPolicy ?? toPolicyIdBytes32(c.policyId),
        patch.lossCap ?? c.lossCapMicros!,
        0n,
        true,
      ];
    if (functionName === 'claimsAuthority') return authority;
    throw new Error(`Unexpected read ${functionName}`);
  });
  return {
    getChainId: async () => patch.chainId ?? 5042002,
    getBlock: async () => ({ timestamp }),
    readContract,
  } as unknown as PublicClient;
}
describe('offline authorized decision → existing settlement builder', () => {
  it('binds exact policy, claim, loss, amount, loss cap, beneficiary and designated authority with no signer or broadcast', async () => {
    const c = await approvedFixture();
    const tx = await prepareClaimsTransaction(c, clientFor(c));
    expect(tx.account).toBe(authority);
    expect(tx.to).toBe('0x6657974EEdF488380251bDD95A7FFfb0D456E49E');
    const decoded = decodeFunctionData({ abi: insurancePoolAbi, data: tx.data });
    expect(decoded.functionName).toBe('settleClaim');
    expect(decoded.args).toEqual([
      toPolicyIdBytes32(c.policyId),
      toClaimIdBytes32(c.id),
      c.lossKey,
      c.payableMicros,
      c.lossCapMicros,
      owner,
    ]);
    expect((await prepareClaimsTransaction(c, clientFor(c))).data).toBe(tx.data);
    // The pool pins its USDC asset at construction. There is no caller-selected asset/deadline in this ABI.
    expect(decoded.args).toHaveLength(6);
  });
  it('accepts the exact onchain deadline and rejects a window one second early or late', async () => {
    const c = await approvedFixture();
    await expect(prepareClaimsTransaction(c, clientFor(c, 300n))).resolves.toBeTruthy();
    for (const at of [99n, 301n])
      await expect(prepareClaimsTransaction(c, clientFor(c, at))).rejects.toThrow(
        'coverage window',
      );
  });
  it.each([
    { chainId: 1 },
    { beneficiary: authority },
    { reserved: 0n },
    { lossPolicy: '0x' + 'ff'.repeat(32) },
    { lossCap: 1n },
  ])('rejects mismatched chain/financial bindings %#', async (patch) => {
    const c = await approvedFixture();
    await expect(prepareClaimsTransaction(c, clientFor(c, 200n, patch))).rejects.toThrow();
  });
});
