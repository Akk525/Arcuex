/** Disposable synthetic boundary fixture. Real Next routes, auth, SQLite and browser; no financial writes. */
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  openSync,
  closeSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { decodeFunctionData, encodeFunctionResult } from 'viem';
import { openDatabase, ProcurementStore } from '@arcuex/persistence';
import { ProcurementService } from '@arcuex/agent-sdk';
import { insurancePoolAbi, toPolicyIdBytes32 } from '@arcuex/onchain';
import { CLAIM_FIXTURE } from '@arcuex/insurance';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const out = join(root, 'docs/verification/plan-b-sprint3', process.env.SPRINT3_PASS || 'final');
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'arcuex-sprint3-'));
chmodSync(dir, 0o700);
const dbPath = join(dir, 'acceptance.sqlite'),
  db = openDatabase(dbPath);
const owner = privateKeyToAccount(generatePrivateKey()); // ephemeral unfunded test identity; never stored
const pool = '0x6657974EEdF488380251bDD95A7FFfb0D456E49E';
const usdc = '0x3600000000000000000000000000000000000000';
const now = Math.floor(Date.now() / 1000),
  scope = `5042002:${pool.toLowerCase()}`;
const service = new ProcurementService(new ProcurementStore(db), pool, usdc, () => now - 1200);
const wallet = owner.address.toLowerCase();
const agent = service.register(wallet, {
  idempotencyKey: 'synthetic-browser-agent',
  label: 'Disposable synthetic browser fixture',
  signer: wallet,
  position: 'synthetic-browser-position',
  exposureMicros: '1000000',
  ownerAttestsControl: true,
});
const quote = service.quote(wallet, {
  idempotencyKey: 'synthetic-browser-quote',
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
const policy = service.prepare(wallet, {
  quoteId: quote.terms.quoteId,
  acceptedDigest: quote.digest,
}).policy;
const bindHash = `0x${'ab'.repeat(32)}`;
service.store.confirm(policy.terms.policyId, bindHash, now - 1100);
const evidence = {
  chainId: 5042002,
  pool,
  transactionHash: bindHash,
  blockNumber: '1',
  blockHash: `0x${'cd'.repeat(32)}`,
  logIndex: 0,
  timestamp: now - 1100,
  policyId: toPolicyIdBytes32(policy.terms.policyId),
  termsHash: policy.digest,
  beneficiary: wallet,
  premiumPayer: wallet,
  premium: policy.terms.premiumMicros,
  limit: policy.terms.limitMicros,
  coverageStart: String(policy.terms.effectiveAt),
  coverageEnd: String(policy.terms.expiresAt),
};
function checkpoint(healthy = true) {
  db.transaction(() =>
    db
      .prepare('UPDATE policy_reconciliation_scopes SET healthy=?,checked_at=? WHERE scope=?')
      .run(healthy ? 1 : 0, healthy ? Math.floor(Date.now() / 1000) : 0, scope),
  )();
}
db.transaction(() => {
  db.prepare(
    'INSERT INTO policy_reconciliation_scopes(scope,healthy,checked_at) VALUES (?,1,?)',
  ).run(scope, now);
  db.prepare('INSERT INTO policy_bind_events VALUES (?,?,?,?,?,1,?,?,?)').run(
    'synthetic-browser-bind',
    scope,
    evidence.policyId,
    policy.terms.policyId,
    'VERIFIED_LINKED',
    '1',
    evidence.blockHash,
    JSON.stringify(evidence),
  );
})();
const rpcMethods = new Set<string>();
const rpc = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const execute = (r: any) => {
    rpcMethods.add(r.method);
    try {
      let result: unknown;
      if (r.method === 'eth_chainId') result = '0x4cef52';
      else if (r.method === 'eth_blockNumber') result = '0x1';
      else if (r.method === 'eth_call') {
        const decoded = decodeFunctionData({ abi: insurancePoolAbi, data: r.params[0].data });
        if (decoded.functionName === 'claimsAuthority') {
          result = encodeFunctionResult({
            abi: insurancePoolAbi,
            functionName: 'claimsAuthority',
            result: '0x2222222222222222222222222222222222222222',
          });
        } else if (decoded.functionName === 'losses') {
          result = encodeFunctionResult({
            abi: insurancePoolAbi,
            functionName: 'losses',
            result: ['0x' + '00'.repeat(32), 0n, 0n, false],
          });
        } else {
          if (decoded.functionName !== 'policies' || decoded.args?.[0] !== evidence.policyId)
            throw new Error('Unsupported synthetic read');
          result = encodeFunctionResult({
            abi: insurancePoolAbi,
            functionName: 'policies',
            result: [
              policy.digest,
              wallet,
              wallet,
              BigInt(policy.terms.limitMicros),
              BigInt(policy.terms.premiumMicros),
              BigInt(policy.terms.effectiveAt),
              BigInt(policy.terms.expiresAt),
              BigInt(policy.terms.limitMicros),
              0n,
              true,
              false,
            ],
          });
        }
      } else if (r.method === 'eth_getBlockByNumber') {
        const zero = '0x' + '00'.repeat(32);
        result = {
          number: '0x1',
          hash: evidence.blockHash,
          parentHash: zero,
          timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16),
          gasLimit: '0x1c9c380',
          gasUsed: '0x0',
          miner: '0x' + '00'.repeat(20),
          difficulty: '0x0',
          totalDifficulty: '0x0',
          size: '0x0',
          extraData: '0x',
          transactions: [],
          uncles: [],
          nonce: '0x0000000000000000',
          sha3Uncles: zero,
          logsBloom: '0x' + '00'.repeat(256),
          transactionsRoot: zero,
          stateRoot: zero,
          receiptsRoot: zero,
        };
      } else throw new Error('Read-only fixture rejects this method');
      return { jsonrpc: '2.0', id: r.id, result };
    } catch {
      return {
        jsonrpc: '2.0',
        id: r.id,
        error: { code: -32601, message: 'Unsupported read-only synthetic fixture operation' },
      };
    }
  };
  try {
    const data = JSON.parse(raw);
    res.end(JSON.stringify(Array.isArray(data) ? data.map(execute) : execute(data)));
  } catch {
    res.statusCode = 400;
    res.end('{}');
  }
});
await new Promise<void>((r) => rpc.listen(3054, '127.0.0.1', r));
const base = 'http://localhost:3053',
  rpcUrl = 'http://127.0.0.1:3054';
