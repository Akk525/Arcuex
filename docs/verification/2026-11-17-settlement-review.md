# Settlement verification and premium-share review

Verified 2026-11-17 using public Arc Testnet RPC reads only. No wallet was instantiated by the verification script, no keys or `.env` were read by it, and no deployment or financial transaction was submitted. Evidence: [sanitized block-pinned JSON](2026-11-17-settlement-readonly.json). Reproduce from the worktree root with `pnpm --filter @arcuex/onchain exec tsx src/cli/verify-settlement.ts` (overwrites the evidence snapshot with fresh current state).

## Existing transaction

[Settlement receipt on Arc explorer](https://explorer.testnet.arc.io/tx/0x83130e95f5dfb2209a5382524a1ef749dd2f90a605fcf892cf80b333ef3d89c7): success, block **72712674**, pool `0x6657974EEdF488380251bDD95A7FFfb0D456E49E`. Sender matches the onchain claimsAuthority. The receipt's `ClaimSettled` event and USDC `Transfer` agree on the beneficiary `0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760` and **1,000,000 micros (1 USDC)**. Beneficiary USDC increased from 14,866,934 to 15,866,934 micros across the settlement block.

| Metric (micros, except shares) | Before block 72712673 |  After block 72712674 | Current capture block 72713224 |
| ------------------------------ | --------------------: | --------------------: | -----------------------------: |
| Pool assets / USDC balance     |             5,100,000 |             4,100,000 |                      4,100,000 |
| Reserved                       |             2,000,000 |             1,000,000 |                      1,000,000 |
| Available                      |             3,100,000 |             3,100,000 |                      3,100,000 |
| Shares                         |             5,100,000 |             5,100,000 |                      5,100,000 |
| Policy paidOut                 |                     0 |             1,000,000 |                      1,000,000 |
| claimId settled                |                 false |                  true |                           true |
| lossKey paid / cap             |                absent | 1,000,000 / 1,000,000 |          1,000,000 / 1,000,000 |

The lossKey is `0x7a6dfe6606b3c2651a98c69e36d0f4e806ae77f16dea70adcd342ab8a8fa121c`, bound to policy `0x709b9ba707bc439385d46a013efde14b58160bf9d4583f60aa8b932d25ac4f74`. Its cap is exhausted, although the policy retains 1 USDC of reservation. Another claimId for this same loss must not pay again. Twelve automated evidence checks passed, including receipt status, authority, transfer, balance deltas, shares unchanged and current solvency. This verifies financial movement on testnet; the incident/evaluation remains a synthetic fixture, not independent loss evidence.

The old invocation's exit status 2 was a runner reporting bug. It does not negate the successful transaction. This review did not rerun that live invocation.

## Independent premium-share accounting review

Local `InsurancePool.bindPolicy` mints `floor(premium * totalShares / totalAssets)` shares using **pre-premium** assets and credits `sharesOf[feeRecipient]`. For assets/shares 5,000,000 and premium 100,000, this creates 100,000 shares. The deployed state confirms ownership:

- Original holder `0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760`: **5,000,000 shares**.
- feeRecipient `0x69797270A2b8B355D55676787a29D2B1057411C7`: **100,000 shares**.
- Sum equals `totalShares` **5,100,000**, both before and after settlement and at current capture.

Percentage ownership falls from 100% to 98.0392% for the original holder, but NAV remains 1 micro per share at premium receipt: their redemption value remains 5 USDC. Thus there is percentage dilution without principal-value dilution. **All premium value accrues to feeRecipient; LPs do not earn this premium as yield.** This is a material economic design choice, not an unowned-share or withdrawal-denominator bug. Economics were not changed in this fix.

After the 1 USDC claim, NAV is 4,100,000 / 5,100,000 micros/share. Standalone floored redemption values are 4,019,607 micros for the original holder and 80,392 for feeRecipient. They share losses proportionally; fee shares are neither fixed-value fees nor senior debt. The last withdrawing holder receives any residual rounding dust. Floor minting at a non-unit NAV favors existing holders by less than one share per mint and cannot reduce their NAV. Withdrawals use current assets/current shares, burn the withdrawing owner's shares, and enforce available capital; all shares cannot be redeemed while the remaining reservation is active.

Caveats: feeRecipient can withdraw free capital before future losses, so timing changes who bears those losses. Premiums are not cash already paid out to feeRecipient. Very small mints can round to zero and revert. This bounded accounting review and tests are not a security audit, and do not establish production suitability.

## Validation

Regression coverage includes first run, completed approvals/deposit, bound and settled policies, settlement-only selection without unrelated keys, invalid prerequisites/loss accounting, combined signer balances and consumed allowance, unknown selections, blockers before any send, and retained hashes on receipt failure. Local Foundry tests cover exact demo premium ownership, proportional loss, reserved withdrawal rejection, full redemption conservation and non-unit NAV mint rounding (256 fuzz cases).

Verification commands completed in this worktree:

- `pnpm test`: 88 TypeScript tests passed (47 in `@arcuex/onchain`).
- `pnpm test:contracts`: 22 tests passed, including 256 fuzz runs.
- `pnpm typecheck`: passed across all workspaces.
- `pnpm lint`: passed across all workspaces; final onchain edits also linted.
- `pnpm build`: passed, including Next production compilation and page generation. Existing warnings: multiple worktree lockfiles affect inferred tracing root; Next ESLint plugin not detected.
- Read-only settlement verifier: all 12 checks passed.

No `.env` changes, contract source/economic changes, redeployments, or new onchain financial transactions were made.
