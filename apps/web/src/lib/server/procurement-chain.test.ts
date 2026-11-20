import { describe, it, expect } from 'vitest';
import { openDatabase, ProcurementStore } from '@arcuex/persistence';
import { ProcurementService } from '@arcuex/agent-sdk';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { insurancePoolAbi, toPolicyIdBytes32 } from '@arcuex/onchain';
import {
  verifyBindEvent,
  transactions,
  preflightPayment,
  verifyApproval,
  verifyReceipt,
  type procurementClient,
} from './procurement-chain';
const owner = '0x1111111111111111111111111111111111111111';
const pool = '0x6657974EEdF488380251bDD95A7FFfb0D456E49E';
const token = '0x3600000000000000000000000000000000000000';
function fixture() {
  const service = new ProcurementService(
    new ProcurementStore(openDatabase()),
    pool,
    token,
    () => 1800000000,
  );
  const a = service.register(owner, {
    idempotencyKey: 'a',
    signer: owner,
    label: 'agent',
    position: 'demo',
    exposureMicros: '100000000',
    ownerAttestsControl: true,
  });
  const q = service.quote(owner, {
    idempotencyKey: 'q',
    agentId: a.id,
    eligibility: {
      positionHealthy: true,
      noKnownIncident: true,
      syntheticOnly: true,
      ownerAttestsControl: true,
    },
    limitMicros: '10000000',
    durationDays: 7,
  });
  const p = service.prepare(owner, { quoteId: q.terms.quoteId, acceptedDigest: q.digest }).policy;
  const args = {
    policyId: toPolicyIdBytes32(p.terms.policyId),
    termsHash: p.digest,
    beneficiary: owner,
    premiumPayer: owner,
    premium: 100000n,
    limit: 10000000n,
    coverageStart: BigInt(p.terms.effectiveAt),
    coverageEnd: BigInt(p.terms.expiresAt),
  };
  return { p, args, service };
}
describe('procurement bind reconciliation', () => {
  it('accepts matching receipt terms and prepares only exact approval and bind', () => {
    const { p, args } = fixture();
    expect(() => verifyBindEvent(p, args, 1800000001)).not.toThrow();
    expect(transactions(p).map((t) => t.to)).toEqual([token, pool]);
  });
  it.each([
    'policyId',
    'termsHash',
    'beneficiary',
    'premiumPayer',
    'premium',
    'limit',
    'coverageStart',
    'coverageEnd',
  ])('rejects altered %s', (field) => {
    const { p, args } = fixture();
    expect(() =>
      verifyBindEvent(p, { ...args, [field]: field === 'premium' ? 1n : 'bad' }, 1800000001),
    ).toThrow('does not match');
  });
  it.each([1799999999, 1800000600, 1800000901])('rejects late or pre-quote block %s', (time) => {
    const { p, args } = fixture();
    expect(() => verifyBindEvent(p, args, time)).toThrow('Late bind');
  });
  it('prevents SQL mutations of immutable terms and confirmed receipts', () => {
    const { p, service } = fixture();
    const db = service.store.db;
    expect(() =>
      db
        .prepare('UPDATE procurement_policies SET payload=? WHERE id=?')
        .run('{}', p.terms.policyId),
    ).toThrow('immutable');
    expect(() => db.prepare('DELETE FROM procurement_records').run()).toThrow('immutable');
    service.store.confirm(p.terms.policyId, '0xreceipt', 1800000001);
    expect(() =>
      db
        .prepare('UPDATE procurement_policies SET bind_tx=? WHERE id=?')
        .run('other', p.terms.policyId),
    ).toThrow('immutable');
  });
});

it('verifies exact approval receipts and rejects altered approval calldata or payer', async () => {
  const { p } = fixture();
  const expected = transactions(p)[0]!;
  const hash = `0x${'ab'.repeat(32)}` as const;
  let tx = {
    hash,
    blockHash: hash,
    blockNumber: 10n,
    from: owner,
    to: expected.to,
    input: expected.data,
    value: 0n,
  };
  const client = {
    getChainId: async () => 5042002,
    getBlockNumber: async () => 12n,
    getTransactionReceipt: async () => ({
      status: 'success',
      transactionHash: hash,
      blockHash: hash,
      blockNumber: 10n,
      from: owner,
      to: expected.to,
    }),
    getTransaction: async () => tx,
    getBlock: async () => ({ hash, timestamp: 1800000001n }),
  } as unknown as ReturnType<typeof procurementClient>;
  expect(await verifyApproval(p, hash, client)).toBe(1800000001);
  tx = { ...tx, input: '0x00' };
  await expect(verifyApproval(p, hash, client)).rejects.toThrow('does not match');
  tx = { ...tx, input: expected.data, from: '0x2222222222222222222222222222222222222222' };
  await expect(verifyApproval(p, hash, client)).rejects.toThrow('does not match');
});

