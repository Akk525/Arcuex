# Documentation

Current source: `main`. Current hosted fallback: `f8365a8`.
Start with [repository reconciliation](verification/2026-11-18-repository-consolidation.md)
and [deployment/recovery](deployments/main-and-plan-a.md). Dated verification reports describe
their captured release, not an automatic guarantee about today's deployment.

| Section | Contents |
| --- | --- |
| [architecture/overview.md](architecture/overview.md) | System shape of the foundation |
| [architecture/decisions/](architecture/decisions/) | ADRs |
| [integrations/arc.md](integrations/arc.md) | Arc Testnet parameters and verification |
| [integrations/quicknode.md](integrations/quicknode.md) | QuickNode RPC + Streams status |
| [integrations/wallets.md](integrations/wallets.md) | Injected wallet behavior |
| [development/setup.md](development/setup.md) | Local setup |
| [development/workflow.md](development/workflow.md) | Branching and commits |
| [development/testing.md](development/testing.md) | Test commands |
| [research/](research/) | External references |
| [working-notes/](working-notes/) | Dated engineering notes |

Also see [architecture/trust-boundaries.md](architecture/trust-boundaries.md).

Potential future integrations (not implemented): Circle Gateway, CCTP, Blockaid, Memora and model providers.
The existing Arc Testnet Solidity pool is implemented; no mainnet issuance is supported.
