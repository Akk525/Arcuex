# @arcuex/web

## Scope

Developer dashboard for Arc Testnet connectivity, injected EVM wallets,
balances, one user-approved test transaction, QuickNode RPC status, and
**synthetic** Coverage / Claims / Capital panels backed by SQLite API routes.

Preserve the existing Protect/Build landing and authenticated procurement/claims routes.
No private-key collection. No real insurance issuance UI. Workspace selection grants no role.

## UI rules

- Prefer clear status labels: Disconnected, Connecting, Connected, Wrong Network,
  Switching, Ready.
- Always show loading / empty / error states for network and QuickNode panels.
- Transaction sends require an explicit click; never auto-send.
- Display a single USDC balance (ERC-20 view). Do not show native + ERC-20 as two assets.
- Keep the layout dense and technical; accessibility and responsive layout matter.

## Wallet rules

- Injected connectors only by default (MetaMask, Rabby, etc.).
- WalletConnect project ID is optional; injected wallets must work without it.
- Handle rejection, insufficient funds, wrong network, and missing providers.
- Route all chain config through `@arcuex/chain`.
