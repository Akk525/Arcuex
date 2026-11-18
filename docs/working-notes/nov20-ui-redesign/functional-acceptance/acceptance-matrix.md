# Functional acceptance matrix — UI redesign

**Branch:** `ui/nov20-product-experience` @ `887de65`  
**Run:** 2026-11-18T03:47:04.032Z  
**Host:** `http://127.0.0.1:3017` (`local-test`; mocked wallet/API — **no real broadcasts**)  
**Harness:** `docs/working-notes/nov20-ui-redesign/functional-acceptance/run-functional-acceptance.mjs`  
**Supporting tests:** `pnpm --filter @arcuex/web test` → **66/66 pass** (clean env)  
**Totals:** **29 PASS · 0 FAIL · 0 WAIVED**

## Requirement → evidence

| # | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Four-stage coverage wizard (Back/Continue, validation, reload, expiry, failed tx, confirmed status) | **PASS** | COV-01…COV-13 |
| 2 | Session indicator: wallet vs server auth; logout; account switch; expiry | **PASS** | SES-01…SES-05, COV-13 |
| 3 | Protect / Build / Ops for unauth, claimant, reviewer, authority | **PASS** | SES-01, SES-03, NAV-01…NAV-03 |
| 4 | Claims REVIEW, synthetic labels, authorized ≠ paid | **PASS** | CLM-01…CLM-04 |
| 5 | Desktop/mobile a11y + interaction | **PASS** | A11Y-01…A11Y-04 + screenshots |
| 6 | No redesign change to financial auth / pricing / issuance / claims logic | **PASS** | `git diff fb6fe5d...HEAD` → **0 files** under `packages/`, `apps/web/src/lib/server/`, `apps/web/src/app/api/`, `apps/web/src/lib/claims/` |
| 7 | Acceptance matrix + final screenshots | **PASS** | This file + `screenshots/` |

## Case results

| ID | Result | Detail |
| --- | --- | --- |
| COV-01 | **PASS** | Stage 1 validation blocks Continue without agent |
| COV-02 | **PASS** | Stage 1 → 2 with Back/Continue |
| COV-03 | **PASS** | Stage 2 validation requires attestations |
| COV-04 | **PASS** | Back from stage 2 restores stage 1; Continue returns |
| COV-05 | **PASS** | Stage 2 → 3 after quote |
| COV-06 | **PASS** | Stage 3 validation requires terms acceptance |
| COV-07 | **PASS** | Stage 3 → 4 after prepare |
| COV-08 | **PASS** | Failed / rejected approval surfaces alert |
| COV-09 | **PASS** | Successful approval after retry |
| COV-10 | **PASS** | Bind confirms on-chain status (mocked receipt) |
| COV-11 | **PASS** | Reload resets wizard to stage 1 (no client persistence of draft quote) |
| COV-12 | **PASS** | Quote expiry UI (visible=true, blocked=false) |
| COV-13 | **PASS** | Account change / reconnect resets wizard to stage 1 |
| SES-01 | **PASS** | unauth: Protect+Build, no Ops, Disconnected + No session |
| SES-02 | **PASS** | wallet-connected shows Sign in while still No session |
| SES-03 | **PASS** | claimant Signed in; Ops hidden |
| SES-04 | **PASS** | Logout returns No session |
| SES-05 | **PASS** | Cleared/expired session shows No session |
| NAV-01 | **PASS** | Protect/Build subnav (Coverage / Agents) |
| NAV-02 | **PASS** | reviewer: Ops switcher visible |
| NAV-03 | **PASS** | authority: Ops switcher visible |
| CLM-01 | **PASS** | List: REVIEW + SYNTHETIC + APPROVED + SETTLEMENT_PENDING + PAID |
| CLM-02 | **PASS** | REVIEW detail keeps synthetic; not PAID |
| CLM-03 | **PASS** | SETTLEMENT_PENDING ≠ PAID |
| CLM-04 | **PASS** | PAID case shows PAID |
| A11Y-01 | **PASS** | Keyboard Tab on landing |
| A11Y-02 | **PASS** | Mobile landing brand + CTAs |
| A11Y-03 | **PASS** | Mobile coverage progress `ol[aria-label]` |
| A11Y-04 | **PASS** | Back disabled on stage 1 |

## Final screenshots

Under `docs/working-notes/nov20-ui-redesign/functional-acceptance/screenshots/`:

| File | What it shows |
| --- | --- |
| `wizard-confirmed-desktop.png` | Stage 4 confirmed bind (mocked) |
| `wizard-quote-expired-desktop.png` | Quote expiry messaging |
| `session-unauthenticated-desktop.png` | Disconnected + No session; Protect/Build only |
| `session-claimant-logout-desktop.png` | Post-logout No session |
| `nav-ops-reviewer-desktop.png` | Ops chrome for reviewer |
| `nav-ops-authority-desktop.png` | Ops chrome for authority |
| `claims-status-labels-desktop.png` | REVIEW / SYNTHETIC / APPROVED / SETTLEMENT_PENDING / PAID |
| `claims-paid-detail-desktop.png` | PAID detail |
| `a11y-landing-mobile.png` | Mobile landing |
| `a11y-coverage-mobile.png` | Mobile coverage wizard |

Prior visual-pass shots remain in `../screenshots/` (landing/coverage/claims/policies/agents).

## Logic isolation (item 6)

- Diff vs beta tip `fb6fe5d` for financial/server surfaces: **empty**
- Redesign is UI components, workspace nav helpers, session chrome hooks, and docs
- Vitest claims/procurement/session suites still **66/66**

## Explicit gaps (not blockers for UI functional acceptance)

1. **Live Arc Testnet USDC approve/bind** with a funded injected wallet was **not** run here (COV-08/09/10 use mocked RPC + wallet).
2. Ops role badge copy (`Session · reviewer`) was not always asserted as visible text; Ops **switcher presence** is the chrome gate under test (URLs remain server-authorized).
3. Wizard draft state does **not** survive reload (COV-11) — intentional client-only state.

## Deploy posture

**Do not merge or deploy** until product visual review signs off alongside this integrated acceptance. Branch stays isolated: `ui/nov20-product-experience`.
