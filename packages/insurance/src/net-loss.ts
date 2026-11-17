import { ValidationError, type UsdcMicros } from '@arcuex/domain';

export type NetLossInput = {
  /** Independently verified or fixture-consistent economic loss. Null → REVIEW. */
  verifiedLossMicros: UsdcMicros | null;
  deductibleMicros: UsdcMicros;
  priorCompensationMicros: UsdcMicros;
  /** Null means unknown recoveries → must REVIEW, never silent approve/deny. */
  recoveriesMicros: UsdcMicros | null;
  remainingLimitMicros: UsdcMicros;
  lossCapMicros: UsdcMicros;
  /** Cumulative payouts already applied to the same durable lossKey. */
  alreadyPaidForLossMicros: UsdcMicros;
  requestedMicros: UsdcMicros;
};

export type NetLossResult =
  | {
      outcome: 'payable';
      payableMicros: UsdcMicros;
      reasonCode: 'NET_LOSS_COMPUTED' | 'NET_LOSS_ZERO';
    }
  | {
      outcome: 'REVIEW';
      payableMicros: null;
      reasonCode: 'UNKNOWN_RECOVERIES' | 'UNVERIFIED_LOSS' | 'MISSING_LIMITS';
    }
  | {
      outcome: 'DENIED';
      payableMicros: null;
      reasonCode: 'LOSS_CAP_EXHAUSTED' | 'NO_REMAINING_LIMIT';
    };

function assertNonNegative(label: string, value: bigint): void {
  if (value < 0n) {
    throw new ValidationError(`${label} must be non-negative`);
  }
}

/**
 * Compute payable USDC micros. Never derives amount from LLM or claimant alone —
 * caller must supply verifiedLossMicros from evidence/authority path.
 */
export function computeNetLossPayable(input: NetLossInput): NetLossResult {
  assertNonNegative('deductibleMicros', input.deductibleMicros);
  assertNonNegative('priorCompensationMicros', input.priorCompensationMicros);
  assertNonNegative('remainingLimitMicros', input.remainingLimitMicros);
  assertNonNegative('lossCapMicros', input.lossCapMicros);
  assertNonNegative('alreadyPaidForLossMicros', input.alreadyPaidForLossMicros);
  assertNonNegative('requestedMicros', input.requestedMicros);
  if (input.recoveriesMicros !== null) {
    assertNonNegative('recoveriesMicros', input.recoveriesMicros);
  }
  if (input.verifiedLossMicros !== null) {
    assertNonNegative('verifiedLossMicros', input.verifiedLossMicros);
  }

  if (input.verifiedLossMicros === null) {
    return { outcome: 'REVIEW', payableMicros: null, reasonCode: 'UNVERIFIED_LOSS' };
  }
  if (input.recoveriesMicros === null) {
    return { outcome: 'REVIEW', payableMicros: null, reasonCode: 'UNKNOWN_RECOVERIES' };
  }

  if (input.remainingLimitMicros === 0n) {
    return { outcome: 'DENIED', payableMicros: null, reasonCode: 'NO_REMAINING_LIMIT' };
  }

  const lossRoom = input.lossCapMicros - input.alreadyPaidForLossMicros;
  if (lossRoom <= 0n) {
    return { outcome: 'DENIED', payableMicros: null, reasonCode: 'LOSS_CAP_EXHAUSTED' };
  }

  const afterDeductions =
    input.verifiedLossMicros -
    input.deductibleMicros -
    input.priorCompensationMicros -
    input.recoveriesMicros;

  const economic = afterDeductions > 0n ? afterDeductions : 0n;

  // Pool-paid/pending commitments are distinct from external prior compensation.
  // Both reduce economic room; the policy/loss ceiling alone is insufficient.
  const economicRoom = economic - input.alreadyPaidForLossMicros;
  let payable = economicRoom > 0n ? economicRoom : 0n;
  if (payable > input.requestedMicros) payable = input.requestedMicros;
  if (payable > input.remainingLimitMicros) payable = input.remainingLimitMicros;
  if (payable > lossRoom) payable = lossRoom;

  if (payable === 0n) {
    return { outcome: 'payable', payableMicros: 0n, reasonCode: 'NET_LOSS_ZERO' };
  }
  return { outcome: 'payable', payableMicros: payable, reasonCode: 'NET_LOSS_COMPUTED' };
}
