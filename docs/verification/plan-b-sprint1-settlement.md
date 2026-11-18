# Plan B Sprint 1 — settlement feasibility

Verified 2026-11-18 against baseline `42e2c225b32b6b3d41abf8e0c2a6e9ba5f878f62`.
Branch `analysis/plan-b-sprint1-settlement`; worktree `/private/tmp/arcuex-plan-b-settlement`.
Scope: source audit and offline tests only. No RPC calls, forks, deployment, wallet approval,
capital movement, live bind, payout, Railway access, production database access or keys.
Plan A remains `f8365a85f0c4a6298f713be7e799cb7538ca1fc7` at its existing deployment.

## Verdict

**The current InsurancePool code supports a fresh, authorized synthetic testnet payout unchanged,
provided the payout is included during the policy's coverage window.** This is a conditional
code/EVM feasibility verdict, not verification of the deployed bytecode, present funds, signer
availability, RPC health or a completed end-to-end live journey.

**The existing production web runtime cannot prepare a synthetic settlement.**
`NODE_ENV=production` enforces this even with `ARCUEX_DEPLOYMENT_MODE=local-test`:
`validateRuntimeEnvironment` rejects `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=1`,
and both bearer and session principal construction require `!c.enforced`.
Changing the profile alone does not help. Do not relabel synthetic evidence as independent.

The smallest defensible demonstration path is a separately authorized, loopback-only development
instance with its own empty SQLite database and credentials, using the already explicit development
synthetic-preparation flag. Keep production checks intact. The existing contract needs no replacement.
If public hosted synthetic settlement preparation is required, that is a separate design/approval task:
a visible demo capability with rigorous environment isolation, not a hidden authority bypass.

## Exact prerequisites and authorization sequence

1. Obtain separate authorization for every future live operation. None is granted by this audit.
   Preserve Plan A's source, volume, environment, policies, hashes and history. Never reuse its DB,
   data directory, session/rate secrets, acceptance gate or operator tokens. Bind the development
   server to loopback; do not expose development authentication publicly. Do not import production
   credentials. SQLite isolation does **not** isolate a shared onchain pool's funds or authority.
2. Read and verify Arc chain ID 5042002, the pinned deployment address/code, USDC address/decimals,
   `claimsAuthority`, fee recipient, balances, reservations, existing loss records and policy IDs.
   The web adapter pins the deployment manifest pool; changing an env var does not isolate it.
   A separate contract would need explicit approval; do not deploy one during this sprint.
3. Register the agent/exposure under the owner (or explicit scoped delegation). Existing procurement
   permits limits 1, 10, 50, 100 USDC, no greater than registered exposure; durations 1, 7, 30 days.
   All eligibility attestations must be true, including healthy position/no known incident/synthetic.
   These are attestations, not independently proven eligibility.
4. Create a fresh quote and explicitly accept its exact immutable digest. `ProcurementService.quote`
   sets premium = limit/100, deductible = limit/10, effectiveAt = quote time + 900 seconds,
   expiresAt = effectiveAt + durationDays*86400, quoteExpiresAt = quote time + 600 seconds.
   Terms include owner, frozen beneficiary, agent/exposure, event and exclusions, synthetic label.
   Do not mutate terms or backdate an incident to make a demo fit.
5. Before bind, available pool capital must cover the **full limit before premium collection**.
   Payer needs premium and transaction gas; LP capital deposits, if needed, require separate approval.
   LP and premium payer must explicitly approve USDC allowances and the relevant wallet transactions.
   The successful bind receipt must match all terms and fall in the ten-minute quote window and
   before effectiveAt (`verifyBindEvent`). Reconcile canonical confirmed bind evidence and a healthy,
   fresh policy checkpoint before ClaimsCase intake. An in-memory policy alone is insufficient.
6. Wait for effectiveAt. Intake an actual linked incident/exposure owned by the claimant, with a
   nonfuture incident timestamp inside the contractual window. The Sprint 1 verifier on the other
   branch establishes only catalog fixture consistency. It neither proves a real loss nor supplies
   a reviewer decision; the integration of that record into adjudication remains future work.
7. Collect evidence manifests. A claimant can attach evidence; claimant assertions cannot grant
   independent authenticity. Evidence collection must reach INVESTIGATING (or reviewer-controlled
   REVIEW/reopening). An explicit reviewer/authority adjudicates coverage, verified/fixture-consistent
   loss and known recoveries. Unknown loss/recoveries route to REVIEW. No AI vote is authority.
8. Approval freezes canonical policy/exposure/incident lossKey, manifest evidenceRoot, beneficiary,
   payable and economic-loss inputs. Evidence must be present and authenticity must be appropriate;
   the synthetic demo path remains labeled synthetic. Never substitute the fixture's own deductible
   or illustrative payable for the policy deductible and reviewed amounts.
9. A distinct explicit authority action confirms **exact** recipient, payable, lossKey and evidenceRoot.
   `authorizeSettlementPreparation` rechecks binding, current manifest root, policy/loss commitments,
   and net economic loss. Synthetic preparation requires the explicit nonproduction capability.
   HTTP preparation reconciles policy state and calls `prepareClaimsTransaction`; preparation does
   not sign or broadcast. The app authority role and contract `claimsAuthority` are separate checks.
