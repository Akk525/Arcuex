'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { WagmiProvider, type State } from 'wagmi';
import { createWagmiConfig } from '@/lib/wagmi';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { FixtureModeContext } from './source-mode';

export function AppProviders({
  children,
  initialState,
  fixtureMode = false,
}: {
  children: ReactNode;
  initialState?: State;
  fixtureMode?: boolean;
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
  const [config] = useState(() => createWagmiConfig(fixtureMode));

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <FixtureModeContext.Provider value={fixtureMode}>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </FixtureModeContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
