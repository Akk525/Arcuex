import { describe, expect, it } from 'vitest';
import {
  canonicalLossLotId,
  deriveCanonicalClaimsLossKey,
} from './canonical-loss-key';

describe('canonical claims loss key', () => {
  const base = {
    policyEntityId: '11111111-1111-4111-8111-111111111111',
    exposureId: '22222222-2222-4222-8222-222222222222',
    incidentId: '33333333-3333-4333-8333-333333333333',
    observedEventRef: 'tx:0xabc',
  };

  it('is stable for the same economic loss identifiers', () => {
    const a = deriveCanonicalClaimsLossKey(base);
    const b = deriveCanonicalClaimsLossKey(base);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('changes when observed event (loss lot) changes', () => {
    const a = deriveCanonicalClaimsLossKey(base);
    const b = deriveCanonicalClaimsLossKey({
      ...base,
      observedEventRef: 'tx:0xdef',
    });
    expect(a).not.toBe(b);
  });

  it('builds deterministic loss-lot ids', () => {
    expect(
      canonicalLossLotId({
        policyId: base.policyEntityId,
        exposureId: base.exposureId,
        observedEventRef: 'tx:0xabc',
      }),
    ).toBe(`${base.policyEntityId}:${base.exposureId}:tx:0xabc`);
  });
});
