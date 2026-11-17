import { describe, expect, it } from 'vitest';
import { buildSyntheticTerms } from '@arcuex/domain';
import { hashCoverageTerms, toClaimIdBytes32, toPolicyIdBytes32 } from './ids';

describe('onchain ids', () => {
  it('produces stable 32-byte policy ids', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const a = toPolicyIdBytes32(id);
    const b = toPolicyIdBytes32(id);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[a-f0-9]{64}$/);
    expect(toPolicyIdBytes32('22222222-2222-4222-8222-222222222222')).not.toBe(a);
  });

  it('hashes coverage terms immutably', () => {
    const terms = buildSyntheticTerms({
      coverageStartsAt: '2026-11-16T00:00:00.000Z',
      coverageEndsAt: '2026-11-23T00:00:00.000Z',
    });
    const h1 = hashCoverageTerms(terms);
    const h2 = hashCoverageTerms(terms);
    expect(h1).toBe(h2);
    expect(hashCoverageTerms({ ...terms, notes: 'changed' })).not.toBe(h1);
  });

  it('namesclaims distinctly from policies', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(toClaimIdBytes32(id)).not.toBe(toPolicyIdBytes32(id));
  });
});
