# Procurement beta acceptance — 2026-11-17

Historical procurement checkpoint. Shared authentication and the claims bridge are now implemented; see the [current integration assessment](2026-11-17-procurement-claims-integration.md).

Branch: `feat/onchain-lifecycle`. Baseline commits inspected: `2c8ec30`, `5dd621c`. Existing uncommitted procurement schema/service foundations were inspected and integrated. No contracts changed, no redeployment, no financial broadcasts, no secrets printed or committed.

## Baseline findings

- Deployed `InsurancePool` supports premium collection, fully collateralized reservation, immutable policy fields/hash, authority-only claims, loss-key accounting and release. It permits direct binds at caller-selected amounts/windows and has no quote signer/delegation enforcement.
- Generic domain/SQLite insurance, synthetic oracle replay and lifecycle SDK helpers already existed. Their local `active` status did not prove a matching onchain receipt.
- Human coverage UI used a caller-set funding flag; agent procurement trusted a supplied wallet address and a static spend cap. Neither was owner-authenticated delegation. The legacy binding API is now disabled.
- Existing policies lacked complete procurement/exposure/eligibility snapshots, authenticated per-owner history, and a detail route. The new product records deliberately use separate immutable procurement tables.
- Production build alone did not prove SQLite could load. A real built-server smoke exposed native-driver bundling and migration-directory resolution errors. These were fixed with a direct web runtime dependency, explicit migration directory and traced SQL assets; actual built-server HTTP requests now pass.

## Per-screen acceptance matrix

“Browser mock” means wallet, RPC and API responses were intercepted; it is not a live financial test. “HTTP smoke” uses the actual built Next server, real SQLite, real wallet-message signatures from ephemeral test identities and read-only Arc RPC. No transaction signing or financial broadcast occurs.

| Screen / step               | Acceptance implemented                                                                                                                   | Evidence                                                                                                                 | Remaining gap                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `/coverage` discovery       | One labeled synthetic product, demo pricing and limitations, no fake metrics                                                             | Desktop and 390px browser rendering                                                                                      | Launch-host content/HTTPS review                                                 |
| Wallet                      | Injected connect, account/network checks, explicit sign-in, rejection/error handling                                                     | Browser mock connect/sign-in; real HTTP signature auth; signature replay/expiry unit tests                               | Actual extension-wallet/device and network-switch smoke                          |
| Agent/exposure registration | Owned registration, registered signer, protocol/chain restriction, owner control attestation and notional micros                         | Browser mock; actual HTTP owner/agent identity; invalid registration tests                                               | External position verification intentionally absent                              |
| Quote builder               | Existing agent, allowed duration/limits, beneficiary, four hard eligibility booleans, limit ≤ exposure                                   | Browser mock; real HTTP quote; unhealthy/known-incident/malformed-amount/exposure/unsupported-chain tests                | No real risk pricing or external eligibility oracle                              |
| Terms review                | Full immutable versioned snapshot/digest, premium/limit/deductible, beneficiary, start/end, quote deadline, exclusions, exact acceptance | Browser mock; digest/idempotency/acceptance tests                                                                        | Hash commits semantics but deployed contract does not interpret them             |
| USDC approval               | Exact premium/spender, separate wallet click, successful receipt verification and immutable transaction reference                        | Browser mock rejection → retry → approval; exact approval transaction tests                                              | Authorized funded extension-wallet run                                           |
| Bind                        | Permission/cap/expiry checks, deployment/capital preflight, wallet simulation, explicit bind click, receipt and live-policy match        | Browser mock success; real HTTP calldata preflight; receipt-field, deadline, duplicate/replay and SQL-immutability tests | New live bind deliberately not broadcast                                         |
| Success                     | Confirmed bind distinguished from scheduled start; policy/explorer links                                                                 | Browser mock success at desktop/mobile                                                                                   | Live extension-wallet receipt                                                    |
| `/policies`                 | Authenticated owned/paid list, prepared/confirmed/scheduled/expired labels, empty/loading/error states                                   | Actual HTTP unbound status; desktop/mobile 200/no-overflow rendering                                                     | No seeded fake policy counts; real bound-history walkthrough pending             |
| `/policies/[id]`            | Immutable snapshot, approval/bind links, live match/cancel/exhaustion status, receipt recovery; RPC failure retains record as unverified | Actual HTTP read-only reconciliation; desktop/mobile rendering; receipt recovery logic covered by verifier tests         | Browser recovery of an actually broadcast transaction pending                    |
| `/agent`                    | Owner-created scoped permissions, cumulative premium budget, per-policy limit, allowed beneficiary and expiry/revoke                     | Actual HTTP owner/agent SDK workflow, cap-once and revoke checks; desktop/mobile render; adversarial scope/cap tests     | Backend-only scope/revocation; previously prepared calldata stays usable onchain |

