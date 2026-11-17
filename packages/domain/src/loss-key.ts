/**
 * Canonical economic-loss identity (distinct from claim / settlement ids).
 *
 * On-chain lossKey = keccak256(abi.encode(
 *   chainId, policyId, exposureKey, incidentRef, lossLotId
 * ))
 * See `LossKey.sol` and `@arcuex/onchain` `computeLossKey`.
 *
 * Partial payouts are allowed until cumulative paid reaches an immutable
 * lossCap, and until the policy remaining limit / reservation is exhausted.
 * Do not conflate loss identity with claim identity.
 */

export type EconomicLossIdentity = {
  chainId: number;
  /** bytes32 hex policy id (on-chain) */
  policyIdBytes32: `0x${string}`;
  /** Opaque exposure key (hash of exposure entity id or exposureKey string) */
  exposureKey: `0x${string}`;
  /** Opaque incident reference hash */
  incidentRef: `0x${string}`;
  /** Covered loss lot id hash — one economic loss unit */
  lossLotId: `0x${string}`;
};

/** Human-readable preimage for docs/logging — not the on-chain lossKey bytes. */
export function lossKeyPreimage(parts: {
  chainId: number;
  policyEntityId: string;
  exposureId: string;
  incidentId: string;
  lossLotId: string;
}): string {
  return [
    'arcuex:loss',
    String(parts.chainId),
    parts.policyEntityId,
    parts.exposureId,
    parts.incidentId,
    parts.lossLotId,
  ].join(':');
}

/** Off-chain string preimages hashed to bytes32 components of the on-chain key. */
export function exposureKeyPreimage(exposureId: string): string {
  return `arcuex:exposure:${exposureId}`;
}

export function incidentRefPreimage(incidentId: string): string {
  return `arcuex:incident:${incidentId}`;
}

export function lossLotPreimage(lossLotId: string): string {
  return `arcuex:loss-lot:${lossLotId}`;
}
