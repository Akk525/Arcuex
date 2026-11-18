# Synthetic Arc demo and verification record

## What was actually checked

- Worktree: `/private/tmp/arcuex-coverage-wedges`, branch `research/coverage-wedges`,
  base `d9d47a5`. Only `docs/research/coverage-wedges/` is tracked as changed.
- Public QuickNode Arc Testnet RPC read near **2026-11-17T01:15:24Z**:
  endpoint `https://rpc.quicknode.testnet.arc.io`, `eth_chainId` → `0x4cef52`
  (5042002), `eth_blockNumber` → `0x4541c28`. HTTP request exited 0 and returned
  matching JSON-RPC request IDs. This proves this endpoint answered these reads at
  that time; no receipt, archive replay, wallet flow or stream was tested.
- Official [Arc network details](https://docs.arc.io/arc/references/connect-to-arc)
  match chain 5042002. Use Testnet only regardless of mainnet entries elsewhere.
- Current [Streams matrix](https://www.quicknode.com/docs/streams/supported-chains)
  lists Arc Testnet. Documentation support is verified; account provisioning is not.
- Node v24.16.0, pnpm 11.20.0: **52 fixture tests passed**; standalone strict TS
  check passed. The sandbox initially blocked pnpm's automatic dependency preparation;
  the authorized network-enabled retry completed. No lockfile/package changes resulted.
  These are tests with fabricated verified summaries, not recorded historical transports.
- Full production suite/build were not run: production code and dependencies are
  unchanged, and the new research runner has its own focused tests/type check.

Reproduce the read (public URL, no credentials):

```sh
curl --silent --show-error --max-time 20 https://rpc.quicknode.testnet.arc.io \
  -H 'content-type: application/json' \
  --data-raw '[{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]},{"jsonrpc":"2.0","id":2,"method":"eth_blockNumber","params":[]}]'
```

## Demo A: oracle-ratio liquidation

1. Offline: load `fixtures/cases.ts`, bind synthetic registration before waiting
   period, evaluate the synthetic liquidation. Show seizure=10,500, debt
   extinguished=10,000, recovery=100, deductible=10, payable=312 synthetic USDC.
2. Show ordinary market liquidation rejected, and a contaminated reference or missing
   exact-state replay held for REVIEW with zero payable.
3. Add the successful chain ID/block read alongside, explicitly labelled live Arc
   connectivity. It is not linked to the synthetic loss by a fabricated tx hash.
4. Future onchain phase, only with a tracked scope expansion: deploy disposable mock
   wrapper/adapter/lending contracts under an experimental namespace; fund from the
   testnet faucet with wallet approval. Register a position, misconfigure mock adapter,
   liquidate, collect ordered receipts/state, replay and compare to offline arithmetic.
   All scenarios are synthetic; mock control permits creating the event and therefore
   would be excluded from real coverage.
5. In a future approved settlement demo, require explicit human wallet approval for a
   testnet transfer. A synthetic ledger “settled” state is not an onchain receipt.

## Demo B: protocol impairment

1. Offline: registered principal=10,000, proceeds=2,000, remaining rights=3,000,
   third-party recovery=1,000; 100 deductible and 80% share yield 3,120 before
   1,000 policy cap. Demonstrate full recovery rejection and unresolved rights REVIEW.
2. Future approved mock vault phase: deposit, register lot, induce a labelled synthetic
   drain, produce recovery and residual-right records, advance a simulated assessment
   clock 30 days in offline evidence (do not forge real block timestamps). Compare
   pure evaluator result with raw mock state and provenance.
3. Show a claimant-created vault rejected by real eligibility rules even though its
   synthetic loss events look valid. An allowed demo override must be synthetic-only.
4. Recovery-window and insolvency review remain staged offline; a live Testnet drain
   cannot prove an actual irreversible economic loss or real insurance obligation.

## Required event/state inventory

Names below are **proposed mock semantics**, not verified Arc protocol ABI names.
Before a real stream, pin each deployed ABI and exact event topic/address allowlist.

| Wedge    | Required onchain events                                                                                                                         | Additional state/evidence Streams does not supply                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Both     | registration receipt/reference; holder transfers; oracle/pool/admin configuration changes; real settlement transfer/receipt if later authorized | Immutable policy identity, ownership/relationships, code eligibility, capacity and all offchain recoveries                              |
| Oracle   | mock `PositionOpened`, `OracleRatioUpdated`, `Liquidated`; collateral/debt token transfers and receipt success                                  | Exact pre-call collateral/debt/risk state, actual oracle call, independent wrapper ratio, integer HF replay, gas/fee and loss valuation |
| Protocol | mock `Deposit`, share `Transfer`, `Withdraw`, extraction/outflow transfers, recovery transfers                                                  | Continuous lot allocation, attack causation, legal ownership, residual rights valuation and qualified exploit decision                  |

Use per-chain **blocks + receipts/logs** with relevant address/topic filters; traces
where supported and needed for internal value flow. Backfill registration through
event/settlement; detect missing heights and pin hashes. State changes without emitted
logs still require archive calls/code checks. Provider transaction traces are useful
replay inputs, not self-authenticating cryptographic proofs.

## Streams receiver acceptance, when provisioned

Authenticate the raw webhook using the provider's documented
[HMAC verification](https://www.quicknode.com/docs/streams/destinations/webhooks),
then persist raw bytes and metadata before acknowledging. Maintain contiguous cursor,
deduplicate delivery identities and separately deduplicate canonical economic loss;
backfill gaps and revalidate hashes/finality through independent reads. Reorg or
contradictory history invalidates pending evidence. A valid HMAC proves transport
origin/integrity, not completeness, independent price truth, loss or eligibility.

No actual Stream ID, delivery ID, webhook signature or deployed emitter exists from
this work. Remaining blockers: provider account credentials/plan, publicly reachable
receiver, secrets handling, raw evidence store, pinned ABI/deployment, archive/replay
support and independently reviewed evidence authority. RPC success does not satisfy
Streams completion or any bounty. No provider credential files were read.

## Reproduction checks

```sh
pnpm exec node --test docs/research/coverage-wedges/fixtures/evaluator.test.ts
pnpm exec tsc --strict --noEmit --target ES2022 --module NodeNext \
  --moduleResolution NodeNext --allowImportingTsExtensions --types node --skipLibCheck \
  docs/research/coverage-wedges/fixtures/evaluator.ts \
  docs/research/coverage-wedges/fixtures/cases.ts \
  docs/research/coverage-wedges/fixtures/evaluator.test.ts
git diff --check
```
