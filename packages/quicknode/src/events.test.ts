import { describe, expect, it, vi } from 'vitest';
import { fetchRecentLogs, fetchRecentReceipts } from './events';

describe('fetchRecentLogs', () => {
  it('queries a bounded window ending at latest', async () => {
    const getLogs = vi.fn().mockResolvedValue([{ logIndex: 0 }]);
    const publicClient = {
      getBlockNumber: async () => 200n,
      getLogs,
    };

    const logs = await fetchRecentLogs(publicClient as never, { maxBlocks: 20 });
    expect(logs).toHaveLength(1);
    expect(getLogs).toHaveBeenCalledWith({
      fromBlock: 180n,
      toBlock: 200n,
    });
  });
});

describe('fetchRecentReceipts', () => {
  it('returns null receipts via mocked client methods', async () => {
    const hash =
      '0x2222222222222222222222222222222222222222222222222222222222222222' as const;

    // Use a custom publicClient through QuickNodeClient options
    const results = await fetchRecentReceipts([hash], {
      publicClient: {
        getChainId: async () => 5042002,
        getBlockNumber: async () => 1n,
        getBlock: async () => ({
          number: 1n,
          hash: '0x0',
          timestamp: 0n,
          transactions: [],
        }),
        getTransactionReceipt: async () => {
          throw new Error('transaction not found');
        },
      } as never,
    });

    expect(results).toEqual([{ hash, receipt: null }]);
  });
});
