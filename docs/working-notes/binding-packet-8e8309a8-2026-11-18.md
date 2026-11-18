# Separate binding authorization packet — quote 8e8309a8

**EXACT QUOTE AND BIND AUTHORIZED BY USER. FINAL WALLET CONFIRMATION PENDING. NO TRANSACTION SIGNED OR BROADCAST BY AGENT.**

The authorization covers quote `8e8309a8-4e2f-4e63-8e0a-25d2a15e3f10`, premium 0.01 USDC, and network fee at most 0.00783744 USDC. Earlier prerequisite/status statements below are historical and superseded only for this exact authorization. Latest read-only preflight at 2026-11-18T18:02:16.774Z passed all checks; pending nonce is now **7**. See [authorized preflight](binding-authorized-preflight-8e8309a8-2026-11-18.json). Refresh before final confirmation. Backend preparation remains to be checked against this exact calldata.

This is a candidate derived from the newly supplied quote, with a fresh successful exact-sender on-chain simulation. It excludes both earlier expired quotes. Backend acceptance and transaction preparation for this new digest have not been performed or verified by this task. Those steps and equality of the backend-prepared transaction to this packet remain prerequisites to a separately authorized broadcast.

## Quote and identity

| Field | Value |
| --- | --- |
| Chain | Arc Testnet, `5042002` |
| Product | `ARC_ORACLE_LIQUIDATION_DEMO_V1`, version 1, synthetic |
| Quote ID | `8e8309a8-4e2f-4e63-8e0a-25d2a15e3f10` |
| Policy entity ID | `cc5fcf8f-d09c-4db9-8520-76d276c2358b` |
| Agent ID | `143fc0e6-f1b1-4642-9762-38a336bc2c0e` |
| Sender / payer / owner / intended signing wallet | `0x2e2da4311ea87cfa31c372d59b4a0d567c15d760` |
| Beneficiary | `0x2e2da4311ea87cfa31c372d59b4a0d567c15d760` |
| Transaction target / InsurancePool | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| USDC token | `0x3600000000000000000000000000000000000000` |
| Premium pulled on binding | **0.01 USDC** (`10000` micros) |
| Coverage limit / capital reservation | **1 USDC** (`1000000` micros) |
| Deductible | **0.1 USDC** (`100000` micros) |
| Exposure | `demo_position-01`, `arcuex-synthetic-lending-v1`, chain 5042002 |
| Exposure notional | 100 USDC (`100000000` micros), synthetic |
| Quote deadline | **2026-11-18T18:06:20Z / Nov 18, 2026, 1:06:20 PM Eastern** |
| Coverage start | **2026-11-18T18:11:20Z / Nov 18, 2026, 1:11:20 PM Eastern** |
| Coverage end | **2026-11-19T18:11:20Z / Nov 19, 2026, 1:11:20 PM Eastern** |
| Coverage duration | 86400 seconds / 1 day |
| Exact terms digest | `0xf45654d128f93105dd78a07ef39760f5e4f06ee59f099d267b2f10b5fe5d3add` |
| On-chain policy ID | `0xb14dc8320d5cfb14c379443b1905d1abe277d4827f29b3f4f36f9d71b5b9d638` |

Recomputing the digest from every supplied term using the repository's recursively key-sorted JSON serialization and keccak256 matched exactly. The on-chain ID is `keccak256(UTF8("arcuex:policy:cc5fcf8f-d09c-4db9-8520-76d276c2358b"))`, per the repository's ID mapping.

Insured event: Synthetic oracle adapter understates collateral value and causes liquidation of a lending position that remains healthy under the canonical ratio replay.

Exclusions:

- Pre-existing or known liquidation
- Market price movements or ordinary insolvency
- Owner or agent misconduct
- Non-registered positions or protocols
- Non-synthetic evidence; no external loss oracle is integrated

All four eligibility attestations are true in the supplied terms. They are user/backend attestations, not independently verified financial-event evidence. Complete immutable quote JSON is retained in the [machine-readable packet](binding-packet-8e8309a8-2026-11-18.json).

Testnet demonstration, not legal insurance. Backend controls enforce eligibility, ownership, quote expiry, delegation and event evaluation. The pool commits the hash without interpreting the terms. A compromised EOA can bypass backend permissions. Claims require the designated claims authority; no AI vote authorizes payment. No coverage should be claimed before canonical reconciliation verifies a matching bind and the scheduled effective window.

## Exact transaction for separate authorization

Function: `bindPolicy(bytes32,bytes32,address,uint256,uint256,uint64,uint64)` as defined by the repository ABI (the exact types are encoded and decoded from that ABI).

Decoded arguments, in order:

1. Policy ID: `0xb14dc8320d5cfb14c379443b1905d1abe277d4827f29b3f4f36f9d71b5b9d638`
2. Terms hash: `0xf45654d128f93105dd78a07ef39760f5e4f06ee59f099d267b2f10b5fe5d3add`
3. Beneficiary: `0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760`
4. Premium: `10000`
5. Limit: `1000000`
6. Coverage start: `1795025480`
7. Coverage end: `1795111880`

