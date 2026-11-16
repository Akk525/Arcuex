'use client';

import { createQuickNodeClient, type QuickNodeBlockSummary, type QuickNodeStatus } from '@arcuex/quicknode';
import { useQuery } from '@tanstack/react-query';
import { getQuickNodeRpcUrl } from '@/lib/env';

export type QuickNodeDashboardData = {
  status: QuickNodeStatus;
  block: QuickNodeBlockSummary | null;
};

export function useQuickNodeStatus(refetchInterval = 12_000) {
  const rpcUrl = getQuickNodeRpcUrl();

  return useQuery<QuickNodeDashboardData>({
    queryKey: ['quicknode-status', rpcUrl],
    queryFn: async () => {
      const client = createQuickNodeClient({ rpcUrl });
      const status = await client.getStatus();
      if (!status.ok || status.blockNumber === null) {
        return { status, block: null };
      }
      const block = await client.getBlock(status.blockNumber);
      return { status, block };
    },
    refetchInterval,
  });
}
