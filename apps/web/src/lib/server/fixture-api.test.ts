import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { openDatabase, InsuranceRepository, type SqliteDb } from '@arcuex/persistence';
import { seedFixture } from './fixture-source';
import { resetRuntimeConfigCache, getRuntimeConfig } from './runtime-config';
import { readPolicies } from './policy-read-api';
import { reconcile, transactions, procurementClient } from './procurement-chain';
import { getArcRpcUrl, getQuickNodeRpcUrl } from './env-rpc';
import { reconcilePolicyBinds } from './policy-reconciliation';
import { issueClaimsNonce, verifyWalletAndCreateSession } from './claims-session';
import { handle } from './procurement-api';
import { requestBoundaryError } from './request-boundary';
import { GET as ready } from '@/app/api/health/ready/route';
import { POST as claimDecision } from '@/app/api/claims/cases/[id]/route';
import { prepareClaimsTransaction, verifyClaimsSettlement } from './claims-chain';
import type { ClaimsCase } from '@arcuex/insurance';
import type { PublicClient } from 'viem';

const globals = globalThis as typeof globalThis & {
  __arcuexDb?: SqliteDb;
  __arcuexRepo?: InsuranceRepository;
};
const id = 'candidate-12345678-1234-4234-8234-123456789abc';
let db: SqliteDb;
let seeded: ReturnType<typeof seedFixture>;
let cookie: string;
let network: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  db = openDatabase();
  const account = privateKeyToAccount(generatePrivateKey());
  seeded = seedFixture(db, {
    id,
    owner: account.address.toLowerCase(),
    at: Math.floor(Date.now() / 1000),
  });
  const env = {
    NODE_ENV: 'test',
    ARCUEX_CHAIN_SOURCE: 'fixture',
    ARCUEX_FIXTURE_ID: id,
    ARCUEX_FIXTURE_DIGEST: seeded.digest,
    ARCUEX_DATA_DIR: '/tmp/candidate-api',
    ARCUE_X_SQLITE_PATH: `/tmp/candidate-api/${id}.sqlite`,
    ARCUEX_STORAGE_ID: id,
    ARCUEX_SESSION_EPOCH: id,
    ARC_TESTNET_RPC_URL: '',
    QUICKNODE_RPC_URL: '',
    CLAIMS_REVIEWER_API_TOKEN: '02'.repeat(32),
    CLAIMS_AUTHORITY_API_TOKEN: '03'.repeat(32),
    ARCUEX_ACCEPTANCE_GATE_TOKEN: '04'.repeat(32),
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  resetRuntimeConfigCache();
  globals.__arcuexDb = db;
  globals.__arcuexRepo = new InsuranceRepository(db);
  const nonce = issueClaimsNonce(globals.__arcuexRepo, account.address);
  const session = await verifyWalletAndCreateSession(globals.__arcuexRepo, {
    wallet: account.address,
    nonce: nonce.nonce,
    signature: await account.signMessage({ message: nonce.message }),
  });
  cookie = `arcuex_claims_sid=${session.sessionId}`;
  network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Network forbidden in fixture mode'));
});
afterEach(() => {
  db.close();
  delete globals.__arcuexDb;
  delete globals.__arcuexRepo;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetRuntimeConfigCache();
});
const request = (path: string, data?: unknown) =>
  new Request(`http://localhost${path}`, {
    method: data ? 'POST' : 'GET',
    headers: { cookie, origin: 'http://localhost', 'content-type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
describe('fixture API source and financial boundaries', () => {
  it('projects fixture readiness with provenance and no live explorer confirmation; performs no network calls', async () => {
    const p = seeded.snapshot.policy;
    const response = await readPolicies(request('/api/policies'), p.terms.policyId);
    expect(await response.json()).toMatchObject({
      state: 'fixture_ready',
      claimsEligible: true,
      source: {
        mode: 'fixture',
        id,
        digest: seeded.digest,
        checkpoint: seeded.snapshot.checkpoint,
      },
      confirmation: null,
      notice: expect.stringContaining('not Arc confirmations'),
    });
    expect(await reconcile(p)).toMatchObject({ matches: true, source: { mode: 'fixture' } });
    const health = await ready(request('/api/health/ready'));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      source: { mode: 'fixture' },
      notice: expect.stringContaining('no live chain'),
    });
    expect(network).not.toHaveBeenCalled();
  });
  it('rejects every live reader, indexer and procurement financial path before network activity', async () => {
    expect(getArcRpcUrl).toThrow(/disabled/);
    expect(getQuickNodeRpcUrl).toThrow(/disabled/);
    expect(procurementClient).toThrow(/disabled/);
    expect(
      await (await handle(request('/api/procurement/products'), 'products')).json(),
    ).toMatchObject({
      paymentMode: 'fixture_offline',
    });
    expect(
      await (await handle(request('/api/procurement/capacity'), 'capacity')).json(),
    ).toMatchObject({
      status: 'offline',
      availableMicros: null,
    });
    expect(() => transactions(seeded.snapshot.policy)).toThrow(/disabled/);
    await expect(reconcilePolicyBinds(db, 0n, 1n)).rejects.toThrow(/disabled/);
    await expect(
      reconcilePolicyBinds(db, 0n, 1n, {} as ReturnType<typeof procurementClient>),
    ).rejects.toThrow(/disabled/);
    await expect(prepareClaimsTransaction({} as ClaimsCase, {} as PublicClient)).rejects.toThrow(
      /Fixture source/,
    );
    await expect(
      verifyClaimsSettlement({} as ClaimsCase, `0x${'ab'.repeat(32)}`, {} as PublicClient),
    ).rejects.toThrow(/Fixture source/);
    for (const path of ['accept', 'payment', 'procure', 'approvals', 'confirm']) {
      const response = await handle(request(`/api/procurement/${path}`, {}), path);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'FIXTURE_FINANCIAL_DISABLED' });
    }
    for (const action of ['prepare_settlement', 'mark_paid']) {
      const response = await claimDecision(
        new Request('http://localhost/api/claims/cases/fixture', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
            authorization: `Bearer ${'03'.repeat(32)}`,
          },
          body: JSON.stringify({ action }),
        }),
        { params: Promise.resolve({ id: 'fixture' }) },
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/fixture/i);
    }
    expect(network).not.toHaveBeenCalled();
  });
  it('fails readiness and intake on expiry and never falls back or renews source state', async () => {
    const snapshot = db.prepare('SELECT * FROM candidate_fixture_source').all();
    vi.spyOn(Date, 'now').mockReturnValue((seeded.snapshot.checkpoint.validUntil + 1) * 1000);
    expect((await ready(request('/api/health/ready'))).status).toBe(503);
    await expect(reconcile(seeded.snapshot.policy)).rejects.toThrow(/expired/);
    expect(db.prepare('SELECT * FROM candidate_fixture_source').all()).toEqual(snapshot);
    expect(network).not.toHaveBeenCalled();
  });
  it('rejects foreign acceptance credentials and foreign sessions without granting a role', async () => {
    const c = {
      ...getRuntimeConfig(),
      enforced: true,
      requireAcceptanceGate: true,
      origin: 'http://localhost',
      host: 'localhost',
      hostname: 'localhost',
    };
    expect(
      requestBoundaryError(
        new Request('http://localhost/api/policies', {
          headers: { 'x-arcuex-acceptance-gate': 'foreign-environment-gate' },
        }),
        c,
      )?.status,
    ).toBe(401);
    const response = await readPolicies(
      new Request('http://localhost/api/policies', {
        headers: { cookie: 'arcuex_claims_sid=foreign-environment-session' },
      }),
      seeded.snapshot.policy.terms.policyId,
    );
    expect(response.status).toBe(401);
    expect(network).not.toHaveBeenCalled();
  });
});
