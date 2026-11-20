/**
 * Release-sprint demo capture (working note). Real production build, fixture chain source,
 * temporary SQLite and a real signed policyholder session. No transactions, no AI calls.
 *
 *   ARCUEX_BROWSER_EVIDENCE_DIR=<new dir> PLAYWRIGHT_MODULE=<playwright index.mjs> \
 *     pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/release-sprint-capture.mts
 */
import { mkdirSync, mkdtempSync, writeFileSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { openDatabase } from '@arcuex/persistence';
import { seedFixture } from '../src/lib/server/fixture-source';

const root = resolve(import.meta.dirname, '../../..');
const out = resolve(process.env.ARCUEX_BROWSER_EVIDENCE_DIR ?? 'release-sprint-capture');
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'arcuex-sprint-')),
  id = `candidate-${randomUUID()}`,
  dbPath = join(dir, id + '.sqlite');
const db = openDatabase(dbPath),
  owner = privateKeyToAccount(generatePrivateKey()),
  agent = privateKeyToAccount(generatePrivateKey()); // nonce signing only, unfunded, RAM only
const seed = seedFixture(db, {
  id,
  owner: owner.address.toLowerCase(),
  agentSigner: agent.address.toLowerCase(),
  at: Math.floor(Date.now() / 1000),
});
db.close();
writeFileSync(join(dir, '.arcuex-volume-id'), id, { mode: 0o600 });
const policyId = seed.snapshot.policy.terms.policyId;
const port = 3064,
  base = `http://localhost:${port}`,
  secret = () => randomBytes(32).toString('hex');
const env: Record<string, string> = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]!]),
);
Object.assign(env, {
  NODE_ENV: 'production',
  ARCUEX_DEPLOYMENT_MODE: 'local-test',
  ARCUEX_CHAIN_SOURCE: 'fixture',
  ARCUEX_FIXTURE_ID: id,
  ARCUEX_FIXTURE_DIGEST: seed.digest,
  ARCUEX_PUBLIC_ORIGIN: base,
  ARCUEX_PUBLIC_HOST: `localhost:${port}`,
  ARCUEX_TLS_SERVER_NAME: 'localhost',
  ARCUEX_CHAIN_ID: '5042002',
  ARCUE_X_POOL_ADDRESS: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  ARCUEX_DATA_DIR: dir,
  ARCUE_X_SQLITE_PATH: dbPath,
  ARCUEX_STORAGE_ID: id,
  ARCUEX_SESSION_EPOCH: id,
  ARCUEX_RATE_LIMIT_SECRET: secret(),
  CLAIMS_REVIEWER_API_TOKEN: secret(),
  CLAIMS_AUTHORITY_API_TOKEN: secret(),
  CLAIMS_SYSTEM_API_TOKEN: secret(),
  ARCUEX_ACCEPTANCE_GATE_TOKEN: secret(),
  CLAIMS_COOKIE_SECURE: '1',
  CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '0',
  ARCUEX_RECONCILIATION_ENABLED: '0',
});
const require = createRequire(join(root, 'apps/web/package.json'));
let app: ChildProcess | undefined;
let browser: any;
const results: Array<{ shot: string; overflow: number; found: boolean }> = [];
const consoleErrors: string[] = [];

try {
  app = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', String(port)],
    {
      cwd: join(root, 'apps/web'),
      env,
      stdio: ['ignore', openSync(join(out, 'server.txt'), 'w'), openSync(join(out, 'server.txt'), 'a')],
      detached: true,
    },
  );
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      up = (await fetch(base + '/api/health/live')).ok;
    } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 300));
  }
  if (!up) throw new Error('App did not start');

  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  for (const context of [desktop, mobile]) {
    const challenge = await (
      await context.request.post(base + '/api/claims/auth/nonce', {
        headers: { origin: base },
        data: { wallet: owner.address },
      })
    ).json();
    const verified = await context.request.post(base + '/api/claims/auth/verify', {
      headers: { origin: base },
      data: {
        wallet: owner.address,
        nonce: challenge.nonce,
        signature: await owner.signMessage({ message: challenge.message }),
      },
    });
    if (!verified.ok()) throw new Error('Policyholder session failed');
  }

  async function shot(context: any, path: string, name: string, waitFor?: string) {
    const page = await context.newPage();
    page.on('console', (m: any) => m.type() === 'error' && consoleErrors.push(`${name}: ${m.text()}`));
    await page.goto(base + path);
    let found = true;
    if (waitFor)
      found = await page
        .getByText(waitFor, { exact: false })
        .first()
        .waitFor({ timeout: 10000 })
        .then(() => true, () => false);
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    await page.screenshot({ path: join(out, name + '.png'), fullPage: true });
    results.push({ shot: name, overflow, found });
    await page.close();
  }

  await shot(desktop, '/dashboard', 's01-mission-control-desktop', 'Mission Control');
  await shot(desktop, '/coverage', 's02-coverage-product-agent-desktop', 'Product & agent');
  await shot(desktop, '/policies', 's03-policies-desktop', 'Policies');
  await shot(desktop, `/policies/${policyId}`, 's04-policy-record-desktop', 'Beneficiary');
  await shot(mobile, `/policies/${policyId}`, 's04-policy-record-mobile', 'Beneficiary');
  await shot(desktop, '/claims', 's05-claims-desktop', 'Claims');
  await shot(desktop, '/replay/oracle-liquidation', 's06-historical-replay-desktop', 'Candidate payout');
  await shot(mobile, '/replay/oracle-liquidation', 's06-historical-replay-mobile', 'Candidate payout');

  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify({ policyId, source: 'synthetic fixture', results, consoleErrors }, null, 2),
  );
  console.log(JSON.stringify({ results, consoleErrors }, null, 2));
} finally {
  await browser?.close();
  if (app?.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {}
  }
  rmSync(dir, { recursive: true, force: true });
}
