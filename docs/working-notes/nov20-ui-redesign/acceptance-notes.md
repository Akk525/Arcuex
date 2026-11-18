# Nov 20 UI redesign — acceptance notes (visual pass)

**Branch:** `ui/nov20-product-experience`  
**Base:** `fb6fe5d` (tested private beta tip)  
**Deployed Railway beta:** **not modified**  
**Visual-pass tip:** see latest commits below (after `0b973f9`)

## Commits (architecture + visual pass)

| SHA | Summary |
| --- | --- |
| `2beab3f` … `0b973f9` | Prior redesign: tokens, shell, coverage chrome, claims/agents polish, first screenshots |
| `978d428` | Persistent wallet + session indicator; Ops chrome gated on session role |
| `77b810a` | Stronger public landing hero + grounded demo journey |
| `40acd84` | Progressive four-stage coverage wizard |
| `0f87824` | Simplified claims IA (My claims / submit / expandable help) |
| `6fb0586` | Agents, policies, Protect overview empty states |

## Verification (local)

- `pnpm --filter @arcuex/web test` — pass (66)
- `pnpm --filter @arcuex/web typecheck` — pass
- `pnpm --filter @arcuex/web lint` — pass
- `pnpm --filter @arcuex/web build` — pass

## UX decisions that would need backend coordination (not implemented)

1. **Historic pool policy → claimable procurement policy** — on-chain beneficiary wallet may still have no SQLite `procurement_policies` row; importing/reconciling legacy pool policies into confirmed procurement records is a backend product rule, not a UI-only change.
2. **Authenticated portfolio fixtures for screenshots** — empty/disconnected states are captured locally; signed-in wallet journeys still need a real Arc Testnet wallet + session cookie (and optional seeded procurement rows) for visual review of populated policies/claims.
3. **New routes for Protect overview vs landing** — intentionally avoided; `/` dual-purposes landing vs Protect overview by workspace to preserve route stability.

## Implemented without new backend APIs

- Shell **AccountBar** reads `GET /api/claims/auth/session` and exposes Connect / Sign in / Sign out from the header.
- Ops workspace switcher is shown only when session role is `reviewer` or `authority` (chrome only — URLs remain server-authorized).
- Coverage wizard stages, claims IA, agents IA, and empty-state copy are client presentation only.

## Deferred features

- Public DNS / gate removal  
- Dark mode  
- Capital LP deposit productization  
- Full Playwright journey suite against Railway (pending redesign acceptance + gate)  
- Visual regression CI  
- Deploy / merge of this branch  

## Screenshot checklist (visual pass)

Captured under `docs/working-notes/nov20-ui-redesign/screenshots/` (local `next start` on `127.0.0.1:3017`, `ARCUEX_DEPLOYMENT_MODE=local-test`, volume identity file present, Playwright 1280×900 desktop / 390×844 mobile, 2026-11-17):

- [x] Landing desktop + mobile — `landing-desktop.png`, `landing-mobile.png`
- [x] Protect overview — `protect-overview-desktop.png` (`arcuex.workspace=protect`, `/`)
- [x] Coverage wizard — `coverage-desktop.png`, `coverage-mobile.png`
- [x] Policies — `policies-desktop.png`, `policies-mobile.png`
- [x] Claims — `claims-desktop.png`, `claims-mobile.png`
- [x] Agent — `agent-desktop.png`, `agent-mobile.png` (`workspace=build`)
- [x] Ops review — `ops-review-desktop.png` (`workspace=ops`, `/claims/review`)

## Review posture

Architecture remains **CONDITIONAL GO**. This pass addresses the NO-GO visual/IA feedback (hero, progressive wizard, claims simplification, shell session indicator, agents/policies empty states). **Do not deploy or merge** until visual + functional review of the new screenshots.
