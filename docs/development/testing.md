# Testing

```bash
pnpm test          # vitest in all packages/apps
pnpm typecheck
pnpm lint
pnpm build
```

Package unit tests mock transports/public clients. Live RPC checks belong in README verification commands or `docs/working-notes/`.

Manual wallet checks (browser):

1. Connect injected wallet
2. Switch to Arc Testnet if prompted
3. Confirm USDC balance loads
4. Send test transfer and inspect receipt / explorer link
