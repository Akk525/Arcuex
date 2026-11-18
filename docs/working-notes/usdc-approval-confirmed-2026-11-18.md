# Exact USDC approval confirmation — 2026-11-18

Verified at 2026-11-18T17:54:03.638Z on chain 5042002. The user confirmed the wallet transaction; the agent did not sign or broadcast it.

- Transaction: `0xd24ec17a3a6c45c7cf6b3960103d10e7fb62240333f56e7ce1d4a0429fc9220e`.
- Receipt: success, block 72887797, block hash `0x766054a6ea593a8271e5326ec48d1861e85edd7aa21f1e7cfcb2ef1b11d09f31`.
- Observed confirmations: 103 at block 72887899.
- Sender: `0x2E2Da4311Ea87Cfa31c372D59B4A0d567c15D760`.
- Target: `0x3600000000000000000000000000000000000000`; zero native transaction value.
- Exact input matched the verified `approve(0x6657974EEdF488380251bDD95A7FFfb0D456E49E, 10000)` calldata byte for byte.
- Receipt includes the matching Approval event for owner, spender, and 10000 micros.
- Resulting current allowance: **0.01 USDC**.
- Nonce: 5; next latest and pending nonce: 6.
- Transaction gas limit: 67475; actual gas used: 55426.
- Actual max fee per gas: 24 gwei; priority fee: 1 gwei; effective gas price: 21 gwei.
- Actual network fee: **0.001163946 USDC**, below the authorized **0.0016194 USDC** maximum.

All sender/chain/target/calldata/value/gas/fee/receipt/allowance assertions passed. [Raw read-only receipt evidence](usdc-approval-receipt-2026-11-18.json).

Arcuex's browser displays “Allowance confirmed · bind required” and “Premium approval confirmed.” This verifies that the UI recognized approval; it does not establish coverage.

The quote `c20e442d-c9c9-460d-9a41-ccd5702eb8a9` expired at 2026-11-18T17:53:57Z and must not be bound. No second approval is authorized or needed while allowance remains 10000. The next required step is a fresh 1 USDC / 1 day quote with this wallet as beneficiary, followed by a complete separate binding authorization packet. Browser input automation did not advance the fresh-quote screen; the user must click “Start a fresh quote”. No binding, deposits, withdrawals, or settlements were performed or authorized.
