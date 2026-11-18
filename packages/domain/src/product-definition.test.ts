import { describe, expect, it } from 'vitest';
import {
  artifactDigest,
  canonicalProductJson,
  InsuranceProductSchema,
  ProductAmountSchema,
  snapshotProduct,
} from './product-definition';
import { buildSyntheticTerms } from './synthetic-product';
import { encodeTerms } from './serialize';
import { policyIdPreimage } from './onchain-ids';

export function specimenProduct() {
  const reference = (kind: 'exposure' | 'coverage' | 'evidence' | 'wording') => ({
    kind,
    id: `${kind}-one`,
    version: 1,
    digest: artifactDigest(kind, { example: true }),
  });
  return {
    schemaVersion: 1 as const,
    organizationId: 'synthetic-lab',
    productId: 'example-cover',
    version: 1,
    name: 'Example',
    description: 'Synthetic definition only',
    synthetic: true,
    exposure: reference('exposure'),
    coverage: reference('coverage'),
    evidence: reference('evidence'),
    wording: reference('wording'),
  };
}

describe('additive product envelope', () => {
  it('accepts a non-chain product and pins independent immutable references', () => {
    const source = specimenProduct();
    const result = snapshotProduct(source);
    source.coverage.version = 2;
    expect(result.content.coverage.version).toBe(1);
    expect(Object.isFrozen(result.content.coverage)).toBe(true);
    expect(() => {
      (result.content.coverage as { version: number }).version = 3;
    }).toThrow();
    expect(result.reference.digest).toBe(result.digest);
  });
  it('rejects unsupported versions, kind substitution and executable extras', () => {
    for (const extra of [
      { schemaVersion: 2 },
      { script: 'pay()' },
      { authority: 'settle' },
      { version: 0 },
      { coverage: specimenProduct().exposure },
    ]) {
      expect(() => snapshotProduct({ ...specimenProduct(), ...extra })).toThrow();
    }
    expect(
      InsuranceProductSchema.safeParse({
        ...specimenProduct(),
        workflow: { kind: 'workflow', id: 'x', version: 1, digest: 'bad' },
      }).success,
    ).toBe(false);
  });
  it('produces stable content identity and a new identity for a nested change', () => {
    const a = specimenProduct();
    const reversed = Object.fromEntries(Object.entries(a).reverse());
    expect(snapshotProduct(a).digest).toBe(snapshotProduct(reversed).digest);
    expect(snapshotProduct({ ...a, coverage: { ...a.coverage, version: 2 } }).digest).not.toBe(
      snapshotProduct(a).digest,
    );
    expect(artifactDigest('wording', { a: 1 })).not.toBe(artifactDigest('coverage', { a: 1 }));
    expect(artifactDigest('coverage', { a: 1 })).toBe(
      'sha256:d9d7c72309681d1b15de19cd10700e6e487ce1c930bcf52a1db2055b2289dba1',
    );
    expect(canonicalProductJson({ z: [2, 1], a: true })).toBe('{"a":true,"z":[2,1]}');
  });
  it('rejects ambiguous/non-JSON content rather than normalizing away risk', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const value of [
      undefined,
      NaN,
      Infinity,
      0.5,
      1n,
      new Date(),
      cyclic,
      new Array<unknown>(2),
      { x: undefined },
      {
        get x() {
          throw new Error('getter');
        },
      },
    ]) {
      expect(() => canonicalProductJson(value)).toThrow();
    }
  });
  it('uses explicit integer denominations with no implicit USDC assumption', () => {
    expect(
      ProductAmountSchema.parse({
        units: '100',
        asset: { kind: 'currency', code: 'USD', scale: 2 },
      }).units,
    ).toBe('100');
    for (const units of ['-1', '1.2', '01', 100])
      expect(() =>
        ProductAmountSchema.parse({ units, asset: { kind: 'currency', code: 'USD', scale: 2 } }),
      ).toThrow();
  });
  it('preserves legacy terms serialization and policy identity preimages', () => {
    const terms = buildSyntheticTerms({
      coverageStartsAt: '2026-11-18T00:00:00.000Z',
      coverageEndsAt: '2026-11-19T00:00:00.000Z',
    });
    expect(encodeTerms(terms)).toBe(
      '{"version":1,"productCode":"ARCUE_X_SYNTHETIC_V1","productVersion":"1.0.0","coveredEventClass":"financial_loss","limitMicros":"100000000","premiumMicros":"1000000","deductibleMicros":"0","coverageStartsAt":"2026-11-18T00:00:00.000Z","coverageEndsAt":"2026-11-19T00:00:00.000Z","waitingPeriodSeconds":0,"synthetic":true,"notes":"SYNTHETIC TERMS — demo only, not real insurance issuance."}',
    );
    expect(policyIdPreimage('cc5fcf8f-d09c-4db9-8520-76d276c2358b')).toBe(
      'arcuex:policy:cc5fcf8f-d09c-4db9-8520-76d276c2358b',
    );
  });
});
