# Workspace navigation

| Destination | Entry | Actions and detail |
| --- | --- | --- |
| Overview | `/dashboard` | Next action, coverage, claims, activity and recent reimbursement status when available. Mission Control is the interactive example. Historical replay remains a linked case study. |
| Coverage | `/coverage` | My policies by default. `?tab=applications` opens coverage applications and `?tab=products` opens available products and quoting. |
| Agents | `/agent` | Add an agent at `/agent/new`, see registered positions and manage delegations. |
| Claims | `/claims` | File at `/claims/new`, follow evidence and decisions at `/claims/[id]`. Eligible policies link to filing with the policy preselected. |
| Insurer workspace | `/insurer` | Underwriting and claims review keep their existing URLs. AI investigations and settlements are focused views of the workbench. Capital remains at `/capital`. |
| Developer tools | `/integrations`, `/settings`, `/help` | SDK examples, API authentication guidance, diagnostics, wallet settings and help. |

`/policies` and `/coverage/applications` still render their respective Coverage tabs.
Policy detail URLs and existing Coverage query links for policy resumption, agents,
delegations and registration keep their behavior.

The insurer switch uses the authenticated reviewer or authority role from the
existing session endpoint. An anonymous user or customer opening a staff URL sees
the existing staff sign-in prompt. The existing API role and policy checks enforce
authorization. Queue origin on a dossier URL controls navigation only.

The investigation entry point links to the evidence and examiner findings the
existing claim dossier supports. Only the recorded human decision determines
coverage. Reimbursement status depends on settlement reconciliation. The
historical case study and Mission Control example are illustrative.

This build uses signed wallet sessions for agent API access. It has no MCP
connection or API key management UI.

## Local verification

On 2026-11-20, the production build, lint, and 468 workspace unit and integration
tests passed. The release browser harness checked customer and reviewer navigation,
legacy Coverage links, policy-to-claim filing, agent onboarding, and the mobile
drawer and lifecycle demo. Its eight captures reported zero horizontal overflow
and no browser console errors. The claims acceptance harness passed 34 checks
against temporary SQLite, fixture chain data and mocked examiner inference.
