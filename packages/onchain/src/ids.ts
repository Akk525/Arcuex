import { canonicalTermsPayload, policyIdPreimage, type CoverageTerms } from '@arcuex/domain';
import { keccak256, stringToHex, type Hex } from 'viem';

/** bytes32 policy id = keccak256("arcuex:policy:<uuid>") */
export function toPolicyIdBytes32(policyEntityId: string): Hex {
  return keccak256(stringToHex(policyIdPreimage(policyEntityId)));
}

/** Immutable terms commitment matching InsurancePool.bindPolicy termsHash. */
export function hashCoverageTerms(terms: CoverageTerms): Hex {
  return keccak256(stringToHex(canonicalTermsPayload(terms)));
}

export function toClaimIdBytes32(claimEntityId: string): Hex {
  return keccak256(stringToHex(`arcuex:claim:${claimEntityId}`));
}
