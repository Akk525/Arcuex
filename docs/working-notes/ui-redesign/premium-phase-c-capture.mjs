// Phase C acceptance capture with an EMULATED wallet and MOCKED authenticated procurement API.
// Product catalog and pool capacity come from the real dev server (Arc Testnet reads).
// Usage: node phasec.mjs <outDir> <width> <height> <suffix>
import { chromium } from '/tmp/arcuex-pw/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const [, , outDir, w = '1440', h = '900', suffix = 'desktop'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://127.0.0.1:3020';
const ADDR = '0x5a1e0c0ffee0000000000000000000000000ab12';
const NOW = () => Math.floor(Date.now() / 1000);
const H = (c) => `0x${c.repeat(64 / c.length)}`;

const catalog = await (await fetch(`${BASE}/api/procurement/products`)).json();
const product = catalog.products[0];

const agents = [
  { id: '7d1c2a44-0b7e-4c51-9a3e-2f6e1b0c9a01', owner: ADDR, signer: ADDR, label: 'treasury-agent', exposure: { chainId: 5042002, protocol: product.protocol, position: 'demo-position-01', notionalMicros: '100000000' } },
  { id: '7d1c2a44-0b7e-4c51-9a3e-2f6e1b0c9a02', owner: ADDR, signer: ADDR, label: 'market-maker-02', exposure: { chainId: 5042002, protocol: product.protocol, position: 'demo-position-07', notionalMicros: '50000000' } },
  { id: '7d1c2a44-0b7e-4c51-9a3e-2f6e1b0c9a03', owner: ADDR, signer: ADDR, label: 'research-runner', exposure: { chainId: 5042002, protocol: product.protocol, position: 'demo-position-12', notionalMicros: '10000000' } },
];

function terms(i, agent, { limit = '1000000', start, end, quoteExpires }) {
  return {
    version: 1,
    policyId: `c0ffee00-0000-4000-8000-00000000000${i}`,
    quoteId: `9e5a7b10-0000-4000-8000-00000000000${i}`,
    productCode: product.code,
    agentId: agent.id,
    owner: ADDR,
    beneficiary: ADDR,
    exposure: agent.exposure,
    eligibility: { positionHealthy: true, noKnownIncident: true, syntheticOnly: true, ownerAttestsControl: true },
    premiumMicros: String(BigInt(limit) / 100n),
    limitMicros: limit,
    deductibleMicros: String(BigInt(limit) / 10n),
    effectiveAt: start,
    expiresAt: end,
    quoteExpiresAt: quoteExpires,
    insuredEvent: product.event,
    exclusions: product.exclusions,
    synthetic: true,
  };
}
const day = 86_400;
function policies() {
  const n = NOW();
  return [
    { terms: terms(1, agents[0], { limit: '1000000', start: n - 2 * day, end: n + 5 * day, quoteExpires: n - 2 * day - 600 }), digest: H('d1'), state: 'confirmed', payer: ADDR, delegationId: null, bindTx: H('b1'), confirmedAt: n - 2 * day },
    { terms: terms(2, agents[1], { limit: '10000000', start: n + 3600, end: n + 30 * day, quoteExpires: n - 600 }), digest: H('d2'), state: 'confirmed', payer: ADDR, delegationId: null, bindTx: H('b2'), confirmedAt: n - 300 },
    { terms: terms(3, agents[2], { limit: '1000000', start: n + 2 * 3600, end: n + 7 * day, quoteExpires: n + 600 }), digest: H('d3'), state: 'confirmed', payer: ADDR, delegationId: null, bindTx: H('b3'), confirmedAt: null },
    { terms: terms(4, agents[0], { limit: '1000000', start: n + 3 * 3600, end: n + 7 * day, quoteExpires: n + 22 * 60 }), digest: H('d4'), state: 'prepared', payer: ADDR, delegationId: null, bindTx: null, confirmedAt: null },
    { terms: terms(5, agents[1], { limit: '1000000', start: n - 40 * day, end: n - 10 * day, quoteExpires: n - 41 * day }), digest: H('d5'), state: 'confirmed', payer: ADDR, delegationId: null, bindTx: H('b5'), confirmedAt: n - 40 * day },
  ];
}
function lifecycle(p) {
  const n = NOW();
  const i = p.terms.policyId.slice(-1);
  const base = { version: 1, policyId: p.terms.policyId, onchainPolicyId: H(`e${i}`), chainId: 5042002, pool: catalog.pool, settlements: [], source: { mode: 'arc-testnet', id: 'arc-testnet-5042002' } };
  const conf = { transactionHash: p.bindTx, explorerUrl: `https://explorer.testnet.arc.io/tx/${p.bindTx}`, blockNumber: String(18_204_000 + +i * 37), blockHash: H(`f${i}`), logIndex: 2 };
  if (i === '1') return { ...base, state: 'confirmed', completeness: 'VERIFIED_LINKED', claimsEligible: true, checkedAt: n, confirmation: conf, notice: 'Canonical bind verified. Coverage window open.' };
  if (i === '2') return { ...base, state: 'confirmed', completeness: 'VERIFIED_LINKED', claimsEligible: false, checkedAt: n, confirmation: conf, notice: 'Canonical bind verified. Coverage has not started.' };
  if (i === '3') return { ...base, state: 'reconciliation_pending', completeness: 'INCOMPLETE', claimsEligible: false, checkedAt: n, confirmation: null, notice: 'Bind transaction recorded. Canonical reconciliation has not linked it yet; no coverage is confirmed.' };
  if (i === '4') return { ...base, state: 'prepared', completeness: null, claimsEligible: false, checkedAt: n, confirmation: null, notice: 'Accepted offchain. Premium not paid.' };
  return { ...base, state: 'expired', completeness: 'VERIFIED_LINKED', claimsEligible: false, checkedAt: n, confirmation: conf, notice: 'Coverage window ended.' };
}

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