10. Immediately before any separately authorized broadcast, re-read/simulate current chain state.
    `prepareClaimsTransaction` requires bound/not cancelled policy, current block in the window,
    matching beneficiary, adequate remaining limit/reservation, compatible lossCap/lossKey.
    Only the current contract `claimsAuthority` may sign `settleClaim`. Recipient must exactly equal
    the immutable policy beneficiary. A reviewer's app login does not grant that wallet authority.
11. Payout inclusion must satisfy `coverageStart <= block.timestamp <= coverageEnd`. An incident
    occurring in time does not extend settlement time. Leave operational margin; do not aim at the
    last block. Early authority reservation release cancels the policy and blocks payout.
12. Reconcile a successful receipt before PAID. HTTP `verifyClaimsSettlement` checks chain, successful
    transaction to the pinned pool, sender against authority at receipt block, pool log and exact
    policyId/claimId/lossKey/beneficiary/amount/lossCap. Use canonical receipt/confirmation evidence
    and compare policy/loss balances, settledClaims and USDC transfer/accounting before acceptance.

## Money and replay rules

All amounts are integer six-decimal ERC-20 USDC micros. Let L be reviewed loss before deductible,
D policy deductible, P external prior compensation, R known recoveries, C the sum of existing paid
and pending same-loss commitments. Economic room = max(0, L-D-P-R-C). New payable is bounded by
that room, requested amount, policy remaining limit and immutable same-loss cap minus C.
Do not subtract deductible twice or conflate external prior compensation with pool-paid commitments.
`computeNetLossPayable` handles unknown loss/recoveries conservatively. Preparation separately
checks all pending/paid policy commitments against immutable policy limit and same-loss commitments
against frozen economic loss and lossCap. The contract does not evaluate deductible or evidence;
the authority must preserve those offchain rules. Numeric SQL sums are appropriate for current small
demo limits; larger future exposures need an integer precision audit.

`claimId` is global settlement anti-replay; `lossKey` is canonical economic identity, with partial
payouts sharing a fixed lossCap and policy association. Contract reverts a replayed claimId, increased
cap, reused lossKey across policies, excess reserve/limit/cap or wrong beneficiary/authority.
A repeated HTTP prepare while pending is a state rejection, not a new payout. If broadcast outcome
is unknown, reconcile before retrying; never mint a new claimId to evade replay. SETTLEMENT_FAILED
is not proof that no onchain payout occurred. Contract state wins over SQLite.

## Offline simulations and results

`contracts/test/PlanBSprint1.t.sol` extends the existing pool test harness. No contract source changes.
No fork or RPC; `forge test --offline` compiles locally and executes in the test EVM.

- Fresh quote-like policy: 15-minute delayed start, one-day window, limit 1 USDC, premium .01 USDC,
  deposit 2 USDC. Review calculation: 1.00 loss - .10 deductible - .10 prior compensation - .20
  recoveries = .60 payable. The contract test supplies this reviewed amount; it does not adjudicate.
- Before payout: assets 2.01, reserve 1.00, free capital 1.01. After authority payout: assets 1.41,
  reserve .40, free capital 1.01; beneficiary increases .60; contract USDC equals tracked assets.
- Reusing claimId reverts. A payout at coverageEnd succeeds; another at coverageEnd+1 reverts,
  preserving assets/reserve. 256 fuzz cases over positive payouts <= limit preserve assets/reserve
  conservation and unchanged free capital, and call assertSolvent.
- Full offline contract suite: **46 passed**, including 3 new tests (one fuzz test); inherited baseline
  tests run in the extended harness as well. Baseline contains 21 pool tests plus one loss-key test.
- Application baseline suite and typecheck/lint/build results are recorded in [the validation file](plan-b-sprint1/settlement-validation.md).
  Existing service tests cover synthetic-prep denial, explicit authorization, changed bindings,
  missing evidence, unknown recoveries, same-loss partials and policy-wide commitments.

## Risks, remaining blockers and merge evidence

- Not a proof that deployed code and funded/signer state currently match source. No live reads were
  requested or run. Verify these with read-only checks before requesting any live approvals.
- No post-expiry payout path exists. Expired historical policies cannot be repaired by backdating;
  use fresh legitimately bound terms. A grace period would require a reviewed replacement contract
  and deployment approval, only if the demo truly requires post-expiry settlement.
- The contract permits permissionless bind with caller-chosen terms and relies on authority evidence
  checks at settlement. Only canonical, reconciled application policies may enter this demo workflow.
- Current receipt adapter has no explicit confirmation-depth/reorg acceptance policy or USDC-transfer
  check; preserve independent accounting/transfer reconciliation evidence before declaring acceptance.
  `markClaimsCasePaid` is an internal trusted service; HTTP receipt checks must not be bypassed.
- Track 1 intentionally does not change evidence authenticity, approve a case or automatically feed
  findings into the existing reviewer calculation. A guided browser lifecycle is not delivered here.
- Before merge: review this verdict and new tests; require green CI and inspect exact diffs. Confirm
  production synthetic denial remains intact. Before future live demo: approve a concrete isolated
  environment, exact source/runtime, fresh terms, beneficiary, budget, authority wallet, timing margin,
  chain state/simulation and separate per-operation wallet approvals. Merge is not deployment approval.

Source anchors: `contracts/src/InsurancePool.sol`; `packages/agent-sdk/src/procurement.ts`;
`packages/insurance/src/{claims-case-service,net-loss,settlement-prep}.ts`;
`apps/web/src/lib/server/{runtime-config,claims-auth,claims-session,claims-chain,procurement-chain}.ts`.
