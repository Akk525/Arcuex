import { describe, it, expect, vi } from 'vitest';
import { ProcurementApiClient, ProcurementError } from '@arcuex/agent-sdk';
import { toPolicyIdBytes32, insurancePoolAbi } from '@arcuex/onchain';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { getDb } from './db';
import { reconcilePolicyBinds } from './policy-reconciliation';
import { POST as claimsIntake } from '@/app/api/claims/cases/route';
import { readPolicies } from './policy-read-api';
import {
  preflightPayment,
  readProcurementCapacity,
  verifyApproval,
  verifyReceipt,
  reconcile,
  procurementPool,
} from './procurement-chain';
vi.mock(import('./procurement-chain'), async (importOriginal) => ({
  ...(await importOriginal()),
  preflight: vi.fn(),
  preflightPayment: vi.fn(),
  readProcurementCapacity: vi.fn(),
  verifyReceipt: vi.fn(),
  verifyApproval: vi.fn(),
  reconcile: vi.fn(),
}));
import { handle } from './procurement-api';
describe('procurement API boundary', () => {
  it('discovers only the labeled synthetic product', async () => {
    const r = await handle(new Request('http://localhost/api/procurement/products'), 'products');
    const json = await r.json();
    expect(json.chainId).toBe(5042002);
    expect(json.products).toHaveLength(1);
    expect(json.products[0].synthetic).toBe(true);
  });
  it('does not trust a caller-supplied owner or funding flag', async () => {
    const r = await handle(
      new Request('http://localhost/api/procurement/procure', {
        method: 'POST',
        body: JSON.stringify({
          owner: '0x1111111111111111111111111111111111111111',
          fundingVerified: true,
        }),
      }),
      'procure',
    );
    expect(r.status).toBe(401);
  });
  it('rejects cross origin and oversized requests', async () => {
    const r = await handle(
      new Request('http://localhost/api/procurement/auth/challenge', {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
        body: '{}',
      }),
      'auth/challenge',
    );
    expect(r.status).toBe(403);
    const big = await handle(
      new Request('http://localhost/api/procurement/auth/challenge', {
        method: 'POST',
        body: 'x'.repeat(16001),
      }),
      'auth/challenge',
    );
    expect(big.status).toBe(413);
  });
  it('models malformed JSON as input error', async () => {
    const r = await handle(
      new Request('http://localhost/api/procurement/procure', { method: 'POST', body: '[' }),
      'procure',
    );
    expect(r.status).toBe(400);
  });
});

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
it('runs authenticated registration, quote, acceptance and idempotent preparation through HTTP', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  async function post(path: string, body: unknown, token?: string) {
    return handle(
      new Request(`http://localhost/api/procurement/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Cookie: token } : {}),
        },
        body: JSON.stringify(body),
      }),
      path,
    );
  }
  const challenge = await (await post('auth/challenge', { address: account.address })).json();
  const verified = await post('auth/verify', {
    id: challenge.id,
    signature: await account.signMessage({ message: challenge.message }),
  });
  const token = verified.headers.get('set-cookie')!.split(';')[0]!;
  expect(verified.headers.get('set-cookie')).toContain('HttpOnly');
  expect(await verified.json()).not.toHaveProperty('token');
  const agent = await (
    await post(
      'agents',
      {
        idempotencyKey: 'register-http',
        label: 'test',
        position: 'demo-1',
        exposureMicros: '100000000',
        signer: account.address,
        ownerAttestsControl: true,
      },
      token,
    )
  ).json();
  const quote = await (
    await post(
      'quotes',
      {
        idempotencyKey: 'quote-http',
        agentId: agent.id,
        limitMicros: '10000000',
        premiumMicros: '1',
        durationDays: 7,
        eligibility: {
          positionHealthy: true,
          noKnownIncident: true,
          syntheticOnly: true,
          ownerAttestsControl: true,
        },
      },
      token,
    )
  ).json();
  expect(quote.terms.premiumMicros).toBe('100000');
  const rejected = await post(
    'procure',
    { quoteId: quote.terms.quoteId, acceptedDigest: '0xfake' },
    token,
  );
  expect(rejected.status).toBe(400);
  const input = { quoteId: quote.terms.quoteId, acceptedDigest: quote.digest };
  const first = await (await post('procure', input, token)).json();
  const second = await (await post('procure', input, token)).json();
  expect(first.policy.state).toBe('prepared');
  expect(second).toEqual(first);
  expect(first.policy.bindTx).toBeNull();
  const list = await handle(
    new Request('http://localhost/api/procurement/policies', {
      headers: { Cookie: token },
    }),
    'policies',
  );
  expect(await list.json()).toHaveLength(1);
});

it.each(['owner', 'delegated agent'] as const)(
  'completes staged procurement and canonical claim eligibility as %s with chain doubles',
  async (purchase) => {
    const owner = privateKeyToAccount(generatePrivateKey());
    const agent = privateKeyToAccount(generatePrivateKey());
    const outsider = privateKeyToAccount(generatePrivateKey());
    const delegated = purchase === 'delegated agent';
    const payer = delegated ? agent : owner;
    const clock = Date.now();
    const ownerWallet = owner.address.toLowerCase();
    const payerWallet = payer.address.toLowerCase();
    const request = (account: typeof owner) => {
      let session: string | undefined;
      const api = new ProcurementApiClient({
        baseUrl: 'http://localhost',
        request: async (input, init) => {
          const req = new Request(input, init);
          const path = new URL(req.url).pathname;
          if (path.startsWith('/api/policies/')) return readPolicies(req, path.split('/')[3]);
          const response = await handle(req, path.replace('/api/procurement/', ''));
          session = response.headers.get('set-cookie')?.split(';')[0] ?? session;
          return response;
        },
      });
      return {
        api,
        account,
        auth: () =>
          api.authenticate(account.address, (message) => account.signMessage({ message })),
        getSession: () => session,
      };
    };
    const holder = request(owner),
      authorized = request(agent),
      other = request(outsider);
    const buyer = delegated ? authorized : holder;
    await holder.auth();
    await authorized.auth();
    await other.auth();
    const catalog = await buyer.api.products();
    expect(catalog.paymentMode).toBe('arc_testnet_preflight_required');
    const product = catalog.products[0]!;
    vi.mocked(readProcurementCapacity).mockResolvedValue(2_110_000n);
    expect(await buyer.api.capacity()).toMatchObject({
      status: 'verified',
      availableMicros: '2110000',
    });
    const exposure = await holder.api.register({
      idempotencyKey: crypto.randomUUID(),
      productCode: product.code,
      protocol: product.protocol,
      label: 'policy position',
      position: 'offline-position',
      exposureMicros: '10000000',
      signer: agent.address,
      ownerAttestsControl: true,
    });
    const grant = delegated
      ? await holder.api.delegate({
          idempotencyKey: crypto.randomUUID(),
          agentId: exposure.id,
          premiumCapMicros: '10000',
          limitCapMicros: '1000000',
          expiresAt: Math.floor(clock / 1000) + 3600,
        })
      : undefined;
    const quoteInput = {
      idempotencyKey: crypto.randomUUID(),
      agentId: exposure.id,
      delegationId: grant?.id,
      productCode: product.code,
      productVersion: product.version,
      limitMicros: '1000000',
      durationDays: 7,
      eligibility: {
        positionHealthy: true,
        noKnownIncident: true,
        ownerAttestsControl: true,
        syntheticOnly: true,
      },
    };
    await expect(buyer.api.quote({ ...quoteInput, productVersion: 0 })).rejects.toThrow(
      'PRODUCT_MISMATCH',
    );
    if (grant) {
      const grants = await buyer.api.delegations();
      expect(grants.find(({ id }) => id === grant.id)).toMatchObject({
        agentId: exposure.id,
        revoked: false,
      });
      await expect(other.api.quote(quoteInput)).rejects.toThrow('FORBIDDEN');
    }
    const stale = await buyer.api.quote({ ...quoteInput, idempotencyKey: crypto.randomUUID() });
    const future = vi.spyOn(Date, 'now').mockReturnValue(stale.terms.quoteExpiresAt * 1000);
    try {
      await expect(
        buyer.api.accept({
          quoteId: stale.terms.quoteId,
          acceptedDigest: stale.digest,
          delegationId: grant?.id,
        }),
      ).rejects.toThrow('QUOTE_EXPIRED');
    } finally {
      future.mockRestore();
    }

    const quoted = await buyer.api.quote(quoteInput);
    const acceptance = {
      quoteId: quoted.terms.quoteId,
      acceptedDigest: quoted.digest,
      delegationId: grant?.id,
    };
    if (grant) await expect(holder.api.accept(acceptance)).rejects.toThrow('FORBIDDEN');
    await expect(
      buyer.api.accept({ ...acceptance, acceptedDigest: 'stale-digest' }),
    ).rejects.toThrow('TERMS_NOT_ACCEPTED');
    const accepted = await buyer.api.accept(acceptance);
    const policyId = quoted.terms.policyId;
    expect(accepted).toMatchObject({
      state: 'accepted_offchain',
      policy: { state: 'prepared', payer: payerWallet },
    });
    expect(accepted).not.toHaveProperty('transactions');
    expect(await buyer.api.accept(acceptance)).toEqual(accepted);
    expect(await buyer.api.lifecycle(policyId, grant ? exposure.id : undefined)).toMatchObject({
      state: 'prepared',
      claimsEligible: false,
    });
    expect(
      (await holder.api.policies()).filter(({ terms }) => terms.policyId === policyId),
    ).toHaveLength(1);

    const step = { policyId, acceptedDigest: quoted.digest };
    if (grant) {
      const atExpiry = vi.spyOn(Date, 'now').mockReturnValue(grant.expiresAt * 1000);
      try {
        for (const stage of ['approve', 'bind'] as const) {
          await expect(buyer.api.payment({ ...step, stage })).rejects.toThrow(
            /FORBIDDEN.*expired/i,
          );
        }
        expect(await buyer.api.lifecycle(policyId, exposure.id)).toMatchObject({
          state: 'expired',
          claimsEligible: false,
        });
      } finally {
        atExpiry.mockRestore();
      }
    }
    vi.mocked(preflightPayment).mockRejectedValueOnce(
      new ProcurementError('CAPITAL_UNAVAILABLE', 'Insufficient pool capacity'),
    );
    await expect(buyer.api.payment({ ...step, stage: 'approve' })).rejects.toThrow(
      'CAPITAL_UNAVAILABLE',
    );
    vi.mocked(preflightPayment).mockResolvedValue(undefined);
    const allowance = await buyer.api.payment({ ...step, stage: 'approve' });
    expect(allowance.transaction?.to.toLowerCase()).toBe(
      '0x3600000000000000000000000000000000000000',
    );

    const approvalHash = `0x${'aa'.repeat(32)}`;
    const bindHash = `0x${crypto.randomUUID().replaceAll('-', '').repeat(2)}` as const;
    const blockHash = `0x${'cc'.repeat(32)}` as const;
    const boundAt = Math.floor(Date.now() / 1000);
    vi.mocked(verifyApproval).mockRejectedValueOnce(
      new ProcurementError('INVALID_RECEIPT', 'Reverted'),
    );
    await expect(buyer.api.approval({ policyId, hash: approvalHash })).rejects.toThrow(
      'INVALID_RECEIPT',
    );
    vi.mocked(verifyApproval).mockResolvedValueOnce(boundAt);
    expect(await buyer.api.approval({ policyId, hash: bindHash })).toMatchObject({
      hash: bindHash,
    });
    const bind = await buyer.api.payment({ ...step, stage: 'bind' });
    expect(bind.transaction?.to).toBe(procurementPool);
    expect(bind.transaction?.account).toBe(payerWallet);
    vi.mocked(verifyReceipt).mockResolvedValue(boundAt);
    vi.mocked(reconcile).mockResolvedValueOnce({
      bound: true,
      cancelled: false,
      matches: false,
      paidOutMicros: '0',
      reservedMicros: '1000000',
      checkedAt: new Date().toISOString(),
    });
    await expect(buyer.api.confirm({ policyId, hash: bindHash })).rejects.toThrow(
      'RECONCILIATION_MISMATCH',
    );
    const goodReconciliation = {
      bound: true,
      cancelled: false,
      matches: true,
      paidOutMicros: '0',
      reservedMicros: '1000000',
      checkedAt: new Date().toISOString(),
    };
    vi.mocked(reconcile).mockResolvedValue(goodReconciliation);
    expect(await buyer.api.confirm({ policyId, hash: bindHash })).toMatchObject({
      state: 'confirmed',
      bindTx: bindHash,
    });
    expect(await buyer.api.lifecycle(policyId, grant ? exposure.id : undefined)).toMatchObject({
      state: 'reconciliation_pending',
      claimsEligible: false,
    });
    await expect(buyer.api.confirm({ policyId, hash: approvalHash })).rejects.toThrow(
      'ALREADY_BOUND',
    );
    expect((await buyer.api.payment({ ...step, stage: 'bind' })).transaction).toBeNull();

    const args = {
      policyId: toPolicyIdBytes32(policyId),
      termsHash: quoted.digest,
      beneficiary: ownerWallet,
      premiumPayer: payerWallet,
      premium: 10000n,
      limit: 1000000n,
      coverageStart: BigInt(quoted.terms.effectiveAt),
      coverageEnd: BigInt(quoted.terms.expiresAt),
    } as const;
    const log = {
      address: procurementPool,
      removed: false,
      transactionHash: bindHash,
      blockNumber: 10n,
      blockHash,
      logIndex: 1,
      transactionIndex: 0,
      topics: encodeEventTopics({
        abi: insurancePoolAbi,
        eventName: 'PolicyBound',
        args: {
          policyId: args.policyId,
          beneficiary: owner.address,
          premiumPayer: payer.address,
        },
      }),
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
      getBlockNumber: async () => 15n,
      getBlock: async () => ({ hash: blockHash, timestamp: BigInt(boundAt) }),
      getLogs: async () => [log],
      readContract: async () => [
        quoted.digest,
        ownerWallet,
        payerWallet,
        args.limit,
        args.premium,
        args.coverageStart,
        args.coverageEnd,
        args.limit,
        0n,
        true,
        false,
      ],
    } as unknown as Parameters<typeof reconcilePolicyBinds>[3];
    await reconcilePolicyBinds(getDb(), 10n, 10n, client);
    expect(await buyer.api.lifecycle(policyId, grant ? exposure.id : undefined)).toMatchObject({
      state: 'confirmed',
      claimsEligible: false,
      confirmation: { transactionHash: bindHash },
    });
    const active = vi.spyOn(Date, 'now').mockReturnValue(quoted.terms.effectiveAt * 1000 + 1000);
    try {
      // Refresh the health checkpoint as time advances into the effective window.
      await reconcilePolicyBinds(getDb(), 10n, 10n, client);
      expect(
        (await buyer.api.lifecycle(policyId, grant ? exposure.id : undefined)).claimsEligible,
      ).toBe(true);
      if (grant) expect((await buyer.api.lifecycle(policyId)).claimsEligible).toBe(false);
      const intake = await claimsIntake(
        new Request('http://localhost/api/claims/cases', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: buyer.getSession()!,
            ...(grant ? { 'x-arcuex-agent-id': exposure.id } : {}),
          },
          body: JSON.stringify({
            action: 'open',
            policyId,
            exposureId: exposure.id,
            claimantRef: 'untrusted',
            idempotencyKey: crypto.randomUUID(),
            observedEventRef: 'synthetic:procurement:test',
            observedAt: new Date(quoted.terms.effectiveAt * 1000).toISOString(),
          }),
        }),
      );
      expect(intake.status).toBe(200);
      expect(await intake.json()).toMatchObject({
        case: { policyId, exposureId: exposure.id, claimantRef: payerWallet, syntheticDemo: true },
      });
    } finally {
      active.mockRestore();
    }
  },
);
