/** Run against the local production build. Chromium doubles the wallet, RPC and checkout API. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = 'http://localhost:3063';
const owner = '0x' + '12'.repeat(20);
const hash = '0x' + '34'.repeat(32);
const blockHash = '0x' + '56'.repeat(32);
const digest = '0x' + '78'.repeat(32);
const pool = '0x6657974EEdF488380251bDD95A7FFfb0D456E49E';
const policyId = 'c0ffee00-0000-4000-8000-000000000004';
const key = `arcuex-purchase-bind:${policyId}`;
const productCode = 'ARC_ORACLE_LIQUIDATION_DEMO_V1';
const now = Math.floor(Date.now() / 1000);
const terms = {
  policyId,
  productCode,
  premiumMicros: '10000',
  deductibleMicros: '100000',
  limitMicros: '1000000',
  beneficiary: owner,
  quoteExpiresAt: now + 600,
  effectiveAt: now + 900,
  expiresAt: now + 86400,
};
const policy = { terms, digest, payer: owner, state: 'prepared', bindTx: null };
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG']
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
const temp = await mkdtemp(join(tmpdir(), 'arcuex-checkout-recovery-'));
const storageId = 'checkout-' + randomBytes(12).toString('hex');
const secret = () => randomBytes(32).toString('hex');
await writeFile(join(temp, '.arcuex-volume-id'), storageId, { mode: 0o600 });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const app = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', '3063'],
  {
    cwd: new URL('../', import.meta.url),
    env: {
      ...env,
      NODE_ENV: 'production',
      ARCUEX_DEPLOYMENT_MODE: 'local-test',
      ARCUEX_CHAIN_SOURCE: 'arc-testnet',
      ARCUEX_CHAIN_ID: '5042002',
      ARCUE_X_POOL_ADDRESS: pool,
      ARCUEX_PUBLIC_ORIGIN: origin,
      ARCUEX_PUBLIC_HOST: new URL(origin).host,
      ARCUEX_TLS_SERVER_NAME: 'localhost',
      ARCUEX_DATA_DIR: temp,
      ARCUEX_STORAGE_ID: storageId,
      ARCUEX_SESSION_EPOCH: storageId,
      ARCUEX_RATE_LIMIT_SECRET: secret(),
      CLAIMS_REVIEWER_API_TOKEN: secret(),
      CLAIMS_AUTHORITY_API_TOKEN: secret(),
      CLAIMS_COOKIE_SECURE: '1',
      ARCUEX_RECONCILIATION_ENABLED: '0',
      ARC_TESTNET_RPC_URL: 'http://127.0.0.1:1',
      QUICKNODE_RPC_URL: 'http://127.0.0.1:1',
      ARCUE_X_SQLITE_PATH: join(temp, 'checkout.sqlite'),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);

let browser;
try {
  const listening = await (async () => {
    for (let i = 0; i < 50 && app.exitCode === null; i++) {
      if (
        await fetch(origin + '/api/health/live').then(
          (r) => r.ok,
          () => false,
        )
      )
        return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  })();
  assert(listening, 'Local Next production server did not start');
  browser = await chromium.launch({
    env,
    executablePath:
      process.env.ARCUEX_ACCEPTANCE_CHROMIUM_EXECUTABLE ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(
      ({ owner, key, hash }) => {
        if (!sessionStorage.getItem('checkout-harness-seeded')) {
          localStorage.setItem(key, hash);
          sessionStorage.setItem('checkout-harness-seeded', '1');
        }
        window.ethereum = {
          isMetaMask: true,
          on() {},
          removeListener() {},
          async request({ method }) {
            if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [owner];
            if (method === 'eth_chainId') return '0x4cef52';
            if (method === 'wallet_requestPermissions')
              return [{ parentCapability: 'eth_accounts' }];
            if (['eth_sendTransaction', 'eth_signTransaction'].includes(method))
              window.walletWrite = true;
            throw new Error(`Unexpected wallet method: ${method}`);
          },
        };
      },
      { owner, key, hash },
    );
    const confirmedHashes = [];
    const rpcHashes = [];
    const unexpectedWrites = [];
    const json = (route, value, status = 200) => route.fulfill({ json: value, status });
    await context.route('**/*', (route) => {
      const request = route.request();
      const { origin: target, pathname } = new URL(request.url());
      if (target === origin) {
        if (pathname === '/api/session/me')
          return json(route, {
            state: 'authenticated',
            role: 'claimant',
            wallet: owner,
            capabilities: [],
          });
        if (pathname === '/api/procurement/products') return route.continue();
        if (pathname === '/api/procurement/capacity')
          return json(route, { status: 'unavailable', availableMicros: null });
        if (pathname === `/api/procurement/policies/${policyId}`) return json(route, { policy });
        if (pathname === `/api/policies/${policyId}/lifecycle`)
          return json(route, {
            version: 1,
            policyId,
            state: 'reconciliation_pending',
            claimsEligible: false,
            source: { mode: 'arc-testnet' },
          });
        if (pathname === '/api/procurement/confirm') {
          confirmedHashes.push(request.postDataJSON().hash);
          return confirmedHashes.length === 1
            ? json(route, { error: 'UNCONFIRMED: waiting for canonical receipt' }, 409)
            : json(route, { ...policy, state: 'confirmed', bindTx: hash });
        }
        if (request.method() === 'GET' && !pathname.startsWith('/api/')) return route.continue();
        if (request.method() !== 'GET') unexpectedWrites.push(pathname);
        return json(route, { error: 'Unexpected request' }, 404);
      }
      if (target === 'https://rpc.testnet.arc.io' && request.method() === 'POST') {
        const { id, method, params } = request.postDataJSON();
        if (method === 'eth_getTransactionReceipt') rpcHashes.push(params[0]);
        if (method.startsWith('eth_send')) unexpectedWrites.push(method);
        const result = {
          eth_blockNumber: '0x102',
          eth_getTransactionReceipt: {
            transactionHash: hash,
            blockHash,
            blockNumber: '0x100',
            status: '0x1',
            transactionIndex: '0x0',
            from: owner,
            to: pool,
            type: '0x2',
            logs: [],
            cumulativeGasUsed: '0x1',
            gasUsed: '0x1',
            effectiveGasPrice: '0x1',
          },
        }[method];
        return json(
          route,
          result === undefined
            ? { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unexpected RPC method' } }
            : { jsonrpc: '2.0', id, result },
        );
      }
      return route.abort();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const response = await page.goto(`${origin}/coverage?policyId=${policyId}`);
    assert(response.ok(), await response.text().then((body) => body.slice(0, 250)));
    const resume = page.getByRole('button', { name: 'Resume checkout' });
    await resume.waitFor();
    const connect = page.getByRole('button', { name: /connect wallet/i }).first();
    if (await connect.isVisible()) await connect.click();
    const recheck = page.getByRole('button', { name: 'Re-check bind confirmation' });
    await resume.click();
    await recheck.click();
    await page.getByText('UNCONFIRMED: waiting for canonical receipt').first().waitFor();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), hash);
    assert.equal(
      await page.getByRole('button', { name: 'Pay premium and bind policy' }).count(),
      0,
    );
    console.log(
      `PASS ${viewport.width}px pending receipt retained with repeat payment unavailable`,
    );

    await page.reload();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), hash);
    await resume.click();
    await recheck.click();
    await page.getByText(/Receipt checked\. Coverage follows canonical reconciliation/).waitFor();
    assert.deepEqual(confirmedHashes, [hash, hash]);
    assert(rpcHashes.length >= 2 && rpcHashes.every((checked) => checked === hash));
    assert.equal(await page.evaluate(() => window.walletWrite), undefined);
    assert.deepEqual(unexpectedWrites, []);
    assert.equal(
      await page.getByRole('button', { name: 'Pay premium and bind policy' }).count(),
      0,
    );
    console.log(
      `PASS ${viewport.width}px reload checks the original hash through server confirmation without a wallet write`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  if (app.exitCode === null && app.signalCode === null) {
    const exited = new Promise((resolve) => app.once('exit', resolve));
    app.kill('SIGTERM');
    await exited;
  }
  await rm(temp, { recursive: true, force: true });
}
