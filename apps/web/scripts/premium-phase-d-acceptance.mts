/** Phase D premium claims UI acceptance (working note). Same real app/SDK/verifier/SQLite boundary; only OpenAI transport is doubled. */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  openSync,
  closeSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { openDatabase, InsuranceRepository } from '@arcuex/persistence';
import { ClaimsApiClient } from '@arcuex/agent-sdk';
import { CLAIM_FIXTURE } from '@arcuex/insurance';
import { seedFixture } from '../src/lib/server/fixture-source';
import { processExaminerRequest } from './claims-examiner-worker.mts';
const liveOpenAI = process.env.ARCUEX_ACCEPTANCE_LIVE_OPENAI === '1';
const liveReassessmentOnly = process.env.ARCUEX_ACCEPTANCE_LIVE_STAGE === 'reassessment';
const secretSource = process.env.ARCUEX_WORKER_SECRET_SOURCE;
const apiKey = liveOpenAI
  ? (secretSource
      ? parseEnv(readFileSync(secretSource, 'utf8')).OPENAI_API_KEY
      : process.env.OPENAI_API_KEY
    )?.trim()
  : undefined;
if (liveOpenAI && !apiKey) throw new Error('Live inference requires worker-only OPENAI_API_KEY');
const root = resolve(import.meta.dirname, '../../..'),
  out = process.env.ARCUEX_BROWSER_EVIDENCE_DIR
    ? resolve(process.env.ARCUEX_BROWSER_EVIDENCE_DIR)
    : join(root, 'docs/verification/claims-investigation', liveOpenAI ? 'browser-live' : 'browser');
if (existsSync(join(out, 'results.json')))
  throw new Error('Archive earlier evidence before running');
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'arcuex-investigation-')),
  id = `candidate-${randomUUID()}`,
  dbPath = join(dir, id + '.sqlite');
const db = openDatabase(dbPath),
  repo = new InsuranceRepository(db),
  owner = privateKeyToAccount(generatePrivateKey()),
  agent = privateKeyToAccount(generatePrivateKey()); // nonce signing only, unfunded, RAM only
const seed = seedFixture(db, {
    id,
    owner: owner.address.toLowerCase(),
    agentSigner: agent.address.toLowerCase(),
    at: Math.floor(Date.now() / 1000),
  }),
  policy = seed.snapshot.policy;
writeFileSync(join(dir, '.arcuex-volume-id'), id, { mode: 0o600 });
const base = 'http://localhost:3062',
  secret = () => randomBytes(32).toString('hex'),
  reviewerToken = secret(),
  authorityToken = secret(),
  systemToken = secret();
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG'].filter((k) => process.env[k]).map((k) => [k, process.env[k]!]),
);
Object.assign(env, {
  NODE_ENV: 'production',
  ARCUEX_DEPLOYMENT_MODE: 'local-test',
  ARCUEX_CHAIN_SOURCE: 'fixture',
  ARCUEX_FIXTURE_ID: id,
  ARCUEX_FIXTURE_DIGEST: seed.digest,
  ARCUEX_PUBLIC_ORIGIN: base,
  ARCUEX_PUBLIC_HOST: 'localhost:3062',
  ARCUEX_TLS_SERVER_NAME: 'localhost',
  ARCUEX_CHAIN_ID: '5042002',
  ARCUE_X_POOL_ADDRESS: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
  ARCUEX_DATA_DIR: dir,
  ARCUE_X_SQLITE_PATH: dbPath,
  ARCUEX_STORAGE_ID: id,
  ARCUEX_SESSION_EPOCH: id,
  ARCUEX_RATE_LIMIT_SECRET: secret(),
  CLAIMS_REVIEWER_API_TOKEN: reviewerToken,
  CLAIMS_AUTHORITY_API_TOKEN: authorityToken,
  CLAIMS_SYSTEM_API_TOKEN: systemToken,
  ARCUEX_ACCEPTANCE_GATE_TOKEN: secret(),
  CLAIMS_COOKIE_SECURE: '1',
  CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '0',
  ARCUEX_RECONCILIATION_ENABLED: '0',
});
const require = createRequire(join(root, 'apps/web/package.json')),
  log = openSync(join(out, 'server.txt'), 'w');