```json
{
  "from": "0x2e2da4311ea87cfa31c372d59b4a0d567c15d760",
  "to": "0x6657974EEdF488380251bDD95A7FFfb0D456E49E",
  "chainId": 5042002,
  "nonce": 6,
  "value": "0x0",
  "data": "0x48fb51efb14dc8320d5cfb14c379443b1905d1abe277d4827f29b3f4f36f9d71b5b9d638f45654d128f93105dd78a07ef39760f5e4f06ee59f099d267b2f10b5fe5d3add0000000000000000000000002e2da4311ea87cfa31c372d59b4a0d567c15d760000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000000006afdea48000000000000000000000000000000000000000000000000000000006aff3bc8",
  "gas": "326560",
  "maxFeePerGas": "24000000000",
  "maxPriorityFeePerGas": "1000000000"
}
```

The gas and fee strings in this review description are decimal; they are not raw JSON-RPC hex quantities. Calldata selector: `0x48fb51ef`. Calldata length: 228 bytes. Encoding and decoding matched the intended function and all seven arguments. Native `value` is zero; the premium is pulled through the previously confirmed ERC-20 allowance.

The exact ABI input types are recorded in the attached packet; authoritative ABI source inspected at local `deploy/nov20-combined-private`, commit `b7243bf740366f72ea740dff49fe0951a98ed453`, in `packages/onchain/src/abi/insurance-pool.json`. The backend transaction mapping was source-reviewed in `apps/web/src/lib/server/procurement-chain.ts`. This is not an independently verified deployed binary identity or source audit.

## Live state and simulation

RPC: `https://rpc.testnet.arc.io`. Capture: **2026-11-18T17:57:52.902Z**. Pinned block: **72888352**, hash `0x1359cf11c224799f97132aca934125a719a9b85d082cfd1587fc06c73ba868da`, timestamp **2026-11-18T17:57:52.000Z**. Pending nonce and RPC gas price were read during capture and are not block-pinned.

| Check | Result |
| --- | --- |
| Chain | 5042002 |
| Wallet ERC-20 USDC display balance | 15.86577 USDC |
| Existing allowance to this pool | **0.01 USDC**; no new approval needed |
| New policy bound | **false** |
| Pool USDC getter | Correct token address |
| Pool deployed code hash | `0xffcc03f8145add8bb21b8af7e7eb8146c871c62aeca92b85dae1692c8741b398` |
| Pool assets / token balance | 4.1 / 4.1 USDC |
| Pool reserved capital | 1 USDC |
| Available capital | **3.1 USDC**, sufficient for the 1 USDC reservation |
| Simulation | **Success**, exact sender, no state overrides |
| Gas estimate | **272133** |
| Proposed gas limit | **326560**, 20% buffer rounded up |
| Pending nonce | **6**, refresh before execution |
| Observed base fee | **20 gwei** |
| Proposed max fee per gas | **24 gwei** |
| Proposed priority fee | **1 gwei** |
| Estimated effective price at observed base fee | **21 gwei** |
| Estimated fee with proposed settings | **0.005714793 USDC** |
| RPC suggested gas price (separate market observation) | 24.76044 gwei |
| Fee at RPC suggested gas price and estimated gas | 0.00673813281852 USDC; this suggested rate exceeds the proposed 24 gwei cap |
| **Proposed maximum transaction fee** | **0.00783744 USDC** (`326560 × 24000000000 / 10^18`) |
| **Maximum premium plus network-fee debit** | **0.01783744 USDC** |

The native balance view has sufficient precision and balance for premium plus the proposed maximum fee. It is the same underlying USDC balance, not another asset. The simulation included the proposed gas limit and fee caps. Current base fee plus priority fits the cap; inclusion pricing can change. All amounts above are independent of the prior approval transaction's already-paid fee.

The approval authorization's 67475 gas and 0.0016194 USDC ceiling applied only to that completed approval. **They do not authorize the larger binding gas limit or fee proposed here.** No deposits, withdrawals, second approval, or settlements are included.

## Execution prerequisites — no broadcast yet

1. Obtain explicit approval of this exact new quote/digest and the separate binding transaction, including the proposed fee ceiling (or a freshly reviewed replacement packet).
2. Before execution, verify the backend's accepted digest and prepared policy/payer/calldata match this packet byte for byte; do not send another token approval. The current page's acceptance checkbox and preparation control have not been acted on by this task.
3. Refresh chain, allowance, balance, available capital, policy unbound state, pending nonce, fee conditions and exact transaction simulation. Decline execution if the quote has expired or any material field differs.
4. A successful bind must be mined **strictly before 2026-11-18T18:06:20Z**, not merely submitted before it. The backend reconciliation also requires the bind before coverage start. The contract's successful simulation is not proof that backend quote expiry or acceptance has been satisfied.
5. The user performs final wallet confirmation only after that separate authorization and final review. Verify a successful receipt and exact PolicyBound event, reconcile the backend, and verify canonical lifecycle state and effective window before claiming coverage.

Until those prerequisites are satisfied, keep the policy unbound. If this quote expires, generate another fresh quote and packet; never reuse stale calldata.
