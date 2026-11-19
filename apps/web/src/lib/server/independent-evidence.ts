import type { InsuranceRepository } from '@arcuex/persistence';
import type { ClaimsCase, IndependentLiquidationVerification } from '@arcuex/insurance';
import { procurementClient } from './procurement-chain';
import {
  INDEPENDENT_LIQUIDATION_VERIFIER,
  isIndependentLiquidationProfile,
  sameIndependentLiquidationProfile,
} from '@arcuex/domain';
import { getRuntimeConfig } from './runtime-config';

export function configuredIndependentLiquidation() {
  if (getRuntimeConfig().chainSource !== 'arc-testnet') return undefined;
  const raw = process.env.ARCUEX_INDEPENDENT_LIQUIDATION_PROFILE;
  if (!raw) return undefined;
  try {
    const p: unknown = JSON.parse(raw);
    if (!isIndependentLiquidationProfile(p)) return undefined;
    return {
      verifier: p.verifier,
      emitter: p.emitter,
      runtimeCodeHash: p.runtimeCodeHash,
      replayPublicKey: p.replayPublicKey,
      recoveryPublicKey: p.recoveryPublicKey,
    };
  } catch {
    return undefined;
  }
}

// Read-only canonicality check immediately before human approval or settlement preparation.
export async function recheckIndependentEvidence(
  repo: InsuranceRepository,
  claim: ClaimsCase,
  verificationId: string | undefined,
  client = procurementClient(),
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
    !stored.validUntilMs ||
    stored.validUntilMs <= Date.now() ||
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
    client.getBlockNumber(),
    client.getBlock({ blockNumber }),
  ]);
  if (chainId !== 5042002 || head < blockNumber + 2n || block.hash !== stored.anchor.hash)
    throw new Error('Independent evidence is no longer canonical');
}
