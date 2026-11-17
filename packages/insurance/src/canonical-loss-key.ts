import { ValidationError } from '@arcuex/domain';
import {
  computeLossKeyFromEntities,
  toPolicyIdBytes32,
} from '@arcuex/onchain';

/** Arc Testnet — claims beta target chain. */
export const CLAIMS_LOSS_KEY_CHAIN_ID = 5042002;

/**
 * Canonical loss-lot id derived from validated incident reference.
 * Reviewers cannot supply an alternate lot for the same exposure/event.
 */
export function canonicalLossLotId(input: {
  policyId: string;
  exposureId: string;
  observedEventRef: string;
}): string {
  const ref = input.observedEventRef.trim();
  if (!ref) throw new ValidationError('observedEventRef required for canonical loss lot');
  return `${input.policyId}:${input.exposureId}:${ref}`;
}

/**
 * Derive on-chain-compatible lossKey from entity ids + validated observed event.
 * Uses existing @arcuex/onchain helpers (shared with pool) — do not invent alternate hashes.
 */
export function deriveCanonicalClaimsLossKey(input: {
  policyEntityId: string;
  exposureId: string;
  incidentId: string;
  observedEventRef: string;
  chainId?: number;
}): `0x${string}` {
  const chainId = input.chainId ?? CLAIMS_LOSS_KEY_CHAIN_ID;
  const lossLotId = canonicalLossLotId({
    policyId: input.policyEntityId,
    exposureId: input.exposureId,
    observedEventRef: input.observedEventRef,
  });
  return computeLossKeyFromEntities({
    chainId,
    policyId: toPolicyIdBytes32(input.policyEntityId),
    exposureId: input.exposureId,
    incidentId: input.incidentId,
    lossLotId,
  });
}
