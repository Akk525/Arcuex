# Isolated experiments

Run from the worktree root with Node 24+ (native TypeScript stripping):

```sh
pnpm exec node --test docs/research/coverage-wedges/fixtures/evaluator.test.ts
```

The repository supports Node 20+, but these optional research fixtures use Node's
newer native TS runner; no production requirement or dependency has changed.
`cases.ts` exports fabricated happy paths; the test file supplies rejected and ambiguous
mutations. No fixture contains a real transaction, wallet or signed attestation.

`evaluator.ts` tests conditional coverage arithmetic and gates. The trusted caller must
supply immutable terms, canonical event-position loss keys, independently verified
summary inputs, recovery valuation and capacity. Strings prefixed `synthetic:` are
deliberately not real EVM identities. This is not an evidence verifier, HTTP parser,
event emitter, production adapter or payout authority. No synthetic result is safe to
forward as proof of a financial event.

The duplicate set is read-only; tests do not imply durable idempotency or concurrent
capacity accounting. A real integration needs atomic loss registration, reservation
updates, event-wide exposure controls, authorized assessment and explicit wallet approval.
