# Trust boundaries

| Surface | Trust | Notes |
| --- | --- | --- |
| Arc / QuickNode RPC reads | Network data | Live chain state; not coverage authorization |
| Injected wallet signatures | User intent | Required for on-chain transfers |
| Synthetic quote/bind/claim APIs | Demo ledger | Labeled synthetic; not issuance |
| EvidenceProvider outputs | Untrusted inputs | Feed rules/verifiers only |
| CoverageRule / human authority | Authorization | Required for claim decisions |
| AI model votes | **Not authorized** | Cannot move money |
| QuickNode Streams webhooks | Untrusted until verified | Deduped; not financial proofs by themselves |
| Capital pool SQLite rows | Local accounting | Full collateralization demo; not on-chain |
