# Premium redesign, Phase D: claims and human review

Verified November 19, 2026 on local branch `ui/premium-product-redesign`. Nothing was pushed or deployed, no
transaction was broadcast, and Railway Plan A was not touched.

## Routes

- `/claims`: a "Reviewers are waiting on you" list for claims with unanswered evidence requests, filter chips with
  counts, search (agent, incident, policy, claim ID), and a table showing the persisted incident reference, evidence
  state and status. Approved claims say "not reimbursed". There are no metric cards.
- `/claims/new`: a guided flow (Policy, Incident, Proof, Review) with policy cards, a review step with edit links,
  and progress messages while filing. The open / attach / complete calls and their payloads are unchanged. The review
  step states that insured agents file through the SDK with their own registered signer.
- `/claims/[id]`: the dossier.
  - A next-step band derived from server state, and a compact outcome summary on mobile.
  - Outstanding requests with an inline proof response.
  - Server-verified findings shown next to the advisory examiner reading. They are never merged.
  - A connected timeline with distinct styling for human, AI, proof and verification entries.
  - The human decision, with the reviewer's recorded rationale.
  - A sticky desktop sidebar: financial outcome, settlement blocker, linked records, manifests and technical
    identifiers.
- `/claims/review`: reviewer access is gated by session. The queue is grouped by what each claim needs next. Each row
  shows the server triage reason, open and answered requests, verifier freshness, and the decision available (or why
  none is). Settlement rows show "No payment action" or "Authority handoff". AI output never appears as a decision.
- `/policies/[id]`: on mobile, Claims now comes right after the coverage summary. This is a CSS order change only.

## Backend changes (read-only additions)

`lib/server/claims-list-context.ts` adds display labels:
- insured agent, product and position
- incident reference and time
- open and answered request counts (same rule as triage)
- verifier freshness (same rule as review readiness)

The cases list, case detail and dashboard routes now return these labels, and the claimable-policies route returns
product and agent labels. Nothing changes eligibility, authorization, evidence, adjudication or settlement.
`statusTone('APPROVED')` is now `live` instead of `ok`, so an approval never looks like a payment.

## Verification

- `pnpm lint`, `pnpm typecheck`: pass.
- `pnpm test`: pass, with `CLAUDE_CODE_MESSAGING_TOKEN` unset. Web is 218 tests, including the new presentation and
  parser tests.
- `pnpm test:contracts`: 46 tests pass.
- `pnpm build`: pass.
- Browser acceptance, `apps/web/scripts/premium-phase-d-acceptance.mts`: 34 checks pass.
  - Setup: a real production fixture app, temporary SQLite, the actual SDK, the verifier and examiner worker, and
    Chrome. Only the OpenAI transport is doubled, so reports show `TEST DOUBLE · no live AI inference`. Zero paid
    inference calls.
  - Case sequence:
    1. Agent SDK submission and initial proof.
    2. Examiner gap report.
    3. Reviewer token exchange; the reviewer adopts the proof request.
    4. Policyholder inline validation: oversized and invalid UTF-8 files are rejected.
    5. Agent SDK response linked to the request.
    6. Reviewer resolves the request with a rationale.
    7. Fixture reverification.
    8. Examiner reassessment.
    9. Gated human approval, ending at `APPROVED` / `pending_authority` with no payment language.
  - Also checked:
    - Fixture settlement denial.
    - A second claim filed through the guided browser flow.
    - Failure states: list 503, unknown claim.
    - Empty states: signed out, no claims, no eligible policy.
    - Zero horizontal overflow and zero console errors across 27 captures.
  - Command:

    ```
    ARCUEX_BROWSER_EVIDENCE_DIR=<new dir> PLAYWRIGHT_MODULE=<playwright index.mjs> \
      pnpm --filter @arcuex/onchain exec tsx ../../apps/web/scripts/premium-phase-d-acceptance.mts
    ```

Evidence is in `screenshots/premium-phase-d/` (`results.json`, `acceptance-transcript.txt`). `FAILURE-` and `EMPTY-`
prefixes mark error and empty states. `EMULATED-p1-…` uses the Phase C emulated wallet and mocked policy data.

## Known follow-ups

- Mobile dossiers with long histories are tall. Earlier activity collapses after 14 events, but each examiner report
  is still long.
- The examiner report that was current at approval shows "earlier dossier" afterwards. The server marks it stale
  because the decision changes the dossier digest. This is correct behaviour, but the wording could be gentler.
