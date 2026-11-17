import { ARC_QUICKNODE_TESTNET_RPC_HTTP, ARC_TESTNET_RPC_HTTP } from '@arcuex/chain';

/** Browser-safe defaults. Server routes must use lib/server/env-rpc.ts. */
export const PUBLIC_LAUNCH_POOL =
  '0x6657974EEdF488380251bDD95A7FFfb0D456E49E' as const satisfies `0x${string}`;

export function getArcRpcUrl(): string {
  return process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || ARC_TESTNET_RPC_HTTP;
}

export function getQuickNodeRpcUrl(): string {
  return process.env.NEXT_PUBLIC_QUICKNODE_RPC_URL?.trim() || ARC_QUICKNODE_TESTNET_RPC_HTTP;
}

export function getWalletConnectProjectId(): string | undefined {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || undefined;
}

export function getPoolAddress(): `0x${string}` {
  const fromEnv = process.env.NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS?.trim();
  if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) {
    return fromEnv.toLowerCase() === PUBLIC_LAUNCH_POOL.toLowerCase()
      ? (fromEnv as `0x${string}`)
      : PUBLIC_LAUNCH_POOL;
  }
  return PUBLIC_LAUNCH_POOL;
}
