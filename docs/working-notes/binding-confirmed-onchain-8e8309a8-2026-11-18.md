# Binding receipt verified — 2026-11-18

**On-chain binding succeeded; backend canonical reconciliation is still pending. Coverage is not yet confirmed by the application.**

- Policy: `cc5fcf8f-d09c-4db9-8520-76d276c2358b`.
- Quote: `8e8309a8-4e2f-4e63-8e0a-25d2a15e3f10`.
- Transaction: `0x93e4f284a3efb87bbf943763f5c5d96dc3bce8b0cd8bbbb5d6f3c42151772548`.
- Receipt status: success; block 72889182; hash `0x22f5a6719a4c672665ae306fdedc2a2e5b539e7a8a1191466e949c35de57be89`.
- Mined at **2026-11-18T18:04:51Z / 1:04:51 PM Eastern**, before quote deadline **18:06:20Z** and coverage start **18:11:20Z**.
- Observed confirmations: 89 at capture 2026-11-18T18:05:36.805Z.
- Chain: 5042002. Sender, target, zero native value, nonce 7 and full calldata match the authorized packet.
- Exact PolicyBound event and on-chain policy match all immutable binding arguments: policy ID, digest `0xf45654d128f93105dd78a07ef39760f5e4f06ee59f099d267b2f10b5fe5d3add`, payer, beneficiary, premium 10000 micros, limit 1000000 micros, coverage start 1795025480, end 1795111880.
- On-chain policy: bound true, cancelled false, reserved 1 USDC, paid out zero.
- Premium: **0.01 USDC**; matching ERC-20 Transfer event appears in the receipt.
- Gas limit: 326560; gas used: 261478; max fee per gas: 23 gwei; priority fee: 1 gwei; effective price: 21 gwei.
- Actual binding fee: **0.005491038 USDC**, below authorized maximum **0.00783744 USDC**.
- Premium plus actual binding fee: **0.015491038 USDC**.
- Remaining allowance: **0 USDC**. Do not approve or bind again.
- Pool available capital: **2.11 USDC**.

All listed identity, timing, event, on-chain state and fee assertions passed. [Raw RPC evidence](binding-receipt-8e8309a8-2026-11-18.json).

Browser observation: `Bind receipt checked. Canonical reconciliation must verify the policy before coverage is confirmed.` UI status remains `Reconciliation pending — no coverage confirmed`. The user may click **Re-check bind confirmation**, which is a backend receipt/status operation, not a second on-chain transaction. Browser input automation did not visibly change the status during this task. No canonical lifecycle confirmation was observed, so this report does not assert active or fully confirmed coverage.

Scheduled coverage window, subject to canonical reconciliation: **Nov 18, 2026, 1:11:20 PM Eastern through Nov 19, 2026, 1:11:20 PM Eastern**. No claim, settlement, deposit or withdrawal was authorized or performed. Transactions were confirmed by the user in MetaMask; the agent performed read-only verification.
