# ClaimsCase adjudication design (v1)

**Date:** 2026-11-17  
**Branch:** `feat/claims-workflow`  
**Decision:** Additive `ClaimsCase` in `@arcuex/insurance` — do not alter shared `Claim` / `Incident` schemas.

## Goal

Persisted, versioned claims investigation workflow from intake through adjudication and authority-gated settlement preparation, with append-only audit, bigint USDC micros, and explicit separation of evidence authenticity, coverage, net loss, and payout authorization.

## Ownership

| Owns | Does not touch |
| --- | --- |
| `packages/insurance/src/claims-case*` | `packages/domain` entity schemas / transitions |
| Additive `004_claims_cases.sql` + repo methods | `loss-key.ts`, onchain ABI/tx, contracts |
| Claims web routes/components/APIs | App shell nav/layout, quote-to-bind cores |

## State machine (`schemaVersion: 1`)

Statuses: `DRAFT` → `SUBMITTED` → `COLLECTING_EVIDENCE` → `INVESTIGATING` → `REVIEW` | `APPROVED` | `DENIED` → (`APPROVED` only) `SETTLEMENT_PENDING` → `PAID` | `SETTLEMENT_FAILED`.

Legal edges:

- `DRAFT` → `SUBMITTED`
- `SUBMITTED` → `COLLECTING_EVIDENCE`
- `COLLECTING_EVIDENCE` → `INVESTIGATING` | `REVIEW` (incomplete / unknown → REVIEW)
- `INVESTIGATING` → `REVIEW` | `APPROVED` | `DENIED`
- `REVIEW` → `INVESTIGATING` | `APPROVED` | `DENIED` (no payout while in REVIEW)
- `APPROVED` → `SETTLEMENT_PENDING` (requires authenticated claims authority)
- `SETTLEMENT_PENDING` → `PAID` | `SETTLEMENT_FAILED`
- `SETTLEMENT_FAILED` → `SETTLEMENT_PENDING` (recoverable retry)
- `DENIED`, `PAID` terminal

Every transition records actor, timestamp, reason code, and payload in `claims_case_events` (append-only).

## Four-way determination (never one boolean)

1. **Evidence authenticity** — `unverified` | `synthetic_fixture` | `verified_independent` | `failed`
2. **Coverage determination** — `unknown` | `covered` | `not_covered` | `review_required`
3. **Net loss** — bigint micros from verified loss − deductibles − prior compensation − recoveries, capped by remaining limit and lossCap; unknown recoveries force `REVIEW`
4. **Settlement authorization** — `none` | `pending_authority` | `authorized` | `rejected` — only authenticated claims authority may set `authorized`

Synthetic demo: `syntheticDemo=true` and authenticity `synthetic_fixture` means fixture consistency only — UI and audit must label it; never “independently verified real-world loss.”

## Persistence (additive)

- `claims_cases` — case row + determination fields + foreign keys to policy / optional incident / optional legacy claim
- `claims_case_events` — append-only transition log
- `claims_evidence_manifests` — immutable evidence manifests (digest, provenance, verification method, reliability)

## Settlement

- Prepare settlement payload using existing `@arcuex/onchain` `prepareSettleClaim` / verify helpers.
- **No broadcast** from this workstream. Execution remains gated outside UI click / LLM / webhook.
- Idempotent prepare keyed by case id + lossKey; recoverable from `SETTLEMENT_FAILED`.

## Codex A integration requirements (do not block)

Documented in `docs/working-notes/2026-11-17-claims-codex-a-integration.md`.
