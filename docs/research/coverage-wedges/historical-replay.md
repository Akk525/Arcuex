# CAPO historical replay — conditional result

Investigated 2026-11-17 UTC. **One retrieved liquidation witness is reproducible offline;
an independently authenticated, net payable historical claim is not yet established.**
See [evidence status](verified-evidence-register.md) and [final decision](final-go-no-go.md).

## Selected event and source chain

Ethereum mainnet, chain 1. These are historical observations, not Arc transactions.

| Item                                                  | Retrieved value                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Block / timestamp                                     | `24626860`, `2026-03-10T11:46:11Z`                                                                                                                                 |
| Block hash                                            | `0x4bdbcceb3571635b5c2ec3b6e4d33816ce493c041a3a56838969b57297cc77b9`                                                                                               |
| Parameter change, tx index 0                          | [`0x32c64151469cf2202cbc9581139c6de7b34dae2012eba9daf49311265dfe5a1e`](https://etherscan.io/tx/0x32c64151469cf2202cbc9581139c6de7b34dae2012eba9daf49311265dfe5a1e) |
| Selected liquidation, tx index 1, block-global log 17 | [`0x9064b507f16bd8b85fb5aea0185153b01fa23b3205f7153f986e5107ce988a9c`](https://etherscan.io/tx/0x9064b507f16bd8b85fb5aea0185153b01fa23b3205f7153f986e5107ce988a9c) |
| Borrower                                              | `0x4f962BB0EA0785c539f8ab52a17f1f873DDc355f`                                                                                                                       |
| Liquidator                                            | `0xbD32122bAD41A09f2405Bb374A83877d8245079C`                                                                                                                       |
| Pool                                                  | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`                                                                                                                       |
| Adapter                                               | `0xe1D97bF61901B075E9626c8A2340a7De385861Ef`                                                                                                                       |
| Ratio provider                                        | stETH `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`                                                                                                                 |
| Collateral / debt                                     | wstETH `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` / WETH `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`; both 18-decimal units                                     |

Explorer links identify objects; their pages were not successfully fetched as independent
corroboration. Raw RPC requests, responses, receipt, block and prestate are preserved in
[`selected-liquidation.json`](experiments/causal-v2/historical/selected-liquidation.json).

## What malfunctioned, and what was intended?

The [Chaos Labs report, March 10](https://governance.aave.com/t/post-mortem-exchange-rate-misallignment-on-wsteth-core-and-prime-instances/24269)
attributes the event to a constrained ratio update paired with an advanced timestamp.
Its operator-intent explanation is a published assertion. We did not independently
replay the risk agent's 3%-per-3-day validation code or prove the intended administrative
update. We did retrieve the resulting adapter configuration and execute its code.

[Sourcify's deployed-source record](https://sourcify.dev/server/v2/contract/1/0xe1D97bF61901B075E9626c8A2340a7De385861Ef?fields=all)
identifies `WstETHPriceCapAdapter`, solc `0.8.20+commit.a1b79de6`. Its runtime matches the
historical dRPC code response: Keccak
`0x6de4f6626dff78615c352681d35d4971f88e41c7dc4f1047b38a131a7e430ab5`.
This is a source-service/RPC comparison, not our own compiler rebuild or consensus proof.
Current repository `main` has changed growth rounding; it must not replace deployed code.

Deployed calculation, using integer division at each indicated step:

```
growthPerSecond = floor(floor(snapshotRatio * yearlyBps / 10000) / 31536000)
cap = snapshotRatio + growthPerSecond * (blockTimestamp - snapshotTimestamp)
price = floor(baseUSDPrice * min(stETH.getPooledEthByShares(10^18), cap) / 10^18)
```

Retrieved update: ratio `1191926196478762900`, timestamp `1772535647`, growth/sec
`3326024394`, yearly growth `880` bps. At the event, cap = `1193946836122703356`;
canonical uncapped ratio = `1228848994065905999` (both 1e18).
Actual adapter answer = `246276569349`; uncapped answer = `253475871245` (USD 1e8).
Lido conversion is a share-accounting reference, not a guaranteed immediately realizable
ETH market price. Cover terms must explicitly adopt this valuation and exclude reference
corruption, slashing or redemption restrictions; code alone cannot prove economic intent.

## Reconstruction A/B

Use the transaction **prestate**, not block `24626859` or the end of `24626860`.
The parameter update occurs earlier in the same block. Historical `eth_call` at a block
number otherwise returns an unsuitable execution point.

The harness loads 32 traced accounts with code/storage and one additional immutable
PoolLogic library from Sourcify. Missing code/storage reads throw; nothing defaults to
zero. The code-only library account has placeholder balance/nonce used for local
installation; neither is claimed as a historical financial observation. It runs
deployed bytecode in EthereumJS 10.1.3 at the recorded timestamp, base
fee, coinbase and PREVRANDAO, using Prague rules. Supplementary library authenticity and
the selected hardfork/header still require independent verification before issuance.

| Quantity                         |                    Faulty prestate |        Counterfactual |
| -------------------------------- | ---------------------------------: | --------------------: |
| Health factor, 1e18              |               `994396636472242223` | `1023465425310963254` |
| Total collateral value, USD 1e8  |                 `2732395003841771` |    `2812269985793070` |
| Total debt value, USD 1e8        |                 `2610402286615278` |                  same |
| Liquidation threshold / LTV, bps |                        9500 / 9300 |                  same |
| Transaction call result          | Success; all 23 receipt logs match |     Revert, zero logs |

The intervention changes **only slot 1's low 104-bit `_snapshotRatio` field** to the
live canonical ratio, permitting the existing cap to stop binding. Timestamp, growth,
base feed, position, risk settings, block and transaction remain fixed. This is a
counterfactual valuation intervention, not a valid governance update transaction.
The observed call meets HF < 1; the reference case exceeds both 1 and the proposed 1.02
coverage buffer. Empty revert data does not identify a specific revert selector, so
the result is supported jointly by computed HF and the one-field intervention.

The 50-block discovery range returned 49 liquidation logs and 35 distinct borrowers.
Their addresses and exact logs are in the artifact. We did **not** prove all 35 were
wrongfully liquidated; this range includes events beyond the selected call and is not
a substitute for the report's affected-user list. No extrapolated aggregate payout.

## Reconstruction C: gross harm versus unresolved net harm

Actual-code balances at the same timestamp, before and after the reproduced call:

| Item                                               |                      Integer value, 18-decimal units |
| -------------------------------------------------- | ---------------------------------------------------: |
| wstETH collateral before / after                   | `11094823234969132151300` / `5761578381296808296661` |
| Total collateral depletion                         |                             `5333244853672323854639` |
| Liquidator's collateral in liquidation event       |                             `5327964413223143335971` |
| Additional protocol-fee depletion                  |                                `5280440449180518668` |
| Debt before / after                                | `12655209382465987372527` / `6350644214842231420570` |
| Actual debt extinguished                           |                             `6304565167623755951957` |
| Gross loss at canonical ratio, WETH-equivalent wei |                              `249187405918649252451` |

Debt balances use scaled balance × normalized variable-debt index with RAY half-up
rounding (`1e27`). Raw debt-token Transfer/Burn amounts alone would mix interest
effects with principal reduction. Likewise, the liquidation event alone omits part of
the collateral depletion. Gas paid by the liquidator is not the borrower's loss.

`gross = floor(totalCollateralDepletion * canonicalRatio / 1e18) - debtExtinguished`.
This is a conditional **249.187405918649252451 WETH-equivalent gross loss**, not a
verified remaining claim or USDC payout.

The [TokenLogic reimbursement thread](https://governance.aave.com/t/direct-to-aip-wsteth-capo-oracle-incident-user-reimbursement/24275)
contains a proposed allowance, recovery updates and later participant reports of
distribution. Approval/allowance is not proof of a payment to this borrower. Our
Blockscout lookup yielded only the newest page, stopping in April; bounded historical
queries were rejected. No complete beneficiary recovery ledger was authenticated.
**Remaining net harm is UNKNOWN; candidate historical payable amount is zero pending REVIEW.**

## Independent-authentication blocker

dRPC supplies a coherent replay witness. PublicNode and 1RPC both returned JSON-RPC
`result: null` for the selected hash; this may reflect historical availability, but
does not corroborate dRPC. The block/receipt/state witness was not verified against a
trusted consensus header with receipt/state trie proofs. Source narratives are not
needed to reproduce the arithmetic, but the supplied witness is not yet authenticated
independently of its providers. See [register](verified-evidence-register.md).

## Reproduce offline

From the worktree root, install root dependencies with `pnpm install` if needed:

```sh
cd docs/research/coverage-wedges/experiments/causal-v2/evm-runtime
pnpm install --frozen-lockfile
pnpm exec node replay.mjs
pnpm exec node --test regression.test.mjs
```

Replay needs no RPC, API key or wallet. It exercises message execution and balances,
not full transaction signature/intrinsic-gas/receipt-root consensus validation. Online
collection scripts preserve their successes and failed probes separately; refreshing
them changes the witness and requires a new evidence review and manifest.
