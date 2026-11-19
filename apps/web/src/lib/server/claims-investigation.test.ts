import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { openDatabase, InsuranceRepository, type SqliteDb } from '@arcuex/persistence';
import { seedFixture } from './fixture-source';
import { resetRuntimeConfigCache } from './runtime-config';
import { issueClaimsNonce, verifyWalletAndCreateSession } from './claims-session';
import { POST as intake } from '@/app/api/claims/cases/route';
import { GET, POST } from '@/app/api/claims/cases/[id]/investigation/route';
import { CLAIM_FIXTURE, verificationDigest } from '@arcuex/insurance';
const globalStore = globalThis as typeof globalThis & {
  __arcuexDb?: SqliteDb;
  __arcuexRepo?: InsuranceRepository;
};
let db: SqliteDb,
  cookie: string,
  foreignCookie: string,
  seed: ReturnType<typeof seedFixture>,
  caseId: string;
const path = () => `/api/claims/cases/${caseId}/investigation`;
function request(body?: unknown, headers: Record<string, string> = {}, signed = true) {
  return new Request('http://localhost' + path(), {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      ...(signed ? { cookie } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = () => ({ params: Promise.resolve({ id: caseId }) });
beforeEach(async () => {
  for (const [key, value] of Object.entries({
    NODE_ENV: 'test',
    ARCUEX_CHAIN_SOURCE: 'fixture',
    ARCUEX_FIXTURE_ID: 'candidate-12345678-1234-4234-8234-123456789abc',
    ARCUEX_STORAGE_ID: 'candidate-12345678-1234-4234-8234-123456789abc',
    ARCUEX_SESSION_EPOCH: 'candidate-12345678-1234-4234-8234-123456789abc',
    ARCUEX_DATA_DIR: '/tmp/candidate-investigation-api',
    ARCUE_X_SQLITE_PATH:
      '/tmp/candidate-investigation-api/candidate-12345678-1234-4234-8234-123456789abc.sqlite',
    ARC_TESTNET_RPC_URL: '',
    QUICKNODE_RPC_URL: '',
    CLAIMS_SYSTEM_API_TOKEN: 'worker-secret',
    CLAIMS_REVIEWER_API_TOKEN: 'human-secret',
    CLAIMS_AUTHORITY_API_TOKEN: 'authority-secret',
  }))
    vi.stubEnv(key, value);
  db = openDatabase();
  const account = privateKeyToAccount(generatePrivateKey());
  seed = seedFixture(db, {
    id: process.env.ARCUEX_FIXTURE_ID!,
    owner: account.address.toLowerCase(),
    at: Math.floor(Date.now() / 1000),
  });
  vi.stubEnv('ARCUEX_FIXTURE_DIGEST', seed.digest);
  resetRuntimeConfigCache();
  const repo = new InsuranceRepository(db);
  globalStore.__arcuexDb = db;
  globalStore.__arcuexRepo = repo;
  async function session(w = account) {
    const nonce = issueClaimsNonce(repo, w.address);
    const s = await verifyWalletAndCreateSession(repo, {
      wallet: w.address,
      nonce: nonce.nonce,
      signature: await w.signMessage({ message: nonce.message }),
    });
    return 'arcuex_claims_sid=' + s.sessionId;
  }
  cookie = await session();
  foreignCookie = await session(privateKeyToAccount(generatePrivateKey()));
  const p = seed.snapshot.policy;
  const opened = await intake(
    new Request('http://localhost/api/claims/cases', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        cookie,
        'content-type': 'application/json',
        'x-arcuex-agent-id': p.terms.agentId,
      },
      body: JSON.stringify({
        action: 'open',
        policyId: p.terms.policyId,
        exposureId: p.terms.agentId,
        claimantRef: 'forged-ignored',
        idempotencyKey: crypto.randomUUID(),
        observedAt: new Date(Date.now() - 60000).toISOString(),
        observedEventRef: 'synthetic:investigation',
      }),
    }),
  );
  expect(opened.status).toBe(200);
  caseId = (await opened.json()).case.id;
});
afterEach(() => {
  db.close();
  delete globalStore.__arcuexDb;
  delete globalStore.__arcuexRepo;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetRuntimeConfigCache();
});
it('authenticates agent evidence with server-derived actor, source and hash, sharing the same claim with humans', async () => {
  const p = seed.snapshot.policy;
  const proof = {
    action: 'submit_proof',
    requestKey: crypto.randomUUID(),
    requestId: null,
    filename: 'fixture.json',
    content: CLAIM_FIXTURE.raw,
    contentHash: verificationDigest(CLAIM_FIXTURE.raw),
    declaredSource: 'synthetic fixture',
  };
  const res = await POST(request(proof, { 'x-arcuex-agent-id': p.terms.agentId }), ctx());
  expect(res.status).toBe(200);
  const view = await (await GET(request(), ctx())).json();
  expect(view.entries).toHaveLength(1);
  expect(view.entries[0].payload.submitter.agentId).toBe(p.terms.agentId);
  expect(view.entries[0].payload.verificationStatus).toBe('unverified');
  expect(view.entries[0].actor).toContain('/agent:');
  const reviewerView = await GET(
    request(undefined, { authorization: 'Bearer human-secret' }, false),
    ctx(),
  );
  expect(reviewerView.status).toBe(200);
});
it('rejects unauthenticated, foreign, forged-agent, reviewer impersonation, worker impersonation and cross-origin submissions without writes', async () => {
  const message = { action: 'message', requestKey: crypto.randomUUID(), text: 'forged actor' };
  expect((await POST(request(message, {}, false), ctx())).status).toBe(401);
  expect((await POST(request(message, { cookie: foreignCookie }), ctx())).status).toBe(400);
  expect((await GET(request(undefined, { cookie: foreignCookie }), ctx())).status).toBe(404);
  expect(
    (await POST(request(message, { 'x-arcuex-agent-id': crypto.randomUUID() }), ctx())).status,
  ).toBe(403);
  for (const action of ['request_proof', 'escalate', 'examiner_start'])
    expect((await POST(request({ ...message, action }), ctx())).status).toBe(403);
  expect((await POST(request(message, { origin: 'https://attacker.invalid' }), ctx())).status).toBe(
    403,
  );
  expect(db.prepare('SELECT * FROM claim_investigation_entries').all()).toEqual([]);
});
it('routes real worker reservation and persisted advisory findings but grants no case or payment authority', async () => {
  const queued = await POST(
    request({ action: 'request_examiner', requestKey: crypto.randomUUID() }),
    ctx(),
  );
  const requestId = (await queued.json()).entry.id;
  const workerHeaders = { authorization: 'Bearer worker-secret' };
  const start = await POST(
    request({ action: 'examiner_start', requestId }, workerHeaders, false),
    ctx(),
  );
  expect(start.status).toBe(200);
  const snapshot = await start.json();
  expect(snapshot.dossier.case.id).toBe(caseId);
  expect(snapshot.dossier.verifications).toEqual([]);
  const finish = await POST(
    request(
      {
        action: 'examiner_finish',
        report: {
          requestId,
          dossierDigest: snapshot.digest,
          provider: 'openai',
          model: 'test-model',
          responseId: 'mock-response',
          execution: 'test_double',
          analysis: {
            summary: 'Missing actual persisted verification',
            verifiedFindings: [],
            claimantAssertions: [],
            gaps: ['Need verification'],
            proposedRequests: [{ question: 'Provide replay proof', citations: [caseId] }],
            recommendation: 'request_proof',
            citations: [caseId],
          },
          usage: { inputTokens: 10, outputTokens: 10 },
        },
      },
      workerHeaders,
      false,
    ),
    ctx(),
  );
  expect(finish.status).toBe(200);
  expect(globalStore.__arcuexRepo!.getClaimsCase(caseId)?.settlementAuthorization).toBe('none');
  expect(
    (await POST(request({ action: 'examiner_start', requestId }, workerHeaders, false), ctx()))
      .status,
  ).toBe(400);
});
