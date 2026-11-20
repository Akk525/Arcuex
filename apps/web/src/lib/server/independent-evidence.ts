import type { InsuranceRepository } from '@arcuex/persistence';
import type { ClaimsCase, IndependentLiquidationVerification } from '@arcuex/insurance';
import { ARC_CONFIRMATION_DEPTH } from './arc-confirmation';
import { procurementClient } from './procurement-chain';
import {
  INDEPENDENT_LIQUIDATION_VERIFIER,
  sameIndependentLiquidationProfile,
} from '@arcuex/domain';
import { getRuntimeConfig } from './runtime-config';

export function configuredIndependentLiquidation() {
  return getRuntimeConfig().independentLiquidationProfile;
}

// Read-only canonicality check immediately before human approval or settlement preparation.
export async function recheckIndependentEvidence(
  repo: InsuranceRepository,
  claim: ClaimsCase,
  verificationId: string | undefined,
  client = procurementClient(),
  atMs = Date.now(),
) {
  const profile = configuredIndependentLiquidation();
  const stored = repo
    .listClaimVerifications(claim.id)
    .map(({ recordJson }) => JSON.parse(recordJson) as IndependentLiquidationVerification)
    .find((v) => v.id === verificationId);
  if (
    !profile ||
    !stored ||
    !stored.anchor ||
    Date.parse(stored.createdAt) > atMs ||
    !stored.validUntilMs ||
    stored.validUntilMs <= atMs ||
    stored.verifierVersion !== INDEPENDENT_LIQUIDATION_VERIFIER ||
    stored.authenticity !== 'verified_independent' ||
    stored.evidenceSufficiency !== 'sufficient' ||
    !sameIndependentLiquidationProfile(profile, stored.profile) ||
    !sameIndependentLiquidationProfile(
      profile,
      repo.getProcurementPolicy(claim.policyId)?.terms.independentProfile,
    )
  )
    throw new Error('Current independent verification required');
  const blockNumber = BigInt(stored.anchor.number);
  const [chainId, head, block] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber({ cacheTime: 0 }),
    client.getBlock({ blockNumber }),
  ]);
  if (
    chainId !== 5042002 ||
    head < blockNumber + ARC_CONFIRMATION_DEPTH ||
    block.hash !== stored.anchor.hash
  )
    throw new Error('Independent evidence is no longer canonical');
  return stored;
}
