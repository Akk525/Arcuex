# Functional acceptance matrix — UI redesign

**Candidate:** ef3d0d1041e5cdc6fa9dea4e2906c3094e45bf00
**Run:** 2026-11-18T05:16:30.957Z
**Host:** `http://localhost:3027` (local-test; mocked wallet/API — no real broadcasts)
**Totals:** 33 PASS · 0 FAIL · 0 WAIVED

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
| INT-01 | **PASS** | Mock RPC success plus confirm response cannot confirm coverage without canonical lifecycle |
| INT-02 | **PASS** | Stale canonical checkpoint cannot confirm coverage |
| COV-10 | **PASS** | Confirmation requires explicit authoritative lifecycle fixture (mock only) |
| COV-11 | **PASS** | Reload resets wizard to stage 1 (no client persistence of draft quote) |
| COV-12 | **PASS** | Quote expiry UI (visible=true, blocked=false) |
| COV-13 | **PASS** | Account change / reconnect resets wizard to stage 1 |
| SES-01 | **PASS** | unauth chrome protect=true build=true ops=false noSession=true disconnected=true |
| A11Y-01 | **PASS** | Keyboard Tab navigates without crash on landing |
| NAV-01 | **PASS** | Protect/Build nav (coverage=true, agents=true) |
| SES-02 | **PASS** | wallet-connected vs session (signIn=true, noSession=true) — depends on wagmi mock attach |
| SES-03 | **PASS** | claimant session shows Signed in / role; Ops hidden=true |
| SES-04 | **PASS** | Logout returns No session |
| SES-05 | **PASS** | Expired/cleared session shows No session |
| NAV-02 | **PASS** | reviewer: Ops switcher visible=true, roleLabel=false, reviewContent=true |
| NAV-03 | **PASS** | authority: Ops switcher visible=true, roleLabel=false, reviewContent=true |
| CLM-01 | **PASS** | list labels ok=true review=true synthetic=true approved=true settlement=true paid=true |
| CLM-02 | **PASS** | REVIEW detail synthetic=true paidCount=0 |
| CLM-03 | **PASS** | authorized/pending vs paid (settlement=true, paidCount=0) |
| CLM-04 | **PASS** | PAID case shows PAID status |
| INT-03 | **PASS** | Fresh server eligibility preserves historical incident intake for expired verified policy |
| INT-04 | **PASS** | Stale checkpoint hides claim action even for historical policy |
| A11Y-02 | **PASS** | Mobile landing brand + CTAs reachable |
| A11Y-03 | **PASS** | Mobile coverage progress indicator (ol=true, text=false) |
| A11Y-04 | **PASS** | Back disabled on stage 1 |

Combined frontend/backend contracts; real backend verification is reported separately.

## Real on-chain coverage

- Full Arc Testnet USDC approve/bind with a funded injected wallet is **not** executed in this harness
- COV-08/09/10 validate UI handling of reject → approve → bind → confirm using mocked RPC receipts

## Deploy posture

- **Do not merge or deploy** until visual review + this integrated acceptance are both green with no open FAILs
