# Release sprint: premium UX and demo route

Verified 2026-11-20 on local branch `ui/release-sprint-ux` (from `main` `14aa34d`). Not pushed or deployed.
No transaction was broadcast. Plan A was not touched.

## Changes

- Navigation is grouped as **Protect** (Buy coverage, Policies), **Claims** (Claims, File a claim),
  **Insurer** (Review queue, Capital; ops sessions only, the server still enforces roles) and
  **Mission Control** (Overview, Agents, Historical replay, Integrations). Every item is an existing route.
- Coverage checkout rail: Product & agent → Terms → Quote → Authorize → Policy. "Policy" completes only
  when the server lifecycle reports a scheduled or effective bind.
- Claim dossier: lifecycle rail Claim filed → Evidence → AI examiner → Human review, with
  **Reimbursement** in a separate dashed box ("Approval ≠ payment"). Reimbursement completes only for a
  non-fixture case with a reconciled Arc receipt (`claim-journey.test.ts`).
- `/replay/oracle-liquidation`: read-only historical CAPO counterfactual (Ethereum block 24626860).
  The values come from `offline-replay.json`, and `oracle-liquidation.test.ts` fails if they drift.
  It is labeled as not a claim and not paid, and the candidate payout is zero pending REVIEW.

## Demo route (2–3 min)

1. `/dashboard`: Mission Control overview.
2. `/coverage`: product and insured agent → terms → quote → authorize → policy.
3. `/policies/<id>`: definitions, insured agent, policyholder, payer, beneficiary, terms. Requires a
   connected policyholder, payer or agent wallet.
4. `/claims/new` → `/claims/<id>`: evidence, examiner advice, human review, then the separate
   reimbursement state.
5. `/claims/review` (reviewer session): the insurer queue.
6. `/replay/oracle-liquidation`: historical counterfactual and why it is not payable.

## Verification

- `pnpm --filter @arcuex/web lint`, `typecheck`, `build`: pass.
- `pnpm --filter @arcuex/web test`: 233 pass with `CLAUDE_CODE_MESSAGING_TOKEN` unset.
- `premium-phase-d-acceptance.mts` on this build: all 34 checks pass. This covers the agent SDK claim,
  examiner gap, reviewer request, agent response, reverification, gated approval ending at
  `APPROVED`/not reimbursed, and fixture settlement denial. Zero overflow and zero console errors
  across 27 captures.
- `apps/web/scripts/release-sprint-capture.mts`: 8 captures, zero overflow, zero console errors.

Screenshots: `screenshots/release-sprint/`. The `d*` dossier images come from the Phase D run.

## Remaining

- The policy record needs an injected wallet, so the capture shows the wallet gate
  (`s04-GATED-…`). The parties panel exists in `policy-record.tsx` but was not captured with
  real records this sprint.
- The full coverage bind needs a wallet and Arc Testnet. Only step 1 was captured, in fixture mode.