it('checks fresh chain capacity, duplicate binding, payer balance, and allowance before returning payment data', async () => {
  const { p } = fixture();
  let capital = 10000000n;
  let payerBalance = 99999n;
  let allowance = 0n;
  let bound = false;
  let simulateBind = true;
  let timestamp = BigInt(p.terms.quoteExpiresAt - 1);
  const client = {
    getChainId: async () => 5042002,
    getCode: async () => '0x6000',
    call: async () => {
      if (!simulateBind) throw new Error('reverted');
      return {};
    },
    getBlockNumber: async () => 12n,
    getBlock: async () => ({ number: 10n, hash: p.digest, timestamp }),
    readContract: async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'usdc':
          return token;
        case 'availableCapital':
          return capital;
        case 'balanceOf':
          return payerBalance;
        case 'allowance':
          return allowance;
        case 'policies':
          return [p.digest, owner, owner, 10000000n, 100000n, 0n, 0n, 10000000n, 0n, bound, false];
        default:
          throw new Error('Unexpected read');
      }
    },
  } as unknown as ReturnType<typeof procurementClient>;
  await expect(preflightPayment(p, 'approve', client)).rejects.toThrow('enough testnet USDC');
  payerBalance = 100000n;
  await expect(preflightPayment(p, 'approve', client)).resolves.toBeUndefined();
  await expect(preflightPayment(p, 'bind', client)).rejects.toThrow('Approve the premium');
  allowance = 100000n;
  await expect(preflightPayment(p, 'bind', client)).resolves.toBeUndefined();
  simulateBind = false;
  await expect(preflightPayment(p, 'bind', client)).rejects.toThrow('did not pass Arc simulation');
  simulateBind = true;
  timestamp++;
  await expect(preflightPayment(p, 'bind', client)).rejects.toThrow('Quote expired on Arc');
  timestamp--;
  capital--;
  await expect(preflightPayment(p, 'bind', client)).rejects.toThrow(
    'Insufficient available pool capital',
  );
  bound = true;
  await expect(preflightPayment(p, 'bind', client)).rejects.toThrow('already bound');
});

it('validates canonical bind receipts and refuses reverted, immature, or orphaned binds', async () => {
  const { p, args, service } = fixture();
  const hash = `0x${'55'.repeat(32)}` as const;
  const blockHash = `0x${'aa'.repeat(32)}` as const;
  const blockNumber = 10n;
  let head = 11n;
  let reverted = false;
  let chainHash = blockHash as `0x${string}`;
  const log = {
    address: pool,
    removed: false,
    blockNumber,
    blockHash,
    transactionHash: hash,
    topics: encodeEventTopics({ abi: insurancePoolAbi, eventName: 'PolicyBound', args }),
    data: encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint64' },
        { type: 'uint64' },
      ],
      [args.termsHash, args.premium, args.limit, args.coverageStart, args.coverageEnd],
    ),
  };
  const client = {
    getChainId: async () => 5042002,
    getBlockNumber: async () => head,
    getBlock: async () => ({ blockNumber, hash: chainHash, timestamp: 1800000001n }),
    getTransactionReceipt: async () => ({
      transactionHash: hash,
      status: reverted ? 'reverted' : 'success',
      to: pool,
      from: owner,
      blockNumber,
      blockHash,
      logs: [log],
    }),
  } as unknown as ReturnType<typeof procurementClient>;
  await expect(verifyReceipt(p, hash, client)).rejects.toThrow('awaiting two');
  head++;
  reverted = true;
  await expect(verifyReceipt(p, hash, client)).rejects.toThrow('Successful bind');
  reverted = false;
  chainHash = hash;
  await expect(verifyReceipt(p, hash, client)).rejects.toThrow('no longer canonical');
  expect(service.store.policy(p.terms.policyId)?.state).toBe('prepared');
  chainHash = blockHash;
  await expect(verifyReceipt(p, hash, client)).resolves.toBe(1800000001);
});