## Verification results

- `pnpm test`: **118 TypeScript tests passed** (domain 15, chain 5, onchain 47, persistence 3, QuickNode 9, insurance 7, agent SDK 12, web 20). Focused persistence/web tests repeated after the production SQLite fix: 3 + 20 passed.
- `pnpm test:contracts`: **22 Foundry tests passed**, including conservation, solvency, premium share accounting, authority and replay restrictions. Contracts unchanged.
- `pnpm typecheck`: passed. Production build also runs all package typechecks and Next's app type validation.
- `pnpm lint`: passed after fixing type-only test imports.
- `pnpm build`: passed, including new API/detail routes. Existing Next ESLint-plugin advisory remains non-fatal.
- Playwright: complete mocked human journey passed, including wallet rejection and retry. Final fixture asserts the default 1-USDC limit is present. 390px layout has no horizontal overflow. Console check reported zero errors/warnings in the mocked journey.
- `/agent`, `/policies`, `/policies/test-policy`: HTTP 200 and no horizontal overflow at 1280px and 390px. These unauthenticated render checks do not assert that `test-policy` exists.
- Actual production HTTP/SDK smoke: owner and agent authenticated; agent/exposure registered; delegation created; agent identified registration; quote created; preparation returned two transactions; repeat reserved cap once; status remained `prepared`/unbound; owner revocation rejected future preparation. **Zero financial broadcasts**.

The browser fixture is [procurement.browser.js](../../scripts/e2e/procurement.browser.js). With a built server on port 3002, run it using the Playwright browser tool's `browser_run_code_unsafe` filename option. It is a tool-run regression fixture, not an installed Playwright CI suite. All wallet/RPC calls are mocked.

For actual HTTP/SDK/SQLite/read-only-chain smoke, start the built app and run:

```bash
pnpm build
pnpm --filter @arcuex/web start --port 3002
# In another terminal:
pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/procurement-http-smoke.mts
```

The HTTP smoke creates local synthetic records under ephemeral test identities. It does not approve USDC, bind onchain, settle claims or retain private keys.

## Read-only deployed-pool reconciliation

Verified 2026-11-17 against the checked-in deployment manifest through `connectArcTestnetAdapter`, with an explicit manifest path from the package working directory. Only public fields were printed; RPC URLs were excluded from output.

| Field                          | Observed value                               |
| ------------------------------ | -------------------------------------------- |
| Chain                          | 5042002                                      |
| Pool                           | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| USDC                           | `0x3600000000000000000000000000000000000000` |
| Runtime bytecode               | 4,517 bytes                                  |
| Tracked assets / token balance | 4,100,000 / 4,100,000 micros                 |
| Reserved / available capital   | 1,000,000 / 3,100,000 micros                 |
| Total shares                   | 5,100,000                                    |
| Adapter mismatches             | None                                         |

This is a point-in-time observation, not a pool metric cached into the UI. Capital may change. Current 1-USDC quotes fit this observed capital; higher limits require additional authorized funding. No such funding was performed.

## Exact outstanding launch/handoff work

1. Obtain separate authorization for the funded browser-wallet approval/bind test; verify its live receipts and account/network/recovery UX. Do not treat mocked success as a live procurement.
2. Verify hosting, HTTPS/origin forwarding, edge rate limits, persistent SQLite/backup and availability of traced SQL migration files/native driver in the actual deployed artifact. Local production start/HTTP smoke passed; public hosting was not performed.
3. For stronger onchain pricing, expiry or delegation enforcement, a contract change would require separate demonstrated necessity and redeployment approval. Current implementation makes only backend guarantees and explicitly discloses raw contract bypasses.
4. Claims sprint must wire procurement records into claims intake/replay, enforce incident timing, deductible/exclusions, authority-approved settlement and lossKey uniqueness, and reconcile cancellation/exhaustion. No external loss oracle or automatic association with generic demo claim records exists.
5. EIP-1271 authentication, external position ownership/health verification and abandoned-budget release remain unimplemented. They are not represented as supported features.

See [procurement-beta.md](../development/procurement-beta.md) for the exact field-level enforcement boundary and remote SDK workflow.
