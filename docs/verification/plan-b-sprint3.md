# Plan B Sprint 3: real-route browser acceptance and lifecycle UX

Verified November 18, 2026 (America/Indiana/Indianapolis; browser/record timestamps use UTC).
Working branch: `integration/plan-b-sprint3`, based on local main `543b8e5`.
UX implementation commit: `bf717bf`. Acceptance scripts/evidence and hosted prerequisites are recorded
in the subsequent Sprint 3 validation commit.

No push, merge, deployment, production-data operation or live financial transaction is authorized
or performed by this report. Local main remains at the Sprint 2 baseline.

## What was actually exercised

The optimized production application ran with `NODE_ENV=production`, `local-test` validation,
secure HttpOnly cookies, fresh per-run operator credentials, a new disposable SQLite database,
thirteen original migrations and `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=0`.

The policyholder used browser wallet connection and the real nonce/signature/session routes with
an ephemeral unfunded authentication identity. The reviewer used the real password-field ops-token
exchange and a separate browser context/cookie. Application API responses were **not mocked**.
The primary positive path used the actual policy page, claim form, fixture verification button,
contractual-review checkbox/rationale and approval action. Negative cases used the real HTTP routes
with those authenticated browser contexts and were then viewed/screenshotted in the application.
The database and API response assertions independently confirmed the rendered states.

The external chain boundary was explicitly synthetic: a local read-only JSON-RPC fixture supplied
matching policy/authority/loss/block reads for a seeded policy and synthetic reconciliation evidence.
The fixture accepted only the required reads and rejected transaction methods. All non-local browser
requests were blocked. There was no policy bind, receipt creation on Arc, live RPC acceptance,
funded wallet or signing credential in the app runtime. Fake bind/block references in the policy
screenshots are fixture data, not independently verified Arc transactions. This proves the real
application journey with a controlled synthetic chain boundary, not live onchain reimbursement.

The runner checks integrity/foreign keys, exports a non-secret state summary, stops the local server
and RPC, closes browsers and deletes its temporary database/volume directory after each completed
run. Authentication wallet material exists only in harness process memory and signs nonce messages;
operator credentials are random per run and are not saved in artifacts or passed as shell arguments.

## Browser acceptance results

**32 real-route/browser assertions passed.** Final persisted state: one APPROVED case, four REVIEW
cases, five verification records, zero SETTLEMENT_PENDING cases and zero PAID cases. The approved
case carries a proposed 1 USDC amount and `pending_authority`; every review case has no payable
amount and no settlement authority. SQLite integrity is `ok`, foreign-key check is empty.

| Significant state                   | Evidence / screenshot                                            | Result                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Authenticated policyholder          | [01](plan-b-sprint3/final/01-policyholder-session.png)           | Real wallet nonce/signature; authenticated owner, Secure/HttpOnly session                                                            |
| Policy detail / eligibility         | [02](plan-b-sprint3/final/02-policy-eligible.png)                | Original terms/beneficiary, synthetic bind reference, eligible checkpoint and claim next step                                        |
| Synthetic incident form             | [03](plan-b-sprint3/final/03-incident-intake.png)                | Correct policy/exposure, incident reference/time and explicit supported fixture                                                      |
| Server verification / investigation | [04](plan-b-sprint3/final/04-fixture-verified-investigating.png) | Persisted sufficient fixture execution; independently authenticated=false; case remains INVESTIGATING, no coverage/payment authority |
| Authorized reviewer                 | [05](plan-b-sprint3/final/05-reviewer-session.png)               | Provisioned ops credential exchanged for reviewer cookie; wallet possession grants no reviewer role                                  |
| Human approval / history            | [06](plan-b-sprint3/final/06-approved-not-reimbursed.png)        | Checkbox plus rationale required; frozen economic/reviewer record, APPROVED/pending authority, explicit no reimbursement/receipt     |
| Missing evidence                    | [07](plan-b-sprint3/final/07-review-missing-evidence.png)        | REVIEW / INCOMPLETE_EVIDENCE, no payable                                                                                             |
| Contradictory evidence              | [08](plan-b-sprint3/final/08-review-contradictory-evidence.png)  | REVIEW / UNRESOLVED_VERIFICATION_FINDINGS; selecting an older success does not bypass findings                                       |
| Financially incomplete              | [09](plan-b-sprint3/final/09-review-unresolved-recoveries.png)   | REVIEW / UNRESOLVED_RECOVERIES, no payable                                                                                           |
| Stale reviewer input                | [10](plan-b-sprint3/final/10-review-stale-evidence.png)          | Changed evidence invalidates old verification context; REVIEW / STALE_VERIFICATION_CONTEXT                                           |
| Expired reviewer credential         | [11](plan-b-sprint3/final/11-expired-reviewer-session.png)       | Real authentication returns 401; browser requests sign-in again                                                                      |
| Stale policy reconciliation         | [12](plan-b-sprint3/final/12-stale-policy-eligibility.png)       | Reconciliation pending; claim submission next step hidden                                                                            |

Further route checks rejected claimant adjudication (403), repeated adjudication on an already
approved case (400) and authority exchange without its credential (401). A separate authority
session could authenticate, but matching read-only financial preflight still ended in the existing
**400 Synthetic/fixture evidence cannot authorize settlement preparation** rejection. No broadcast
method was invoked. The authority credential is an application credential, not a pool signing key.

[Full real-run results and state](plan-b-sprint3/final/results.json),
[assertion log](plan-b-sprint3/browser-run.txt), [production server log](plan-b-sprint3/final/server.txt).
The recorded RPC methods are only `eth_chainId`, `eth_call`, `eth_getBlockByNumber`.

## UX changes from the observed workflow

