import { arcTestnet } from '@arcuex/chain';
import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
  injected,
} from 'wagmi';
import { getArcRpcUrl } from './env';

export function createWagmiConfig() {
  const rpcUrl = getArcRpcUrl();

  return createConfig({
    chains: [arcTestnet],
    // `injected` comes from wagmi/core — do not import wagmi/connectors
    // (that barrel pulls Coinbase/Base Account optional deps that break Next builds).
    connectors: [injected({ shimDisconnect: true })],
    transports: {
      [arcTestnet.id]: http(rpcUrl, { timeout: 15_000 }),
    },
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
  });
}

export type AppWagmiConfig = ReturnType<typeof createWagmiConfig>;
