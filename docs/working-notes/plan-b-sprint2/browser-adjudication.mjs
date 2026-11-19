/** Mocked UI only; backend/contract boundaries are exercised separately. No transaction methods. */
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const base = process.env.BASE_URL || 'http://127.0.0.1:3042';
const results = [];
function check(ok, detail) {
  if (!ok) throw new Error(detail);
  results.push({ status: 'PASS', detail });
  console.log('PASS ' + detail);
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME_PATH,
});
try {
  const page = await browser.newPage();
  let role = 'reviewer',
    verified = false,
    status = 'COLLECTING_EVIDENCE';
  const writes = [];
  const detail = () => ({
    principalRole: role,
    fixtureCatalog: {
      reference: 'catalog-v1',
      digest: 'sha256:catalog',
      raw: '{"synthetic":true}',
    },
    linkedIncident: { id: 'incident', observedAt: '2026-11-18T10:00:00.000Z' },
    verifications: verified
      ? [
          {
            id: 'persisted-verification',
            executionStatus: 'completed',
            evidenceSufficiency: 'sufficient',
            independentlyAuthenticated: false,
            findings: ['Fixture consistency only; not external authentication.'],
          },
        ]
      : [],
    case: {
      id: 'sprint2-browser',
      status,
      syntheticDemo: true,
      evidenceAuthenticity: 'synthetic_fixture',
      coverageDetermination: 'unknown',
      settlementAuthorization: 'none',
      verifiedLoss: { usdc: null },
      recoveries: { usdc: null },
      payable: { usdc: null, micros: null },
      lossKey: null,
      evidenceRoot: null,
      payoutTo: '0x1111111111111111111111111111111111111111',
      adjudicationBindingJson: null,
      reviewReasonCode: null,
      denialReasonCode: null,
      authorityActor: null,
      labels: { synthetic: 'SYNTHETIC FIXTURE — consistency only' },
      policyId: 'policy',
      exposureId: 'exposure',
      claimantRef: 'claimant',
    },
    timeline: [],
    evidenceManifests: [],
  });
  await page.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const respond = (value) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/api/session/me')
      return respond({
        version: 1,
        state: 'authenticated',
        role,
        wallet: null,
        chainId: 5042002,
        capabilities: [],
      });
    if (url.pathname.startsWith('/api/claims/cases')) {
      if (req.method() === 'GET') return respond(detail());
      const body = req.postDataJSON();
      writes.push({ path: url.pathname, body });
      if (body.action === 'complete_evidence') status = 'INVESTIGATING';
      if (url.pathname.endsWith('/verification')) verified = true;
      return respond({ case: detail().case, verification: detail().verifications[0] });
    }
    if (url.pathname.startsWith('/api/')) return respond({});
    return route.continue();
  });
  await page.goto(base + '/claims/sprint2-browser');
  const approve = page.getByRole('button', {
    name: 'Review and approve up to 1 USDC',
    exact: true,
  });
  await approve.waitFor();
  check(
    await approve.isDisabled(),
    'Approval disabled before persisted verification and human review',
  );
  await page
    .getByRole('button', { name: 'Attach and verify synthetic fixture', exact: true })
    .click();
  await page
    .getByText('Fixture consistency only; not external authentication.', { exact: true })
    .waitFor();
  check(
    writes.map((x) => x.body.action || 'verify').join(',') ===
      'attach_evidence,complete_evidence,verify',
    'Fixture action attaches, completes collection and persists verification without adjudication',
  );
  check(
    await approve.isDisabled(),
    'Successful fixture verification leaves human approval disabled',
  );
  await page.getByRole('checkbox').check();
  await page
    .getByRole('textbox', { name: 'Contractual review rationale' })
    .fill('Reviewed event applicability and all synthetic policy exclusions.');
  check(
    await approve.isEnabled(),
    'Explicit contractual review and rationale enable reviewer decision',
  );
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/claims/cases/sprint2-browser') && r.request().method() === 'POST',
    ),
    approve.click(),
  ]);
  const decision = writes.find((x) => x.body.action === 'adjudicate')?.body;
  check(
    decision?.verificationId === 'persisted-verification' &&
      decision.verifiedLossUsdc === '1.500000' &&
      decision.recoveriesUsdc === '0.000000' &&
      decision.contractualReview.exclusionsResolved,
    'Decision carries persisted verification, catalog economics and human contractual findings',
  );
  role = 'claimant';
  await page.reload();
  await page
    .getByText('Fixture consistency only; not external authentication.', { exact: true })
    .waitFor();
  check(
    (await page
      .getByRole('button', { name: 'Review and approve up to 1 USDC', exact: true })
      .count()) === 0,
    'Claimants see findings without reviewer approval controls',
  );
  fs.writeFileSync(
    process.env.OUT_FILE || '/tmp/arcuex-sprint2-adjudication-browser.json',
    JSON.stringify(results, null, 2) + '\n',
  );
} finally {
  await browser.close();
}
