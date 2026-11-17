import {
  canonicalTermsPayload,
  exposureKeyPreimage,
  incidentRefPreimage,
  lossLotPreimage,
  policyIdPreimage,
  type CoverageTerms,
} from '@arcuex/domain';
import { encodeAbiParameters, keccak256, stringToHex, type Hex } from 'viem';

/** bytes32 policy id = keccak256("arcuex:policy:<uuid>") */
export function toPolicyIdBytes32(policyEntityId: string): Hex {
  return keccak256(stringToHex(policyIdPreimage(policyEntityId)));
}

/** Immutable terms commitment matching InsurancePool.bindPolicy termsHash. */
export function hashCoverageTerms(terms: CoverageTerms): Hex {
  return keccak256(stringToHex(canonicalTermsPayload(terms)));
}

/** Settlement-record id — anti-replay only; not economic-loss identity. */
export function toClaimIdBytes32(claimEntityId: string): Hex {
  return keccak256(stringToHex(`arcuex:claim:${claimEntityId}`));
}

/**
 * On-chain lossKey matching LossKey.compute / InsurancePool.settleClaim.
 * Distinct from claimId. Partials allowed up to immutable lossCap.
 */
export function computeLossKey(parts: {
  chainId: number | bigint;
  policyId: Hex;
  exposureKey: Hex;
  incidentRef: Hex;
  lossLotId: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [
        BigInt(parts.chainId),
        parts.policyId,
        parts.exposureKey,
        parts.incidentRef,
        parts.lossLotId,
      ],
    ),
  );
}

/** Hash string entity ids into LossKey component bytes32 values. */
export function toExposureKeyBytes32(exposureId: string): Hex {
  return keccak256(stringToHex(exposureKeyPreimage(exposureId)));
}

export function toIncidentRefBytes32(incidentId: string): Hex {
  return keccak256(stringToHex(incidentRefPreimage(incidentId)));
}

export function toLossLotBytes32(lossLotId: string): Hex {
  return keccak256(stringToHex(lossLotPreimage(lossLotId)));
}

/** Convenience: compute lossKey from entity string ids + chain + policy bytes32. */
export function computeLossKeyFromEntities(parts: {
  chainId: number | bigint;
  policyId: Hex;
  exposureId: string;
  incidentId: string;
  lossLotId: string;
}): Hex {
  return computeLossKey({
    chainId: parts.chainId,
    policyId: parts.policyId,
    exposureKey: toExposureKeyBytes32(parts.exposureId),
    incidentRef: toIncidentRefBytes32(parts.incidentId),
    lossLotId: toLossLotBytes32(parts.lossLotId),
  });
}
