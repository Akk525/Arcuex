# InsurancePool financial security audit

**Scope:** `contracts/src/InsurancePool.sol` @ `feat/onchain-lifecycle`  
**Date:** 2026-11-17  
**Network target:** Arc Testnet only (`5042002`)  
**Deploy status:** **Not deployed** — no funded `DEPLOYER_PRIVATE_KEY` in environment

## Constructor / configuration preflight

| Parameter | Required value | Source |
| --- | --- | --- |
| `usdc_` | `0x3600000000000000000000000000000000000000` | docs.arc.io contract-addresses (verified live decimals=6, symbol=USDC via QuickNode RPC 2026-11-17) |
| `claimsAuthority_` | Non-zero ops/rule EOA or multisig | Env `CLAIMS_AUTHORITY` — **unset** |
| `feeRecipient_` | Non-zero address for premium shares | Env `FEE_RECIPIENT` — **unset** |
| Owner | Deployer (`msg.sender`) | Can rotate authority/fee recipient |
| Chain ID gate | Script refuses ≠ `5042002` | `scripts/deploy-insurance-pool.sh` |
| Gas | ≥ 20 gwei | Arc mempool floor |

Deploy script also refuses non-official USDC addresses.

## Assumption audit

| Concern | On-chain behavior | Verdict |
| --- | --- | --- |
| Full collateralization / reserves | `bindPolicy` requires `limit <= availableCapital()` then `totalReserved += limit` | **Pass** — unbacked bind reverts |
| Expiration | `settleClaim` reverts if `block.timestamp > coverageEnd` or `< coverageStart` | **Pass** (exact end second still payable) |
| Pending claims | No on-chain pending state; settle is atomic | **OK for v1** — off-chain claim workflow must not call settle until authorized |
| Access control | `settleClaim` / `releaseReservation` = `onlyClaimsAuthority`; owner rotates authority | **Pass** — no AI role |
| Signature domain separation | **No EIP-712 claim signatures** — authorization is the `claimsAuthority` address | **Documented gap** — not a bug vs current design; do not treat webhooks as signatures |
| Duplicate payout | `settledClaims[claimId]` anti-replay + `losses[lossKey]` cumulative ≤ immutable `lossCap` | **Pass** — claimId ≠ lossKey; partials allowed within cap |
| Wrong beneficiary | `payoutTo != policy.beneficiary` reverts | **Pass** |
| Unauthorized signer | Non-authority settle reverts | **Pass** |
| LP withdraw vs reserved | `withdraw` capped by `availableCapital()` | **Pass** |
| Reentrancy | `ReentrancyGuard` + CEI-ish accounting before transfer | **Pass** |
| Accounting units | ERC-20 6-decimal only; no `msg.value` | **Pass** for Arc |
| Premium share mint after loss | Was 1:1 even when NAV &lt; 1; **fixed** to NAV mint (same as deposit) | **Hardened this session** |
| Same economic loss, new claimId | Second settle with same `lossKey` constrained by `lossCap` / policy remaining | **Hardened** — `LossKey.sol` + `losses` mapping; see Foundry same-loss tests |
| `releaseReservation` cancels policy | Authority can cancel mid-term and free capital | **By design** — ops control; document |

## Negative paths covered by Foundry (local)

- Underfunded bind  
- Withdraw while reserved  
- Duplicate claimId  
- Wrong beneficiary  
- Unauthorized settle  
- Expired coverage  
- Payout over remaining limit  
- Same lossKey partial then cap / inflated cap / policy binding  
- Local lifecycle E2E (invalid authority + blocked LP withdraw)  
- Immutable re-bind  

## Not claimed

- No testnet deployment address  
- No testnet tx hashes  
- No live Streams deliveries  
