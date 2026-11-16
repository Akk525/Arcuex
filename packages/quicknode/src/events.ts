import type { Address, Hash, Log, PublicClient } from 'viem';
import { QuickNodeClient, type QuickNodeClientOptions } from './client';

export type RecentLogsQuery = {
  address?: Address;
  fromBlock?: bigint;
  toBlock?: bigint;
  /** Inclusive lookback window when fromBlock is omitted. Default 50. */
  maxBlocks?: number;
};

export type RecentReceiptResult = {
  hash: Hash;
  receipt: Awaited<ReturnType<QuickNodeClient['getTransactionReceipt']>>;
};

/**
 * Resolve receipts for known transaction hashes.
 */
export async function fetchRecentReceipts(
  hashes: Hash[],
  options?: QuickNodeClientOptions,
): Promise<RecentReceiptResult[]> {
  const qn = new QuickNodeClient(options);
  const results: RecentReceiptResult[] = [];

  for (const hash of hashes) {
    const receipt = await qn.getTransactionReceipt(hash);
    results.push({ hash, receipt });
  }

  return results;
}

/**
 * Fetch recent logs using a viem public client pointed at QuickNode / Arc RPC.
 * Arc public endpoints limit eth_getLogs ranges to 10_000 blocks.
 */
export async function fetchRecentLogs(
  publicClient: PublicClient,
  query: RecentLogsQuery = {},
): Promise<Log[]> {
  const latest = await publicClient.getBlockNumber();
  const window = BigInt(query.maxBlocks ?? 50);
  const fromBlock = query.fromBlock ?? (latest > window ? latest - window : 0n);
  const toBlock = query.toBlock ?? latest;

  return publicClient.getLogs({
    ...(query.address ? { address: query.address } : {}),
    fromBlock,
    toBlock,
  });
}
