# Premium redesign — Phase C: coverage, policies, policy detail

Branch `ui/premium-product-redesign`, 2026-11-19. Not deployed or pushed.

## Pre-Phase-C fixes

- **Homepage illustrations.** The hero claim card has an "Illustration" badge and the
  caption "Illustrative synthetic example. No claim was filed and no funds moved." The
  oversight dossier badge reads "Illustration". The end state is still "Approved / Not
  reimbursed".
- **Dashboard claim labels.** `/api/dashboard` adds three optional fields from persisted
  data: `title` (covered exposure description), `filedAt` (case `createdAt`) and
  `synthetic` (`syntheticDemo`). The attention rail shows "{exposure}, filed {date}" and
  falls back to "Claim {id8}". This is a read projection only; no financial logic changed.
- **Navigation.** `activeNavHref` highlights nothing on hidden Ops routes
  (`/claims/review`, `/capital`) for non-ops sessions. Before, `/claims/review` lit up
  "All claims".
- **Homepage compositions.** The trust section is now a three-column control ledger
  (control / guarantee / where enforced). It is distinct from the hero field, the
  capabilities hairline grid and the scrubbed workflow stage.

## Phase C

### `/coverage`: guided purchase

- The four-step rail is unchanged in logic and renamed: Exposure, Terms, Review, Pay
  and bind.
- **Step 1, product and insured exposure:**
  - product radio cards;
  - pricing, eligibility and live pool capacity;
  - exclusions shown up front;
  - agent radio rows with their exposure value;
  - the registration form.
  - Delegated purchases show a structured grant record (scope, caps, budget, expiry). It
    states that agent identity does not grant authority.
- **Step 2, terms:**
  - segmented limit and term controls, offering only eligible limits;
  - the beneficiary, with its provenance;
  - four declaration rows, all required.
- **Step 3, quote review:**
  - premium, limit and deductible, each with a one-line meaning;
  - a live quote countdown;
  - the coverage window: accept by, can start, ends;
  - covered event and exclusions;
  - the parties: insured agent, policyholder, payer, beneficiary, delegation;
  - limitations, the technical digest, and the accept checkbox, which says acceptance is
    offchain.
- **Step 4, pay and bind:**
  - three separate steps: allowance, bind, reconciliation. Each has its own status line
    from `paymentSteps()`.
  - The handlers, disabled conditions and copy for wallet calls are unchanged.
  - Payment buttons have no press animation.
- **Interrupted checkout:**
  - A "Resume an interrupted checkout" panel appears when `?policyId=` is present.
  - An uncertain bind shows "Check your wallet activity" with hash recovery. The allowance
    step reads "Check the bind first" and does not invite a new payment.
- **Sticky purchase summary:**
  - premium, limit, deductible, term and quote time left;
  - a "When coverage begins" explanation from `coverageStartCopy()`;
  - one status pill from `checkoutStatus()`.
  - On mobile, a compact premium and status strip sits under the rail.

All state, effects and API calls in `human-procurement-panel.tsx` above the render are
unchanged except the step labels (verified by diff against `5e475b0`).

### `/policies`: portfolio

- **Loading.** Loading stays explicit because it may prompt a wallet signature.
- **Needs your attention:**
  - resumable or uncertain purchases, linking to checkout recovery;
  - policies ending within 7 days;
  - unreconciled onchain records.
- **Filters and search.** Status filters with counts (All, Needs action, Awaiting
  confirmation, In force, Scheduled, Ended) and search by product, agent, position or ID.
- **Table rows.** Each row shows policy, insured agent and position, coverage window,
  limit and a short status. Whole-row links go to the detail page; on mobile, rows stack
  as cards.
- **Short labels.** They are never stronger than the full label, which stays available
  as a title and as screen-reader text. "Reconciliation pending" is never grouped as in
  force.
- **Other states.** Empty, error, loading and no-match states are handled.

### `/policies/[id]`: structured record

- **Header:** product name, policy ID, provenance and status, Refresh, and the next
  action (file a claim or resume a purchase).
- **Summary:** a one-sentence state (bound is never presented as in force), then limit,
  deductible, premium and window, plus the live contract check when available.
- **Binding and coverage timeline** (`policyTimeline()`): accepted, allowance, bind,
  reconciliation, can start / started, ends, and settlements.
  - Reconciliation shows "current", not done, until the lifecycle confirms it.
  - A settlement without a receipt reference is never shown as received.
  - No acceptance timestamp is shown, because none is recorded.
- **Other sections:**
  - terms, exclusions and limitations;
  - transaction references with explorer links;
  - collapsible technical details (digest, onchain ID, pool, source, checkpoint, raw
    record);
  - claim eligibility, with its rule stated;
  - parties;
  - read-only bind receipt recovery.

## Verification

- `pnpm lint`, `pnpm typecheck`: clean.
- `env -u CLAUDE_CODE_MESSAGING_TOKEN pnpm test`: all packages pass (web 206 tests).
- `pnpm build`: OK.
- **Contracts:** unchanged; Forge not re-run.
- **New unit tests:** `checkout-presentation.test.ts` (13) and `policy-timeline.test.ts`
  (4). They cover:
  - no coverage claim before reconciliation;
  - allowance ≠ payment;
  - uncertain bind handling;
  - settlement needs a receipt.
- **Browser acceptance:** `premium-phase-c-capture.mjs` drove the real UI at 1440×900 and
  390×844.
  - Journey: connect, load agents, terms, quote, accept, awaiting authorization; then
    resume and recovery; portfolio and filter; confirmed detail; pending-reconciliation
    detail.
  - No console errors and no horizontal overflow.

### Screenshot fixtures

Files prefixed `EMULATED-` use an **emulated EIP-1193 wallet**, which never signs or
sends, and **mocked authenticated procurement responses**: session, agents, quotes,
acceptance, policies and lifecycle. Each image carries an on-page fixture label. The
product catalog and pool capacity (2.11 USDC) are live Arc Testnet reads from the dev
server. No transaction was broadcast.

## Known issues / follow-ups

- Approval `at` values are not displayed because their units are not documented in the
  API.
- In the policy detail on mobile, Claims and Parties come after Terms. Consider moving
  Claims above the timeline on small screens.
- `pnpm build` overwrites the dev server's `.next`, so restart `next dev` after building.
