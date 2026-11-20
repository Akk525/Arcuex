# Premium redesign — Phases A + B (foundation, homepage, dashboard)

Branch `ui/premium-product-redesign`, 2026-11-19. Not deployed, not pushed.
Visual spec: Arcuex high-fidelity reference boards (13 panels).

## Design system

| Token | Value | Role |
| --- | --- | --- |
| Canvas `--paper` | `#f6f8f8` | App ground (cool near-white) |
| Surface | `#ffffff` | Panels, marketing ground |
| Steel ink `--ink` | `#0e1a20` | Primary text |
| Deep teal `--accent` | `#0d4048` | Primary actions |
| Signal teal `--accent-signal` | `#12808a` | Selection, focus, live |
| Amber `--synthetic` | `#8a5a00` | Synthetic label only |

Type: Inter Tight (display), IBM Plex Sans (UI/body), IBM Plex Mono (IDs, hashes, code),
loaded once via `next/font` in `app/fonts.ts`. Custom component CSS lives in
`@layer components` so Tailwind utilities (e.g. `lg:hidden`) win.

Shared pieces: `AppShell` (top bar + grouped sidebar + mobile drawer), `AccountBar`
(condensed wallet/session menu), `WorkRow`/`WorkList`, `Panel`, `PageHeader`,
`EmptyState`, `TruthBadge` (sentence case), `StatusBadge` (pill), `lib/app-nav.ts`.

## Truth rules preserved

- Ops nav (review queue, capital) still appears only for reviewer/authority/system sessions; the server enforces roles.
- Policy rows show lifecycle status and claims-eligibility separately; "bound" is never "active".
- `PAID` without a confirmed receipt renders "Payment unconfirmed" in warning tone.
- Homepage cards end on **Approved · Not reimbursed**; the AI examiner is labeled test double / advisory.
- SDK section shows the real `ProcurementApiClient` / `ClaimsApiClient` calls and states the package is not on npm.
- Dashboard activity now uses recorded policy lifecycle timestamps instead of request time.

## Screenshots

`screenshots/premium-phase-b/`. Files suffixed `MOCKDATA` use an intercepted
`/api/dashboard` response for layout review only; they are not account data.

## Known issues / next

- Coverage, policies, claims, review, agent, integrations and capital pages render in the
  new shell with the new primitives but are not yet redesigned (Phases C–E).
- Non-ops sessions on `/claims/review` highlight "All claims" (the reviewer item is hidden).
- Local `pnpm test` fails 8 fixture tests when `CLAUDE_CODE_MESSAGING_TOKEN` is exported
  (fixture credential allowlist); all 188 pass with it unset.
