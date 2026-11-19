/** Legacy UI mocks in a separate live-mode process/database with explicitly unavailable RPC.
 * These checks do not attest to fixture, hosted or blockchain behavior. */
import { mkdtempSync, mkdirSync, writeFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const out = join(root, 'docs/verification/plan-b-sprint41');
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'arcuex-sprint41-mocks-'));
const id = `mock-ui-${randomUUID()}`;
writeFileSync(join(dir, '.arcuex-volume-id'), id);
const base = 'http://localhost:3056';
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
);
Object.assign(env, {
  NODE_ENV: 'production',
  ARCUEX_DEPLOYMENT_MODE: 'local-test',
  ARCUEX_CHAIN_SOURCE: 'arc-testnet',
  ARCUEX_PUBLIC_ORIGIN: base,
  ARCUEX_PUBLIC_HOST: 'localhost:3056',
  ARCUEX_TLS_SERVER_NAME: 'localhost',
  ARCUEX_CHAIN_ID: '5042002',
  ARCUE_X_POOL_ADDRESS: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  ARC_TESTNET_RPC_URL: 'http://127.0.0.1:9',
  QUICKNODE_RPC_URL: 'http://127.0.0.1:9',
  ARCUEX_DATA_DIR: dir,
  ARCUE_X_SQLITE_PATH: join(dir, 'mock-ui.sqlite'),
  ARCUEX_STORAGE_ID: id,
  ARCUEX_SESSION_EPOCH: id,
  ARCUEX_RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
  CLAIMS_REVIEWER_API_TOKEN: randomBytes(32).toString('hex'),
  CLAIMS_AUTHORITY_API_TOKEN: randomBytes(32).toString('hex'),
  ARCUEX_ACCEPTANCE_GATE_TOKEN: randomBytes(32).toString('hex'),
  CLAIMS_COOKIE_SECURE: '1',
  CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '0',
});
const require = createRequire(join(root, 'apps/web/package.json'));
const log = openSync(join(out, 'mocked-server.txt'), 'w');
const app = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'start', '-H', 'localhost', '-p', '3056'],
  { cwd: join(root, 'apps/web'), env, detached: true, stdio: ['ignore', log, log] },
);
try {
  for (let i = 0; i < 90; i++) {
    if (app.exitCode !== null) throw new Error('Mock UI app exited');
    try {
      if ((await fetch(base + '/api/health/live')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (i === 89) throw new Error('Mock UI server unavailable');
  }
  for (const [name, script] of [
    [
      'mocked-regression',
      'docs/working-notes/nov20-combined-acceptance/run-combined-acceptance.mjs',
    ],
    ['mocked-adjudication', 'docs/working-notes/plan-b-sprint2/browser-adjudication.mjs'],
  ]) {
    const fd = openSync(join(out, name + '.txt'), 'w');
    const child = spawn(process.execPath, [join(root, script)], {
      cwd: root,
      env: {
        ...env,
        BASE_URL: base,
        OUT_DIR: join(dir, name),
        OUT_FILE: join(out, name + '.json'),
        PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE,
        PLAYWRIGHT_CHROME_PATH: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      },
      stdio: ['ignore', fd, fd],
    });
    const code = await new Promise((r) => child.on('exit', r));
    closeSync(fd);
    if (code !== 0) throw new Error(name + ' failed');
    console.log(name + ' passed');
  }
} finally {
  if (app.exitCode === null && app.signalCode === null) {
    const stopped = new Promise((r) => app.once('exit', r));
    process.kill(-app.pid, 'SIGTERM');
    await stopped;
  }
  closeSync(log);
  rmSync(dir, { recursive: true, force: true });
}
