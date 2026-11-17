import {
  ARC_QUICKNODE_TESTNET_RPC_HTTP,
  ARC_TESTNET_RPC_HTTP,
} from '@arcuex/chain';

export function getArcRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() ||
    process.env.ARC_TESTNET_RPC_URL?.trim() ||
    ARC_QUICKNODE_TESTNET_RPC_HTTP ||
    ARC_TESTNET_RPC_HTTP
  );
}

export function getQuickNodeRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_QUICKNODE_RPC_URL?.trim() ||
    process.env.QUICKNODE_RPC_URL?.trim() ||
    ARC_QUICKNODE_TESTNET_RPC_HTTP
  );
}

export function getWalletConnectProjectId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  return id || undefined;
}

/** Deployed InsurancePool on Arc Testnet — null until configured. */
export function getPoolAddress(): `0x${string}` | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS?.trim() ||
    process.env.ARCUE_X_POOL_ADDRESS?.trim();
  if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) {
    return fromEnv as `0x${string}`;
  }
  return null;
}
