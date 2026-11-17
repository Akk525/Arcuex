# November 20 release candidate assessment

Verified: **2026-11-17**. Branch: **`release/nov20-arc-testnet-beta`**.

## Decision: CONDITIONAL GO

The release candidate integrates procurement/claims (`9f8d473`) with Railway launch infrastructure (`334472c`) via a clean fast-forward. Local packaging verification passed. **Do not deploy publicly** until the Railway host checklist and authorized live-wallet acceptance gates pass.

Not approval for real-world insurance, autonomous payouts, contract changes, or financial broadcasts.

## Gates remaining

1. Private Railway service + `/data` volume + secrets + host smoke against the Railway HTTPS URL.
2. Authorized live extension-wallet / operator acceptance.
3. Operational capital / coverage-window limits on the existing pool.

See [docs/deployments/nov20-release-candidate.md](../deployments/nov20-release-candidate.md).