- Removed the submit form's arbitrary prefilled evidence note. It could not satisfy the supported
  fixture's evidence digest and would force review. The form now offers an explicitly labeled
  supported scenario, retrieving exact catalog bytes from the existing authenticated claim-detail
  route. Custom or absent evidence remains an investigation path and is never silently converted
  to supported evidence. Evidence amounts and financial rules remain server-owned.
- Removed the editable claimant reference, which the backend correctly ignored. Identity now clearly
  comes from the signed session. Clarified local-time input versus stored UTC. A partial submission
  failure links to the already saved claim rather than encouraging duplicate intake.
- Added claim/policy/review-queue navigation, a reload action and status-specific next steps. Review
  blockers have plain-language explanations alongside the original audit reason codes.
- Displayed the full claim/incident IDs, canonical observed reference/time, policy beneficiary,
  verification ID/version/actor/time/catalog digest/context and expandable investigation/decision
  payloads. Displayed policy deductible, prior compensation and coverage limit with assessed loss.
- Labeled amounts as proposed settlement, made no-receipt/no-reimbursement explicit, and disabled
  completed decision actions. Historical review reasons are not presented as current blockers on
  approved cases. Verification completion feedback is visible to claimants as well as reviewers.
- Removed settlement preparation controls from reviewer sessions and disabled them for synthetic
  claims in authority sessions. Existing server authority, synthetic restrictions and financial
  checks remain unchanged; the UI grants no additional capability.

No unrelated page redesign, new visual system, marketplace/insurance architecture, domain service,
financial permission, contract implementation, migration or Railway configuration changed.
The existing six-check mocked browser harness received one portability fix: its hostname allowlist
now follows its configured base URL instead of always requiring `127.0.0.1`.

## Validation compared with Sprint 2

| Check                                         | Sprint 2      | Sprint 3                               |
| --------------------------------------------- | ------------- | -------------------------------------- |
| Workspace tests                               | 299 pass      | **299 pass**                           |
| Contract tests                                | 46 pass       | **46 pass**                            |
| Existing mocked browser regressions           | 33 pass       | **33 pass**, 0 failures/waivers        |
| Existing mocked adjudication checks           | 6 pass        | **6 pass**                             |
| Real app routes + browser + disposable SQLite | Not completed | **32 assertions pass**, 12 screenshots |
| Typecheck / lint / production build           | Pass          | **Pass**                               |
| Default migration count                       | 13            | **13**, including exact 011            |
| Live financial operations                     | None          | **None**                               |

[Workspace tests](plan-b-sprint3/workspace-tests.txt), [contracts](plan-b-sprint3/contracts.txt),
[typecheck](plan-b-sprint3/typecheck.txt), [lint](plan-b-sprint3/lint.txt),
[build](plan-b-sprint3/build.txt), [33 browser checks](plan-b-sprint3/final/mocked-regression.txt),
[6 adjudication checks](plan-b-sprint3/final/mocked-adjudication.txt).
The build retains the prior non-failing Next ESLint-plugin warning. `git diff --check` passes.
No extra implementation-mirroring unit tests were added for these UI-only changes; the real route
journey and existing browser/security/accounting suites provide the relevant regression coverage.

Earlier diagnostic attempts are preserved: the initial inspection run entered UTC text into a
local-time input and was correctly rejected as future-dated; the harness was fixed to UTC browser
time. That attempt is in [baseline diagnostics](plan-b-sprint3/baseline-run.txt), not counted as a
passed baseline. A later localhost/127.0.0.1 mismatch in the older mocked harness was corrected;
its superseded log/state are in [working diagnostics](../working-notes/plan-b-sprint3/diagnostics/).
Final acceptance is the successful `completed: true` result linked above.

## Reproduction and hosted readiness

Build first with `pnpm build`. With local Playwright/Chrome already available, run:

```sh
SPRINT3_REGRESSIONS=1 PLAYWRIGHT_MODULE=<absolute-path-to-playwright/index.mjs> \
  pnpm --filter @arcuex/insurance exec tsx ../../apps/web/scripts/sprint3-local-acceptance.mts
```

The runner uses localhost ports 3053/3054, a fresh temporary database and generated credentials.
It creates no external resources. Evidence is written under `docs/verification/plan-b-sprint3/final`.
Archive prior evidence before rerunning; IDs/timestamps naturally differ. Chrome's default path is
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. The test-only RPC is not a hosted
service or a production fallback.

The [disposable hosted candidate prerequisites](../deployments/plan-b-disposable-candidate.md)
prepare separate environment/service/database/volume/credentials/gate/epoch, exact migrations,
secure production configuration and the preserved Plan A boundary. No resources were provisioned.
Railway's [environment behavior](https://docs.railway.com/environments) and
[volume lifecycle](https://docs.railway.com/volumes) were checked November 18, 2026; no account or
production infrastructure inspection was needed for this preparation.

Hosted full-journey readiness is **conditional**: select an explicitly labeled hosted fixture source
with a compatible checkpoint process, or an actually bound policy with genuine read-only Arc
reconciliation. The minimal local fixture does not implement the hosted worker's logs/reorg/restart
protocol. Freshness cannot be claimed by copying a cursor or refreshing a fake live timestamp.
No hosted deployment should proceed before that source choice and separate deployment approval.

Full authorized Plan B reimbursement remains blocked by the intentionally retained production
synthetic settlement restriction, missing separate financial authorization/live preflight, and the
need for a compatible funded, unexpired policy, designated claimsAuthority wallet, exact approved
transaction and independent receipt reconciliation. Real-world loss authentication and natural-person
reviewer attribution are not supplied by fixture verification or shared role credentials. No new
insurance feature, financial bypass or actual reimbursement was introduced.
