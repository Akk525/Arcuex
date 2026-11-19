import { sessionStoreId } from './claims-session';
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
  getDb().transaction(() => {
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO policy_reconciliation_scopes(scope,healthy,checked_at) VALUES ('fixture',1,?)",
      )
      .run(Math.floor(Date.now() / 1000));
    getDb()
      .prepare(
        "INSERT INTO policy_bind_events VALUES (?, 'fixture', ?, ?, 'VERIFIED_LINKED', 1, '1', 'fixture', '{}')",
      )
      .run(p.terms.policyId, p.terms.policyId, p.terms.policyId);
  })();
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
      .run('2000-01-01T00:00:00.000Z', sessionStoreId(sessionId));
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

import { GET as legacyPolicies } from '@/app/api/policies/route';
import { GET as legacyCoverage } from '@/app/api/coverage/route';
import { requestCoverageQuote, acceptAndBindPolicy } from '@arcuex/insurance';
it('contains legacy policy/quote reads under the same wallet ownership boundary', async () => {
  expect((await legacyPolicies(request('/api/policies'))).status).toBe(401);
  expect((await legacyCoverage(request('/api/coverage'))).status).toBe(401);
  const owner = await login(),
    other = await login(),
    repo = getRepo();
  const q = requestCoverageQuote(repo, {
    idempotencyKey: crypto.randomUUID(),
    policyholder: { displayName: 'legacy test', walletAddress: owner.account.address },
    agent: { externalRef: crypto.randomUUID(), label: 'test' },
  });
  const bound = acceptAndBindPolicy(repo, {
    quoteId: q.id,
    idempotencyKey: crypto.randomUUID(),
    fundingVerified: true,
  });
  const owned = await (await legacyPolicies(request('/api/policies', owner.cookie))).json();
  expect(owned.policies.some((p: { id: string }) => p.id === bound.policy.id)).toBe(true);
  const rejectLegacy = await mutateCases(
    request('/api/claims/cases', owner.cookie, {
      action: 'open',
      policyId: bound.policy.id,
      exposureId: bound.exposure.id,
      claimantRef: 'ignored',
      idempotencyKey: crypto.randomUUID(),
      observedEventRef: 'synthetic:legacy',
      observedAt: new Date().toISOString(),
    }),
  );
  expect(rejectLegacy.status).toBe(409);
  const foreign = await (await legacyCoverage(request('/api/coverage', other.cookie))).json();
  expect(foreign.policies.some((p: { id: string }) => p.id === bound.policy.id)).toBe(false);
  expect(foreign.quotes.some((p: { id: string }) => p.id === q.id)).toBe(false);
});

it('authenticates before parsing claim mutations and models malformed/oversized input', async () => {
  const bare = new Request('http://localhost/api/claims/cases', { method: 'POST', body: '[' });
  expect((await mutateCases(bare)).status).toBe(401);
  const owner = await login();
  const malformed = new Request('http://localhost/api/claims/cases', {
    method: 'POST',
    headers: { cookie: owner.cookie },
    body: '[',
  });
  expect((await mutateCases(malformed)).status).toBe(400);
  const oversized = new Request('http://localhost/api/claims/cases', {
    method: 'POST',
    headers: { cookie: owner.cookie },
    body: 'x'.repeat(32001),
  });
  expect((await mutateCases(oversized)).status).toBe(413);
});

it('executes catalog verification through the authenticated API and exposes read-only findings only to the owner', async () => {
  const { CLAIM_FIXTURE, intakeClaimsCase } = await import('@arcuex/insurance');
  const { POST, GET } = await import('@/app/api/claims/cases/[id]/verification/route');
  const f = await fixture();
  const c = intakeClaimsCase(
    getRepo(),
    {
      policyId: f.p.terms.policyId,
      exposureId: f.agent.id,
      claimantRef: f.owner.account.address,
      idempotencyKey: crypto.randomUUID(),
      syntheticDemo: true,
      actor: 'ignored',
      observedEventRef: 'synthetic:api:fixture',
      observedAt: new Date((f.now - 60) * 1000).toISOString(),
    },
    { role: 'claimant', subject: f.owner.account.address, walletAddress: f.owner.account.address },
  );
  const ctx = { params: Promise.resolve({ id: c.id }) };
  const path = `/api/claims/cases/${c.id}/verification`;
  const envelope = {
    fixtureRef: CLAIM_FIXTURE.reference,
    fixtureDigest: CLAIM_FIXTURE.digest,
    policyId: c.policyId,
    incidentId: c.incidentId,
    observedAt: getRepo().getIncident(c.incidentId!)!.observedAt,
  };
  expect((await GET(request(path), ctx)).status).toBe(401);
  expect((await POST(request(path, f.other.cookie, envelope), ctx)).status).toBe(404);
  const response = await POST(request(path, f.owner.cookie, envelope), ctx);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.verification.evidenceSufficiency).toBe('sufficient');
  expect(result.verification.independentlyAuthenticated).toBe(false);
  const read = await (await GET(request(path, f.owner.cookie), ctx)).json();
  expect(read.verifications).toEqual([result.verification]);
  expect((await GET(request(path, f.other.cookie), ctx)).status).toBe(404);
  const caseDetail = await (
    await detail(request(`/api/claims/cases/${c.id}`, f.owner.cookie), ctx)
  ).json();
  expect(caseDetail.verifications).toEqual(read.verifications);
  expect(getRepo().getClaimsCase(c.id)?.status).toBe(c.status);
  expect(getRepo().getClaimsCase(c.id)?.settlementAuthorization).toBe('none');
});

