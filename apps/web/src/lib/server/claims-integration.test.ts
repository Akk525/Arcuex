import { describe, it, expect, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ProcurementService } from '@arcuex/agent-sdk';
import { ProcurementStore } from '@arcuex/persistence';
import { getDb, getRepo } from './db';
import { handle } from './procurement-api';
import { GET as listCases, POST as mutateCases } from '@/app/api/claims/cases/route';
import { GET as detail, POST as mutateCase } from '@/app/api/claims/cases/[id]/route';
import { GET as policyOptions } from '@/app/api/claims/policies/route';
import { POST as logout } from '@/app/api/claims/auth/logout/route';
vi.mock('@/lib/server/procurement-chain', () => ({
  procurementPool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  reconcile: vi.fn(async () => ({ matches: true, bound: true, cancelled: false })),
  preflight: vi.fn(),
  transactions: vi.fn(() => []),
  txHash: (v: string) => v,
}));
const pool = '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  usdc = '0x3600000000000000000000000000000000000000';
async function login() {
  const account = privateKeyToAccount(generatePrivateKey());
  const c = await (
    await handle(
      new Request('http://localhost/api/procurement/auth/challenge', {
        method: 'POST',
        body: JSON.stringify({ address: account.address }),
      }),
      'auth/challenge',
    )
  ).json();
  const verified = await handle(
    new Request('http://localhost/api/procurement/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        id: c.id,
        signature: await account.signMessage({ message: c.message }),
      }),
    }),
    'auth/verify',
  );
  const cookie = verified.headers.get('set-cookie')!.split(';')[0]!;
  expect(await verified.json()).not.toHaveProperty('token');
  return { account, cookie };
}
function request(path: string, cookie?: string, body?: unknown) {
  return new Request('http://localhost' + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function fixture() {
  const owner = await login(),
    other = await login();
  const now = Math.floor(Date.now() / 1000);
  const service = new ProcurementService(
    new ProcurementStore(getDb()),
    pool,
    usdc,
    () => now - 1200,
  );
  const wallet = owner.account.address.toLowerCase();
  const agent = service.register(wallet, {
    idempotencyKey: crypto.randomUUID(),
    label: 'integration-test',
    signer: wallet,
    position: 'test-position',
    exposureMicros: '1000000',
    ownerAttestsControl: true,
  });
  const q = service.quote(wallet, {
    idempotencyKey: crypto.randomUUID(),
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
  const p = service.prepare(wallet, { quoteId: q.terms.quoteId, acceptedDigest: q.digest }).policy;
  service.store.confirm(
    p.terms.policyId,
    `0x${p.terms.policyId.replace(/-/g, '').repeat(2)}`,
    now - 1100,
  );
  return { owner, other, p, agent, now };
}
describe('one authenticated procurement and claims customer journey', () => {
  it('reuses the procurement httpOnly session for owned policy options and claims intake/read; isolates other owners', async () => {
    const f = await fixture();
    const opts = await (
      await policyOptions(request('/api/claims/policies', f.owner.cookie))
    ).json();
    expect(opts.policies.some((p: { id: string }) => p.id === f.p.terms.policyId)).toBe(true);
    const foreignOptions = await (
      await policyOptions(request('/api/claims/policies', f.other.cookie))
    ).json();
    expect(foreignOptions.policies.some((p: { id: string }) => p.id === f.p.terms.policyId)).toBe(
      false,
    );
    const input = {
      action: 'open',
      policyId: f.p.terms.policyId,
      exposureId: f.agent.id,
      idempotencyKey: crypto.randomUUID(),
      claimantRef: 'ignored-spoof',
      observedEventRef: `synthetic:${crypto.randomUUID()}`,
      observedAt: new Date((f.now - 10) * 1000).toISOString(),
      syntheticDemo: false,
    };
    expect((await mutateCases(request('/api/claims/cases', f.other.cookie, input))).status).toBe(
      404,
    );
    const opened = await mutateCases(request('/api/claims/cases', f.owner.cookie, input));
    expect(opened.status).toBe(200);
    const c = (await opened.json()).case;
    expect(c.syntheticDemo).toBe(true);
    expect(c.claimantRef).toBe(f.owner.account.address.toLowerCase());
    const ctx = { params: Promise.resolve({ id: c.id }) };
    expect((await detail(request('/api/claims/cases/' + c.id, f.owner.cookie), ctx)).status).toBe(
      200,
    );
    expect((await detail(request('/api/claims/cases/' + c.id, f.other.cookie), ctx)).status).toBe(
      404,
    );
    const list = await (await listCases(request('/api/claims/cases', f.other.cookie))).json();
    expect(list.cases.some((row: { id: string }) => row.id === c.id)).toBe(false);
    expect(
      (
        await mutateCases(
          request('/api/claims/cases', f.other.cookie, {
            action: 'complete_evidence',
            caseId: c.id,
            evidenceComplete: false,
          }),
        )
      ).status,
    ).not.toBe(200);
    expect(
      (
        await mutateCase(
          request('/api/claims/cases/' + c.id, f.owner.cookie, {
            action: 'adjudicate',
            coverageDetermination: 'covered',
            requestedUsdc: '1',
          }),
          ctx,
        )
      ).status,
    ).toBe(403);
    await logout(request('/api/claims/auth/logout', f.owner.cookie, {}));
    expect((await listCases(request('/api/claims/cases', f.owner.cookie))).status).toBe(401);
  });
  it('rejects expired, forged and cross-origin sessions and owner headers', async () => {
    const f = await fixture();
    const wrong = new Request('http://localhost/api/claims/policies', {
      headers: { cookie: f.owner.cookie, 'x-arcuex-wallet': f.other.account.address },
    });
    expect((await policyOptions(wrong)).status).toBe(401);
    const forged = request('/api/claims/policies', 'arcuex_claims_sid=forged');
    expect((await policyOptions(forged)).status).toBe(401);
    const cross = new Request('http://localhost/api/claims/cases', {
      method: 'POST',
      headers: { cookie: f.owner.cookie, origin: 'https://attacker.example' },
      body: JSON.stringify({ action: 'complete_evidence', caseId: crypto.randomUUID() }),
    });
    expect((await mutateCases(cross)).status).toBe(403);
    const sessionId = f.owner.cookie.split('=')[1]!;
    getDb()
      .prepare('UPDATE claims_sessions SET expires_at=? WHERE id=?')
      .run('2000-01-01T00:00:00.000Z', sessionId);
    expect((await policyOptions(request('/api/claims/policies', f.owner.cookie))).status).toBe(401);
  });
  it('does not accept a static claimant token plus caller-selected owner headers', async () => {
    process.env.CLAIMS_CLAIMANT_API_TOKEN = 'test-only-retired-token';
    const r = await policyOptions(
      new Request('http://localhost/api/claims/policies', {
        headers: {
          authorization: 'Bearer test-only-retired-token',
          'x-arcuex-wallet': '0x1111111111111111111111111111111111111111',
        },
      }),
    );
    expect(r.status).toBe(401);
    delete process.env.CLAIMS_CLAIMANT_API_TOKEN;
    expect(getRepo()).toBeTruthy();
  });
});
