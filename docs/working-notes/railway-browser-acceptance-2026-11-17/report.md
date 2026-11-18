# Railway browser acceptance — 2026-11-17

Recommendation: **NO-GO for completed browser procurement-to-claims acceptance.**

No financial transaction, contract deployment, configuration change, or public launch was performed. The acceptance gate remained enabled. No policy or claim was created. This is a partial live acceptance report, not an end-to-end pass.

## Target and identity

- Host: https://arcuex-nov20-beta-production.up.railway.app
- Configured running SHA: `f93dd39b316770ab97f3b75439108a48420ccaea`, read from Railway `ARCUEX_GIT_SHA`. The liveness endpoint does not expose an independently verifiable binary SHA.
- Railway project: `03848637-de2d-497f-8308-f8f3ccf06f07`.
- Production environment: `6dca510e-fe00-4478-8d8d-ef65fd5bc4d7`.
- Service: `1280c69e-abbc-4d06-8ecc-93bf4a6ed226`.
- Latest deployment observed: `ca78aca8-f97e-4108-9159-9eaab7ce9b82`, SUCCESS, created 2026-11-17T21:33:55.985Z. No staged changes.
- One replica, 5000 MB volume mounted at `/data`.
- Local main checkout is `d9d47a505f6438c6c40a72502f28a32228151705`; source diagnosis used `git show` against the target SHA. Local source was not treated as deployed behavior.

## Gate, navigation and browser sessions

The initial browser visit returned 401 with `Acceptance gate required`. Authentication used the existing Railway gate credential through its implemented `arcuex_acceptance_gate` cookie mechanism. Temporary credential files were restricted and removed after use; the credential is omitted from this report.

The test cookie was installed Secure, HttpOnly, host scoped and SameSite=Lax. These are the test harness's gate-cookie attributes, not evidence of a server gate-login endpoint. No global authentication header or gate bypass was used. Normal Coverage link navigation, RSC prefetches, direct navigation, reload and same-origin fetches preserved access. Removing the gate cookie and reloading returned 401; restoring it restored access. Liveness `/api/health/live` returned 200 without the gate, as designed.

The browser has no injected `window.ethereum`. Clicking Connect wallet ends with `Provider not found. Version: @wagmi/core@2.22.1`. User-browser discovery also reported `The browser access host is unavailable`. No dedicated acceptance wallet/address was available. No fabricated provider, generated signer or private key was substituted.

- Wallet connection, chain switching, nonce signing, successful session issuance and authenticated reload: **BLOCKED**.
- Missing session: `/api/claims/auth/session` returns 401.
- Unknown 64-hex session cookie: rejected with 401.
- Logout: POST returns 200 and expires `arcuex_claims_sid` with `Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=lax`.
- Session check after logout: 401; acceptance access survives logout/reload.
- Revocation of a previously valid session and actual server-side session expiry: **NOT TESTED**, because no signed-in wallet session could be created. Removing a gate cookie and testing an unknown session are not substitutes for real expiry testing.

## Requested screens

| Screen | Live browser result |
| --- | --- |
| `/coverage` | 200; synthetic product, demo pricing, wallet, registration, quote and eligibility controls render. No authenticated quote generated. |
| `/agent` | 200; wallet and delegation disclosure render. Authenticated permissions untested. |
| `/policies` | 200; sign-in and refresh controls render. Ownership filtering untested. |
| `/claims` | **FAIL**: 200 HTML followed by a client exception replacing the application. Reproduced twice. |
| `/claims/new` | 200; synthetic notice and no-owned-confirmed-policies state render while unauthenticated. Actual intake blocked. |
| `/claims/review` | 200; review disclosure and ops exchange controls render. Queue API returns 401 and UI retains “Loading review queue…” with the missing-session error. |

The blocking exception is `TypeError: Cannot read properties of undefined (reading 'length')`, at `/_next/static/chunks/app/claims/page-778df00fa2af353d.js:1:6198`. `/api/claims` returns a legitimate 401 error body. Source at the target SHA shows `ClaimsPanel.refresh` casting that body to `ClaimsResponse`, followed by `data.incidents.length` without validating `res.ok` or the response shape. Fix the component to render its unauthorized/error state before using the response arrays. No application code or deployment was changed during this acceptance task.

Additional console evidence: expected protected-API 401s, favicon 404, and reviewer password-field-outside-form verbose notices. One reload after the UI logout action produced `net::ERR_ABORTED`; a subsequent standalone reload succeeded with 200. It was not counted as a persistent host failure.

## Live service and chain checks

Gated `/api/health/ready`: 200; database true, recoveryHold false, chain true, deployment true, solvency true. `/api/health`: Arc and QuickNode both report chain 5042002 and live block responses. `/api/procurement/products` reports the expected synthetic product and pool.

Independent read-only public Arc RPC calls were made from the browser at block **72746261**, hash `0x0f217758e7ecb489b95421fdf8bfe071eb99c3fd9e3e70a20d4497cc7ab88614`, timestamp **2026-11-17T21:51:47Z**:

| Item | Observed value |
| --- | --- |
| Chain | 5042002 (`0x4cef52`) |
| Pool | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| Pool deployed code | 4517 bytes; bytecode identity not independently compared |
| Pool USDC token | `0x3600000000000000000000000000000000000000` |
| Assets / token balance | 4,100,000 micros = 4.10 USDC each |
| Reserved | 1,000,000 micros = 1.00 USDC |
| Available capital | 3,100,000 micros = 3.10 USDC |
| Claims authority | `0xa6876a60748c638f66b911aaee03bd712d85af36` |
| Fee recipient | `0x69797270a2b8b355d55676787a29d2b1057411c7` |

