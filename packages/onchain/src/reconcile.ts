import type { Address, Hex, PublicClient } from 'viem';
import { OnchainError } from './errors';
import { readOnchainPolicy, readPoolSnapshot, type OnchainPolicy, type PoolSnapshot } from './pool-reads';

export type LocalPolicyView = {
  policyEntityId: string;
  policyIdBytes32: Hex;
  termsHash: Hex;
  beneficiary: Address;
  limitMicros: bigint;
  premiumMicros: bigint;
  bound: boolean;
  status: string;
};

export type ReconcileResult = {
  ok: boolean;
  pool: PoolSnapshot;
  policy: OnchainPolicy | null;
  mismatches: string[];
};

/**
 * Compare SQLite/local view to authoritative contract state.
 * Contract wins — mismatches are reported, not silently overwritten here.
 */
export async function reconcilePolicy(
  client: PublicClient,
  pool: Address,
  local: LocalPolicyView,
): Promise<ReconcileResult> {
  const snapshot = await readPoolSnapshot(client, pool);
  const mismatches: string[] = [];

  if (snapshot.usdcBalance < snapshot.totalAssets) {
    mismatches.push(
      `pool USDC balance ${snapshot.usdcBalance} < tracked totalAssets ${snapshot.totalAssets}`,
    );
  }
  if (snapshot.totalAssets < snapshot.totalReserved) {
    mismatches.push('underfunded: totalAssets < totalReserved');
  }

  let onchain: OnchainPolicy | null = null;
  try {
    onchain = await readOnchainPolicy(client, pool, local.policyIdBytes32);
  } catch (cause) {
    throw new OnchainError('RECONCILE_MISMATCH', 'Failed to read on-chain policy', { cause });
  }

  if (local.bound && !onchain.bound) {
    mismatches.push('local policy bound but on-chain not bound');
  }
  if (onchain.bound) {
    if (onchain.termsHash.toLowerCase() !== local.termsHash.toLowerCase()) {
      mismatches.push('termsHash mismatch (contract authoritative)');
    }
    if (onchain.beneficiary.toLowerCase() !== local.beneficiary.toLowerCase()) {
      mismatches.push('beneficiary mismatch');
    }
    if (onchain.limit !== local.limitMicros) {
      mismatches.push(`limit mismatch local=${local.limitMicros} chain=${onchain.limit}`);
    }
    if (onchain.premium !== local.premiumMicros) {
      mismatches.push(`premium mismatch local=${local.premiumMicros} chain=${onchain.premium}`);
    }
  }

  return {
    ok: mismatches.length === 0,
    pool: snapshot,
    policy: onchain,
    mismatches,
  };
}
