# Nov 20 UI redesign — acceptance notes (in progress)

**Branch:** `ui/nov20-product-experience`  
**Base:** `fb6fe5d` (tested private beta tip)  
**Deployed Railway beta:** **not modified**

## Commits

| SHA | Summary |
| --- | --- |
| `2beab3f` | UX audit + design spec |
| `54d941d` | Implementation plan |
| `b081c6c` | Design tokens + primitives |
| `aff670b` | Workspace nav + dual-entry landing |
| `28d8bc0` | Coverage wizard chrome |
| `566d462` | Policy portfolio/detail |
| `d98048e` | Claims journey clarity |
| `948ae7a` | Agent / integrations / capital polish |

## Verification (local)

- `pnpm --filter @arcuex/web test` — pass (66)
- `pnpm --filter @arcuex/web typecheck` — pass
- `pnpm --filter @arcuex/web lint` — pass
- `pnpm --filter @arcuex/web build` — pass

## UX decisions that would need backend coordination (not implemented)

1. **Server-side workspace / role chrome** — Protect/Build/Ops is client `localStorage` only so it stays independent of wallet auth. Mapping ops chrome to verified reviewer/authority sessions would need a stable, non-secret session summary API contract and must not escalate privileges in the client.
2. **Historic pool policy → claimable procurement policy** — on-chain beneficiary wallet still has no SQLite `procurement_policies` row; importing/reconciling legacy pool policies into confirmed procurement records is a backend product rule, not a UI-only change.
3. **Signed-in session indicator in the shell** — showing “signed in as 0x…” everywhere needs a consistent session read without exposing tokens; optional follow-up using existing `/api/claims/auth/session`.
4. **New routes for Protect overview vs landing** — intentionally avoided; `/` dual-purposes landing vs Protect overview by workspace to preserve route stability.

## Deferred features

- Public DNS / gate removal  
- Dark mode  
- Capital LP deposit productization  
- Full Playwright journey suite against Railway (pending redesign acceptance + gate)  
- Visual regression CI  

## Screenshot checklist

Captured under `docs/working-notes/nov20-ui-redesign/screenshots/` (local `next start` on `127.0.0.1:3017`, `ARCUEX_DEPLOYMENT_MODE=local-test`, Playwright 1280×900 desktop / 390×844 mobile, 2026-11-17):

- [x] Landing desktop + mobile — `landing-desktop.png`, `landing-mobile.png`  
- [x] Protect overview — `protect-overview-desktop.png` (`arcuex.workspace=protect`, `/`)  
- [x] Coverage wizard — `coverage-desktop.png`  
- [x] Policies — `policies-desktop.png`  
- [x] Claims — `claims-desktop.png`, `claims-mobile.png`  
- [x] Agent — `agent-desktop.png` (`workspace=build`)  
- [x] Ops review — `ops-review-desktop.png` (`workspace=ops`, `/claims/review`)  