async function session({ url, localStorage: ls = {} }) {
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ ADDR, ls }) => {
    for (const [k, v] of Object.entries(ls)) window.localStorage.setItem(k, v);
    const listeners = {};
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ADDR];
        if (method === 'eth_chainId') return '0x4cef52';
        if (method === 'net_version') return '5042002';
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
        if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
        if (method === 'personal_sign') return `0x${'11'.repeat(65)}`;
        if (method === 'eth_sendTransaction') return new Promise(() => {}); // emulated wallet never signs
        throw Object.assign(new Error(`emulated wallet: ${method} unsupported`), { code: 4200 });
      },
      on: (e, f) => ((listeners[e] ??= []).push(f)),
      removeListener: () => {},
    };
  }, { ADDR, ls });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()));

  let quote = null;
  await page.route('**/api/session/me', (r) => json(r, { version: 1, state: 'authenticated', wallet: ADDR, role: 'claimant', capabilities: [] }));
  await page.route('**/api/dashboard', (r) => json(r, { state: 'authenticated' }, 500));
  await page.route('**/api/procurement/list', (r) => json(r, { agents, delegations: [] }));
  await page.route('**/api/procurement/agents', (r) => json(r, agents));
  await page.route('**/api/procurement/quotes', (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}');
    const n = NOW();
    const agent = agents.find((a) => a.id === body.agentId) ?? agents[0];
    quote = { terms: { ...terms(9, agent, { limit: body.limitMicros, start: n + 2 * 3600, end: n + 2 * 3600 + body.durationDays * day, quoteExpires: n + 15 * 60 }), beneficiary: body.beneficiary }, digest: H('9a') };
    return json(r, quote);
  });
  await page.route('**/api/procurement/accept', (r) => json(r, { policy: { ...quote, state: 'prepared', payer: ADDR, delegationId: null, bindTx: null, confirmedAt: null }, state: 'accepted_offchain' }));
  await page.route('**/api/procurement/policies', (r) => json(r, policies()));
  await page.route(/\/api\/procurement\/policies\/[^/]+$/, (r) => {
    const id = decodeURIComponent(r.request().url().split('/').pop());
    const p = policies().find((x) => x.terms.policyId === id);
    return p
      ? json(r, { policy: p, approvals: p.state === 'confirmed' || id.endsWith('4') ? [{ hash: H(`a${id.slice(-1)}`), at: 0 }] : [], reconciliation: id.endsWith('1') ? { bound: true, cancelled: false, matches: true, paidOutMicros: '0', reservedMicros: p.terms.limitMicros, checkedAt: new Date().toISOString() } : null })
      : json(r, { error: 'Policy not found' }, 404);
  });
  await page.route('**/api/policies/reconciliation', (r) => json(r, { version: 1, records: [] }));
  await page.route(/\/api\/policies\/[^/]+\/lifecycle$/, (r) => {
    const id = r.request().url().split('/').slice(-2)[0];
    const p = policies().find((x) => x.terms.policyId === id);
    return p ? json(r, lifecycle(p)) : json(r, { error: 'not found' }, 404);
  });

  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 90000 });
  // Connect the emulated wallet through the real header control.
  const connect = page.getByRole('button', { name: /connect wallet/i }).first();
  if (await connect.isVisible().catch(() => false)) await connect.click();
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: '#__fixture{position:fixed;z-index:9999;right:12px;bottom:12px;background:#4a3300;color:#fff;font:600 11px/1.3 system-ui;padding:6px 9px;border-radius:6px;pointer-events:none;max-width:16rem}' });
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = '__fixture';
    d.textContent = 'Screenshot fixture: emulated wallet and mocked account data. Catalog and capacity are live Arc Testnet reads.';
    document.body.appendChild(d);
  });
  return { ctx, page, errors };
}

