# Arcuex financial contracts

Foundry project for the policy-agnostic `InsurancePool` vault.

## Arc notes (verified 2026-11-16)

- Testnet chain ID `5042002`
- USDC ERC-20 `0x3600000000000000000000000000000000000000` (6 decimals)
- Pool math uses ERC-20 units only — never mix native 18-decimal `msg.value`
- Local tests use `MockUSDC` (anvil ≠ Arc precompile)

## Commands

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge test
forge build
```

## Trust boundary

`claimsAuthority` settles and releases. No AI role on-chain.
