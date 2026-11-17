import { ValidationError } from '@arcuex/domain';
import { describe, expect, it } from 'vitest';
import { computeNetLossPayable, type NetLossInput } from './net-loss';

const base: NetLossInput = {
  verifiedLossMicros: 5_000_000n,
  deductibleMicros: 500_000n,
  priorCompensationMicros: 1_000_000n,
  recoveriesMicros: 0n,
  remainingLimitMicros: 10_000_000n,
  lossCapMicros: 8_000_000n,
  alreadyPaidForLossMicros: 0n,
  requestedMicros: 5_000_000n,
};

describe('computeNetLossPayable', () => {
  it('computes payable with bigint micros within all caps', () => {
    const result = computeNetLossPayable(base);
    // 5 - 0.5 - 1 - 0 = 3.5 USDC micros
    expect(result.outcome).toBe('payable');
    expect(result.payableMicros).toBe(3_500_000n);
    expect(result.reasonCode).toBe('NET_LOSS_COMPUTED');
  });

  it('caps by remaining limit, lossCap, and prior loss payouts', () => {
    const byLimit = computeNetLossPayable({
      ...base,
      verifiedLossMicros: 20_000_000n,
      deductibleMicros: 0n,
      priorCompensationMicros: 0n,
      remainingLimitMicros: 2_000_000n,
      lossCapMicros: 8_000_000n,
      alreadyPaidForLossMicros: 1_500_000n,
      requestedMicros: 20_000_000n,
    });
    // min(20M, 2M remaining, 6.5M loss room, request) = 2M
    expect(byLimit.outcome).toBe('payable');
    expect(byLimit.payableMicros).toBe(2_000_000n);

    const byLossRoom = computeNetLossPayable({
      ...base,
      verifiedLossMicros: 20_000_000n,
      deductibleMicros: 0n,
      priorCompensationMicros: 0n,
      remainingLimitMicros: 10_000_000n,
      lossCapMicros: 8_000_000n,
      alreadyPaidForLossMicros: 7_500_000n,
      requestedMicros: 20_000_000n,
    });
    // min(20M, 10M remaining, 500k loss room, request) = 500_000
    expect(byLossRoom.outcome).toBe('payable');
    expect(byLossRoom.payableMicros).toBe(500_000n);
  });

  it('forces REVIEW when recoveries are unknown', () => {
    const result = computeNetLossPayable({
      ...base,
      recoveriesMicros: null,
    });
    expect(result.outcome).toBe('REVIEW');
    expect(result.payableMicros).toBeNull();
    expect(result.reasonCode).toBe('UNKNOWN_RECOVERIES');
  });

  it('forces REVIEW when verified loss is missing', () => {
    const result = computeNetLossPayable({
      ...base,
      verifiedLossMicros: null,
    });
    expect(result.outcome).toBe('REVIEW');
    expect(result.reasonCode).toBe('UNVERIFIED_LOSS');
  });

  it('returns zero payable when deductions exhaust loss', () => {
    const result = computeNetLossPayable({
      ...base,
      verifiedLossMicros: 1_000_000n,
      deductibleMicros: 600_000n,
      priorCompensationMicros: 500_000n,
      recoveriesMicros: 0n,
    });
    expect(result.outcome).toBe('payable');
    expect(result.payableMicros).toBe(0n);
    expect(result.reasonCode).toBe('NET_LOSS_ZERO');
  });

  it('denies same-loss replay when loss cap already exhausted', () => {
    const result = computeNetLossPayable({
      ...base,
      alreadyPaidForLossMicros: 8_000_000n,
      lossCapMicros: 8_000_000n,
    });
    expect(result.outcome).toBe('DENIED');
    expect(result.payableMicros).toBeNull();
    expect(result.reasonCode).toBe('LOSS_CAP_EXHAUSTED');
  });

  it('rejects negative-like overflow inputs', () => {
    expect(() =>
      computeNetLossPayable({
        ...base,
        deductibleMicros: -1n as unknown as bigint,
      }),
    ).toThrow(ValidationError);
  });
});

it('subtracts pending/paid compensation from economic loss even when the policy cap has room', () => {
  const result = computeNetLossPayable({
    ...base,
    verifiedLossMicros: 1000000n,
    deductibleMicros: 100000n,
    priorCompensationMicros: 0n,
    recoveriesMicros: 0n,
    remainingLimitMicros: 1000000n,
    lossCapMicros: 1000000n,
    alreadyPaidForLossMicros: 600000n,
    requestedMicros: 600000n,
  });
  expect(result.outcome).toBe('payable');
  expect(result.payableMicros).toBe(300000n);
});
