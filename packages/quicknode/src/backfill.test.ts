import { describe, expect, it, vi } from 'vitest';
import { backfillPoolLogs } from './backfill';

describe('backfillPoolLogs', () => {
  it('scopes eth_getLogs to the pool address for historical recovery', async () => {
    const getLogs = vi.fn().mockResolvedValue([]);
    const publicClient = {
      getBlockNumber: async () => 1_000n,
      getLogs,
    };
    const pool = '0x00000000000000000000000000000000000000aa' as const;
    await backfillPoolLogs(publicClient as never, pool, { maxBlocks: 100 });
    expect(getLogs).toHaveBeenCalledWith({
      address: pool,
      fromBlock: 900n,
      toBlock: 1_000n,
    });
  });
});
