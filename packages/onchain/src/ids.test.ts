import { describe, expect, it } from 'vitest';
import { buildSyntheticTerms } from '@arcuex/domain';
import {
  computeLossKey,
  computeLossKeyFromEntities,
  hashCoverageTerms,
  toClaimIdBytes32,
  toPolicyIdBytes32,
} from './ids';

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

  it('names claims distinctly from policies and loss keys', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const policyId = toPolicyIdBytes32(id);
    const claimId = toClaimIdBytes32(id);
    const lossKey = computeLossKeyFromEntities({
      chainId: 5042002,
      policyId,
      exposureId: id,
      incidentId: id,
      lossLotId: id,
    });
    expect(claimId).not.toBe(policyId);
    expect(lossKey).not.toBe(claimId);
    expect(lossKey).not.toBe(policyId);
  });

  it('computes lossKey as abi.encode hash (matches LossKey.sol)', () => {
    const policyId = ('0x' + '11'.repeat(32)) as `0x${string}`;
    const exposureKey = ('0x' + '22'.repeat(32)) as `0x${string}`;
    const incidentRef = ('0x' + '33'.repeat(32)) as `0x${string}`;
    const lossLotId = ('0x' + '44'.repeat(32)) as `0x${string}`;
    const a = computeLossKey({
      chainId: 5042002,
      policyId,
      exposureKey,
      incidentRef,
      lossLotId,
    });
    const b = computeLossKey({
      chainId: 5042002,
      policyId,
      exposureKey,
      incidentRef,
      lossLotId,
    });
    expect(a).toBe(b);
    expect(
      computeLossKey({
        chainId: 1,
        policyId,
        exposureKey,
        incidentRef,
        lossLotId,
      }),
    ).not.toBe(a);
  });
});
