# Codex A integration requirements (claims ↔ procurement)

**Date:** 2026-11-17  
**Claims branch:** `feat/claims-workflow`  
**Peer branch:** `feat/onchain-lifecycle`

Claims workflow does **not** edit shared domain claim/incident schemas, `loss-key` helpers, InsurancePool ABI, or deploy scripts. Needed from procurement / shared surfaces:

1. **Stable policy + exposure IDs** readable by claims intake (entity UUIDs already used by SQLite `policies` / `covered_exposures`).
2. **Beneficiary / claimant wallet** on policy or policyholder for settlement recipient confirmation (read-only).
3. **Bound policy remaining limit** — if procurement writes on-chain links via `onchain_policy_links`, claims will read them; do not rename columns without notice.
4. **lossKey preimage fields** — claims will call existing `computeLossKeyFromEntities` / domain preimages; keep signatures stable.
5. **Claims authority identity** — env/role already used by onchain lifecycle; claims UI will require the same authenticated authority string for `APPROVED` → `SETTLEMENT_PENDING`, never a frontend-only flag.
6. **Nav entry** — claims owns `/claims*` routes; if Codex A changes `AppShell` nav, keep or add a Claims link without renaming existing claims paths.

Conflict rule: additive migrations only (`004_claims_cases.sql`). If Codex A also adds `004_*`, rename one side before merge.
