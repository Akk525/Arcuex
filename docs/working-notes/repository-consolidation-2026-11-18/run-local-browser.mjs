/** Consolidated main: local-test production API + temporary SQLite + browser.
 * Adapted from preserved hosted harness; public-beta gate checks remain in unit tests.
 * No production writes or financial transactions. Uses ephemeral local test credentials. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(
  process.env.ARCUEX_TEST_PACKAGE_JSON ||
    new URL('../../../apps/web/package.json', import.meta.url),
);
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const secrets = JSON.parse(fs.readFileSync(process.env.ARCUEX_HOST_TEST_SECRETS, 'utf8'));
const base = secrets.origin;
const account = privateKeyToAccount(generatePrivateKey()); // ephemeral signing identity; never logged/stored
const results = [];
function check(value, detail) {
  if (!value) throw new Error(detail);
  results.push({ status: 'PASS', detail });
  console.log('PASS ' + detail);
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME_PATH,
});
try {
  check((await fetch(base + '/api/health/live')).status === 200, 'Local production liveness');
  const readiness = await (await fetch(base + '/api/health/ready')).json();
  check(readiness.ok === true, 'Local production readiness including Arc and solvency');
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-arcuex-acceptance-gate': secrets.gate },
  });
  const request = context.request;
  const post = (path, data) => request.post(base + path, { data, headers: { origin: base } });
  let response = await request.get(base + '/api/session/me');
  check((await response.json()).state === 'anonymous', 'Anonymous authoritative session');
  response = await request.get(base + '/api/policies/reconciliation');
  check(response.status() === 401, 'Unauthenticated reconciliation is denied');
  response = await post('/api/claims/auth/nonce', { wallet: account.address });
  check(response.ok(), 'Real wallet challenge issued');
  const nonce = await response.json();
  response = await post('/api/claims/auth/verify', {
    wallet: account.address,
    nonce: nonce.nonce,
    signature: await account.signMessage({ message: nonce.message }),
  });
  check(response.ok(), 'Real signed-wallet authentication');
  check(
    /HttpOnly/i.test(response.headers()['set-cookie']) &&
      /Secure/i.test(response.headers()['set-cookie']),
    'Session cookie retains HttpOnly and Secure',
  );
  const me = await (await request.get(base + '/api/session/me')).json();
  check(
    me.state === 'authenticated' &&
      me.role === 'claimant' &&
      me.wallet === account.address.toLowerCase() &&
      me.capabilities.includes('claims:intake'),
    'Authoritative identity and capabilities',
  );
  response = await post('/api/procurement/agents', {
    idempotencyKey: crypto.randomUUID(),
    label: 'Combined acceptance',
    signer: account.address,
    position: crypto.randomUUID(),
    exposureMicros: '100000000',
    ownerAttestsControl: true,
    chainId: 5042002,
    protocol: 'arcuex-synthetic-lending-v1',
  });
  check(response.ok(), 'Real synthetic exposure registration');
  const agent = await response.json();
  response = await post('/api/procurement/quotes', {
    idempotencyKey: crypto.randomUUID(),
    agentId: agent.id,
    limitMicros: '1000000',
    durationDays: 7,
    beneficiary: account.address,
    eligibility: {
      positionHealthy: true,
      noKnownIncident: true,
      syntheticOnly: true,
      ownerAttestsControl: true,
    },
  });
  check(response.ok(), 'Real immutable synthetic quote');
  const quote = await response.json();
  response = await post('/api/procurement/procure', {
    quoteId: quote.terms.quoteId,
    acceptedDigest: quote.digest,
  });
  check(response.ok(), 'Read-only chain preflight and offchain preparation');
  const prep = await response.json();
  const id = prep.policy.terms.policyId;
  const lifecycle = await (await request.get(base + `/api/policies/${id}/lifecycle`)).json();
  check(
    lifecycle.state === 'prepared' && !lifecycle.claimsEligible && lifecycle.confirmation === null,
    'Prepared SQLite record grants no confirmation or claims',
  );
  response = await post('/api/procurement/confirm', { policyId: id, hash: '0x' + 'ff'.repeat(32) });
  check(!response.ok(), 'Fabricated successful wallet hash rejected by real receipt verifier');
  const after = await (await request.get(base + `/api/policies/${id}/lifecycle`)).json();
  check(
    after.state === 'prepared' && !after.claimsEligible,
    'Failed receipt cannot mutate authoritative lifecycle',
  );
  const foreign = await browser.newContext({
    extraHTTPHeaders: { 'x-arcuex-acceptance-gate': secrets.gate },
  });
  check(
    (await foreign.request.get(base + `/api/policies/${id}/lifecycle`)).status() === 401,
    'Session boundary protects policy lifecycle',
  );
  response = await foreign.request.post(base + '/api/claims/cases', {
    headers: { origin: base },
    data: { action: 'open', role: 'authority' },
  });
  check(response.status() === 401, 'Anonymous claims write rejected');
  response = await request.post(base + '/api/claims/cases', {
    headers: { origin: base, 'x-arcuex-role': 'authority' },
    data: { action: 'open', role: 'authority' },
  });
  check(
    response.status() === 400 || response.status() === 403,
    'Client role header cannot grant authority',
  );
  for (const action of ['adjudicate', 'prepare_settlement', 'mark_paid']) {
    response = await request.post(base + '/api/claims/cases/acceptance-nonexistent', {
      headers: { origin: base, 'x-arcuex-role': 'authority' },
      data: { action },
    });
    check(
      response.status() === 403,
      'Claimant denied privileged ' + action + ' despite forged role',
    );
  }
  for (const role of ['reviewer', 'authority']) {
    const ops = await browser.newContext({
      extraHTTPHeaders: { 'x-arcuex-acceptance-gate': secrets.gate },
    });
    response = await ops.request.post(base + '/api/claims/auth/ops-login', {
      headers: { origin: base, authorization: 'Bearer ' + secrets[role] },
      data: { role },
    });
    check(response.ok(), 'Provisioned ' + role + ' session login');
    const identity = await (await ops.request.get(base + '/api/session/me')).json();
    check(identity.role === role && identity.wallet === null, 'Server ' + role + ' identity');
    response = await ops.request.post(base + '/api/claims/cases', {
      headers: { origin: base },
      data: { action: 'open' },
    });
    check(response.status() === 403, role + ' cannot act as claimant');
    if (role === 'reviewer') {
      response = await ops.request.post(base + '/api/claims/cases/acceptance-nonexistent', {
        headers: { origin: base },
        data: { action: 'prepare_settlement' },
      });
      check(response.status() === 403, 'Reviewer denied authority settlement preparation');
    }
    const reconciliation = await (
      await ops.request.get(base + '/api/policies/reconciliation')
    ).json();
    check(
      Array.isArray(reconciliation.records) &&
        reconciliation.records.every((r) => r.claimsEligible === false),
      'Nonverified historical records stay nonclaimable for ' + role,
    );
    const view = await ops.newPage();
    await view.route('https://fonts.googleapis.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await view.goto(base + '/claims/review', { waitUntil: 'domcontentloaded' });
    await view.getByRole('button', { name: 'Ops', exact: true }).waitFor();
    check(true, role + ' Ops navigation uses real session');
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await view.screenshot({
        path: process.env.SCREENSHOT_DIR + '/hosted-' + role + '-ops.png',
        fullPage: true,
      });
    }
    await ops.request.post(base + '/api/claims/auth/logout', { headers: { origin: base } });
    await ops.close();
  }
  await foreign.close();
  const page = await context.newPage();
  await page.addInitScript(
    ({ owner }) => {
      localStorage.setItem('arcuex:workspace', 'protect');
      window.ethereum = {
        isMetaMask: true,
        on() {},
        removeListener() {},
        async request({ method }) {
          if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [owner];
          if (method === 'eth_chainId') return '0x4cef52';
          if (['wallet_requestPermissions', 'wallet_getPermissions'].includes(method))
            return [{ parentCapability: 'eth_accounts' }];
          throw new Error(
            'No transaction or signing method authorized in real-backend acceptance: ' + method,
          );
        },
      };
    },
    { owner: account.address },
  );
  await page.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(base + '/policies');
  await page.getByText('Signed in', { exact: true }).waitFor();
  const connect = page.getByRole('button', { name: 'Connect wallet', exact: true });
  if (await connect.count()) await connect.click();
  await page.getByRole('button', { name: 'Refresh my policies' }).click();
  await page.getByText(id, { exact: true }).waitFor();
  await page.getByText('Prepared — no coverage confirmed', { exact: true }).waitFor();
  check(true, 'Policy frontend consumes real session and lifecycle APIs');
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: process.env.SCREENSHOT_DIR + '/hosted-prepared-policy.png',
      fullPage: true,
    });
  check(
    (await page.getByRole('link', { name: 'Submit a synthetic claim' }).count()) === 0,
    'Prepared policy has no claim action',
  );
  check(
    (await page.getByRole('button', { name: 'Ops', exact: true }).count()) === 0,
    'Claimant cannot select Ops workspace',
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByText('No session', { exact: true }).waitFor();
  check(
    (await (await request.get(base + '/api/session/me')).json()).state === 'anonymous',
    'Logout revokes real session and refreshes AccountBar',
  );
  fs.writeFileSync(
    process.env.OUT_FILE || '/tmp/arcuex-real-backend-results.json',
    JSON.stringify(results, null, 2),
  );
  console.log(`Local production backend acceptance: ${results.length} PASS`);
} catch (error) {
  console.error('Hosted acceptance failed: ' + String(error.message).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await browser.close();
}
