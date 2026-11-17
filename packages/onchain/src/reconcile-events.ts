import type { Address, Hex, Log, PublicClient } from 'viem';
import { decodePoolLogs, type DecodedPoolEvent } from './events';
import { isClaimSettled, readLossAccounting, readOnchainPolicy, readPoolSnapshot } from './pool-reads';

export type BackfillReconcileResult = {
  decoded: Array<{ dedupeKey: string; event: DecodedPoolEvent }>;
  /** Keys already seen in a prior delivery (caller-supplied). */
  skippedDuplicates: string[];
  /** Newly observed keys after filtering. */
  novelDedupeKeys: string[];
  poolOk: boolean;
  mismatches: string[];
};

/**
 * Recover from missed Streams deliveries using RPC logs.
 * Contract state is authoritative; inbox dedupe is durable via dedupeKey set.
 *
 * QuickNode Streams transport verification is separate — this path only uses RPC.
 */
export async function reconcileFromBackfillLogs(
  client: PublicClient,
  pool: Address,
  logs: Array<Pick<Log, 'data' | 'topics' | 'transactionHash' | 'logIndex'>>,
  alreadySeen: ReadonlySet<string> = new Set(),
): Promise<BackfillReconcileResult> {
  const decoded = decodePoolLogs(logs);
  const skippedDuplicates: string[] = [];
  const novelDedupeKeys: string[] = [];

  for (const row of decoded) {
    if (alreadySeen.has(row.dedupeKey)) {
      skippedDuplicates.push(row.dedupeKey);
    } else {
      novelDedupeKeys.push(row.dedupeKey);
    }
  }

  const snapshot = await readPoolSnapshot(client, pool);
  const mismatches: string[] = [];
  if (snapshot.usdcBalance < snapshot.totalAssets) {
    mismatches.push('USDC balance < totalAssets');
  }
  if (snapshot.totalAssets < snapshot.totalReserved) {
    mismatches.push('underfunded: totalAssets < totalReserved');
  }

  // Cross-check ClaimSettled rows against authoritative mappings when present.
  for (const row of decoded) {
    if (row.event.eventName !== 'ClaimSettled') continue;
    const args = row.event.args;
    const settled = await isClaimSettled(client, pool, args.claimId);
    if (!settled) {
      mismatches.push(`ClaimSettled log for ${args.claimId} but settledClaims=false`);
      continue;
    }
    const loss = await readLossAccounting(client, pool, args.lossKey);
    if (!loss.exists) {
      mismatches.push(`ClaimSettled log lossKey ${args.lossKey} missing on-chain`);
    } else {
      if (loss.policyId.toLowerCase() !== args.policyId.toLowerCase()) {
        mismatches.push('lossKey policyId mismatch vs event');
      }
      if (loss.lossCap !== args.lossCap) {
        mismatches.push(`lossCap mismatch event=${args.lossCap} chain=${loss.lossCap}`);
      }
      if (loss.paid < args.lossPaidTotal) {
        mismatches.push(
          `loss.paid ${loss.paid} < event lossPaidTotal ${args.lossPaidTotal} (stale backfill?)`,
        );
      }
    }
    const policy = await readOnchainPolicy(client, pool, args.policyId);
    if (!policy.bound) {
      mismatches.push(`policy ${args.policyId} not bound after ClaimSettled`);
    } else if (policy.paidOut < args.amount) {
      mismatches.push(`policy.paidOut ${policy.paidOut} < event amount ${args.amount}`);
    }
  }

  return {
    decoded,
    skippedDuplicates,
    novelDedupeKeys,
    poolOk: mismatches.length === 0,
    mismatches,
  };
}

/** Merge novel keys into a durable seen-set after successful inbox insert. */
export function mergeSeenDedupeKeys(
  seen: ReadonlySet<string>,
  novel: readonly string[],
): Set<string> {
  const next = new Set(seen);
  for (const k of novel) next.add(k);
  return next;
}

export type { Hex };
