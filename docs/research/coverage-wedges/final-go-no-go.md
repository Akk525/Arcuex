# Phase B decision: CONDITIONAL GO

2026-11-17 UTC. Proceed with the synthetic causal-verification integration and the
bounded historical replay as a regression. **Do not enable real historical payouts.**
No rescoring or new insurance-wedge search was performed.

## Established by this work

- Retrieved a specific CAPO configuration update and subsequent liquidation at block
  24626860, transaction indices 0 and 1 respectively. Captured raw logs, receipt,
  transaction, header, adapter state/code and a transaction-prestate witness.
- Executed deployed bytecode offline. Actual HF `0.994396636472242223` becomes
  `1.023465425310963254` after a single snapshot-ratio-field intervention. Original
  transaction reproduces all 23 retrieved logs; counterfactual reverts with no logs.
- Computed conditional gross loss of `249187405918649252451` base-asset wei,
  including protocol-fee collateral depletion and debt extinguishment.
- Supplied a deterministic synthetic verifier with VERIFIED/REJECTED/REVIEW cases,
  exact arithmetic, evidence commitments, exposure binding and candidate caps.
  Every outcome explicitly says it does not authorize payment.

## Why this is not GO

The replay demonstrates consistency of a **provider-supplied historical witness**.
It does not authenticate that witness to a trusted consensus header. Two other RPCs
returned null for the selected transaction. The supplemental library came from a
Sourcify metadata-level match. These findings remain unresolved rather than silently
discarded. No full transaction-signature, receipt-trie or state-trie proof was verified.

Borrower-level reimbursement/rights reconciliation is also incomplete. A proposal,
allowance or aggregate DAO payment cannot establish the selected beneficiary's final
loss. The conditional gross amount is not remaining net harm; historical candidate
payout remains **zero / REVIEW**. No market-to-USDC conversion, historical policy,
premium, claims authority or capital commitment is invented.

## Concrete next actions and exit gates

1. **Codex A now:** integrate only synthetic evidence and REVIEW-preserving outcomes
   following [handoff v2](integration-handoff-v2.md). Keep the historical EVM runner
   an offline research regression, not a payout signer.
2. **Evidence engineer:** obtain an independently operated archive/consensus source for
   the exact hash; authenticate parent/header/receipt inclusion and earlier tx replay.
   Rebuild/check the supplementary library source/runtime and confirm event hardfork.
   Exit: the same prestate and replay are authenticated independently of the original
   RPC, with the null responses explained.
3. **Claims/recovery analyst:** enumerate and verify direct/indirect reimbursements,
   assigned rights, other insurance and related-party benefit for this borrower.
   Exit: independently reviewable net loss and event-time valuation, or verified
   complete recovery and therefore zero claim.
4. **Underwriter:** approve the canonical valuation assumption, reference controls,
   exclusions, pre-event registration, loss retention, claimant independence and
   correlated incident limits. Exit: concrete eligible pilot exposure and funded risk
   capacity. Retrospective causal evidence does not create retrospective coverage.

If those gates fail because a trustworthy independent reference or causal witness
cannot be obtained, revisit only the existing protocol-impairment fallback. A fallback
re-evaluation was not triggered here: the synthetic demo is sound and one witness
replays, while independent authentication and final economics remain incomplete.

## Verification and scope

Commands executed from the isolated worktree:

```sh
pnpm exec node --test docs/research/coverage-wedges/fixtures/evaluator.test.ts
pnpm exec node --test docs/research/coverage-wedges/experiments/causal-v2/verifier.test.ts
pnpm exec node docs/research/coverage-wedges/experiments/causal-v2/synthetic/run.ts
cd docs/research/coverage-wedges/experiments/causal-v2/evm-runtime
pnpm install --frozen-lockfile --offline
pnpm exec node replay.mjs
pnpm exec node --test regression.test.mjs
```

Final focused suite: **52 original + 34 causal + 5 historical EVM = 91 passing tests**.
Strict TypeScript checks cover both fixture generations and the synthetic runner.
The evidence-integrity manifest check, formatting and `git diff --check` also pass.
No production tests/build were rerun because no production code or dependency changed.

All tracked changes are under `docs/research/coverage-wedges/`. The nested EVM runtime
has its own pinned pnpm manifest/lockfile; production dependencies are untouched.
The main application, contracts, API, SDK, UI and Codex A's branch were only read.
No transactions or wallet actions were submitted.

Research commit history begins with `d081c40` for the captured witness and tested
prototype. Later small commits add the specification, integrity checks and handoff.
Use `git log --oneline 37134a6..HEAD` for exact Phase B commits; final commit hashes
and push status are reported with delivery.
