import { describe, expect, it } from 'vitest';
import { evaluateSyntheticLifecycleClaim } from './synthetic-claim-fixture';

describe('evaluateSyntheticLifecycleClaim', () => {
  it('labels synthetic evidence and never authorizes settlement', () => {
    const ev = evaluateSyntheticLifecycleClaim({
      chainId: 5042002,
      policyEntityId: 'pol-1',
      claimEntityId: 'claim-1',
      exposureId: 'exp-1',
      incidentId: 'inc-1',
      lossLotId: 'lot-1',
      insuredAgent: '0xabc',
      beneficiary: '0x00000000000000000000000000000000000000aa',
      requestedPayoutMicros: 1_000_000n,
      lossCapMicros: 1_000_000n,
      observedEventRef: 'synthetic:oracle-liq:fixture',
    });
    expect(ev.synthetic).toBe(true);
    expect(ev.label).toMatch(/SYNTHETIC/);
    expect(ev.evaluation.verified).toBe(true);
    expect(ev.settlementAuthorizedByEvidence).toBe(false);
    expect(ev.claimId).not.toBe(ev.lossKey);
  });

  it('rejects non-synthetic event refs', () => {
    const ev = evaluateSyntheticLifecycleClaim({
      chainId: 5042002,
      policyEntityId: 'pol-1',
      claimEntityId: 'claim-1',
      exposureId: 'exp-1',
      incidentId: 'inc-1',
      lossLotId: 'lot-1',
      insuredAgent: 'agent',
      beneficiary: '0x00000000000000000000000000000000000000aa',
      requestedPayoutMicros: 1n,
      lossCapMicros: 1n,
      observedEventRef: 'mainnet:real-loss',
    });
    expect(ev.evaluation.outcome).toBe('REJECTED');
    expect(ev.settlementAuthorizedByEvidence).toBe(false);
  });
});
