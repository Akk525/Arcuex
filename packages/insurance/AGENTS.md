# @arcuex/insurance

## Scope

Application services for quote-to-bind, incident/claims pipeline, and capital
orchestration on top of `@arcuex/domain` + `@arcuex/persistence`.

## Rules

- Synthetic product only for demo underwriting — never claim real issuance.
- Funding verification is an explicit boolean/check, not a silent assumption.
- Incident intake stores observed refs; verifiers/rules decide coverage.
- AI majority votes must not authorize payouts.
- Keep services testable with in-memory SQLite.

## Tests

```bash
pnpm --filter @arcuex/insurance test
```
