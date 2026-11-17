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

Conflict rule: additive migrations only (`004_claims_cases.sql`, `005_claims_case_binding.sql`). If Codex A also adds `004_*`/`005_*`, rename one side before merge.

## Security handoff (2026-11-17 hardening)

- Claims APIs require `Authorization: Bearer` tokens (`CLAIMS_CLAIMANT_API_TOKEN`, `CLAIMS_REVIEWER_API_TOKEN`, `CLAIMS_AUTHORITY_API_TOKEN`). Body `actor` / `authorityActor` fields are ignored.
- Claim open validates policyholder/agent ownership via `x-arcuex-wallet` / `x-arcuex-policyholder-id` / `x-arcuex-agent-id` against SQLite policy graph.
- Approval freezes `payoutTo`, `lossKey`, `payableMicros`, and `evidenceRoot` in `adjudication_binding_json`. Settlement prep must echo the frozen binding.
- Synthetic/fixture settlement prep requires `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=1` on the authority principal. Still no broadcast from claims routes.
- Procurement should continue writing `policyholders.wallet_address` so claims can bind beneficiaries without shared-schema edits.
