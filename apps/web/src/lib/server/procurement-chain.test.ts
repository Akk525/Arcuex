import { describe, it, expect } from 'vitest';
import { openDatabase, ProcurementStore } from '@arcuex/persistence';
import { ProcurementService } from '@arcuex/agent-sdk';
import { toPolicyIdBytes32 } from '@arcuex/onchain';
import {
  verifyBindEvent,
  transactions,
  verifyApproval,
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
  let tx = { from: owner, to: expected.to, input: expected.data, value: 0n };
  const client = {
    getChainId: async () => 5042002,
    getTransactionReceipt: async () => ({ status: 'success', blockHash: hash }),
    getTransaction: async () => tx,
    getBlock: async () => ({ timestamp: 1800000001n }),
  } as unknown as ReturnType<typeof procurementClient>;
  expect(await verifyApproval(p, hash, client)).toBe(1800000001);
  tx = { ...tx, input: '0x00' };
  await expect(verifyApproval(p, hash, client)).rejects.toThrow('does not match');
  tx = { ...tx, input: expected.data, from: '0x2222222222222222222222222222222222222222' };
  await expect(verifyApproval(p, hash, client)).rejects.toThrow('does not match');
});
