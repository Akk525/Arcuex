# Read-only USDC approval authorization packet — 2026-11-18

Status: **APPROVAL CONFIRMED — SEE [RECEIPT VERIFICATION](usdc-approval-confirmed-2026-11-18.md).**

Earlier sections below are historical preparation records; the linked receipt verification supersedes their pending-approval status. Policy binding remains unauthorized.

This packet supersedes the incomplete earlier packet. No signing, approval broadcast, quote creation, terms acceptance, or binding was performed. The expired quote is excluded. This task made no policy-state changes; current backend policy state has not been independently inspected.

## Exact proposed approval

| Field | Verified / proposed value |
| --- | --- |
| Network | Arc Testnet, chain `5042002` / `0x4cef52` |
| Sender / allowance owner | `0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760` |
| Transaction target / USDC token | `0x3600000000000000000000000000000000000000` |
| Spender / InsurancePool | `0x6657974EEdF488380251bDD95A7FFfb0D456E49E` |
| Token symbol / decimals | `USDC` / `6` |
| Wallet USDC balance (ERC-20 display) | **15.866934 USDC** (`15866934` micros) |
| Current allowance to this spender | **0 USDC** |
| Proposed resulting allowance | **0.01 USDC** (`10000` micros) |
| Function | `approve(address,uint256)` |
| Native transaction value | `0` |
| Pending nonce observed | `5`; refresh before execution |
| Wallet account code | Empty at the observed block |

The wallet address is designated by the user as the previously authenticated acceptance wallet. This task verified its on-chain state, not a new authentication signature or the currently selected browser account. Confirm the wallet displays this exact sender and chain before any later signature.

`approve` sets the allowance to 10000, rather than adding 10000 to the existing allowance. This permits the pool to spend up to 0.01 USDC under its contract logic. It does not itself transfer that premium or bind coverage. The allowance has no quote expiry and remains until consumed or changed. Approval is separately authorized from any later binding.

## Unsigned transaction fields

```json
{
  "from": "0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760",
  "to": "0x3600000000000000000000000000000000000000",
  "chainId": 5042002,
  "value": "0x0",
  "data": "0x095ea7b30000000000000000000000006657974eedf488380251bdd95a7fffb0d456e49e0000000000000000000000000000000000000000000000000000000000002710",
  "gas": "67475",
  "maxFeePerGas": "24000000000",
  "maxPriorityFeePerGas": "0",
  "nonce": 5,
  "type": "eip1559"
}
```

Numeric strings for gas and fees above are decimal, in native base units where applicable; this is a review description, not raw JSON-RPC quantity encoding.

Calldata is 68 bytes. Encoding and decoding with installed viem confirmed selector `0x095ea7b3`, function `approve(address,uint256)`, spender `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`, and amount `0x2710` = `10000` = **0.01 USDC**.

## Simulation and fees

- Exact-sender `eth_call` simulation returned **true** at block **72883814** without state overrides.
- A second simulation using the proposed gas limit, maximum fee and priority fee also returned **true**. Return data: `0x0000000000000000000000000000000000000000000000000000000000000001`.
- RPC gas estimate: **56,229 gas**.
- Proposed gas limit: **67,475 gas**, adding 20% and rounding upward.
- Observed base fee and RPC gas price: **20 gwei** (`20000000000` native base units per gas).
- Proposed `maxFeePerGas`: **24 gwei** (`24000000000`); `maxPriorityFeePerGas`: **0**. These are the freshly returned viem EIP-1559 suggestions, not reused earlier values.
- Estimated fee at observed gas price: `56229 × 20000000000 / 10^18` = **0.00112458 USDC**.
- **Proposed maximum execution fee:** `67475 × 24000000000 / 10^18` = **0.0016194 USDC**.
- Native value is zero, so maximum transaction debit under these exact gas/fee limits is **0.0016194 USDC**. The 0.01 USDC allowance is spending permission, not an additional immediate debit.

The native fee view was `15866934540000000000` base units (18 decimals); it covers the proposed maximum fee. It represents the same USDC balance as the ERC-20 display, with additional precision, and is not a second asset. Actual fees depend on gas used and inclusion pricing. The maximum applies only if these exact limits are retained; wallet changes require review. Refresh balance, allowance, nonce, simulation and fees before separately authorized execution. No fee cap or transaction is authorized by this preparation request.