const reviewerToken = randomBytes(32).toString('hex'),
  authorityToken = randomBytes(32).toString('hex');
writeFileSync(join(dir, '.arcuex-volume-id'), 'sprint3-disposable');
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]!]),
);
Object.assign(env, {
  NODE_ENV: 'production',
  ARCUEX_DEPLOYMENT_MODE: 'local-test',
  ARCUEX_PUBLIC_ORIGIN: base,
  ARCUEX_PUBLIC_HOST: 'localhost:3053',
  ARCUEX_TLS_SERVER_NAME: 'localhost',
  ARCUEX_CHAIN_ID: '5042002',
  ARCUE_X_POOL_ADDRESS: pool,
  ARC_TESTNET_RPC_URL: rpcUrl,
  QUICKNODE_RPC_URL: rpcUrl,
  ARCUEX_DATA_DIR: dir,
  ARCUE_X_SQLITE_PATH: dbPath,
  ARCUEX_STORAGE_ID: 'sprint3-disposable',
  ARCUEX_SESSION_EPOCH: 'sprint3-disposable',
});
// Keep all operator secrets in process memory/environment, never files or command arguments.
Object.assign(env, {
  CLAIMS_COOKIE_SECURE: '1',
  CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '0',
  CLAIMS_REVIEWER_API_TOKEN: reviewerToken,
  CLAIMS_AUTHORITY_API_TOKEN: authorityToken,
  ARCUEX_RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
});
const log = openSync(join(out, 'server.txt'), 'w');
const require = createRequire(import.meta.url);
const app = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', '3053'],
  { cwd: join(root, 'apps/web'), env, stdio: ['ignore', log, log], detached: true },
);
process.on('SIGINT', () => {
  if (app.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {}
  }
  process.exit(130);
});
let browser: any;
let completed = false;
const results: any[] = [];
try {
  for (let i = 0; i < 90; i++) {
    try {
      if (app.exitCode !== null) throw new Error('App exited');
      if ((await fetch(base + '/api/health/live')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (i === 89) throw new Error('Local app failed to start');
  }
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
    checkpoint,
    results,
  });
  if (process.env.SPRINT3_REGRESSIONS === '1') {
    for (const [name, script] of [
      [
        'mocked-regression',
        'docs/working-notes/nov20-combined-acceptance/run-combined-acceptance.mjs',
      ],
      ['mocked-adjudication', 'docs/working-notes/plan-b-sprint2/browser-adjudication.mjs'],
    ]) {
      const fd = openSync(join(out, name + '.txt'), 'w');
      const child = spawn(process.execPath, [join(root, script!)], {
        cwd: root,
        env: {
          ...process.env,
          BASE_URL: base,
          OUT_DIR: join(dir, name!),
          OUT_FILE: join(out, name + '.json'),
          PLAYWRIGHT_CHROME_PATH: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        },
        stdio: ['ignore', fd, fd],
      });
      const code = await new Promise<number | null>((r) => child.on('exit', r));
      closeSync(fd);
      if (code !== 0) throw new Error(name + ' failed');
    }
  }
  completed = true;
} finally {
  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify(
      {
        completed,
        boundary:
          'Real app routes/auth/SQLite with seeded synthetic policy and local read-only RPC fixture; no live chain proof',
        migrations: db.prepare('SELECT id FROM schema_migrations ORDER BY rowid').all(),
        state: {
          claims: db
            .prepare(
              'SELECT id,status,coverage_determination,settlement_authorization,payable_micros,review_reason_code FROM claims_cases ORDER BY created_at,id',
            )
            .all(),
          verifications: db.prepare('SELECT COUNT(*) AS count FROM claim_verifications').get(),
          foreignKeyCheck: db.pragma('foreign_key_check'),
          integrity: db.pragma('integrity_check'),
        },
        policyId: policy.terms.policyId,
        rpcMethods: [...rpcMethods],
        results,
      },
      null,
      2,
    ) + '\n',
  );
  if (browser) await browser.close();
  if (app.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {}
  }
  rpc.close();
  db.close();
  closeSync(log);
  rmSync(dir, { recursive: true, force: true });
}