let app: ChildProcess | undefined,
  browser: any,
  reviewerBrowser: any,
  completed = false,
  caseId = '',
  modelCalls = 0,
  estimatedSpendMicros = 0;
const providerResponses: Array<{
  status: number;
  providerRequestId: string | null;
  citationIds: string[];
  currentVerificationIds: string[];
  dossierBytes: number;
}> = [];
const results: Array<{ status: string; detail: string }> = [];
const check = (condition: any, detail: string) => {
  if (!condition) throw new Error(detail);
  results.push({ status: 'PASS', detail });
  console.log('PASS ' + detail);
};
async function stop() {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  const current = app,
    closed = new Promise<void>((r) => current.once('exit', () => r()));
  process.kill(-current.pid!, 'SIGTERM');
  await closed;
}
async function start() {
  app = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', '3062'],
    { cwd: join(root, 'apps/web'), env, stdio: ['ignore', log, log], detached: true },
  );
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(base + '/api/health/live')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('App did not start');
}
const sdk = new ClaimsApiClient({ baseUrl: base, agentId: policy.terms.agentId });
async function inspect() {
  return sdk.investigation(caseId);
}
async function worker(stage: 'initial' | 'reassessment') {
  const useLive = liveOpenAI && (!liveReassessmentOnly || stage === 'reassessment');
  const view = await inspect();
  const pending = view.entries.filter((e) => e.kind === 'examiner_request').at(-1)!;
  return processExaminerRequest({
    baseUrl: base,
    caseId,
    requestId: pending.id,
    systemToken,
    apiKey: useLive ? apiKey! : 'test-double-not-a-real-key',
    execution: useLive ? 'live' : 'test_double',
    inferenceRequest: async (url, init) => {
      check(
        String(url) === 'https://api.openai.com/v1/responses',
        'Worker uses fixed OpenAI endpoint with no financial tools',
      );
      const sent = JSON.parse(String(init?.body)),
        dossier = JSON.parse(sent.input[0].content);
      check(
        dossier.case.id === caseId && Array.isArray(dossier.verifications),
        'Examiner receives the actual same-claim dossier and persisted verifier findings',
      );
      check(
        dossier.chronology.relation === 'during_coverage' &&
          dossier.chronology.incident.epochMs > dossier.chronology.startsAt.epochMs,
        'Examiner receives server-checked in-window chronology with original timestamp provenance',
      );
      check(
        dossier.authority.claimant.basis === 'authenticated_policy_agent' &&
          dossier.authority.claimant.agentId === policy.terms.agentId &&
          dossier.authority.policyDelegation.status === 'owner_procured_no_delegation' &&
          dossier.authorityReview.length === 0 &&
          dossier.incidentPolicyLink.recorded,
        'Examiner sees authenticated signer and evidence scope separately from policy procurement',
      );
      if (modelCalls >= 2) throw new Error('Two-call acceptance budget exhausted');
      modelCalls++;
      if (useLive) {
        const dossierBytes = Buffer.byteLength(sent.input[0].content);
        check(
          dossierBytes <= 16000 &&
            sent.max_output_tokens === 1500 &&
            sent.store === false &&
            sent.tools === undefined &&
            init?.redirect === 'error' &&
            dossier.case.syntheticDemo &&
            dossier.terms.synthetic &&
            dossier.entries.every(
              (entry: any) =>
                entry.kind !== 'proof_submission' || entry.payload.content === CLAIM_FIXTURE.raw,
            ),
          'Live request is synthetic-only and within the 16 KB dossier and 1,500-token output caps',
        );
        // Estimate using at most one token per UTF-8 byte, with request framing headroom,
        // at the documented standard rates ($1/M input, $5/M output).
        estimatedSpendMicros +=
          dossierBytes +
          Buffer.byteLength(sent.instructions) +
          Buffer.byteLength(JSON.stringify(sent.text)) +
          512 +
          1500 * 5;
        check(
          estimatedSpendMicros <= 60_000,
          'Live acceptance stays within the $0.06 estimated budget',
        );
        const response = await fetch(url, init).catch(() => {
          throw new Error('OpenAI transport failed before receiving a provider response');
        });
        providerResponses.push({
          status: response.status,
          providerRequestId: response.headers.get('x-request-id'),
          citationIds: dossier.citationIds,
          currentVerificationIds: dossier.currentVerificationIds,
          dossierBytes,
        });
        return response;
      }
      const fresh = dossier.verifications.some(
        (v: any) =>
          v.contextDigest === dossier.verificationContext &&
          v.executionStatus === 'completed' &&
          v.evidenceSufficiency === 'sufficient',
      );
      const proof = dossier.entries.filter((e: any) => e.kind === 'proof_submission');
      const analysis = {
        summary: fresh
          ? 'Persisted fixture verifier is current; human contractual review is still required.'
          : 'This synthetic claim has no current persisted verifier findings. Request the versioned replay artifact and verify it.',
        chronology: dossier.chronology.relation,
        verifiedFindings: dossier.verifiedFindingIds,
        claimantAssertions: [],
        gaps: dossier.reviewBlockers,
        proposedRequests: fresh
          ? []
          : [
              {
                question: 'Supply the canonical synthetic replay artifact for this incident',
                citations: [caseId],
              },
            ],
        recommendation: fresh ? 'human_review' : 'request_proof',
        citations: [
          caseId,
          ...proof.map((p: any) => p.id),
          ...dossier.verifications.map((v: any) => v.id),
        ],
      };
      return Response.json({
        id: 'test-double-response-' + modelCalls,
        model: sent.model,
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(analysis) }] }],
        usage: { input_tokens: 200, output_tokens: 100 },
      });
    },
  });
}
async function walletSession(context: any, account: typeof owner) {
  const nonce = await context.request.post(base + '/api/claims/auth/nonce', {
      headers: { origin: base },
      data: { wallet: account.address },
    }),
    challenge = await nonce.json();
  const verified = await context.request.post(base + '/api/claims/auth/verify', {
    headers: { origin: base },
    data: {
      wallet: account.address,
      nonce: challenge.nonce,
      signature: await account.signMessage({ message: challenge.message }),
    },
  });
  check(verified.ok(), 'Real signed nonce establishes policyholder session');
}
try {
  await start();
  await sdk.authenticate(agent.address, (message) => agent.signMessage({ message }));
  const opened = await sdk.submitClaim({
    policyId: policy.terms.policyId,
    exposureId: policy.terms.agentId,
    idempotencyKey: randomUUID(),
    observedEventRef: 'synthetic:agent-investigation:same-claim',
    observedAt: new Date(Date.now() - 60000).toISOString(),
  });
  caseId = opened.case.id;
  check(
    !!caseId && repo.getClaimsCase(caseId)?.claimantRef === agent.address.toLowerCase(),
    'Distinct insured-agent signer submits claim against owner policy using authenticated SDK',
  );
  if (!liveOpenAI) {
    await sdk.submitProof(caseId, {
      requestKey: randomUUID(),
      requestId: null,
      filename: 'initial-fixture.json',
      content: CLAIM_FIXTURE.raw,
      declaredSource: CLAIM_FIXTURE.reference,
    });
    check(
      (await inspect()).entries.filter((e) => e.kind === 'proof_submission').length === 1,
      'Agent SDK persists initial evidence with hash and server-derived provenance',
    );
  }
  const anonymous = await fetch(base + `/api/claims/cases/${caseId}/investigation`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'message', requestKey: randomUUID(), text: 'not authorized' }),
  });
  check(anonymous.status === 401, 'Real HTTP rejects unauthenticated submission');
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
  const browserEnv = Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR', 'LANG']
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]!]),
  );
  const alternateChromium = process.env.ARCUEX_ACCEPTANCE_CHROMIUM_EXECUTABLE;
  const launch = () =>
    chromium.launch({
      headless: true,
      env: browserEnv,
      executablePath:
        alternateChromium ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ...(alternateChromium
        ? { args: ['--single-process', '--disable-gpu', '--in-process-gpu'] }
        : {}),
    });
  browser = await launch();
  if (alternateChromium) reviewerBrowser = await launch();
  const holder = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    ops = await (reviewerBrowser ?? browser).newContext({
      viewport: { width: 1440, height: 1000 },
    });
  for (const context of [holder, ops])
    await context.route('**/*', (route: any) =>
      ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
        ? route.continue()
        : route.abort(),
    );
  const consoleErrors: string[] = [];
  const watch = (p: any, label: string) =>
    p.on('console', (m: any) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
        consoleErrors.push(`${label}: ${m.text()}`);
    });
  const overflow: Record<string, number> = {};
  async function shot(p: any, name: string) {
    await p.waitForTimeout(250);
    const size = p.viewportSize();
    const height = await p.evaluate(() => document.documentElement.scrollHeight);
    overflow[name] = await p.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    await p.setViewportSize({
      width: size.width,
      height: Math.min(Math.max(height, size.height), 12000),
    });
    await p.waitForTimeout(150);
    await p.screenshot({ path: join(out, name + '.png') });
    await p.setViewportSize(size);
  }
  await walletSession(holder, owner);
  const page = await holder.newPage();
  const mobile = await holder.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  watch(page, 'holder');
  watch(mobile, 'holder-mobile');
  page.setDefaultTimeout(15000);
  mobile.setDefaultTimeout(15000);

  // 1. Agent submission + initial evidence visible to the policyholder.
  await page.goto(base + '/claims');
  await page
    .getByRole('link', { name: /.+/ })
    .filter({ hasText: /Oracle|Claim|agent/i })
    .first()
    .waitFor();
  await page.locator(`a[href="/claims/${caseId}"]`).waitFor();
  await shot(page, 'd01-claims-overview-agent-submitted-desktop');
  await page.goto(base + '/claims/' + caseId);
  await page
    .getByText('Server-checked chronology · During the policy window', { exact: true })
    .waitFor();
  await page.locator('[data-entry-kind="proof_submission"]').first().waitFor();
  check(
    (await page.locator('[data-entry-kind="proof_submission"]').count()) === 1,
    'Dossier shows the agent initial proof on the same claim',
  );
  check(
    (await page.getByText('Insured agent submitted proof').count()) >= 1,
    'Agent provenance is labeled in the timeline',
  );

  // 2. Examiner initial assessment (advisory).
  await page.getByRole('button', { name: 'Request examiner reassessment', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Examiner assessment requested' }).waitFor();
  await page.getByText('Examiner assessment running').waitFor();
  check(true, 'Next-step band reports the examiner run without implying a decision');
  await worker('initial');
  await page.getByText('TEST DOUBLE · no live AI inference', { exact: false }).first().waitFor();
  await page.getByText('Examiner advice').first().waitFor();
  check(
    repo.getClaimsCase(caseId)?.settlementAuthorization === 'none',
    'Examiner report alone never changes claim or grants payment authority',
  );
  await shot(page, 'd02-dossier-initial-examiner-gap-desktop');

  // 3. Reviewer: permission state, token exchange, workbench, adopt request.
  const review = await ops.newPage();
  watch(review, 'reviewer');
  review.setDefaultTimeout(15000);
  await review.goto(base + '/claims/review');
  await review.getByRole('heading', { name: 'Reviewer access' }).waitFor();
  await shot(review, 'd03-workbench-signed-out-desktop');
  await review.getByLabel('Reviewer API token (one-shot exchange)').fill(reviewerToken);
  await review.getByRole('button', { name: 'Exchange reviewer session', exact: true }).click();
  await review.getByText('Signed in · reviewer', { exact: true }).waitFor();
  await review.locator(`a[href="/claims/${caseId}"]`).waitFor();
  await shot(review, 'd04-workbench-awaiting-human-desktop');
  await review.goto(base + '/claims/' + caseId);
  await review.getByRole('button', { name: 'Adopt evidence request 1', exact: true }).click();
  await review.getByText('Evidence request · Outstanding', { exact: true }).waitFor();
  let view = await inspect();
  check(
    view.outstandingRequests.length === 1,
    'Human adopts advisory request and creates an outstanding proof gate',
  );
  const requestId = view.outstandingRequests[0];
  await review.getByText('Waiting for claimant evidence').waitFor();
  check(true, 'Reviewer next step waits for claimant evidence');

  // 4. Policyholder sees the request; inline response form validation.
  await page.goto(base + '/claims');
  await page.getByRole('heading', { name: 'Reviewers are waiting on you' }).waitFor();
  await shot(page, 'd05-claims-overview-evidence-requested-desktop');
  await mobile.goto(base + '/claims');
  await mobile.getByRole('heading', { name: 'Reviewers are waiting on you' }).waitFor();
  await shot(mobile, 'd05-claims-overview-evidence-requested-mobile');
  await page.goto(base + '/claims/' + caseId);
  await page.getByText('Respond to an evidence request').waitFor();
  await page.getByRole('button', { name: 'Respond to this request' }).click();
  await page.getByText('Proof for this request').waitFor();
  await page
    .getByLabel('Attach proof file')
    .setInputFiles({ name: 'oversized.txt', mimeType: 'text/plain', buffer: Buffer.alloc(16001) });
  await page.getByRole('alert').filter({ hasText: 'Proof exceeds 16 KB' }).waitFor();
  check(
    await page.getByRole('button', { name: 'Submit linked proof', exact: true }).isDisabled(),
    'Inline response rejects oversized proof',
  );
  await page
    .getByLabel('Attach proof file')
    .setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff]) });
  await page.getByRole('alert').filter({ hasText: 'Only valid UTF-8' }).waitFor();
  check(
    await page.getByRole('button', { name: 'Submit linked proof', exact: true }).isDisabled(),
    'Inline response rejects invalid UTF-8',
  );
  await shot(page, 'd06-dossier-inline-response-validation-desktop');
  await mobile.goto(base + '/claims/' + caseId);
  await mobile.getByText('Respond to an evidence request').waitFor();
  await shot(mobile, 'd06-dossier-evidence-requested-mobile');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  // 5. Insured agent responds through the SDK, linked to the request.
  await sdk.submitProof(caseId, {
    requestKey: randomUUID(),
    requestId,
    filename: 'requested-fixture.json',
    content: CLAIM_FIXTURE.raw,
    declaredSource: 'Agent response to ' + requestId,
  });
  view = await inspect();
  const response = view.entries
    .filter((e) => e.kind === 'proof_submission' && e.payload.requestId === requestId)
    .at(-1)!;
  check(
    !!response &&
      response.payload.contentHash === CLAIM_FIXTURE.digest &&
      (response.payload.submitter as any).wallet === agent.address.toLowerCase(),
    'Agent response persists exact bytes, hash and agent identity linked to the request',
  );

  // 6. Reviewer resolves after reading the response.
  await review.goto(base + '/claims/review');
  await review.getByText('Resolve request first').waitFor();
  await shot(review, 'd07-workbench-response-awaiting-review-desktop');
  await review.goto(base + '/claims/' + caseId);
  await review.getByText('Review the claimant response').waitFor();
  await review
    .getByLabel('Investigation message or reviewer rationale')
    .fill(
      'Human reviewed the requested synthetic bytes and their case/request provenance; no independent event proof is asserted.',
    );
  await shot(review, 'd08-dossier-reviewer-resolving-desktop');
  await review
    .getByRole('button', { name: 'Resolve request after human review', exact: true })
    .click();
  for (let i = 0; i < 40 && (await inspect()).outstandingRequests.length; i++)
    await new Promise((r) => setTimeout(r, 100));
  check(
    (await inspect()).outstandingRequests.length === 0,
    'Human resolution closes the request while retaining submissions',
  );

  // 7. Reverification, then examiner reassessment.
  await page.reload();
  await page
    .getByRole('button', { name: 'Attach and verify synthetic fixture', exact: true })
    .click();
  await page.getByText('completed · Evidence sufficient', { exact: true }).first().waitFor();
  check(true, 'Deterministic reverification recorded and shown separately from AI advice');
  await sdk.requestExamination(caseId);
  await worker('reassessment');
  await page.getByRole('button', { name: 'Refresh investigation', exact: true }).click();
  await page.locator('[data-entry-kind="examiner_report"]').nth(1).waitFor();
  view = await inspect();
  const reports = view.entries.filter((e) => e.kind === 'examiner_report');
  check(
    reports.length === 2 && reports.at(-1)!.payload.dossierDigest === view.dossierDigest,
    'Reassessment uses current dossier and retains earlier report',
  );
  await page.reload();
  await page.getByText('Verified by the server').waitFor();
  await shot(page, 'd09-dossier-reverified-reassessed-desktop');

  // 8. Human decision with rationale; approved but unpaid.
  await review.goto(base + '/claims/review');
  await review.getByText('Approve or deny').waitFor();
  await shot(review, 'd10-workbench-ready-for-decision-desktop');
  await review.goto(base + '/claims/' + caseId);
  const approve = review.getByRole('button', {
    name: 'Review and approve up to 1 USDC',
    exact: true,
  });
  await approve.waitFor();
  await review.getByText('Ready for your decision').waitFor();
  check(
    await approve.isDisabled(),
    'Approval stays disabled until contractual confirmation and rationale',
  );
  await review.getByRole('checkbox').check();
  await review
    .getByLabel('Contractual review rationale')
    .fill(
      'Human evaluated fixture replay, applicable event, timing, registered exposure, all exclusions and zero recoveries. Synthetic-only adjudication, no real-world loss proof or reimbursement.',
    );
  await approve.click();
  for (let i = 0; i < 50 && repo.getClaimsCase(caseId)?.status !== 'APPROVED'; i++)
    await new Promise((r) => setTimeout(r, 100));
  const final = repo.getClaimsCase(caseId)!;
  check(
    final.status === 'APPROVED' && final.settlementAuthorization === 'pending_authority',
    'Human decision is APPROVED with pending authority, never reimbursed',
  );
  await review.getByRole('button', { name: 'Reload claim and findings', exact: true }).click();
  await review.getByText('Approved · not reimbursed').first().waitFor();
  await review.getByText('Coverage approved', { exact: true }).waitFor();
  check(
    (await review.getByText('Payment confirmed').count()) === 0,
    'No payment-confirmed language appears for the approved claim',
  );
  await shot(review, 'd11-dossier-approved-unpaid-reviewer-desktop');
  const reviewMobile = await ops.newPage();
  await reviewMobile.setViewportSize({ width: 390, height: 844 });
  watch(reviewMobile, 'reviewer-mobile');
  await reviewMobile.goto(base + '/claims/' + caseId);
  await reviewMobile.getByText('Approved · not reimbursed').first().waitFor();
  await shot(reviewMobile, 'd11-dossier-approved-unpaid-mobile');
  await page.goto(base + '/claims');
  await page.locator(`a[href="/claims/${caseId}"]`).waitFor();
  await shot(page, 'd12-claims-overview-approved-desktop');
  await mobile.goto(base + '/claims/review');
  await shot(mobile, 'd12-workbench-claimant-session-mobile');
  await reviewMobile.goto(base + '/claims/review');
  await reviewMobile.getByText('Signed in · reviewer').waitFor();
  await shot(reviewMobile, 'd13-workbench-settlement-handoff-mobile');

  const denied = await fetch(base + '/api/claims/cases/' + caseId, {
    method: 'POST',
    headers: {
      origin: base,
      'content-type': 'application/json',
      authorization: `Bearer ${authorityToken}`,
    },
    body: JSON.stringify({ action: 'prepare_settlement' }),
  });
  check(
    denied.status === 400 && (await denied.json()).error.includes('Synthetic/fixture'),
    'Fixture API still denies settlement preparation',
  );

  // 9. Guided filing through the browser (second synthetic claim).
  await page.goto(base + '/claims/new');
  await page.getByRole('heading', { name: 'Which policy covered the agent?' }).waitFor();
  await shot(page, 'd14-file-claim-policy-desktop');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'What happened, and when?' }).waitFor();
  check(
    await page.getByRole('button', { name: 'Continue' }).isDisabled(),
    'Incident step requires a reference and time',
  );
  await page
    .getByLabel('Canonical synthetic incident reference')
    .fill('synthetic:premium-phase-d:browser-filing');
  const local = new Date(Date.now() - 120000 - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel('Incident time').fill(local);
  await shot(page, 'd15-file-claim-incident-desktop');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Attach initial proof' }).waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Review and file' }).waitFor();
  await shot(page, 'd16-file-claim-review-desktop');
  await mobile.goto(base + '/claims/new');
  await mobile.getByRole('heading', { name: 'Which policy covered the agent?' }).waitFor();
  await shot(mobile, 'd16-file-claim-policy-mobile');
  await page.getByRole('button', { name: 'Submit claim case' }).click();
  await page.waitForURL(/\/claims\/[0-9a-f-]{36}$/);
  const filedId = page.url().split('/').at(-1)!;
  await page.getByText('Server-checked chronology', { exact: false }).waitFor();
  const filed = repo.getClaimsCase(filedId)!;
  check(
    filed && filed.claimantRef === owner.address.toLowerCase() && filed.syntheticDemo,
    'Browser filing opens a synthetic case under the authenticated policyholder',
  );
  await shot(page, 'd17-filed-claim-resulting-state-desktop');

  // 10. Failure and empty states.
  await page.route('**/api/claims/cases', (route: any) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Claims store unavailable"}',
        })
      : route.continue(),
  );
  await page.goto(base + '/claims');
  await page.getByText('Claims could not be loaded').waitFor();
  await shot(page, 'd18-FAILURE-claims-list-desktop');
  await page.unroute('**/api/claims/cases');
  await page.goto(base + '/claims/00000000-0000-4000-8000-000000000000');
  await page.getByText('This claim could not be opened').waitFor();
  await shot(page, 'd19-FAILURE-claim-not-found-desktop');
  const stranger = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await stranger.route('**/*', (route: any) =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(base + '/claims');
  await strangerPage.getByText('Connect your wallet and sign in').waitFor();
  await shot(strangerPage, 'd20-EMPTY-claims-signed-out-desktop');
  await walletSession(stranger, privateKeyToAccount(generatePrivateKey()));
  await strangerPage.goto(base + '/claims');
  await strangerPage.getByText('No claims yet').waitFor();
  await shot(strangerPage, 'd21-EMPTY-claims-no-claims-desktop');
  await strangerPage.setViewportSize({ width: 390, height: 844 });
  await strangerPage.goto(base + '/claims/new');
  await strangerPage.getByText('No policy can take a claim right now').waitFor();
  await shot(strangerPage, 'd22-EMPTY-file-claim-no-policy-mobile');
  await stranger.close();

  check(
    Object.values(overflow).every((v) => v <= 0),
    'No horizontal overflow on any captured page: ' + JSON.stringify(overflow),
  );
  check(consoleErrors.length === 0, 'No browser console errors: ' + consoleErrors.join(' | '));
  check(
    db
      .prepare("SELECT count(*) n FROM claims_cases WHERE status IN ('PAID','SETTLEMENT_PENDING')")
      .get().n === 0,
    'No paid or settlement-pending claims exist',
  );
  completed = true;
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((c: any) => c.pages());
    if (pages.length)
      await pages
        .at(-1)
        .screenshot({ path: join(out, 'failure.png'), fullPage: true })
        .catch(() => {});
  }
  throw error;
} finally {
  if (reviewerBrowser) await reviewerBrowser.close();
  if (browser) await browser.close();
  await stop();
  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify(
      {
        completed,
        caseId,
        boundary: liveOpenAI
          ? 'Actual app/browser/SDK/verifier plus explicitly enabled live OpenAI inference in separate worker. Fixture app holds no provider key.'
          : 'Actual production fixture app, HTTP, authentication, SDK, verifier, SQLite and browser. Only OpenAI transport mocked; zero paid inference calls.',
        modelCalls,
        providerResponses,
        estimatedSpendMicros,
        source: { id, digest: seed.digest, checkpoint: seed.snapshot.checkpoint },
        finalCase: caseId ? repo.getClaimsCase(caseId) : null,
        entries: caseId ? repo.listInvestigationEntries(caseId) : [],
        migrations: db.prepare('SELECT id FROM schema_migrations').all(),
        integrity: db.pragma('integrity_check'),
        foreignKeys: db.pragma('foreign_key_check'),
        results,
      },
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    ),
  );
  db.close();
  closeSync(log);
  rmSync(dir, { recursive: true, force: true });
}
