import { getRuntimeConfig } from './runtime-config';

export function getArcRpcUrl(): string {
  return getRuntimeConfig().rpcUrl;
}

export function getQuickNodeRpcUrl(): string {
  return getRuntimeConfig().quicknodeRpcUrl;
}
