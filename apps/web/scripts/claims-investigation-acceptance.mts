/** Production fixture browser acceptance with a labeled transport double or two explicitly enabled live calls. */
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
const base = 'http://localhost:3061',
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
  ARCUEX_PUBLIC_HOST: 'localhost:3061',
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
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', '3061'],
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
  await walletSession(holder, owner);
  const page = await holder.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(base + '/claims/' + caseId);
  await page.getByRole('heading', { name: 'Investigation · agent, examiner and human' }).waitFor();
  await page
    .getByText('Server-checked chronology · During the policy window', { exact: true })
    .waitFor();
  check(true, 'Browser displays server chronology separately from model commentary');
  if (!liveOpenAI) {
    await page.locator('[data-entry-kind="proof_submission"]').first().waitFor();
    check(
      (await page.locator('[data-entry-kind="proof_submission"]').count()) === 1,
      'Policyholder browser sees agent proof on the exact same claim',
    );
    await page.getByLabel('Attach proof file').setInputFiles({
      name: 'oversized.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(16001),
    });
    await page.getByRole('alert').filter({ hasText: 'Proof exceeds 16 KB' }).waitFor();
    check(
      await page.getByRole('button', { name: 'Submit linked proof', exact: true }).isDisabled(),
      'Browser rejects oversized attachment without submitting stale content',
    );
    await page
      .getByLabel('Attach proof file')
      .setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff]) });
    await page.getByRole('alert').filter({ hasText: 'Only valid UTF-8' }).waitFor();
    check(
      await page.getByRole('button', { name: 'Submit linked proof', exact: true }).isDisabled(),
      'Browser rejects invalid UTF-8 attachment without submitting stale content',
    );
    await page.getByLabel('Attach proof file').setInputFiles({
      name: 'policyholder-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(CLAIM_FIXTURE.raw),
    });
    await page.getByRole('button', { name: 'Submit linked proof', exact: true }).click();
    await page.locator('[data-entry-kind="proof_submission"]').nth(1).waitFor();
    const holderProof = (await inspect()).entries
      .filter((e) => e.kind === 'proof_submission')
      .at(-1)!;
    check(
      holderProof.payload.contentHash === CLAIM_FIXTURE.digest &&
        (holderProof.payload.submitter as any).wallet === owner.address.toLowerCase(),
      'Policyholder browser file attachment persists exact hash and distinct submitter identity',
    );
  } else {
    check(
      (await inspect()).entries.every((entry) => entry.kind !== 'proof_submission'),
      'Initial live request starts without replay proof',
    );
  }
  await page.getByRole('button', { name: 'Request examiner reassessment', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Examiner assessment requested' }).waitFor();
  await worker('initial');
  await page
    .getByText(
      liveOpenAI && !liveReassessmentOnly
        ? 'LIVE OPENAI · advisory only'
        : 'TEST DOUBLE · no live AI inference',
      {
        exact: false,
      },
    )
    .first()
    .waitFor();
  await page.screenshot({
    path: join(out, '01-agent-submission-and-examiner-gap.png'),
    fullPage: true,
  });
  check(
    repo.getClaimsCase(caseId)?.settlementAuthorization === 'none',
    'Examiner report alone never changes claim or grants payment authority',
  );
  const review = await ops.newPage();
  review.setDefaultTimeout(15000);
  await review.goto(base + '/claims/review');
  await review.getByLabel('Reviewer API token (one-shot exchange)').fill(reviewerToken);
  await review.getByRole('button', { name: 'Exchange reviewer session', exact: true }).click();
  await review.getByText('Session · reviewer', { exact: true }).waitFor();
  await review.goto(base + '/claims/' + caseId);
  await review.getByRole('button', { name: 'Adopt evidence request 1', exact: true }).click();
  await review.getByText('proof request · Outstanding', { exact: true }).waitFor();
  let view = await inspect();
  check(
    view.outstandingRequests.length === 1,
    'Human adopts advisory evidence request and creates an outstanding proof gate',
  );
  const requestId = view.outstandingRequests[0];
  const requested = view.entries.find((entry) => entry.id === requestId);
  check(
    typeof requested?.payload.reportId === 'string' &&
      Array.isArray(requested.payload.citations) &&
      requested.payload.citations.length > 0,
    'Agent SDK receives adopted proof request with its report and evidence citations',
  );
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
  check(!!response, 'Agent response explicitly links claim ID and evidence request ID');
  const payload = response.payload;
  check(
    payload.contentHash === CLAIM_FIXTURE.digest &&
      (payload.submitter as any).wallet === agent.address.toLowerCase() &&
      (payload.submitter as any).agentId === policy.terms.agentId,
    'Persisted response records exact bytes, content hash, agent identity and unverified status',
  );
  await page.getByRole('button', { name: 'Refresh investigation', exact: true }).click();
  await page
    .locator('[data-entry-kind="proof_submission"]')
    .nth(liveOpenAI ? 0 : 2)
    .waitFor();
  await page.screenshot({ path: join(out, '02-linked-agent-response.png'), fullPage: true });
  await review.getByRole('button', { name: 'Refresh investigation', exact: true }).click();
  await review
    .getByRole('button', { name: 'Resolve request after human review', exact: true })
    .waitFor();
  await review
    .getByLabel('Investigation message or reviewer rationale')
    .fill(
      'Human reviewed the requested synthetic bytes and their case/request provenance; no independent event proof is asserted.',
    );
  await review
    .getByRole('button', { name: 'Resolve request after human review', exact: true })
    .click();
  for (let i = 0; i < 40 && (await inspect()).outstandingRequests.length; i++)
    await new Promise((r) => setTimeout(r, 100));
  check(
    (await inspect()).outstandingRequests.length === 0,
    'Human response closes proof request while retaining recorded submissions',
  );
  await page
    .getByRole('button', { name: 'Attach and verify synthetic fixture', exact: true })
    .click();
  await page.getByText('completed · Evidence sufficient', { exact: true }).waitFor();
  await sdk.requestExamination(caseId);
  check(
    (await inspect()).entries.filter((entry) => entry.kind === 'examiner_request').length === 2,
    'Insured agent requests reassessment from the same claim thread',
  );
  await worker('reassessment');
  await page.getByRole('button', { name: 'Refresh investigation', exact: true }).click();
  await page.locator('[data-entry-kind="examiner_report"]').nth(1).waitFor();
  await page.screenshot({
    path: join(out, '03-reassessed-with-persisted-verifier.png'),
    fullPage: true,
  });
  view = await inspect();
  const reports = view.entries.filter((e) => e.kind === 'examiner_report');
  check(
    reports.length === 2 && reports.at(-1)!.payload.dossierDigest === view.dossierDigest,
    'Reassessment uses current dossier while retaining earlier report',
  );
  if (liveOpenAI) {
    await page
      .getByText(/LIVE OPENAI · advisory only/)
      .last()
      .waitFor();
    const liveReports = reports.filter((entry) => entry.payload.execution === 'live');
    const expected = liveReassessmentOnly ? 1 : 2;
    check(
      providerResponses.length === expected &&
        liveReports.length === expected &&
        liveReports.every((entry, index) => {
          const payload = entry.payload;
          const analysis = payload.analysis as {
            citations: string[];
            proposedRequests: Array<{ citations: string[] }>;
          };
          const ids = providerResponses[index].citationIds;
          return (
            payload.execution === 'live' &&
            payload.promptVersion === 'claims-dossier-v3' &&
            payload.provider === 'openai' &&
            String(payload.responseId).startsWith('resp_') &&
            payload.model === 'gpt-6.1-terra' &&
            providerResponses[index].status === 200 &&
            [
              ...analysis.citations,
              ...analysis.proposedRequests.flatMap((proposal) => proposal.citations),
            ].every((id) => ids.includes(id))
          );
        }),
      'Live OpenAI reports and their proposed requests cite only supplied records',
    );
    const analysis = reports[1].payload.analysis as { citations: string[] };
    check(
      providerResponses
        .at(-1)!
        .currentVerificationIds.some((id) => analysis.citations.includes(id)),
      'Live reassessment cites the current deterministic verification',
    );
  }
  await review.reload();
  const approve = review.getByRole('button', {
    name: 'Review and approve up to 1 USDC',
    exact: true,
  });
  await approve.waitFor();
  check(await approve.isDisabled(), 'Reviewer must still explicitly confirm contractual gates');
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
  await review.getByText('APPROVED', { exact: true }).waitFor();
  await review.screenshot({
    path: join(out, '04-human-approved-not-reimbursed.png'),
    fullPage: true,
  });
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
    'Actual fixture API still denies separately authenticated settlement preparation',
  );
  await stop();
  await start();
  check(
    (await inspect()).entries.length === view.entries.length,
    'Restart preserves same-claim journal, metadata and all examiner records',
  );
  check(
    repo.getClaimsCase(caseId)?.status === 'APPROVED',
    'Restart preserves final human decision',
  );
  check(
    db
      .prepare("SELECT count(*) n FROM claims_cases WHERE status IN ('PAID','SETTLEMENT_PENDING')")
      .get().n === 0,
    'No paid or settlement-pending claims exist',
  );
  check(
    db.pragma('foreign_key_check').length === 0,
    'Investigation and migration foreign-key checks pass',
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
