import type { Address, Log, PublicClient } from 'viem';
import { fetchRecentLogs } from './events';

/**
 * RPC log backfill for missed Streams deliveries.
 * This is reconciliation — not a substitute for authenticated Streams transport.
 */
export async function backfillPoolLogs(
  publicClient: PublicClient,
  pool: Address,
  opts?: { fromBlock?: bigint; toBlock?: bigint; maxBlocks?: number },
): Promise<Log[]> {
  return fetchRecentLogs(publicClient, {
    address: pool,
    fromBlock: opts?.fromBlock,
    toBlock: opts?.toBlock,
    maxBlocks: opts?.maxBlocks ?? 200,
  });
}
