# Nov 20 Product Experience Implementation Plan

> **For agentic workers:** Execute task-by-task with incremental commits on `ui/nov20-product-experience`. Do not deploy to Railway.

**Goal:** Dual-primary Protect/Build product UI with shared design system, stable routes/auth/contracts.

**Architecture:** Workspace chrome (`protect` | `build` | `ops`) persisted in `localStorage`, independent of wallet. Same URLs; shell nav and page framing change. Shared CSS tokens + primitives under `apps/web/src/components/ui/`.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 4, wagmi/viem, existing claims/procurement APIs.

## Global Constraints

- Preserve routes, business logic, auth, contracts; no financial broadcasts; no Railway deploy.
- Workspace switching clear, persistent, wallet-independent.
- Never imply policy active before on-chain confirm; never imply claim paid before verified settlement.
- Genuine data only; label synthetic; a11y + mobile + loading/error states.
- Deployed beta untouched until acceptance.

## File map

| Area | Files |
| --- | --- |
| Tokens | `apps/web/src/app/globals.css`, `layout.tsx` metadata |
| Primitives | `apps/web/src/components/ui/*`, update `panel.tsx`, `status-badge.tsx` |
| Workspace | `apps/web/src/lib/workspace.ts`, `components/workspace-provider.tsx`, `app-shell.tsx` |
| Landing / overview | `app/page.tsx`, `components/landing/*`, `overview-dashboard.tsx` (demote) |
| Coverage | `components/coverage/human-procurement-panel.tsx` (+ stepper chrome) |
| Policies | `components/coverage/policies-panel.tsx`, policy detail |
| Claims | claims components + pages framing |
| Agent | `components/agent/*`, agent page framing |

---

### Task 1: Design tokens + primitives

- [ ] Add CSS variables + base focus/button/input styles in `globals.css`
- [ ] Add `Button`, `PageHeader`, `EmptyState`, `AuthRequired`, `Callout`, `Stepper`
- [ ] Extend `StatusBadge` tones (`live`, `synthetic`)
- [ ] Update `Panel` to token borders/surfaces
- [ ] Commit: `feat(ui): shared design tokens and primitives`

### Task 2: Workspace shell + landing

- [ ] `WorkspaceProvider` + localStorage persistence
- [ ] `AppShell` with Protect/Build/Ops switcher + contextual nav
- [ ] Landing at `/` with dual CTAs; Protect overview when workspace=protect
- [ ] Hide ops links from Protect/Build primary nav
- [ ] Commit: `feat(ui): workspace navigation and dual-entry landing`

### Task 3: Coverage wizard chrome

- [ ] Stepper for eligibility → terms → accept → approve → bind → confirmed/failed
- [ ] Explicit copy for quote/approval/pending/confirmed/failed
- [ ] Commit: `feat(ui): coverage procurement wizard chrome`

### Task 4: Policies

- [ ] Portfolio/detail PageHeader + status clarity (prepared vs confirmed)
- [ ] Commit: `feat(ui): policy portfolio and detail presentation`

### Task 5: Claims

- [ ] List/submit/detail framing; stage language; synthetic/payment copy rules
- [ ] Ops review remains ops-workspace framed
- [ ] Commit: `feat(ui): claims journey clarity`

### Task 6: Developer experience

- [ ] Agent + integrations PageHeaders; Build workspace framing
- [ ] Commit: `feat(ui): agent and integrations workspace polish`

### Task 7: Verify

- [ ] typecheck, lint, test, build
- [ ] Screenshots desktop/mobile; acceptance notes
- [ ] Commit: `docs(ui): nov20 redesign acceptance notes and screenshots`
