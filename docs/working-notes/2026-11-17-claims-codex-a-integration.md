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

## Security handoff (2026-11-17 hardening + public-exposure closeout)

### Auth interface for Codex A (procurement)

Preferred shared pattern (claims already implements claims-scoped copy):

1. `POST /api/claims/auth/nonce` `{ wallet }` → `{ nonce, message, expiresAt }`
2. Wallet `personal_sign(message)` → `POST /api/claims/auth/verify` `{ wallet, nonce, signature }` → httpOnly `Secure`/`SameSite=Lax` cookie `arcuex_claims_sid`
3. Ops: `POST /api/claims/auth/ops-login` with `Authorization: Bearer <CLAIMS_REVIEWER|AUTHORITY_API_TOKEN>` → opaque session cookie (API secret never stored in cookie/JS storage)
4. Logout revokes session row + clears cookie

Procurement may mirror this under `/api/auth/*` later; do **not** rename claims cookie without coordination. Wallet sessions are **claimant-only** — never auto-elevate to reviewer/authority.

### Claims rules

- Legacy `POST /api/claims` and `POST /api/claims/demo` are **403** (read-only GET retained).
- Claim open validates policyholder/agent ownership against SQLite policy graph + session wallet.
- `lossKey` is derived via `@arcuex/onchain` `computeLossKeyFromEntities` from policy/exposure/incident/`observedEventRef`. Client-supplied alternate keys are rejected.
- Approval freezes `payoutTo`, `lossKey`, `payableMicros`, and `evidenceRoot` in `adjudication_binding_json`. Settlement prep must echo the frozen binding. No broadcast from claims routes.
- Synthetic settlement prep requires `CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=1` (default off).
- Same-loss `PAID`/`SETTLEMENT_PENDING` commitments count against loss cap (`sumCommittedForLossKey`).
- Migrations: `004`–`006` claims-owned. If Codex A adds overlapping `006_*`, rename before merge.
- Procurement should continue writing `policyholders.wallet_address` so claims can bind beneficiaries.