Assets cover reservations and pool token balance covers assets at this block. The existing reservation was not identified as an acceptance-wallet policy. Capital can change; re-read before any bind. The `/api/capital` response is separately labeled a **synthetic ledger** with 1000 USDC available; that is not live contract capital.

## Claims and authorization checks

Same-origin browser requests with valid gate access but no wallet/ops session:

- Procurement policies, claims policies, claims cases and REVIEW queue GETs: 401.
- Synthetic claim-open POST using a deliberately nonexistent acceptance policy: 401; no intake created.
- Adjudicate POST against a nonexistent acceptance case: 401.
- Prepare-settlement POST against that case: 401.
- Authority ops-login attempt without valid credentials: 401.

These establish the unauthenticated boundary only. Authenticated claimant-to-reviewer privilege escalation, reviewer-to-authority escalation, cross-wallet ownership, incomplete-evidence transition to REVIEW, genuine intake and authenticated settlement preparation remain **BLOCKED/NOT TESTED**. The workbench states REVIEW has zero authorized payout; its live transition has not been demonstrated here.

`CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=0` and `CLAIMS_COOKIE_SECURE=1` were confirmed in deployment configuration. Target-SHA `claims-chain.ts` prepares transactions without signing/broadcasting, requires active coverage, matching beneficiary/reservation/loss accounting and reads the designated authority. Source inspection is not a live settlement acceptance pass. No authorized settlement preparation response was obtained.

## Proposed transaction sequence — NOT READY FOR APPROVAL

The smallest intended acceptance policy is **1 USDC limit for 1 day**, with the dedicated acceptance wallet as payer and beneficiary. This is a proposal, not a generated quote. No deposit is needed based on the observed 3.10 USDC available. Larger 10/50/100 USDC limits exceed current available capital and must not be selected without a separately approved capital plan.

1. Connect the designated external wallet; confirm address and chain 5042002. Sign only the canonical-host, single-use, expiring login nonce. Verify the issued HttpOnly/Secure/SameSite session cookie, reload, expiry and logout. Registration and any delegation are offchain, separately scoped API actions.
2. Register the authorized synthetic exposure and generate a fresh 1 USDC / 1 day quote. Verify exact owner, signer, beneficiary, policy ID, immutable terms and digest, quote deadline, coverage start/end and current balance/allowance. Accept the exact digest and prepare; no coverage is active yet.
3. **Financial authorization required:** call USDC `approve(pool, 10000)` at token `0x3600000000000000000000000000000000000000`, spender `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`. Exact premium allowance is **10,000 micros = 0.01 USDC**; no unlimited allowance. Native transaction value is zero; network gas is additional and must be reviewed in the wallet. Confirm any existing allowance before presenting this step.
4. Verify approval receipt through the backend. **Separate financial authorization required:** call the pool's `bindPolicy(policyIdBytes32, termsDigest, beneficiary, 10000, 1000000, coverageStart, coverageEnd)`. This pulls **0.01 USDC** from the payer and reserves **1 USDC** of pool capital. Native value zero; gas additional. Reconcile the successful bind receipt before claiming active/scheduled coverage.
5. Wait for coverage start. The target-SHA documented schedule is start at quote creation +15 minutes, quote expiry +10 minutes, and end at start +1 day. Bind must mine before quote expiry and after terms acceptance. Generate fresh quotes near execution; never use this report as reusable calldata. These timing rules were source-reviewed, not checked against a fresh quote.
6. Open an authorized synthetic claim with incident timing inside coverage. Submit incomplete evidence and demonstrate REVIEW with **zero authorized payout**. Confirm ownership and authenticated role denials. This step should not request a wallet transfer.
7. Settlement stays withheld. Only after complete evidence, valid deterministic adjudication and designated-authority authorization may preparation freeze `claimId`, canonical `lossKey`, evidence root, `lossCap`, beneficiary and exact payable amount. Any eventual `settleClaim(policyId, claimId, lossKey, amount, lossCap, beneficiary)` requires **new explicit financial authorization**. With the proposed policy, the deductible is **100,000 micros = 0.10 USDC**; exact payout depends on the admitted loss, recoveries and remaining reservation. No payout amount or settlement calldata is approved or available now.

**Missing for an exact approval package:** dedicated wallet public address and balance/allowance, fresh quote and policy IDs, immutable terms digest, accepted beneficiary, exact timestamps, encoded calldata/simulations, gas estimates, authenticated policy state, and any later adjudicated settlement amount/loss binding. Do not authorize broadcasts from this provisional sequence.

## Evidence and next requirements

Screenshots in this directory cover all six screens, the claims exception, gate rejection and wallet-unavailable state. `browser-console.log` records the client exception and network failures. No secrets are included intentionally.

Before resuming acceptance: repair the claims unauthorized-response crash in a separately tracked change; provide working browser access with the dedicated injected wallet; rerun authentication/session/ownership and role tests; prepare a fresh exact quote for review. A new bound-policy journey necessarily needs the separately authorized approval and bind transactions before the later claims steps can be completed. Keep the gate enabled throughout.
