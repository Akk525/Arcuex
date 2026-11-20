# Premium frontend and backend v1 integration acceptance

Verified on November 19, 2026 (America/Chicago). Local branch `integration/premium-backend-v1`, local release tag `integration-release/2026-11-19-premium-backend-v1`.

| Source | Exact commit |
| --- | --- |
| Canonical main at worktree creation | `543b8e5bc11e8d3098c2c3a05a7a3114ceb76ac2` |
| Frozen hackathon candidate and frontend/backend merge base | `72097ed8145c1ab5e4e91e81b5ceeeee9a811f21` |
| Backend v1 and pinned backend tag | `fa462049cd4d87afce6ac9a3df9ef8dd2f55a7fc` |
| Compatibility preparation and first merge parent | `1d77d9d13e460369816b848136f7b42906741e8b` |
| Accepted Phase D frontend and second merge parent | `f5309019e4d6029c2934205d94577b3e3a67acbd` |
| Plan A fallback | `f8365a85f0c4a6298f713be7e799cb7538ca1fc7` |

The local frontend ref ended at accepted Phase D with no tracked working-tree edits. The configured origin returned no matching frontend, backend, or preparation refs. The integration uses committed inputs only.

The list and detail routes retain backend v1 access checks, canonical payment projection and mutation handlers. Both return the frontend's read-only claim context. The reviewer list includes verification freshness. The prepared compatibility patch also carries finality through the dashboard, claims views and policy timeline, gives fixture policies a Rehearsal category, and keeps checkout retries tied to the recorded hash.

## Acceptance results

| Gate | Result |
| --- | --- |
| Frozen dependency install | Passed with pnpm 11.20.0 and Node.js 24.16.0 |
| `pnpm test:all` | 459 workspace tests and 46 Foundry tests passed |
| Operations | 12 checks passed with `node --test deploy/railway/*.test.cjs deploy/backend/*.test.cjs` |
| Compatibility runner | 21 checks passed against the staged integration tree with patch application disabled |
| `pnpm lint` and `pnpm typecheck` | Passed |
| `pnpm build` | Passed and generated 18 static pages. Next.js reported its ESLint plugin configuration warning. |
| `pnpm smoke:launch` | Passed against a production-mode local fixture, including secure sessions, access controls, rate limiting and a second SQLite process open |
| Real Chrome claims lifecycle | 34 checks passed against production Next.js and disposable SQLite, with 27 captures and zero horizontal overflow or browser application console errors |
| Real Chrome checkout recovery | 4 checks passed across desktop and mobile. The recorded hash survived an unconfirmed response and reload. A second check sent the same hash to the confirmation endpoint with no wallet write or repeat payment option. |

The claims run used the agent SDK and actual route handlers for submission, evidence, human request and resolution, deterministic reverification, examiner reassessment and human approval. The two examiner calls used a transport double. The approved case remained unpaid, and the fixture rejected settlement preparation. Checkout used the real local product catalog and doubled the injected wallet, RPC, and authenticated checkout responses. The backend tests independently exercised the actual payment and settlement route handlers with controlled chain responses.

The expanded regressions check that a reorged payment loses its confirmed receipt in both claim routes and disappears from the paid filter while preserving display context. A stale verification is visible in the workbench and continues to block settlement. The authenticated payment endpoints deny both allowance and bind preparation when delegation expires. Duplicate callbacks preserve one reconciliation event, and a callback replay after reorg cannot restore it.

Live provider behavior, funded wallet operations, settlement execution and hosted acceptance remain outside this local baseline. The Plan A release ref still resolves to the pinned commit. There were no pushes, deployments, wallet spending approvals, transaction signatures or broadcasts.

## Reproduce the focused checks

Use the local release tag from the worktree with the frozen dependencies installed and the production build available. Point `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` and use a fresh evidence directory for the claims harness.

```sh
ARCUEX_COMPAT_INSTALLED_WORKSPACE="$PWD" \
  bash docs/integrations/checks/run-premium-backend-v1.sh HEAD
ARCUEX_BROWSER_EVIDENCE_DIR=/private/tmp/arcuex-premium-v1-claims-new \
  pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/premium-phase-d-acceptance.mts
node apps/web/scripts/premium-checkout-recovery-acceptance.mjs
```
