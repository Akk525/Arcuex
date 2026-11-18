import { describe, it, expect, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { requestCoverageQuote } from '@arcuex/insurance';
import { ProcurementService } from '@arcuex/agent-sdk';
import { openDatabase, ProcurementStore, InsuranceRepository } from '@arcuex/persistence';
import { insurancePoolAbi, toPolicyIdBytes32 } from '@arcuex/onchain';
import { procurementPool, type procurementClient } from './procurement-chain';
import { reconcilePolicyBinds, reconciliationRows } from './policy-reconciliation';
const owner = `0x${'11'.repeat(20)}` as const;
const hash = `0x${'ab'.repeat(32)}` as const;
const tx = `0x${'cd'.repeat(32)}` as const;
function fixture(omit?: string, partialExposure = false) {
  const db = openDatabase(),
    store = new ProcurementStore(db);
  const now = Math.floor(Date.now() / 1000);
  const service = new ProcurementService(store, procurementPool, owner, () => now);
  const agent = service.register(owner, {
    idempotencyKey: 'register',
    label: 'test',
    signer: owner,
    position: 'synthetic-1',
    exposureMicros: '1000000',
    ownerAttestsControl: true,
  });
  const quote = service.quote(owner, {
    idempotencyKey: 'quote',
    agentId: agent.id,
    limitMicros: '1000000',
    durationDays: 1,
    eligibility: {
      positionHealthy: true,
      noKnownIncident: true,
      syntheticOnly: true,
      ownerAttestsControl: true,
    },
  });
  const p = service.prepare(owner, {
    quoteId: quote.terms.quoteId,
    acceptedDigest: quote.digest,
  }).policy;
  const a = {
    policyId: toPolicyIdBytes32(p.terms.policyId),
    termsHash: p.digest,
    beneficiary: owner,
    premiumPayer: owner,
    premium: 10000n,
    limit: 1000000n,
    coverageStart: BigInt(p.terms.effectiveAt),
    coverageEnd: BigInt(p.terms.expiresAt),
  };
  const log = {
    address: procurementPool,
    removed: false,
    blockNumber: 10n,
    blockHash: hash,
    transactionHash: tx,
    logIndex: 0,
    transactionIndex: 0,
    topics: encodeEventTopics({ abi: insurancePoolAbi, eventName: 'PolicyBound', args: a }),
    data: encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint64' },
        { type: 'uint64' },
      ],
      [a.termsHash, a.premium, a.limit, a.coverageStart, a.coverageEnd],
    ),
  };
  // policyId, beneficiary and premiumPayer are indexed (checked-in ABI).
  const client = {
    getChainId: vi.fn(async () => 5042002),
    getBlockNumber: vi.fn(async () => 20n),
    getBlock: vi.fn(async () => ({ hash, timestamp: BigInt(now + 1) })),
    getLogs: vi.fn(async () => [log]),
    readContract: vi.fn(async () => [
      a.termsHash,
      a.beneficiary,
      a.premiumPayer,
      a.limit,
      a.premium,
      a.coverageStart,
      a.coverageEnd,
      a.limit,
      0n,
      true,
      false,
    ]),
  };
  const target = openDatabase();
  const records = db.prepare('SELECT * FROM procurement_records').all() as Array<{
    kind: string;
    id: string;
    owner: string;
    payload: string;
  }>;
  const targetStore = new ProcurementStore(target);
  for (const r of records)
    if (r.kind !== omit && omit !== 'all')
      targetStore.insert(r.kind, r.id, r.owner, JSON.parse(r.payload));
  if (omit !== 'policy' && omit !== 'all')
    targetStore.insertPolicy(
      partialExposure
        ? ({ ...p, terms: { ...p.terms, exposure: undefined } } as unknown as typeof p)
        : p,
    );
  db.close();
  const run = () =>
    reconcilePolicyBinds(
      target,
      10n,
      10n,
      client as unknown as ReturnType<typeof procurementClient>,
    );
  return { db: target, store: targetStore, p, agent, log, client, run, records };
}
describe('canonical policy reconciliation', () => {
  it('links full authenticated records, records provenance, confirms once and deduplicates repeated runs', async () => {
    const f = fixture();
    f.client.getLogs.mockResolvedValue([f.log, f.log]);
    await f.run();
    await f.run();
    const rows = reconciliationRows(f.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('VERIFIED_LINKED');
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({
      chainId: 5042002,
      blockHash: hash,
      transactionHash: tx,
      logIndex: 0,
      blockNumber: '10',
      policyId: toPolicyIdBytes32(f.p.terms.policyId),
    });
    expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(true);
    expect(f.store.policy(f.p.terms.policyId)?.bindTx).toBe(tx);
    f.db.close();
  });
  it('imports missing historical records as unlinked without inventing a policy or owner', async () => {
    const f = fixture('all');
    await f.run();
    expect(reconciliationRows(f.db)[0]?.status).toBe('ONCHAIN_UNLINKED');
    expect(reconciliationRows(f.db)[0]?.local_policy_id).toBeNull();
    expect(f.store.policies(owner)).toEqual([]);
    f.db.close();
  });
  it('recovers a missing self-procured policy only from its exact quote and authenticated acceptance', async () => {
    const f = fixture('policy');
    await f.run();
    await f.run();
    expect(reconciliationRows(f.db)[0]?.status).toBe('VERIFIED_LINKED');
    expect(f.store.policy(f.p.terms.policyId)?.terms).toEqual(f.p.terms);
    expect(f.store.policies(owner)).toHaveLength(1);
    f.db.close();
  });
  it.each(['agent', 'quote', 'acceptance'])(
    'blocks incomplete %s and safely relinks after restoration',
    async (kind) => {
      const f = fixture(kind);
      const row = f.records.find((r) => r.kind === kind)!;
      await f.run();
      expect(reconciliationRows(f.db)[0]?.status).toBe('INCOMPLETE');
      expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(false);
      f.store.insert(kind, row.id, row.owner, JSON.parse(row.payload));
      await f.run();
      expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(true);
      f.db.close();
    },
  );
  it('orphans missing/reorged logs and preserves old confirmation and accounting records', async () => {
    const f = fixture();
    await f.run();
    f.client.getBlock.mockResolvedValue({ hash: `0x${'ff'.repeat(32)}`, timestamp: 1n });
    f.client.getLogs.mockResolvedValue([]);
    await f.run();
    expect(reconciliationRows(f.db)[0]?.status).toBe('ORPHANED');
    expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(false);
    expect(f.store.policy(f.p.terms.policyId)?.bindTx).toBe(tx);
    f.db.close();
  });
  it.each(['chain', 'rpc', 'state', 'unconfirmed', 'mid-scan-reorg', 'wrong-pool'])(
    'fails closed on %s and recovers on retry',
    async (failure) => {
      const f = fixture();
      await f.run();
      if (failure === 'chain') f.client.getChainId.mockResolvedValueOnce(1);
      if (failure === 'rpc')
        f.client.getLogs.mockRejectedValueOnce(new Error('https://secret-rpc-key'));
      if (failure === 'state') f.client.readContract.mockResolvedValueOnce([]);
      if (failure === 'unconfirmed') f.client.getBlockNumber.mockResolvedValueOnce(10n);
      if (failure === 'mid-scan-reorg')
        f.client.getBlock.mockResolvedValueOnce({ hash: `0x${'ff'.repeat(32)}`, timestamp: 1n });
      if (failure === 'wrong-pool')
        f.client.getLogs.mockResolvedValueOnce([{ ...f.log, address: owner }]);
      await expect(f.run()).rejects.toThrow('this run grants no eligibility');
      expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(false);
      await f.run();
      expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(true);
      f.db.close();
    },
  );
  it('keeps an incomplete exposure out of claim contexts without inventing it', async () => {
    const f = fixture(undefined, true);
    await f.run();
    expect(reconciliationRows(f.db)[0]?.status).toBe('INCOMPLETE');
    expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(false);
    expect(new InsuranceRepository(f.db).claimsPolicyContext(f.p.terms.policyId)).toBeNull();
    f.db.close();
  });
  it('does not accept another wallet as the authenticated terms acceptor', async () => {
    const f = fixture('acceptance');
    const original = JSON.parse(f.records.find((r) => r.kind === 'acceptance')!.payload);
    f.store.insert('acceptance', f.p.terms.policyId, owner, {
      ...original,
      actor: `0x${'99'.repeat(20)}`,
    });
    await f.run();
    expect(reconciliationRows(f.db)[0]?.status).toBe('INCOMPLETE');
    f.db.close();
  });
  it('rolls back a conflicting canonical event batch and retains prior evidence for retry', async () => {
    const f = fixture();
    await f.run();
    f.client.getLogs.mockResolvedValueOnce([f.log, { ...f.log, logIndex: 1 }]);
    await expect(f.run()).rejects.toThrow('this run grants no eligibility');
    expect(reconciliationRows(f.db)).toHaveLength(1);
    expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(false);
    await f.run();
    expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(true);
    f.db.close();
  });
  it('does not import a policy ID already used by the legacy ledger', async () => {
    const f = fixture('policy'),
      repo = new InsuranceRepository(f.db);
    const q = requestCoverageQuote(repo, {
      idempotencyKey: 'legacy-collision',
      policyholder: { displayName: 'fixture' },
      agent: { externalRef: 'fixture', label: 'fixture' },
    });
    repo.savePolicy({
      id: f.p.terms.policyId,
      quoteId: q.id,
      productId: q.productId,
      policyholderId: q.policyholderId,
      agentId: q.agentId,
      status: 'active',
      terms: q.terms,
      createdAt: new Date().toISOString(),
    });
    const before = repo.getPolicy(f.p.terms.policyId);
    await f.run();
    expect(reconciliationRows(f.db)[0]?.status).toBe('ONCHAIN_UNLINKED');
    expect(f.store.policy(f.p.terms.policyId)).toBeNull();
    expect(repo.getPolicy(f.p.terms.policyId)).toEqual(before);
    f.db.close();
  });
  it('prevents an older scan from committing after a newer successful run', async () => {
    const f = fixture();
    f.client.getLogs.mockImplementationOnce(async () => {
      await f.run();
      return [f.log];
    });
    await expect(f.run()).rejects.toThrow('superseded');
    expect(reconciliationRows(f.db)).toHaveLength(1);
    expect(f.store.claimsEligible(f.p.terms.policyId)).toBe(true);
    f.db.close();
  });
  it('rejects incomplete exposure/digest and stale eligibility', async () => {
    const f = fixture();
    await f.run();
    expect(f.store.claimsEligible(f.p.terms.policyId, Math.floor(Date.now() / 1000) + 301)).toBe(
      false,
    );
    // Immutable records cannot be silently rewritten into a new exposure.
    expect(() => f.db.prepare("UPDATE procurement_policies SET payload='{}'").run()).toThrow();
    f.db.close();
  });
});
