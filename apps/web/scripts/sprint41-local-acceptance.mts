/** Real app/auth/SQLite/browser with an embedded pinned fixture source; no RPC server or live reads. */
import { mkdtempSync, mkdirSync, writeFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { openDatabase, ProcurementStore } from '@arcuex/persistence';
import { CLAIM_FIXTURE } from '@arcuex/insurance';
import { seedFixture, readFixture } from '../src/lib/server/fixture-source';
import { validateRuntimeEnvironment } from '../src/lib/server/runtime-config';

const root = resolve(import.meta.dirname, '../../..');
const out = join(root, 'docs/verification/plan-b-sprint41/local-browser');
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'arcuex-sprint41-'));
const id = `candidate-${randomUUID()}`;
const dbPath = join(dir, `${id}.sqlite`);
const db = openDatabase(dbPath);
const owner = privateKeyToAccount(generatePrivateKey()); // unfunded nonce authentication only; memory only
const seeded = seedFixture(db, {
  id,
  owner: owner.address.toLowerCase(),
  at: Math.floor(Date.now() / 1000),
});
const policy = seeded.snapshot.policy;
const agent = new ProcurementStore(db).get<any>('agent', policy.terms.agentId)!;
writeFileSync(join(dir, '.arcuex-volume-id'), id, { mode: 0o600 });
const reviewerToken = randomBytes(32).toString('hex'),
  authorityToken = randomBytes(32).toString('hex');
const base = 'http://localhost:3053';
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]!]),
);
Object.assign(env, {
  NODE_ENV: 'production',
  ARCUEX_DEPLOYMENT_MODE: 'local-test',
  ARCUEX_CHAIN_SOURCE: 'fixture',
  ARCUEX_FIXTURE_ID: id,
  ARCUEX_FIXTURE_DIGEST: seeded.digest,
  ARCUEX_PUBLIC_ORIGIN: base,
  ARCUEX_PUBLIC_HOST: 'localhost:3053',
  ARCUEX_TLS_SERVER_NAME: 'localhost',
  ARCUEX_CHAIN_ID: '5042002',
  ARCUE_X_POOL_ADDRESS: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  ARCUEX_DATA_DIR: dir,
  ARCUE_X_SQLITE_PATH: dbPath,
  ARCUEX_STORAGE_ID: id,
  ARCUEX_SESSION_EPOCH: id,
  ARCUEX_RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
  CLAIMS_REVIEWER_API_TOKEN: reviewerToken,
  CLAIMS_AUTHORITY_API_TOKEN: authorityToken,
  ARCUEX_ACCEPTANCE_GATE_TOKEN: randomBytes(32).toString('hex'),
  CLAIMS_COOKIE_SECURE: '1',
  CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '0',
});
const config = validateRuntimeEnvironment(env);
const require = createRequire(join(root, 'apps/web/package.json'));
const log = openSync(join(out, 'server.txt'), 'w');
let app: ChildProcess | undefined;
async function stop() {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  const current = app;
  const closed = new Promise<void>((r) => current.once('exit', () => r()));
  process.kill(-current.pid!, 'SIGTERM');
  await closed;
}
async function start() {
  app = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', '3053'],
    { cwd: join(root, 'apps/web'), env, stdio: ['ignore', log, log], detached: true },
  );
  for (let i = 0; i < 90; i++) {
    if (app.exitCode !== null) throw new Error('Candidate process exited');
    try {
      if ((await fetch(base + '/api/health/live')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Local candidate failed to start');
}
let browser: any;
const results: any[] = [];
let completed = false,
  restarts = 0;
try {
  await start();
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const harness = await import('../../../docs/working-notes/plan-b-sprint3/browser-acceptance.mjs');
  await harness.run({
    browser,
    base,
    out,
    owner,
    reviewerToken,
    authorityToken,
    policy,
    agent,
    catalog: CLAIM_FIXTURE,
    db,
    results,
    fixtureSource: true,
    checkpoint: (healthy = true) =>
      db.transaction(() =>
        db
          .prepare('UPDATE policy_reconciliation_scopes SET healthy=? WHERE scope=?')
          .run(healthy ? 1 : 0, `fixture:${id}`),
      )(),
    restart: async () => {
      await stop();
      await start();
      restarts++;
    },
  });
  const before = readFixture(db, config).source;
  await stop();
  await start();
  restarts++;
  if (JSON.stringify(readFixture(db, config).source) !== JSON.stringify(before))
    throw new Error('Checkpoint changed after claims/restart');
  const approved = db.prepare("SELECT id FROM claims_cases WHERE status='APPROVED'").get() as {
    id: string;
  };
  const persisted = await fetch(base + '/api/claims/cases/' + approved.id, {
    headers: { authorization: `Bearer ${reviewerToken}` },
  });
  const record = await persisted.json();
  if (
    !persisted.ok ||
    record.case.status !== 'APPROVED' ||
    !record.verifications.length ||
    !record.timeline.some((e: { toStatus: string }) => e.toStatus === 'APPROVED')
  )
    throw new Error('Claims lost across process restart');
  results.push({
    status: 'PASS',
    detail:
      'Second process restart preserves claim/verification persistence and the original checkpoint',
  });
  db.transaction(() =>
    db.prepare("UPDATE launch_runtime_state SET value='1' WHERE key='recovery_hold'").run(),
  )();
  const held = await fetch(base + '/api/claims/cases', {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: '{}',
  });
  if (held.status !== 503 || !(await held.json()).error.includes('Recovery review'))
    throw new Error('Recovery hold failed to block writes');
  await stop();
  await start();
  restarts++;
  const readiness = await fetch(base + '/api/health/ready');
  if (readiness.status !== 503 || !(await readiness.json()).checks.recoveryHold)
    throw new Error('Restart cleared recovery hold');
  results.push({
    status: 'PASS',
    detail: 'Recovery hold blocks mutations and survives a third process restart',
  });
  completed = true;
} finally {
  if (browser) await browser.close();
  await stop();
  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify(
      {
        completed,
        boundary:
          'Pinned embedded synthetic fixture; no fixture RPC and no live blockchain confirmation',
        source: { id, digest: seeded.digest, checkpoint: seeded.snapshot.checkpoint },
        restarts,
        migrations: db.prepare('SELECT id FROM schema_migrations ORDER BY rowid').all(),
        state: {
          claims: db
            .prepare('SELECT id,status,settlement_authorization,payable_micros FROM claims_cases')
            .all(),
          verifications: db.prepare('SELECT COUNT(*) AS count FROM claim_verifications').get(),
          integrity: db.pragma('integrity_check'),
          foreignKeyCheck: db.pragma('foreign_key_check'),
        },
        runtimeCredentialNames: Object.keys(env).filter((k) => /TOKEN|KEY|SECRET/.test(k)),
        results,
      },
      null,
      2,
    ) + '\n',
  );
  db.close();
  closeSync(log);
  rmSync(dir, { recursive: true, force: true });
}
