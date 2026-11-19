import { hasProcurementBindAuthority } from './procurement';
import { describe, it, expect, beforeEach } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { openDatabase, ProcurementStore } from '@arcuex/persistence';
import { ProcurementService, procurementDigest } from './procurement';
import { confirmProcurement } from './procurement-confirm';
import type { PublicClient } from 'viem';
const owner = privateKeyToAccount(generatePrivateKey()); // Ephemeral test identity, never printed or retained.
const agentWallet = privateKeyToAccount(generatePrivateKey());
const who = owner.address.toLowerCase(),
  agentWho = agentWallet.address.toLowerCase();
const pool = '0x6657974EEdF488380251bDD95A7FFfb0D456E49E';
const usdc = '0x3600000000000000000000000000000000000000';
let service: ProcurementService, now: number;
const eligibility = {
  positionHealthy: true,
  noKnownIncident: true,
  syntheticOnly: true,
  ownerAttestsControl: true,
};
function register() {
  return service.register(who, {
    idempotencyKey: 'register-1',
    signer: agentWho,
    label: 'Risk agent',
    position: 'position:1',
    exposureMicros: '100000000',
    ownerAttestsControl: true,
  });
}
function quote(agentId: string, key = 'quote-1', actor = who, delegationId?: string) {
  return service.quote(actor, {
    idempotencyKey: key,
    agentId,
    delegationId,
    eligibility,
    limitMicros: '10000000',
    durationDays: 7,
  });
}
beforeEach(() => {
  now = 1800000000;
  service = new ProcurementService(new ProcurementStore(openDatabase()), pool, usdc, () => now);
});
describe('authenticated procurement', () => {
  it('validates registration and enforces ownership for delegation', () => {
    expect(() => service.register(who, { idempotencyKey: 'bad', signer: '0x0' })).toThrow();
    const a = register();
    expect(() => service.delegate(agentWho, { idempotencyKey: 'bad', agentId: a.id })).toThrow(
      'Only the authenticated owner',
    );
  });
  it('rejects unhealthy positions, malformed amounts and unsupported durations', () => {
    const a = register();
    for (const change of [
      { eligibility: { ...eligibility, noKnownIncident: false } },
      { limitMicros: '1e8' },
      { limitMicros: '-1' },
      { limitMicros: '10000001' },
      { durationDays: 0 },
    ]) {
      expect(() =>
        service.quote(who, {
          agentId: a.id,
          idempotencyKey: JSON.stringify(change),
          eligibility,
          limitMicros: '10000000',
          durationDays: 7,
          ...change,
        }),
      ).toThrow();
    }
  });
  it('creates deterministic immutable terms and idempotent quotes', () => {
    const a = register(),
      q = quote(a.id);
    expect(quote(a.id)).toEqual(q);
    expect(q.terms.premiumMicros).toBe('100000');
    expect(q.terms.effectiveAt).toBe(now + 900);
    expect(q.digest).toBe(procurementDigest(q.terms));
    expect(() =>
      service.quote(who, {
        agentId: a.id,
        idempotencyKey: 'quote-1',
        eligibility,
        limitMicros: '50000000',
        durationDays: 7,
      }),
    ).toThrow('different input');
    const prepared = service.prepare(who, { quoteId: q.terms.quoteId, acceptedDigest: q.digest });
    expect(prepared.policy.state).toBe('prepared');
    expect(prepared.policy.bindTx).toBeNull();
    expect(prepared.transactions).toHaveLength(2);
    expect(service.prepare(who, { quoteId: q.terms.quoteId, acceptedDigest: q.digest })).toEqual(
      prepared,
    );
    expect(service.store.policies(who)).toHaveLength(1);
  });
  it('requires acceptance, prevents unauthorized access and expired preparation', () => {
    const a = register(),
      q = quote(a.id);
    expect(() =>
      service.prepare(who, { quoteId: q.terms.quoteId, acceptedDigest: 'fake' }),
    ).toThrow('Explicitly accept');
    expect(() =>
      service.prepare(agentWho, {
        quoteId: q.terms.quoteId,
        acceptedDigest: q.digest,
        delegationId: 'fake',
      }),
    ).toThrow('different payer or delegation');
    now += 601;
    expect(() =>
      service.prepare(who, { quoteId: q.terms.quoteId, acceptedDigest: q.digest }),
    ).toThrow('Quote expired');
  });
  it('reserves cumulative delegated premium once and rejects beneficiary/exposure abuse', () => {
    const a = register();
    const d = service.delegate(who, {
      idempotencyKey: 'delegate',
      agentId: a.id,
      premiumCapMicros: '100000',
      limitCapMicros: '10000000',
      expiresAt: now + 3600,
    });
    const q = quote(a.id, 'a', agentWho, d.id),
      q2 = quote(a.id, 'b', agentWho, d.id);
    const input = {
      quoteId: q.terms.quoteId,
      acceptedDigest: q.digest,
      delegationId: d.id,
      beneficiary: agentWho,
    };
    expect(service.prepare(agentWho, input).policy.terms.beneficiary).toBe(who);
    service.prepare(agentWho, input);
    expect(() =>
      service.prepare(agentWho, { ...input, quoteId: q2.terms.quoteId, acceptedDigest: q2.digest }),
    ).toThrow('cap exceeded');
    expect(() => service.inspect('0xother', q.terms.policyId)).toThrow('not found');
    expect(service.revoke(who, d.id).revoked).toBe(true);
    expect(() => service.prepare(agentWho, input)).toThrow('revoked');
  });
  it('rejects expired delegations', () => {
    const a = register();
    const d = service.delegate(who, {
      idempotencyKey: 'delegate',
      agentId: a.id,
      premiumCapMicros: '100000',
      limitCapMicros: '10000000',
      expiresAt: now + 1,
    });
    now += 2;
    expect(() => quote(a.id, 'q', agentWho, d.id)).toThrow('expired');
  });
  it('confirms only a successful exact bind receipt before expiry and coverage start', async () => {
    const a = register(),
      q = quote(a.id);
    const p = service.prepare(who, { quoteId: q.terms.quoteId, acceptedDigest: q.digest }).policy;
    const txHash = `0x${'ab'.repeat(32)}`;
    const row = [
      q.digest,
      who,
      who,
      10000000n,
      100000n,
      BigInt(q.terms.effectiveAt),
      BigInt(q.terms.expiresAt),
      10000000n,
      0n,
      true,
      false,
    ];
    let status = 'reverted',
      blockTime = BigInt(now + 10);
    const client = {
      getChainId: async () => 5042002,
      getTransactionReceipt: async () => ({
        status,
        blockHash: '0xblock',
        transactionHash: txHash,
      }),
      getTransaction: async () => ({
        to: pool,
        from: who,
        input: service.transactions(p)[1]!.data,
        value: 0n,
      }),
      getBlock: async () => ({ timestamp: blockTime }),
      readContract: async () => row,
    } as unknown as PublicClient;
    await expect(
      confirmProcurement(service, client, who, p.terms.policyId, txHash),
    ).rejects.toThrow('differs');
    status = 'success';
    blockTime = BigInt(q.terms.quoteExpiresAt + 1);
    await expect(
      confirmProcurement(service, client, who, p.terms.policyId, txHash),
    ).rejects.toThrow('differs');
    blockTime = BigInt(now + 10);
    row[0] = `0x${'cd'.repeat(32)}`;
    await expect(
      confirmProcurement(service, client, who, p.terms.policyId, txHash),
    ).rejects.toThrow('differs');
    row[0] = q.digest;
    const confirmed = await confirmProcurement(service, client, who, p.terms.policyId, txHash);
    expect(confirmed.state).toBe('confirmed');
    expect(await confirmProcurement(service, client, who, p.terms.policyId, txHash)).toEqual(
      confirmed,
    );
    expect(service.store.get('quote', q.terms.quoteId)).toEqual(q);
  });
});

