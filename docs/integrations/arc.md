# Arc Testnet integration

Source of truth: [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc), [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints).

## Parameters (Testnet)

| Field | Value |
| --- | --- |
| Chain ID | `5042002` (`0x4cef52`) |
| Currency | USDC (native gas) |
| RPC | `https://rpc.testnet.arc.io` |
| WebSocket | `wss://rpc.testnet.arc.io` |
| Explorer | `https://explorer.testnet.arc.io` |
| Faucet | `https://faucet.circle.com` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` (6 decimals display) |

## Arc-specific notes

- Native USDC uses 18 decimals for gas/`msg.value`; ERC-20 view uses 6 decimals. Same pool — show one balance.
- Mempool `maxFeePerGas` floor: 20 Gwei.
- Sub-second finality; multiple confirmations are unnecessary for test transfers.

## Verification (2026-11-16)

```text
POST https://rpc.testnet.arc.io eth_chainId → 0x4cef52
POST https://rpc.testnet.arc.io eth_blockNumber → live hex block
```

Code lives in `packages/chain`.
