# Onchain insurance lifecycle — design (A1–A3)

**Status:** Accepted for `feat/onchain-lifecycle` (user brief 2026-11-16)  
**Baseline:** `d9d47a5` (synthetic domain + SQLite core green)

## Goal

Policy-agnostic financial contracts and integrations that make quote → bind →
reserve → authorized settle → USDC payout authoritative on Arc Testnet, while
keeping coverage-wedge evidence and AI votes off the money path.

## Arc facts (verified 2026-11-16)

| Item | Value | Source |
| --- | --- | --- |
| Testnet chain ID | `5042002` | docs.arc.io connect-to-arc |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` | docs.arc.io contract-addresses |
| ERC-20 decimals | 6 | same |
| Native gas decimals | 18 (same asset) | docs.arc.io evm-differences |
| Fee floor | 20 Gwei `maxFeePerGas` | same |
| Finality | single inclusion | same |

**Rule:** All pool accounting uses the 6-decimal ERC-20 interface only. Never mix
`msg.value` / 18-decimal native units into pool math.

Local Foundry/`anvil` does not simulate Arc precompiles; tests use `MockUSDC`.
Testnet deployment uses the official USDC address.

## A1 — Financial contracts

Single vault `InsurancePool`:

1. **LP capital** — `deposit` / `withdraw` with 1:1 shares under full collateralization
   until losses; withdrawals limited to `assets - reserved`.
2. **Bind** — `bindPolicy(policyId, termsHash, beneficiary, premium, limit, start, end)`
   pulls premium via `transferFrom`, increases pool assets, reserves `limit` from
   available capital (reverts if underfunded). Policy terms are immutable after bind.
3. **Settle** — `settleClaim(policyId, claimId, amount, payoutTo)` callable only by
   `claimsAuthority`. Checks: policy bound, not expired path handled by caller or
   coverage window, `payoutTo == beneficiary`, `amount <= remaining limit`,
   `amount <= reserved`, `claimId` unused (anti-replay).
4. **Release** — authority can release unused reservation after expiry/cancel.
5. **Invariants** — `assets >= reserved`; conservation of USDC across deposit/bind/settle/withdraw;
   no AI role on-chain.

OpenZeppelin: `Ownable`, `ReentrancyGuard`, `IERC20`, `SafeERC20`.

## A2 — Domain / chain integration

- Canonical `policyId = keccak256(abi.encode(...))` helpers in `@arcuex/domain` + Solidity.
- `termsHash = keccak256` over canonical terms encoding.
- `@arcuex/onchain`: typed ABIs, viem read/write helpers, wait-for-receipt, failure mapping.
- Persistence: onchain tx / claim settlement audit rows; reconciler compares SQLite
  policy/capital rows to contract state (contract wins).

## A3 — Agent SDK

`@arcuex/agent-sdk` surface (no private keys collected):

`requestQuote → getQuote/terms → acceptQuote → prepareBindTx → (wallet signs) → waitActive → getPolicy/getClaim`

Permissions: narrowly scoped function allowlist for USDC `approve` + `bindPolicy`.

## Trust boundaries

| Actor | Can move USDC? |
| --- | --- |
| LP wallet | Deposit/withdraw only |
| Policyholder / agent wallet | Premium approve + bind |
| `claimsAuthority` (human/rule ops key) | Settle / release only |
| LLM / majority vote | **Never** |

Synthetic incident evidence remains off-chain and labeled simulated until a wedge
oracle exists. Coverage wedge stays undecided.

## Out of scope (this branch slice)

- A4 Streams, A5 full dashboard redesign, A6 live testnet vertical proof — after A1–A3 green.
- Mainnet, production pricing, real loss proofs, Circle Gateway/CCTP.

## Approach chosen

**Monolithic `InsurancePool` vault** (vs separate Capital + Policy + Claims contracts):
fewer cross-contract race conditions for full-collateralization math; clearer
invariants for Foundry tests. Split later only if gas/size forces it.
