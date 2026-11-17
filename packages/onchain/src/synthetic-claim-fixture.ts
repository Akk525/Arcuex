import type { Address, Hex } from 'viem';
import { computeLossKeyFromEntities, toClaimIdBytes32, toPolicyIdBytes32 } from './ids';

/**
 * Off-chain synthetic claim evaluation for the Arc Testnet lifecycle demo.
 *
 * IMPORTANT: This is a labeled test fixture. It is NOT independently verified
 * real-world loss evidence. Evaluation here does not authorize settlement —
 * only the on-chain `claimsAuthority` may call settleClaim.
 */
export const SYNTHETIC_LIFECYCLE_CLAIM_LABEL =
  'SYNTHETIC fixture — not independently verified real-world loss' as const;

export type SyntheticClaimFixtureInput = {
  chainId: number;
  /** Off-chain policy entity UUID / opaque id */
  policyEntityId: string;
  claimEntityId: string;
  exposureId: string;
  incidentId: string;
  lossLotId: string;
  insuredAgent: string;
  beneficiary: Address;
  requestedPayoutMicros: bigint;
  lossCapMicros: bigint;
  observedEventRef: string;
};

export type SyntheticClaimEvaluation = {
  synthetic: true;
  label: typeof SYNTHETIC_LIFECYCLE_CLAIM_LABEL;
  policyId: Hex;
  claimId: Hex;
  lossKey: Hex;
  insuredAgent: string;
  beneficiary: Address;
  observedEventRef: string;
  requestedPayoutMicros: bigint;
  lossCapMicros: bigint;
  /** Evidence evaluation result — separate from on-chain settlement authorization. */
  evaluation: {
    outcome: 'VERIFIED' | 'REJECTED' | 'REVIEW';
    verified: boolean;
    reason: string;
    evaluatedAt: string;
  };
  /** Always false: evaluation never equals settlement authority. */
  settlementAuthorizedByEvidence: false;
};

export function evaluateSyntheticLifecycleClaim(
  input: SyntheticClaimFixtureInput,
): SyntheticClaimEvaluation {
  const policyId = toPolicyIdBytes32(input.policyEntityId);
  const claimId = toClaimIdBytes32(input.claimEntityId);
  const lossKey = computeLossKeyFromEntities({
    chainId: input.chainId,
    policyId,
    exposureId: input.exposureId,
    incidentId: input.incidentId,
    lossLotId: input.lossLotId,
  });

  const reasons: string[] = [];
  if (!input.observedEventRef.startsWith('synthetic:')) {
    reasons.push('observedEventRef must be synthetic:-prefixed');
  }
  if (input.requestedPayoutMicros <= 0n || input.lossCapMicros <= 0n) {
    reasons.push('payout and lossCap must be > 0');
  }
  if (input.requestedPayoutMicros > input.lossCapMicros) {
    reasons.push('requested payout exceeds lossCap');
  }
  if (!input.beneficiary || input.beneficiary === '0x0000000000000000000000000000000000000000') {
    reasons.push('beneficiary missing');
  }

  const ok = reasons.length === 0;
  return {
    synthetic: true,
    label: SYNTHETIC_LIFECYCLE_CLAIM_LABEL,
    policyId,
    claimId,
    lossKey,
    insuredAgent: input.insuredAgent,
    beneficiary: input.beneficiary,
    observedEventRef: input.observedEventRef,
    requestedPayoutMicros: input.requestedPayoutMicros,
    lossCapMicros: input.lossCapMicros,
    evaluation: {
      outcome: ok ? 'VERIFIED' : 'REJECTED',
      verified: ok,
      reason: ok
        ? 'Synthetic fixture checks passed (policy/agent/event/beneficiary/payout bound). Not real-world loss proof.'
        : reasons.join('; '),
      evaluatedAt: new Date().toISOString(),
    },
    settlementAuthorizedByEvidence: false,
  };
}
