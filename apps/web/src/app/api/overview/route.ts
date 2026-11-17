import {withApiSecurity} from '@/lib/server/api-security';
import { NextResponse } from 'next/server';
import { createArcPublicClient, getNetworkHealth, ARC_TESTNET_CHAIN_ID } from '@arcuex/chain';
import { createQuickNodeClient } from '@arcuex/quicknode';
import { getRepo } from '@/lib/server/db';
import {getPoolAddress} from '@/lib/env';
import {getArcRpcUrl,getQuickNodeRpcUrl} from '@/lib/server/env-rpc';

export const runtime = 'nodejs';

async function GETHandler() {
  const repo = getRepo();
  const arcRpc = getArcRpcUrl();
  const qnRpc = getQuickNodeRpcUrl();
  const pool = getPoolAddress();

  let arcHealth: Awaited<ReturnType<typeof getNetworkHealth>> | null = null;
  let arcError: string | null = null;
  try {
    const client = createArcPublicClient({ rpcUrl: arcRpc });
    arcHealth = await getNetworkHealth(client, arcRpc);
  } catch {
    arcError = 'Arc health unavailable';
  }

  let qnStatus: Awaited<ReturnType<ReturnType<typeof createQuickNodeClient>['getStatus']>> | null =
    null;
  let qnError: string | null = null;
  try {
    qnStatus = await createQuickNodeClient({ rpcUrl: qnRpc }).getStatus();
  } catch {
    qnError = 'QuickNode status unavailable';
  }

  const capitalPools = repo.listPools().map((p) => ({
    id: p.id,
    name: p.name,
    depositedMicros: p.depositedMicros.toString(),
    outstandingLiabilityMicros: p.outstandingLiabilityMicros.toString(),
    sharesOutstanding: p.sharesOutstanding.toString(),
    synthetic: true,
  }));

  return NextResponse.json({
    chainIdExpected: ARC_TESTNET_CHAIN_ID,
    poolAddress: pool,
    poolDeployed: Boolean(pool),
    arc: {
      rpcHost: new URL(arcRpc).host,
      health: arcHealth
        ? {
            chainId: arcHealth.chainId,
            blockNumber: arcHealth.blockNumber?.toString() ?? null,
            ok: arcHealth.ok,
            latencyMs: arcHealth.latencyMs,
          }
        : null,
      error: arcError,
    },
    quicknode: {
      rpcHost: new URL(qnRpc).host,
      status: qnStatus
        ? {
            chainId: qnStatus.chainId,
            blockNumber: qnStatus.blockNumber?.toString() ?? null,
            ok: qnStatus.ok,
          }
        : null,
      error: qnError,
    },
    streamsConfigured: Boolean(process.env.QUICKNODE_STREAMS_WEBHOOK_SECRET?.trim()),
    capitalPools,
    policyCount: repo.listPolicies(100).length,
    claimCount: repo.listClaims(100).length,
    recent: {
      policyAudit: [],
      capitalAudit: [],
      streamsInbox: [],
    },
    labels: {
      synthetic: 'Synthetic ledger / demo underwriting',
      live: 'Live Arc Testnet reads; on-chain finance only when pool is deployed',
    },
  });
}

export const GET=withApiSecurity(GETHandler);