it('enforces an owner-chosen beneficiary at quote and acceptance, with expiry on preparation retries', () => {
  const a = register();
  const beneficiary = '0x3333333333333333333333333333333333333333';
  const d = service.delegate(who, {
    idempotencyKey: 'custom-beneficiary',
    agentId: a.id,
    premiumCapMicros: '1000000',
    limitCapMicros: '10000000',
    beneficiary,
    expiresAt: now + 3600,
  });
  const input = {
    idempotencyKey: 'scoped-q',
    agentId: a.id,
    delegationId: d.id,
    beneficiary,
    limitMicros: '10000000',
    durationDays: 7,
    eligibility,
  };
  expect(() =>
    service.quote(agentWho, { ...input, idempotencyKey: 'bad-beneficiary', beneficiary: agentWho }),
  ).toThrow('Beneficiary');
  const q = service.quote(agentWho, input);
  const accept = { quoteId: q.terms.quoteId, acceptedDigest: q.digest, delegationId: d.id };
  expect(service.prepare(agentWho, accept).policy.terms.beneficiary).toBe(beneficiary);
  const ownerQuote = quote(a.id, 'owner-beneficiary');
  expect(() =>
    service.prepare(agentWho, {
      quoteId: ownerQuote.terms.quoteId,
      acceptedDigest: ownerQuote.digest,
      delegationId: d.id,
    }),
  ).toThrow('different payer or delegation');
  now += 601;
  expect(() => service.prepare(agentWho, accept)).toThrow('Quote expired');
});

it('rejects a limit above the registered exposure and unsupported chain registration', () => {
  const a = service.register(who, {
    idempotencyKey: 'small',
    signer: who,
    label: 'small',
    position: 'small',
    exposureMicros: '1000000',
    ownerAttestsControl: true,
  });
  expect(() => quote(a.id, 'overexposed')).toThrow('registered exposure');
  expect(() =>
    service.register(who, {
      idempotencyKey: 'mainnet',
      signer: who,
      label: 'bad',
      position: 'bad',
      exposureMicros: '1000000',
      chainId: 1,
      ownerAttestsControl: true,
    }),
  ).toThrow('Protocol or chain is not approved');
});

it('evaluates delegated bind authority at the chain block, including revocation and expiry', () => {
  const agent = register();
  const grant = service.delegate(who, {
    idempotencyKey: 'bind-authority',
    agentId: agent.id,
    premiumCapMicros: '100000',
    limitCapMicros: '10000000',
    expiresAt: now + 600,
  });
  const q = quote(agent.id, 'bound-to-grant', agentWho, grant.id);
  const policy = service.accept(agentWho, {
    quoteId: q.terms.quoteId,
    acceptedDigest: q.digest,
    delegationId: grant.id,
  });
  expect(hasProcurementBindAuthority(service.store, policy, now - 1)).toBe(false);
  expect(hasProcurementBindAuthority(service.store, policy, now + 1)).toBe(true);
  expect(hasProcurementBindAuthority(service.store, policy, grant.expiresAt)).toBe(false);
  now += 5;
  service.revoke(who, grant.id);
  expect(() => service.authorizedPayment(agentWho, policy.terms.policyId, q.digest)).toThrow(
    'revoked',
  );
  expect(hasProcurementBindAuthority(service.store, policy, now - 1)).toBe(true);
  expect(hasProcurementBindAuthority(service.store, policy, now)).toBe(false);
});
