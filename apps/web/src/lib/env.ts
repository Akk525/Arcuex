import {
  ARC_QUICKNODE_TESTNET_RPC_HTTP,
  ARC_TESTNET_RPC_HTTP,
} from '@arcuex/chain';

export function getArcRpcUrl(): string {
  return process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || ARC_TESTNET_RPC_HTTP;
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
