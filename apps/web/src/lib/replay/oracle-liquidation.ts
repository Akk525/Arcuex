/**
 * Historical CAPO oracle-liquidation counterfactual (Ethereum mainnet, chain 1).
 *
 * Read-only research values copied from the preserved offline replay
 * (`docs/research/coverage-wedges/experiments/causal-v2/historical/offline-replay.json`)
 * and the investigation write-up (`docs/research/coverage-wedges/historical-replay.md`).
 * `oracle-liquidation.test.ts` fails if these drift from the artifact.
 *
 * This is not an Arc transaction, not an Arcuex policy, and not a payable claim.
 * The witness is provider-supplied and not independently authenticated, and net harm is
 * unknown, so the candidate historical payout is zero pending REVIEW.
 */
export const ORACLE_LIQUIDATION_REPLAY = {
  investigatedAt: '2026-11-17',
  chain: 'Ethereum mainnet (chain 1)',
  block: '24626860',
  blockTimestamp: '2026-03-10T11:46:11Z',
  blockHash: '0x4bdbcceb3571635b5c2ec3b6e4d33816ce493c041a3a56838969b57297cc77b9',
  parameterChangeTx: '0x32c64151469cf2202cbc9581139c6de7b34dae2012eba9daf49311265dfe5a1e',
  liquidationTx: '0x9064b507f16bd8b85fb5aea0185153b01fa23b3205f7153f986e5107ce988a9c',
  borrower: '0x4f962BB0EA0785c539f8ab52a17f1f873DDc355f',
  adapter: '0xe1D97bF61901B075E9626c8A2340a7De385861Ef',
  method: 'ethereumjs-prestate-witness-v1',
  hardfork: 'prague',
  intervention:
    "Only slot 1's low 104-bit _snapshotRatio field is set to the live canonical ratio. Timestamp, growth, base feed, position, risk settings, block and transaction stay fixed.",
  faulty: {
    adapterPrice: '246276569349',
    healthFactor: '994396636472242223',
    collateralValueUsd: '2732395003841771',
    debtValueUsd: '2610402286615278',
    outcome: 'Liquidation succeeds; all 23 receipt logs reproduce',
  },
  counterfactual: {
    adapterPrice: '253475871245',
    healthFactor: '1023465425310963254',
    collateralValueUsd: '2812269985793070',
    debtValueUsd: '2610402286615278',
    outcome: 'Liquidation reverts with zero logs',
  },
  canonicalRatio: '1228848994065905999',
  totalCollateralDepletion: '5333244853672323854639',
  debtExtinguished: '6304565167623755951957',
  grossLossBaseWei: '249187405918649252451',
  candidatePayout: 'Zero, pending REVIEW',
  blockers: [
    'The block, receipt and state witness came from one RPC provider and is not verified against a trusted consensus header. Two other RPCs returned null for the transaction.',
    "The borrower's reimbursements, assigned rights and other recoveries are not reconciled, so remaining net harm is unknown.",
    'No historical policy, premium, claims authority or capital commitment existed. Retrospective evidence does not create retrospective coverage.',
  ],
  sources: {
    writeUp: 'docs/research/coverage-wedges/historical-replay.md',
    decision: 'docs/research/coverage-wedges/final-go-no-go.md',
    artifact: 'docs/research/coverage-wedges/experiments/causal-v2/historical/offline-replay.json',
    postMortem:
      'https://governance.aave.com/t/post-mortem-exchange-rate-misallignment-on-wsteth-core-and-prime-instances/24269',
  },
} as const;

/** Exact fixed-point decimal rendering of an integer string. No floating point. */
export function fixedPoint(raw: string, decimals: number, digits = decimals): string {
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').slice(0, digits);
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return digits > 0 ? `${grouped}.${fraction}` : grouped;
}
