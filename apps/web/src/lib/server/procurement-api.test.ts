import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/server/procurement-chain', () => ({
  procurementPool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  preflight: vi.fn(),
  transactions: vi.fn(() => []),
  verifyReceipt: vi.fn(),
  reconcile: vi.fn(),
  txHash: vi.fn(),
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
