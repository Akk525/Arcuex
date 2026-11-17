import { createArcPublicClient, getNetworkHealth } from '@arcuex/chain';
import { createQuickNodeClient } from '@arcuex/quicknode';
import { getArcRpcUrl, getQuickNodeRpcUrl } from './env-rpc';
import { LAUNCH_CHAIN_ID } from './runtime-config';

/** Explicit DTO: provider URLs, headers, error/cause chains never cross the API boundary. */
export async function publicRpcHealth() {
  const rpc = getArcRpcUrl();
  const qn = getQuickNodeRpcUrl();
  const [a, q] = await Promise.all([
    getNetworkHealth(createArcPublicClient({ rpcUrl: rpc }), rpc),
    createQuickNodeClient({ rpcUrl: qn, timeoutMs: 5000, maxRetries: 0 }).getStatus(),
  ]);
  const safe = (v: typeof a | typeof q) => ({
    ok: v.ok,
    chainId: v.chainId,
    expectedChainId: LAUNCH_CHAIN_ID,
    blockNumber: v.blockNumber?.toString() ?? null,
    latencyMs: v.latencyMs,
    ...(!v.ok ? { error: 'RPC unavailable or unexpected chain' } : {}),
  });
  return { ok: a.ok && q.ok, arc: safe(a), quicknode: safe(q) };
}
