import { NextResponse } from 'next/server';
import { createArcPublicClient, getNetworkHealth, ARC_TESTNET_CHAIN_ID } from '@arcuex/chain';
import { createQuickNodeClient } from '@arcuex/quicknode';
import { getRepo } from '@/lib/server/db';
import { getArcRpcUrl, getPoolAddress, getQuickNodeRpcUrl } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Array<{ name: string; ok: boolean; detail: string; kind: 'live' | 'config' }> = [];

  try {
    const rpc = getArcRpcUrl();
    const health = await getNetworkHealth(createArcPublicClient({ rpcUrl: rpc }), rpc);
    checks.push({
      name: 'Arc RPC',
      ok: health.ok && health.chainId === ARC_TESTNET_CHAIN_ID,
      detail: `chainId=${health.chainId} block=${health.blockNumber?.toString() ?? 'null'}`,
      kind: 'live',
    });
  } catch (err) {
    checks.push({
      name: 'Arc RPC',
      ok: false,
      detail: err instanceof Error ? err.message : 'failed',
      kind: 'live',
    });
  }

  try {
    const status = await createQuickNodeClient({ rpcUrl: getQuickNodeRpcUrl() }).getStatus();
    checks.push({
      name: 'QuickNode RPC',
      ok: status.ok,
      detail: `chainId=${status.chainId} block=${status.blockNumber}`,
      kind: 'live',
    });
  } catch (err) {
    checks.push({
      name: 'QuickNode RPC',
      ok: false,
      detail: err instanceof Error ? err.message : 'failed',
      kind: 'live',
    });
  }

  const pool = getPoolAddress();
  checks.push({
    name: 'InsurancePool address',
    ok: Boolean(pool),
    detail: pool ?? 'ARCUE_X_POOL_ADDRESS unset — no live finance yet',
    kind: 'config',
  });

  const streamsSecret = Boolean(process.env.QUICKNODE_STREAMS_WEBHOOK_SECRET?.trim());
  checks.push({
    name: 'QuickNode Streams secret',
    ok: streamsSecret,
    detail: streamsSecret
      ? 'Secret configured (still need public webhook URL + Stream filter)'
      : 'QUICKNODE_STREAMS_WEBHOOK_SECRET unset — receiver returns 503',
    kind: 'config',
  });

  const inbox = getRepo().listStreamsInbox(5);
  checks.push({
    name: 'Streams inbox',
    ok: true,
    detail: `${inbox.length} recent rows (authenticated deliveries only count as Streams)`,
    kind: 'live',
  });

  checks.push({
    name: 'Agent SDK',
    ok: true,
    detail: '@arcuex/agent-sdk wired via /api/agent/procure (no private keys)',
    kind: 'config',
  });

  return NextResponse.json({
    checks,
    streamsBountyEligible: false,
    note: 'RPC health ≠ Streams completion. Webhook auth + live deliveries required.',
  });
}
