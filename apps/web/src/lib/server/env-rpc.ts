import { getRuntimeConfig } from './runtime-config';

export function getArcRpcUrl(): string {
  const c = getRuntimeConfig();
  if (c.chainSource === 'fixture') throw new Error('Live RPC disabled in fixture mode');
  return c.rpcUrl;
}

export function getQuickNodeRpcUrl(): string {
  const c = getRuntimeConfig();
  if (c.chainSource === 'fixture') throw new Error('Live RPC disabled in fixture mode');
  return c.quicknodeRpcUrl;
}
