import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, type Evidence, type Terms } from './evaluator.ts';
import { terms, oracle, protocolTerms, protocol, usdc } from './cases.ts';
const run = (e: Evidence, t: Terms = e.kind === 'oracle' ? terms : protocolTerms) =>
  evaluate(t, e, new Set());

test('oracle pays net extraction, excludes debt principal and deducts recovery', () => {
  assert.equal(run(oracle).payableMicros, usdc(312n));
  assert.equal(run(oracle).status, 'COVERED');
});
test('protocol pays capped, compensated principal only', () => {
  assert.equal(run(protocol, protocolTerms).payableMicros, usdc(1000n));
  const uncapped = {
    ...protocolTerms,
    policyRemainingMicros: usdc(10000n),
    exposureRemainingMicros: usdc(10000n),
  };
  assert.equal(run(protocol, uncapped).payableMicros, usdc(3120n));
});
const commonRejections: Array<[string, Partial<Evidence>]> = [
  ['wrong chain', { chainId: 1 }],
  ['fake contract', { pool: 'synthetic:claimant-pool' }],
  ['upgraded code', { codeHash: 'synthetic:unlisted-code' }],
  ['wrong position', { position: 'synthetic:other-position' }],
  ['beneficiary substitution', { beneficiary: 'synthetic:attacker' }],
  ['late purchase', { eventAt: 86399 }],
  ['end time boundary', { eventAt: terms.endsAt }],
  ['related party', { relationship: 'related' }],
  ['deliberate exploit', { excludedConduct: true }],
  ['borrow/withdraw/re-entry after bind', { exposureUnchanged: false }],
  ['negative recovery', { recoveriesMicros: -1n }],
];
for (const [name, mutation] of commonRejections)
  for (const base of [oracle, protocol]) {
    test(`${base.kind} rejects ${name}`, () => {
      const actual = run({ ...base, ...mutation } as Evidence);
      assert.equal(actual.status, 'REJECTED');
      assert.equal(actual.payableMicros, 0n);
    });
  }
for (const [name, mutation] of [
  ['unapproved attester', { verifierApproved: false }],
  ['nonfinal/reorg', { canonical: false }],
  ['missing history', { complete: false }],
  ['provider disagreement', { referenceAgrees: false }],
  ['unknown relationships', { relationship: 'unknown' }],
  ['pending grants', { recoveriesResolved: false }],
] as const)
  for (const base of [oracle, protocol]) {
    test(`${base.kind} holds ${name} for review`, () => {
      const actual = run({ ...base, ...mutation });
      assert.equal(actual.status, 'REVIEW');
      assert.equal(actual.payableMicros, 0n);
    });
  }
for (const base of [oracle, protocol]) {
  test(`${base.kind} duplicate loss key rejects regardless of new delivery ID`, () => {
    assert.equal(
      evaluate(base.kind === 'oracle' ? terms : protocolTerms, base, new Set([base.lossKey]))
        .reason,
      'DUPLICATE_LOSS',
    );
  });
  test(`${base.kind} cannot exceed any capacity`, () => {
    for (const key of [
      'policyRemainingMicros',
      'exposureRemainingMicros',
      'reservedEventRemainingMicros',
    ] as const)
      assert.equal(
        run(base, { ...(base.kind === 'oracle' ? terms : protocolTerms), [key]: 1n }).payableMicros,
        1n,
      );
  });
  test(`${base.kind} full recoveries produce no payable loss`, () => {
    assert.equal(run({ ...base, recoveriesMicros: usdc(100000n) }).payableMicros, 0n);
  });
}
test('market liquidation fails counterfactual', () => {
  assert.equal(
    run({ ...oracle, referenceHealthE18: 99n * 10n ** 16n }).reason,
    'NO_BUT_FOR_CAUSATION',
  );
});
test('exact ratio and HF boundaries are inclusive', () => {
  assert.equal(
    run({ ...oracle, actualRatio: 9800n, referenceHealthE18: 102n * 10n ** 16n }).status,
    'COVERED',
  );
  assert.equal(run({ ...oracle, actualRatio: 9801n }).status, 'REJECTED');
  assert.equal(run({ ...oracle, actualHealthE18: 10n ** 18n }).status, 'REJECTED');
});
test('bad wrapper reference is ambiguous', () => {
  assert.equal(run({ ...oracle, referenceUsable: false }).status, 'REVIEW');
});
test('zero ratio, no liquidation and no extraction reject', () => {
  assert.equal(run({ ...oracle, actualRatio: 0n }).status, 'REJECTED');
  assert.equal(run({ ...oracle, liquidation: false }).status, 'REJECTED');
  assert.equal(run({ ...oracle, seizedValueMicros: 0n }).status, 'REJECTED');
});
test('unqualified exploit, unresolved rights and short window cannot pay', () => {
  for (const mutation of [
    { exploitQualified: false },
    { rightsResolved: false },
    { evaluatedAt: 3 * 86400 },
  ])
    assert.equal(run({ ...protocol, ...mutation }).status, 'REVIEW');
});
test('protocol continuous lot reduces insured principal', () => {
  assert.equal(run({ ...protocol, continuousLotPrincipalMicros: usdc(5000n) }).payableMicros, 0n);
});
test('only synthetic records; malformed bigint and missing boolean fail closed', () => {
  assert.equal(
    run({ ...oracle, synthetic: false } as unknown as Evidence).reason,
    'SYNTHETIC_ONLY',
  );
  assert.equal(
    run({ ...oracle, actualRatio: '9700' } as unknown as Evidence).reason,
    'INVALID_INPUT',
  );
  assert.equal(
    run({ ...oracle, complete: undefined } as unknown as Evidence).reason,
    'INVALID_INPUT',
  );
});
test('huge integers remain exact and coinsurance rounds down', () => {
  assert.equal(run({ ...oracle, seizedValueMicros: 10n ** 70n }).payableMicros, usdc(1000n));
  assert.equal(
    run(
      { ...oracle, seizedValueMicros: 7n, debtExtinguishedValueMicros: 0n, recoveriesMicros: 0n },
      { ...terms, deductibleMicros: 0n },
    ).payableMicros,
    5n,
  );
});
test('registration waiting period and invalid time inputs fail closed', () => {
  assert.equal(run(oracle, { ...terms, registeredAt: oracle.eventAt - 1 }).status, 'REJECTED');
  assert.equal(run({ ...oracle, eventAt: Number.NaN }).status, 'REJECTED');
  assert.equal(run(oracle, { ...terms, waitingSeconds: 0 }).status, 'REJECTED');
});
test('claim cannot choose a more favorable wedge than its bound terms', () => {
  assert.equal(run(protocol, terms).reason, 'SCOPE_MISMATCH');
  assert.equal(run(oracle, protocolTerms).reason, 'SCOPE_MISMATCH');
});