it('requires persisted verification and explicit reviewer findings at the authenticated API boundary', async () => {
  vi.stubEnv('CLAIMS_REVIEWER_API_TOKEN', 'offline-sprint2-reviewer');
  vi.stubEnv('CLAIMS_AUTHORITY_API_TOKEN', 'offline-sprint2-authority');
  try {
    const { CLAIM_FIXTURE, intakeClaimsCase, attachEvidenceManifest, completeEvidenceOrReview } =
      await import('@arcuex/insurance');
    const { POST: verify } = await import('@/app/api/claims/cases/[id]/verification/route');
    const f = await fixture(),
      repo = getRepo();
    const principal = {
      role: 'claimant' as const,
      subject: f.owner.account.address,
      walletAddress: f.owner.account.address,
    };
    const c = intakeClaimsCase(
      repo,
      {
        policyId: f.p.terms.policyId,
        exposureId: f.agent.id,
        claimantRef: principal.subject,
        idempotencyKey: crypto.randomUUID(),
        syntheticDemo: true,
        actor: 'ignored',
        observedEventRef: 'synthetic:sprint2:api',
        observedAt: new Date((f.now - 60) * 1000).toISOString(),
      },
      principal,
    );
    attachEvidenceManifest(
      repo,
      {
        caseId: c.id,
        source: 'fixture',
        provenance: CLAIM_FIXTURE.reference,
        rawEvidence: CLAIM_FIXTURE.raw,
        verificationMethod: 'fixture_consistency',
        sourceReliability: 'demo_only',
        syntheticFixture: true,
      },
      principal,
    );
    completeEvidenceOrReview(repo, { caseId: c.id, evidenceComplete: true }, principal);
    const path = `/api/claims/cases/${c.id}`,
      ctx = { params: Promise.resolve({ id: c.id }) };
    const mutate = (body: unknown, token = 'offline-sprint2-reviewer') =>
      mutateCase(
        new Request('http://localhost' + path, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        ctx,
      );
    const input = {
      action: 'adjudicate',
      coverageDetermination: 'covered',
      verifiedLossUsdc: '1.5',
      recoveriesUsdc: '0',
      requestedUsdc: '1',
      contractualReview: {
        eventApplies: true,
        exclusionsResolved: true,
        rationale: 'Human reviewed synthetic terms and exclusions',
      },
    };
    expect((await (await mutate(input)).json()).case.reviewReasonCode).toBe(
      'PERSISTED_VERIFICATION_REQUIRED',
    );
    const response = await verify(
      request(path + '/verification', f.owner.cookie, {
        fixtureRef: CLAIM_FIXTURE.reference,
        fixtureDigest: CLAIM_FIXTURE.digest,
        policyId: c.policyId,
        incidentId: c.incidentId,
        observedAt: repo.getIncident(c.incidentId!)!.observedAt,
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    const verification = (await response.json()).verification;
    const arbitrary = await (
      await mutate({ ...input, verificationId: verification.id, verifiedLossUsdc: '99' })
    ).json();
    expect(arbitrary.case.reviewReasonCode).toBe('LOSS_ASSESSMENT_MISMATCH');
    const approved = await (await mutate({ ...input, verificationId: verification.id })).json();
    expect(approved.case.status).toBe('APPROVED');
    expect(JSON.parse(approved.case.adjudicationBindingJson).reviewer.actor).toBe(
      'reviewer:reviewer',
    );
    const rejected = await mutate(
      {
        action: 'prepare_settlement',
        confirmedRecipient: f.p.terms.beneficiary,
        confirmedAmountUsdc: approved.case.payable.usdc,
        confirmedLossKey: approved.case.lossKey,
        confirmedEvidenceRoot: approved.case.evidenceRoot,
      },
      'offline-sprint2-authority',
    );
    expect(rejected.status).not.toBe(200);
    expect(repo.getClaimsCase(c.id)?.settlementAuthorization).toBe('pending_authority');
  } finally {
    vi.unstubAllEnvs();
  }
});
