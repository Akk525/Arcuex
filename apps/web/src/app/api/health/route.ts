import { createArcPublicClient, getNetworkHealth } from '@arcuex/chain';
import { createQuickNodeClient } from '@arcuex/quicknode';
import { NextResponse } from 'next/server';
import { getArcRpcUrl, getQuickNodeRpcUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const arcRpcUrl = getArcRpcUrl();
  const quickNodeRpcUrl = getQuickNodeRpcUrl();

  const arcClient = createArcPublicClient({ rpcUrl: arcRpcUrl });
  const arc = await getNetworkHealth(arcClient, arcRpcUrl);
  const quicknode = await createQuickNodeClient({ rpcUrl: quickNodeRpcUrl }).getStatus();

  return NextResponse.json({
    ok: arc.ok && quicknode.ok,
    arc: {
      ...arc,
      blockNumber: arc.blockNumber?.toString() ?? null,
    },
    quicknode: {
      ...quicknode,
      blockNumber: quicknode.blockNumber?.toString() ?? null,
    },
  });
}
