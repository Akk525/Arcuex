# ADR 002: Policy-agnostic insurance core with synthetic underwriting

## Status

Accepted — 2026-11-16

## Context

Arcuex needs an insurance domain before the first covered-event wedge is chosen.
The core must not encode protocol-failure vs execution-loss assumptions, must
keep money movement explicit and auditable, and must not authorize payouts via
AI majority votes.

## Decision

1. Put pure domain types/state machines/capital math in `@arcuex/domain`.
2. Persist with SQLite (`better-sqlite3`) and thin repositories in `@arcuex/persistence`.
3. Orchestrate quote-to-bind, claims, and capital in `@arcuex/insurance`.
4. Ship a clearly labeled **synthetic** coverage product for demo underwriting only.
5. Model observed events separately from verified covered events via pluggable
   `EvidenceProvider`, `IncidentVerifier`, and `CoverageRule` interfaces.
6. Use full-collateralization USDC micros accounting before any Solidity.

## Consequences

### Positive

- Wedge-agnostic domain can evolve without rewrite
- Testable vertical slice without external services
- Clear trust boundary: synthetic ledger ≠ on-chain proof

### Negative

- SQLite is local/Node-only (not Edge)
- Synthetic pricing is not actuarial and must not be marketed as real coverage

## Follow-ups

- QuickNode Streams webhook with dedupe (issue #7) — still blocked on credentials/host
- On-chain capital/settlement contracts only after ledger invariants remain green
