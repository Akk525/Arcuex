# Railway private browser acceptance — claims hotfix revalidation (2026-11-17)

**Decision: CONDITIONAL GO** for **private browser acceptance** (gate-only, unauthenticated claims session).

No deployment, contract broadcast, gate removal, or credential disclosure was performed. The acceptance gate remained enabled throughout.

## Target and deployed identity

| Item | Observed |
| --- | --- |
| Host | `https://arcuex-nov20-beta-production.up.railway.app` |
| Expected SHA | `fb6fe5dc8b80107b4860ce3ef2926bf343c493cb` |
| `ARCUEX_GIT_SHA` (Railway) | `fb6fe5dc8b80107b4860ce3ef2926bf343c493cb` — **match** |
| Deployment ID | `32f25f20-b66e-447a-adb2-240cb99d408a` — **match** (`railway status`) |
| Project / env / service | `03848637-de2d-497f-8308-f8f3ccf06f07` / `6dca510e-fe00-4478-8d8d-ef65fd5bc4d7` / `1280c69e-abbc-4d06-8ecc-93bf4a6ed226` |

Liveness `/api/health/live` does not expose an independent binary SHA; identity is taken from Railway `ARCUEX_GIT_SHA` plus deployment metadata.

## Gate enforcement

| Request | Without gate | With gate (no claims session) |
| --- | --- | --- |
| `/` | 401 `Acceptance gate required` | — |
| `/claims` | 401 | HTML 200 (cookie only) |
| `/api/claims` | 401 gate | 401 `Missing claims session cookie or Authorization Bearer token` |
| `/api/claims/cases` | 401 gate | 401 missing session |
| `/api/claims/settlements/historic` | 401 gate | 401 missing session |
| `/api/health/live` | **200** `ok/live` | **200** |
| `/api/health/ready` | 401 gate | **200** all checks true |

See `api-checks.log`.

## P0 hotfix — `/claims` unauthenticated (gate cookie only)

**PASS.** Prior failure (`Cannot read properties of undefined (reading 'length')`) is **not** reproduced.

- Page loads (navigation 200) with coherent sign-in-required copy in Claims cases, legacy ledger, and settlement panels.
- Console shows expected 401 network errors only; **no** `pageerror` or `length` exception (`browser-console.log`).
- UI explicitly states unauthorized responses are **not** treated as empty lists.

## Gated browser screens (no wallet / no ops session)

| Route | Result |
| --- | --- |
| `/claims` | 200; sign-in-required state; **no client crash** |
| `/claims/new` | 200; unauthenticated intake disclosure |
| `/claims/review` | 200; ops exchange UI; queue APIs 401 in console |
| `/claims/acceptance-nonexistent` | 200; case detail shell with auth messaging |

Screenshots: `acceptance-claims.png`, `acceptance-claims-new.png`, `acceptance-claims-review.png`, `acceptance-claims-nonexistent.png`, `acceptance-gate-required.png`.

## Authenticated claims session

**NOT TESTED** in live browser (no injected wallet; headless Chrome has no `window.ethereum`). Railway exposes reviewer/authority API tokens, but exchanging ops sessions was out of scope for this revalidation pass (no prior acceptance evidence of that path on this deployment). Wallet nonce/verify flow is exercised indirectly via HTTPS smoke (synthetic key, no broadcasts).

## HTTPS launch smoke (`pnpm smoke:launch`)

From worktree `/Users/aditya/Projects/Arcuex/.worktrees/launch-infrastructure` against production URL with gate token in env:

```
launch-release-smoke: PASS
smoke exit: 0
```

Durable SQLite assertion skipped (`ARCUE_X_SQLITE_PATH` unset locally — expected). Live checks included wallet session cookie issuance, authenticated reads, unauthorized/forged-role write rejection, and auth rate limiting.

Log: `smoke-launch.log`.

## Evidence paths

| Artifact | Path |
| --- | --- |
| Report | `docs/working-notes/railway-claims-hotfix-revalidation-2026-11-17/report.md` |
| API log | `…/api-checks.log` |
| Browser console | `…/browser-console.log` |
| Browser harness | `…/browser-harness.log`, `…/browser-harness.stdout.log` |
| Smoke | `…/smoke-launch.log` |
| Screenshots | `…/acceptance-*.png` |

Mirrored (sans `node_modules/`) to `.worktrees/launch-infrastructure/docs/working-notes/railway-claims-hotfix-revalidation-2026-11-17/`.

## Remaining blockers (outside private unauthenticated scope)

1. Live wallet connect + signed session + ownership-filtered claims lists.
2. Reviewer/authority ops session exchange and privileged queue/adjudication UI.
3. End-to-end procurement → bind → claim on the acceptance wallet (still requires explicit financial authorization per prior acceptance plan).

## Recommendation summary

| Scope | Verdict |
| --- | --- |
| **Private browser acceptance** (gate + unauthenticated claims surfaces after P0 hotfix) | **CONDITIONAL GO** |
| Full authenticated claims / procurement acceptance | **NOT READY** (same blockers as 2026-11-17 partial acceptance) |

**Conditional** solely because authenticated browser sessions were not exercised; the P0 `/claims` unauthorized crash is cleared and gate/API boundaries match expectations.