'use client';

import { createArcPublicClient, getNetworkHealth, type NetworkHealth } from '@arcuex/chain';
import { useQuery } from '@tanstack/react-query';
import { getArcRpcUrl } from '@/lib/env';

export function useArcHealth(refetchInterval = 12_000) {
  const rpcUrl = getArcRpcUrl();

  return useQuery<NetworkHealth>({
    queryKey: ['arc-health', rpcUrl],
    queryFn: async () => {
      const client = createArcPublicClient({ rpcUrl });
      return getNetworkHealth(client, rpcUrl);
    },
    refetchInterval,
  });
}
