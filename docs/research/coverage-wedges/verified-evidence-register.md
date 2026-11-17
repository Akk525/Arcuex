# Evidence register — checked 2026-11-17 UTC

“Retrieved” means the stated source returned these bytes. “Reproduced” means offline
execution agrees with those bytes. Neither word implies independently authenticated
canonical inclusion, an independent price oracle or a payable insurance loss.

| ID  | Source / exact locator                                                                                                                                                                             | Status and permitted inference                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | [Chaos Labs incident report](https://governance.aave.com/t/post-mortem-exchange-rate-misallignment-on-wsteth-core-and-prime-instances/24269), March 10, 2026, root cause and impact                | Published assertion; mechanism lead, not a state proof or eligibility list.                                                                                                                                        |
| R2  | [TokenLogic reimbursement](https://governance.aave.com/t/direct-to-aip-wsteth-capo-oracle-incident-user-reimbursement/24275), March 11; March 12 update and later comments                         | Published assertions/proposal; individual recoveries unresolved. Proposed 513.19 ETH allowance includes goodwill; summary and detailed figures differ. Do not treat either as final net loss.                      |
| C1  | [Pinned address book](https://github.com/bgd-labs/aave-address-book/blob/266429eefae828d52c91ffcb3a75656ab18f7160/src/AaveV3Ethereum.sol)                                                          | Retrieved discovery addresses. Current pointer values are not incident-time configuration proof.                                                                                                                   |
| C2  | [Adapter Sourcify record](https://sourcify.dev/server/v2/contract/1/0xe1D97bF61901B075E9626c8A2340a7De385861Ef?fields=all)                                                                         | Retrieved exact source/runtime match assertion, ABI, storage layout and compiler settings. Historical dRPC runtime matches its runtime bytes. No local compiler rebuild.                                           |
| C3  | [PoolLogic Sourcify record](https://sourcify.dev/server/v2/contract/1/0x25ed699a052b820d772765e26ed4dd9f0a26f3e5?fields=all)                                                                       | Retrieved `match` rather than `exact_match`; deployment height 23839360 asserted by source service. Supplementary library code, not an independent historical storage proof. Failed RPC code probe also preserved. |
| C4  | [Pinned current CAPO source](https://github.com/aave-dao/aave-price-feeds/blob/d1d6a2fb30377c1aaafa77ee91bbb548d98633b5/src/contracts/PriceCapAdapterBase.sol)                                     | Retrieved for comparison only. Has scaled growth rounding; **not substituted for the deployed version**.                                                                                                           |
| D1  | `https://ethereum-rpc.publicnode.com`, chain/block headers                                                                                                                                         | Retrieved chain 1 and incident-day header range; pruned/paid archive errors recorded. Headers were not authenticated through an independent consensus client.                                                      |
| D2  | `https://eth.drpc.org`, exact requests in `selected-liquidation.json`                                                                                                                              | Retrieved config log, 49 nearby liquidation logs, selected receipt/transaction/block, historical calls and prestate trace. Single RPC witness, not a receipt/state proof.                                          |
| D3  | `https://1rpc.io/eth`, `https://ethereum-rpc.publicnode.com`, selected `eth_getTransactionReceipt`                                                                                                 | Both returned `null`. No corroboration. Retain disagreement; never choose whichever response creates a payout.                                                                                                     |
| D4  | [Borrower transfer discovery](https://eth.blockscout.com/api/v2/addresses/0x4f962BB0EA0785c539f8ab52a17f1f873DDc355f/token-transfers?type=ERC-20&token=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2) | Retrieved 50 newest WETH transfers, cursor still April 23. Not exhaustive March recovery accounting. Bounded legacy and transaction checks returned 403.                                                           |
| P1  | `evm-runtime/replay.mjs`, `historical/offline-replay.json`                                                                                                                                         | Reproduced both health factors, all selected receipt logs and gross value depletion, conditional on witness authenticity. Five offline regression tests.                                                           |
| S1  | `synthetic/scenario.ts`, `synthetic/demonstration.json`                                                                                                                                            | Fabricated scenario; independently tested model arithmetic, never historical event proof.                                                                                                                          |

Artifacts live under [`experiments/causal-v2/historical/`](experiments/causal-v2/historical/).
`adapter-verification.json` preserves ABI/layout/compiler and source hashes; source
bodies were inspected in a temporary cache, not silently taken from a moving branch.
`source-provenance.json` pins the repository trees and retrieved-byte hashes.
`manifest.json` records SHA-256 of cached artifacts. File hashes establish integrity
against accidental edits, not authenticity of the original provider response.

Failed discovery requests are intentionally retained: PublicNode pruned-history and
archive-token limits; LlamaRPC 525; Cloudflare range limit then 403; 1RPC 50-block limit
and unavailable state; dRPC broad-range rejection. A discarded early topic probe used
an unverified guessed signature; no result from it supports any conclusion. The actual
configuration was decoded from the deployed ABI and address-only one-block query.

Unresolved: independent canonical header and receipt/state proof; complete source of
prestate and supplementary code; hardfork confirmation; complete beneficiary recovery
ledger; beneficial-owner/control investigation; underwriting intent/eligibility. The
historical claims outcome remains REVIEW regardless of reproducible math.