const shot = async (page, name) => {
  await page.waitForTimeout(500);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (ov > 0) console.log('OVERFLOW', name, ov);
  // Grow the viewport to the document so the fixed shell renders once, in place.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: +w, height: Math.max(+h, height) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${name}-${suffix}.png` });
  await page.setViewportSize({ width: +w, height: +h });
  console.log('saved', name);
};

// 1-4: guided purchase
{
  const { ctx, page, errors } = await session({ url: '/coverage' });
  await page.getByRole('button', { name: /load my agents/i }).click();
  await page.waitForTimeout(900);
  await shot(page, 'c1-coverage-product-exposure');
  await page.getByRole('button', { name: /continue to terms/i }).click();
  await page.waitForTimeout(400);
  for (const box of await page.locator('fieldset input[type=checkbox]').all()) await box.check();
  await shot(page, 'c2-coverage-terms');
  await page.getByRole('button', { name: /get quote/i }).click();
  await page.waitForTimeout(1200);
  await shot(page, 'c3-coverage-quote-review');
  await page.getByRole('checkbox', { name: /accept these exact terms/i }).check();
  await page.getByRole('button', { name: /^accept terms$/i }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'c4-coverage-awaiting-authorization');
  if (errors.length) console.log('ERRORS purchase:\n' + errors.slice(0, 6).join('\n'));
  await ctx.close();
}

// 5: interrupted checkout recovery (wallet returned no hash)
{
  const id = 'c0ffee00-0000-4000-8000-000000000004';
  const { ctx, page, errors } = await session({ url: `/coverage?policyId=${id}`, localStorage: { [`arcuex-purchase-bind:${id}`]: 'uncertain' } });
  await page.waitForTimeout(600);
  await shot(page, 'c5-coverage-resume-offer');
  await page.getByRole('button', { name: /resume checkout/i }).click();
  await page.waitForTimeout(1800);
  await shot(page, 'c6-coverage-recovery');
  if (errors.length) console.log('ERRORS recovery:\n' + errors.slice(0, 6).join('\n'));
  await ctx.close();
}

// 6: populated portfolio
{
  const { ctx, page, errors } = await session({ url: '/policies' });
  await page.getByRole('button', { name: /load policies/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, 'p1-policies-portfolio');
  await page.getByRole('button', { name: /awaiting confirmation/i }).click();
  await shot(page, 'p2-policies-filtered');
  if (errors.length) console.log('ERRORS portfolio:\n' + errors.slice(0, 6).join('\n'));
  await ctx.close();
}

// 7-8: detail confirmed and pending reconciliation
for (const [id, name] of [
  ['c0ffee00-0000-4000-8000-000000000001', 'd1-policy-confirmed-effective'],
  ['c0ffee00-0000-4000-8000-000000000003', 'd2-policy-pending-reconciliation'],
]) {
  const { ctx, page, errors } = await session({ url: `/policies/${id}` });
  await page.getByRole('button', { name: /load policy/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, name);
  if (errors.length) console.log(`ERRORS ${name}:\n` + errors.slice(0, 6).join('\n'));
  await ctx.close();
}

await browser.close();
