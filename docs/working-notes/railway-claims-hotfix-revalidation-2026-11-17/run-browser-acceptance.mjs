/**
 * One-off private browser acceptance harness. Reads gate token from env only.
 * Never logs the token.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = 'https://arcuex-nov20-beta-production.up.railway.app';
const gate = process.env.ARCUEX_ACCEPTANCE_GATE_TOKEN?.trim();
if (!gate) {
  console.error('ARCUEX_ACCEPTANCE_GATE_TOKEN required');
  process.exit(2);
}

const { chromium } = await import('playwright');
await mkdir(__dirname, { recursive: true });

const consoleLog = createWriteStream(path.join(__dirname, 'browser-console.log'), { flags: 'w' });
const routes = [
  { name: 'claims', url: '/claims' },
  { name: 'claims-new', url: '/claims/new' },
  { name: 'claims-review', url: '/claims/review' },
  { name: 'claims-nonexistent', url: '/claims/acceptance-nonexistent' },
];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
});
await context.addCookies([
  {
    name: 'arcuex_acceptance_gate',
    value: gate,
    domain: 'arcuex-nov20-beta-production.up.railway.app',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  },
]);

let crashDetected = false;

for (const route of routes) {
  const page = await context.newPage();
  const lines = [];
  page.on('console', (msg) => {
    const text = `[${route.name}] ${msg.type()}: ${msg.text()}`;
    lines.push(text);
    consoleLog.write(text + '\n');
    if (/Cannot read properties of undefined \(reading 'length'\)/.test(msg.text())) {
      crashDetected = true;
    }
  });
  page.on('pageerror', (err) => {
    const text = `[${route.name}] pageerror: ${err.message}`;
    lines.push(text);
    consoleLog.write(text + '\n');
    if (/reading 'length'/.test(err.message)) crashDetected = true;
  });

  const response = await page.goto(`${host}${route.url}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const status = response?.status() ?? 0;
  consoleLog.write(`[${route.name}] navigation status: ${status}\n`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, `acceptance-${route.name}.png`), fullPage: true });

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const signInCue =
    /sign in|wallet session|authorization|unauthorized|session/i.test(bodyText) ||
    /Sign in with a reviewer/.test(bodyText);
  consoleLog.write(`[${route.name}] sign-in-cue: ${signInCue}\n`);
  consoleLog.write(`[${route.name}] body-snippet: ${bodyText.slice(0, 280).replace(/\s+/g, ' ')}\n`);

  await page.close();
}

await browser.close();
consoleLog.end();

if (crashDetected) {
  console.error('FAIL: length crash detected in console');
  process.exit(1);
}
console.log('browser acceptance harness: PASS (no length crash)');