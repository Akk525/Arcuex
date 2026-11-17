import { ARC_TESTNET_RPC_HTTP } from '@arcuex/chain';
export function getArcRpcUrl(): string {
  return process.env.ARC_TESTNET_RPC_URL?.trim() || ARC_TESTNET_RPC_HTTP;
}
