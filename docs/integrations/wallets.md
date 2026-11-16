# Wallet integration

## Approach

wagmi v2 + viem with the `injected()` connector. Optional WalletConnect project ID is supported via env but not required.

## UI states

| State | Meaning |
| --- | --- |
| Disconnected | No account |
| Connecting | Connector pending |
| Connected | Account present (may still be wrong chain) |
| Wrong Network | Connected but chain ≠ `5042002` |
| Switching | `wallet_switchEthereumChain` / add-chain in flight |
| Ready | Connected on Arc Testnet |

## Balances

Display ERC-20 USDC only (`0x3600…0000`, 6 decimals). Do not also show native balance as a second asset.

## Transactions

Only the explicit “Send test transfer” control submits a transaction. Rejections, insufficient funds, and RPC failures are surfaced in the panel.
