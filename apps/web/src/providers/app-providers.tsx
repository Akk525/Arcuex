'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { WagmiProvider, type State } from 'wagmi';
import { createWagmiConfig } from '@/lib/wagmi';
import { WorkspaceProvider } from '@/components/workspace-provider';

export function AppProviders({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [config] = useState(() => createWagmiConfig());

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
