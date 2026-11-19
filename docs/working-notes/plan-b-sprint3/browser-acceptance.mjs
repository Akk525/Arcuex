import fs from 'node:fs';
import path from 'node:path';
export async function run({
  browser,
  base,
  out,
  owner,
  reviewerToken,
  authorityToken,
  policy,
  agent,
  catalog,
  db,
  checkpoint,
  results,
}) {
  const check = (ok, detail) => {
    if (!ok) throw new Error(detail);
    results.push({ status: 'PASS', detail });
    console.log('PASS ' + detail);
  };
  const shot = async (page, name) => {
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'UTC',
  });
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(u.hostname) ? route.continue() : route.abort();
  });
  await context.exposeBinding('syntheticSign', async (_source, message) =>
    owner.signMessage({ message: { raw: message } }),
  );
  await context.addInitScript(
    ({ wallet }) => {
      localStorage.setItem('arcuex:workspace', 'protect');
      window.ethereum = {
        isMetaMask: true,
        on() {},
        removeListener() {},
        async request({ method, params }) {
          if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [wallet];
          if (method === 'eth_chainId') return '0x4cef52';
          if (method === 'personal_sign') return window.syntheticSign(params[0]);
          if (['wallet_requestPermissions', 'wallet_getPermissions'].includes(method))
            return [{ parentCapability: 'eth_accounts' }];
          throw new Error('No transaction or additional wallet method authorized: ' + method);
        },
      };
    },
    { wallet: owner.address },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const json = async (request, url, data) => {
    const response = await request.post(base + url, { data, headers: { origin: base } });
    const body = await response.json();
    return { status: response.status(), body };
  };
  try {
    await page.goto(base + '/policies');
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('Signed in', { exact: true }).waitFor();
    const me = await (await context.request.get(base + '/api/session/me')).json();
    check(
      me.state === 'authenticated' &&
        me.role === 'claimant' &&
        me.wallet === owner.address.toLowerCase(),
      'Real signed nonce authenticates policyholder via httpOnly cookie',
    );
    check(
      (await context.cookies()).some((c) => c.httpOnly && c.secure),
      'Session cookie is HttpOnly and Secure',
    );
    await shot(page, '01-policyholder-session');
    await page.goto(base + '/policies/' + policy.terms.policyId);
    await page.getByRole('button', { name: 'Refresh my policies', exact: true }).click();
    await page.getByRole('link', { name: 'Submit a synthetic claim', exact: true }).waitFor();
    check(
      (
        await (
          await context.request.get(base + `/api/policies/${policy.terms.policyId}/lifecycle`)
        ).json()
      ).claimsEligible === true,
      'Real policy projection is confirmed and eligible against synthetic checkpoint',
    );
    await shot(page, '02-policy-eligible');
    await page.getByRole('link', { name: 'Submit a synthetic claim', exact: true }).click();
    await page
      .getByLabel('Canonical synthetic incident reference')
      .fill('synthetic:sprint3:eligible');
    await page
      .getByLabel('Incident time')
      .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16));
    {
      const option = page.getByRole('checkbox', { name: 'Use the supported synthetic fixture' });
      if (await option.count()) await option.check();
      else await page.getByLabel('Supporting evidence (raw)').fill(catalog.raw);
    }
    await shot(page, '03-incident-intake');
    await page.getByRole('button', { name: 'Submit claim case', exact: true }).click();
    await page.waitForURL(/\/claims\/[0-9a-f-]{36}$/);
    const caseId = page.url().split('/').pop(),
      detailUrl = `/api/claims/cases/${caseId}`;
    check(
      !!db.prepare('SELECT id FROM claims_cases WHERE id=?').get(caseId),
      'Browser submission persists real linked claim/incident state',
    );
    await page
      .getByRole('button', { name: 'Attach and verify synthetic fixture', exact: true })
      .click();
    await page.getByText('completed · Evidence sufficient', { exact: true }).waitFor();
    let detail = await (await context.request.get(base + detailUrl)).json();
    check(
      detail.verifications.length === 1 && !detail.verifications[0].independentlyAuthenticated,
      'Server persists fixture consistency and explicit absence of real-world authentication',
    );
    check(
      detail.case.status === 'INVESTIGATING' && detail.case.settlementAuthorization === 'none',
      'Successful verification leaves investigation open without coverage/payment authority',
    );
    await shot(page, '04-fixture-verified-investigating');
    const unauthorized = await json(context.request, detailUrl, {
      action: 'adjudicate',
      coverageDetermination: 'covered',
      requestedUsdc: '1',
    });
    check(unauthorized.status === 403, 'Policyholder cannot adjudicate through real API');
    check(
      (await page
        .getByRole('button', { name: 'Review and approve up to 1 USDC', exact: true })
        .count()) === 0,
      'Claimant browser has no approval controls',
    );
    const ops = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      timezoneId: 'UTC',
    });
    await ops.route('**/*', (route) =>
      ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
        ? route.continue()
        : route.abort(),
    );
    const review = await ops.newPage();
    await review.goto(base + '/claims/review');
    await review.getByLabel('Reviewer API token (one-shot exchange)').fill(reviewerToken);
    await review.getByRole('button', { name: 'Exchange reviewer session', exact: true }).click();
    await review.getByText('Session · reviewer', { exact: true }).waitFor();
    check(
      (await (await ops.request.get(base + '/api/session/me')).json()).role === 'reviewer',
      'Real ops token exchange establishes authorized reviewer cookie session',
    );
    await shot(review, '05-reviewer-session');
    await review.goto(base + '/claims/' + caseId);
    const approve = review.getByRole('button', {
      name: 'Review and approve up to 1 USDC',
      exact: true,
    });
    await approve.waitFor();
    check(
      await approve.isDisabled(),
      'Reviewer approval disabled until explicit contractual confirmation and rationale',
    );
    await review.getByRole('checkbox').check();
    await review
      .getByRole('textbox', { name: 'Contractual review rationale' })
      .fill(
        'Reviewed catalog fixture, insured event, policy timing, registered exposure and all exclusions. Recoveries and compensation are resolved zero in this synthetic scenario.',
      );
    await Promise.all([
      review.waitForResponse((r) => r.url().endsWith(detailUrl) && r.request().method() === 'GET'),
      approve.click(),
    ]);
    detail = await (await ops.request.get(base + detailUrl)).json();
    check(
      detail.case.status === 'APPROVED' &&
        detail.case.payable.micros === '1000000' &&
        detail.case.settlementAuthorization === 'pending_authority',
      'Fully specified fixture becomes APPROVED with 1 USDC proposed payable and separate authority gate',
    );
    check(
      JSON.parse(detail.case.adjudicationBindingJson).reviewer.contractualReview.rationale.includes(
        'Reviewed catalog',
      ),
      'Persisted decision contains reviewer identity, contractual rationale and frozen economics',
    );
    check(
      detail.timeline.some((e) => e.toStatus === 'APPROVED'),
      'Real investigation history retains reviewer decision',
    );
    await shot(review, '06-approved-not-reimbursed');
    // Further states use real HTTP routes with the same cookie identities; no mocked application responses.
    const post = async (url, data) => json(context.request, url, data);
    const reviewPost = async (url, data) => json(ops.request, url, data);
    const newCase = async (suffix) => {
      checkpoint();
      const opened = await post('/api/claims/cases', {
        action: 'open',
        policyId: policy.terms.policyId,
        exposureId: agent.id,
        idempotencyKey: crypto.randomUUID(),
        claimantRef: owner.address,
        syntheticDemo: true,
        observedEventRef: 'synthetic:sprint3:' + suffix,
        observedAt: new Date(Date.now() - 60000).toISOString(),
      });
      check(opened.status === 200, 'Real authenticated intake creates ' + suffix + ' case');
      return opened.body.case;
    };
    const envelope = (c) => ({
      fixtureRef: catalog.reference,
      fixtureDigest: catalog.digest,
      policyId: c.policyId,
      incidentId: c.incidentId,
      observedAt: db.prepare('SELECT observed_at FROM incidents WHERE id=?').get(c.incidentId)
        .observed_at,
    });
    const attach = (c) =>
      post('/api/claims/cases', {
        action: 'attach_evidence',
        caseId: c.id,
        evidence: {
          source: 'synthetic-fixture',
          provenance: catalog.reference,
          rawEvidence: catalog.raw,
          verificationMethod: 'fixture_consistency',
          sourceReliability: 'demo_only',
          syntheticFixture: true,
        },
      });
    const verified = async (c) => {
      await attach(c);
      await post('/api/claims/cases', {
        action: 'complete_evidence',
        caseId: c.id,
        evidenceComplete: true,
      });
      const r = await post(`/api/claims/cases/${c.id}/verification`, envelope(c));
      check(r.status === 200, 'Real verifier executes ' + c.id);
      return r.body.verification;
    };
    const decision = (c, v) => ({
      action: 'adjudicate',
      coverageDetermination: 'covered',
      verificationId: v?.id,
      contractualReview: {
        eventApplies: true,
        exclusionsResolved: true,
        rationale: 'Synthetic scenario contractual checks resolved by human reviewer.',
      },
      verifiedLossUsdc: '1.5',
      recoveriesUsdc: '0',
      requestedUsdc: '1',
    });
    const missing = await newCase('missing');
    await post('/api/claims/cases', {
      action: 'complete_evidence',
      caseId: missing.id,
      evidenceComplete: false,
    });
    await review.goto(base + '/claims/' + missing.id);
    await review.getByText('Review reason: INCOMPLETE_EVIDENCE', { exact: true }).waitFor();
    check(
      db.prepare('SELECT status,payable_micros FROM claims_cases WHERE id=?').get(missing.id)
        .payable_micros === null,
      'Missing evidence remains REVIEW without payable',
    );
    await shot(review, '07-review-missing-evidence');
    const contradictory = await newCase('contradictory');
    const v = await verified(contradictory);
    await post(`/api/claims/cases/${contradictory.id}/verification`, {
      ...envelope(contradictory),
      policyId: 'wrong-policy',
    });
    const negative = await reviewPost(
      `/api/claims/cases/${contradictory.id}`,
      decision(contradictory, v),
    );
    check(
      negative.body.case.reviewReasonCode === 'UNRESOLVED_VERIFICATION_FINDINGS',
      'Contradictory evidence cannot be bypassed by choosing prior successful verification',
    );
    await review.goto(base + '/claims/' + contradictory.id);
    await review
      .getByText('Review reason: UNRESOLVED_VERIFICATION_FINDINGS', { exact: true })
      .waitFor();
    await shot(review, '08-review-contradictory-evidence');
    const financial = await newCase('recoveries');
    const fv = await verified(financial);
    const incomplete = await reviewPost(`/api/claims/cases/${financial.id}`, {
      ...decision(financial, fv),
      recoveriesUsdc: null,
    });
    check(
      incomplete.body.case.status === 'REVIEW' &&
        incomplete.body.case.reviewReasonCode === 'UNRESOLVED_RECOVERIES',
      'Unresolved recoveries prohibit approval and any payable amount',
    );
    await review.goto(base + '/claims/' + financial.id);
    await review.getByText('Review reason: UNRESOLVED_RECOVERIES', { exact: true }).waitFor();
    await shot(review, '09-review-unresolved-recoveries');
    const stale = await newCase('stale-evidence');
    const sv = await verified(stale);
    await post('/api/claims/cases', {
      action: 'attach_evidence',
      caseId: stale.id,
      evidence: {
        source: 'late',
        provenance: 'synthetic-extra',
        rawEvidence: 'changed evidence',
        verificationMethod: 'fixture_consistency',
        sourceReliability: 'demo_only',
        syntheticFixture: true,
      },
    });
    const sr = await reviewPost(`/api/claims/cases/${stale.id}`, decision(stale, sv));
    check(
      sr.body.case.status === 'REVIEW' &&
        sr.body.case.reviewReasonCode === 'STALE_VERIFICATION_CONTEXT',
      'Reviewer action with stale evidence context cannot approve',
    );
    await review.goto(base + '/claims/' + stale.id);
    await review.getByText('Review reason: STALE_VERIFICATION_CONTEXT', { exact: true }).waitFor();
    await shot(review, '10-review-stale-evidence');
    const unauthorizedAgain = await post(
      `/api/claims/cases/${financial.id}`,
      decision(financial, fv),
    );
    check(
      unauthorizedAgain.status === 403,
      'Caller-selected reviewer fields do not escalate policyholder privileges',
    );
    const replay = await reviewPost(detailUrl, decision({ id: caseId }, detail.verifications[0]));
    check(replay.status === 400, 'Already approved case rejects a repeated reviewer decision');
    db.transaction(() =>
      db
        .prepare(
          "UPDATE claims_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE role='reviewer'",
        )
        .run(),
    )();
    const expired = await reviewPost(`/api/claims/cases/${financial.id}`, decision(financial, fv));
    check(expired.status === 401, 'Expired reviewer session is rejected by real authentication');
    await review.reload();
    await review.getByText('Sign in required', { exact: false }).first().waitFor();
    await shot(review, '11-expired-reviewer-session');
    checkpoint(false);
    await page.goto(base + '/policies/' + policy.terms.policyId);
    await page.getByRole('button', { name: 'Refresh my policies', exact: true }).click();
    await page
      .getByText('Reconciliation pending — no coverage confirmed', { exact: true })
      .waitFor();
    check(
      (await page.getByRole('link', { name: 'Submit a synthetic claim', exact: true }).count()) ===
        0,
      'Stale reconciliation hides claim next step',
    );
    await shot(page, '12-stale-policy-eligibility');
    checkpoint();
    const authContext = await browser.newContext();
    const auth = await json(authContext.request, '/api/claims/auth/ops-login', {
      role: 'authority',
    });
    check(auth.status === 401, 'Authority endpoint requires a separately provisioned credential');
    const exchange = await authContext.request.post(base + '/api/claims/auth/ops-login', {
      headers: { origin: base, authorization: `Bearer ${authorityToken}` },
      data: { role: 'authority' },
    });
    check(
      exchange.ok(),
      'Separate authority session established without any financial signing key',
    );
    const confirmed = detail.case;
    const blocked = await json(authContext.request, detailUrl, {
      action: 'prepare_settlement',
      confirmedRecipient: confirmed.payoutTo,
      confirmedAmountUsdc: confirmed.payable.usdc,
      confirmedLossKey: confirmed.lossKey,
      confirmedEvidenceRoot: confirmed.evidenceRoot,
    });
    check(
      blocked.status === 400 &&
        blocked.body.error.includes('Synthetic/fixture evidence cannot authorize') &&
        db.prepare('SELECT settlement_authorization FROM claims_cases WHERE id=?').get(caseId)
          .settlement_authorization === 'pending_authority',
      'Synthetic settlement preparation remains blocked; no settlement or reimbursement recorded',
    );
    check(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM claims_cases WHERE status IN ('PAID','SETTLEMENT_PENDING')",
        )
        .get().count === 0,
      'Disposable database contains no paid or settlement-pending claims',
    );
    await authContext.close();
    await ops.close();
  } catch (error) {
    await shot(page, 'failure');
    throw error;
  } finally {
    await context.close();
  }
}
