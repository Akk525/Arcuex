# @arcuex/persistence

## Scope

SQLite migrations and repositories for domain aggregates. Transactional writes
with audit events. Replay-safe idempotency key storage.

## Rules

- Use better-sqlite3 (Node runtime only). No ORM abstraction layers.
- Every state-changing write must run inside `db.transaction(...)`.
- Persist immutable terms JSON snapshots; do not mutate in place.
- Deduplicate by idempotency keys for quotes, claims, settlements, and inbound events.
- Do not invent cloud database adapters.

## Tests

```bash
pnpm --filter @arcuex/persistence test
```