## Verification evidence

RPC: `https://rpc.testnet.arc.io`. Capture: **2026-11-18T17:19:39.292Z**; capped simulation: **2026-11-18T17:19:56.152Z**.

State reads, gas estimation and simulations pinned to block **72883814**, hash `0x767c082ffe74acf432357a4b235af8d76f837b5f3caf555bbd687f611e6e4136`, timestamp **2026-11-18T17:19:38.000Z**. Chain ID, pending nonce, gas price and fee suggestions were obtained during capture and are not pinned state reads.

| Check | Result |
| --- | --- |
| `eth_chainId` | `5042002` |
| Token `symbol()` / `decimals()` | `USDC` / `6` |
| Token code size / keccak256 | 1798 bytes / `0xc9987bd3af6b26a030951faa7eacc017b68343aeedf3ce5fe68f821c4b93939d` |
| Spender code size / keccak256 | 4517 bytes / `0xffcc03f8145add8bb21b8af7e7eb8146c871c62aeca92b85dae1692c8741b398` |
| Pool `usdc()` | `0x3600000000000000000000000000000000000000` |
| `balanceOf(owner)` | `15866934` |
| `allowance(owner, spender)` | `0` |

The spender matches the exact user-designated address, has deployed code, and its token getter matches the official USDC address. These checks do not independently verify the pool's source-code identity or constitute an audit.

Machine-readable results: [RPC and simulation evidence](usdc-approval-evidence-2026-11-18.json).

Official references checked 2026-11-18: [Arc network details](https://docs.arc.io/arc/references/connect-to-arc) and [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses). Live RPC reads above rechecked the chain, token address relationship and decimals.

## Required next authorization sequence

1. Await separate explicit approval authorization and user wallet confirmation. Do not sign or broadcast from this read-only request. Confirm exact sender, network, token, spender, amount, zero native value, calldata and fee ceiling; refresh the pending nonce and chain state.
2. After approval is separately authorized and confirmed, verify a successful receipt and on-chain allowance, including exact chain, sender, target and calldata. A failed or unconfirmed transaction is insufficient.
3. Only then generate a **fresh quote** and full binding packet. Do not reuse the expired quote. The future packet must include policy ID, owner/signer/beneficiary, premium, limit, deductible, immutable terms and digest, quote deadline, coverage timestamps, current pool capital, exact calldata, simulation, nonce and current fee limits.
4. Keep the policy unbound until the new quote and binding transaction receive explicit approval. Token approval does not authorize binding, settlement or any other transaction.

## Authorized approval pre-broadcast refresh

The user subsequently authorized only `approve(pool, 10000)` on chain 5042002, with gas no greater than 67475 and max fee per gas no greater than 24000000000. This supersedes the preparation-only authorization statements above for that exact approval. No policy binding, additional approval, deposit, withdrawal or settlement is authorized. The user must perform final wallet confirmation under the browser transaction policy.

Fresh capture: **2026-11-18T17:22:22.299Z**, block **72884136**, hash `0x68ed69321b2f145c49a1e034002cc67bdd003930ef4c300554887a8e10ba5ef1`. Balance remains **15.866934 USDC**; allowance remains **0**; pending nonce **5**. The exact-sender simulation with gas 67475, max fee 24 gwei and zero priority fee returned **true**. Gas estimate remains **56229**; base fee **20 gwei**; RPC suggested gas price **22.599999999 gwei**. All recorded preflight checks passed. Maximum fee under the authorized gas/fee ceilings remains **0.0016194 USDC**.

[Fresh pre-broadcast RPC evidence](usdc-approval-prebroadcast-2026-11-18.json). These checks are timestamped and must be refreshed if execution is delayed.

Execution blocker: browser-host integration is unavailable; native Chrome navigation to the canonical `/coverage` page returned `Acceptance gate required`. No approval control or transaction confirmation was reached. No transaction hash, receipt, or resulting allowance increase exists from this task. The final wallet action must be completed by the user. Restore the authenticated acceptance session, submit only the exact approved transaction, and provide its transaction hash for independent receipt and allowance verification. No quote should be created until that confirmation is verified.
