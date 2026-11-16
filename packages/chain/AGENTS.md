# @arcuex/chain

## Scope

Typed Arc network configuration, read-only RPC clients, health checks, and
explorer URL helpers. No wallet UI and no write transactions except helpers
consumed by `apps/web` for user-approved sends.

## Network safety

- Prefer Arc Testnet (`5042002`) for all foundation work.
- Source of truth: https://docs.arc.io/arc/references/connect-to-arc
- USDC is the native gas token (18 decimals native view). ERC-20 USDC at
  `0x3600000000000000000000000000000000000000` is the same pool (6 decimals).
  Display a single USDC balance using the ERC-20 view; never double-count.
- Mempool enforces a 20 Gwei `maxFeePerGas` floor on Arc.

## Rules

- Export chain definitions compatible with viem/wagmi.
- Keep RPC URL overridable via env; default to Circle public testnet RPC.
- Verify chain ID against live RPC before claiming connectivity.
- Do not hardcode mainnet as the app default.
