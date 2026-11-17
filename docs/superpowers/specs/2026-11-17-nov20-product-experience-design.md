# Design: Arcuex November 20 product experience

**Status:** draft — awaiting approval before UI implementation  
**Base tip:** `fb6fe5dc8b80107b4860ce3ef2926bf343c493cb`  
**Branch:** `ui/nov20-product-experience`  
**Constraint:** do not deploy to private Railway beta until redesign acceptance  

Companion audit: [ux-audit-2026-11-17.md](../../working-notes/nov20-ui-redesign/ux-audit-2026-11-17.md)

## Design read

Reading this as: **regulated fintech product UI + dual-entry public landing** for human policyholders and agent builders, with a **restrained institutional aesthetic** (trust, clarity, low motion), not a marketing-template SaaS kit.

Dials (workspace UI): variance **4**, motion **2**, density **5**.  
Landing may use slightly more atmosphere (motion **3**) without purple/glow/cream-serif defaults.

## Goals

1. Two first-session journeys share identity, policies, and insurance backend: **Protect** (human) and **Build** (agent/developer).
2. Feel like a professional insurance platform, not a panel dump.
3. Keep routes, auth, contracts, and business rules stable.
4. Never present synthetic/demo/prepared data as live insurance or paid reimbursement.

## Non-goals

- Public Railway deploy or gate removal  
- Contract / financial broadcasts  
- New backend business rules without coordination  
- Auth weakening or client-side role escalation  
- Decorative animation budget  

## Approaches considered

| Approach | Summary | Trade-off |
| --- | --- | --- |
| A. Visual reskin only | Same IA, new tokens/components | Fast; does not fix dual-primary journeys |
| B. Full route remapping | New paths per persona | Breaks “preserve routes” constraint |
| **C. Contextual workspaces + shared system (recommended)** | Same URLs; chrome/IA by persona; shared primitives; wizard/claims clarity | Slightly more shell complexity; highest journey clarity |

**Chosen: C.**

## Information architecture

### Public

- `/` becomes **product landing** with two primary CTAs: Protect my agent · Build with Arcuex.
- Short proof of what is live (Arc Testnet) vs synthetic beta labeling.
- Secondary link to existing Overview-style connectivity can move under Build or a “Status” affordance — not the home hero.

### Protect workspace (policyholder)

Nav (contextual): Overview · Coverage · Policies · Claims  
(Routes: `/` entry CTA → `/coverage`, `/policies`, `/claims`, …)

- Policyholder overview: next action, policies summary, open claims — not RPC soup.
- Coverage: stepped wizard (see below).
- Claims: owner case list / submit / detail; hide reviewer workbench and legacy ledger from default Protect chrome.

### Build workspace (agent/developer)

Nav: Agents · Integrations · (link into Coverage/Policies with builder framing)  
Routes stay `/agent`, `/integrations`, reuse `/coverage` / `/policies` with workspace chrome.

### Ops workspace (role-gated)

Entry only via explicit ops paths (`/claims/review`, capital, legacy ledger) and ops session — **not** in Protect/Build primary nav.  
UI may hide controls; **server remains source of truth**.

## Visual system (tokens)

Working names (implementation in CSS variables):

| Token | Intent | Avoid |
| --- | --- | --- |
| `--ink` | Near-black text | Slate-on-purple kits |
| `--paper` | Cool neutral page ground | Warm cream #F4F1EA |
| `--surface` | Raised work surface | Soft grey card shadows everywhere |
| `--line` | Hairline structure | Heavy multi-shadow stacks |
| `--accent` | Single institutional accent (deep teal or steel blue) | Purple/indigo gradient, glow |
| `--live` / `--synthetic` / `--warn` / `--danger` / `--ok` | Status semantics | Color-only meaning |

**Type:** Keep IBM Plex Sans as product body; pair with **IBM Plex Mono** for addresses/ids/hashes (already in family spirit). No Inter/Roboto. Display stays restrained — weight and size, not costume serif.

**Components (reuse first):** `AppShell` (workspace-aware), `PageHeader`, `Button`, `Input`/`Select`, `StatusBadge` (extended tones), `DataTable`/`ListRow`, `EmptyState`, `AuthRequired`, `Callout` (live vs synthetic), `Stepper` (procurement).

**Cards:** Only where interaction/grouping needs a container; landing hero is not a card grid.

## Priority screens

1. **Landing `/`** — brand-forward dual CTAs; one supporting sentence; no stats strip in first viewport.
2. **Policyholder overview** — either refined `/` post-entry or a Protect home state; next actions.
3. **Coverage wizard** — eligibility → terms (premium, deductible, beneficiary, window, exclusions) → exact digest accept → wallet approve → bind pending → **confirmed** (never “active” before confirm).
4. **Policies list/detail** — portfolio clarity; chain match vs local confirm labels.
5. **Claims list / new / detail** — stages, evidence provenance, loss math; REVIEW ≠ approved ≠ paid; synthetic unmistakable.
6. **Agent management** — delegation scope readable; link to procure.

## Procurement UX rules

- Surface terms the API already returns; do not invent coverages.
- Exact quote acceptance preserved.
- Explicit states: disconnected / wrong network / sign-in / allowance / tx pending / success / failure.
- Copy: “Confirmed on Arc Testnet” only after bind confirmation path succeeds.

## Claims UX rules

- Map case status to human stages; keep machine status visible as secondary.
- Evidence: source, provenance, synthetic fixture badge.
- Payment language only after verified settlement receipt checks.
- Ops actions remain on `/claims/review` + ops session.

## Verification plan (Phase 7)

- No API contract or auth changes in UI commits.
- Tests: existing web vitest + new component/state tests where added.
- `pnpm typecheck`, `lint`, `build`; browser E2E on critical Protect/Build paths (mocked wallet ok for UI; live labeled separately).
- Before/after screenshots under `docs/working-notes/nov20-ui-redesign/`.
- Acceptance report + deferred list; **no Railway deploy** from this branch until GO.

## Incremental commit sequence (post-approval)

1. `chore(ui): design tokens and primitive components`  
2. `feat(ui): workspace-aware shell and landing dual entry`  
3. `feat(ui): policyholder overview and nav demotion of ops`  
4. `feat(ui): coverage procurement wizard chrome`  
5. `feat(ui): policies and claims journey clarity`  
6. `feat(ui): agent workspace polish`  
7. `docs(ui): acceptance report and deferred features`  

## Deferred (explicit)

- Full marketing site / public DNS  
- Live extension-wallet E2E as proof of financial acceptance  
- Capital LP deposit productization  
- Rewriting claims case engine or quote math  
- Dark mode  

## Open questions (non-blocking)

- Post-login default: last workspace vs Protect overview (recommend: Protect if claimant session, Build if deep-linked from `/agent`).
- Whether connectivity dashboard survives as `/integrations` only or a secondary “Network status” panel on Protect overview (recommend: Integrations only + small live chain chip in shell).
