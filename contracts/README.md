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
# From contracts/: pinned to foundry.lock; no Git submodules or commits created.
forge install --no-git foundry-rs/forge-std@rev=f3dae6e6ee381f25eb6a246f7da9b85c91a68219 OpenZeppelin/openzeppelin-contracts@rev=acd4ff74de833399287ed6b31b4debf6b2b35527
forge test
forge build
```

## Trust boundary

`claimsAuthority` settles and releases. No AI role on-chain.
