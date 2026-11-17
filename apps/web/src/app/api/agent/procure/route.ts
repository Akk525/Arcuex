import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { arcTestnet } from '@arcuex/chain';
import { ArcuexAgentClient } from '@arcuex/agent-sdk';
import { getRepo } from '@/lib/server/db';
import { getArcRpcUrl, getPoolAddress } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Server-side agent procurement: quote → inspect → accept → prepare bind.
 * Never accepts or stores private keys. Live broadcast remains wallet-side.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    idempotencyKey?: string;
    displayName?: string;
    walletAddress?: `0x${string}`;
    agentRef?: string;
  };

  if (!body.idempotencyKey || body.idempotencyKey.length < 8) {
    return NextResponse.json({ error: 'idempotencyKey required (min 8)' }, { status: 400 });
  }

  const repo = getRepo();
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(getArcRpcUrl()),
  });
  const pool = getPoolAddress();

  const agent = new ArcuexAgentClient({
    repo,
    publicClient,
    poolAddress: pool ?? '0x1111111111111111111111111111111111111111',
  });

  const quote = agent.requestQuote({
    idempotencyKey: body.idempotencyKey,
    policyholder: {
      displayName: body.displayName ?? 'Agent Operator',
      walletAddress: body.walletAddress,
    },
    agent: {
      externalRef: body.agentRef ?? 'agent://web-procure',
      label: 'web-bounded-agent',
    },
  });
  const inspected = agent.inspectQuote(quote.id);
  if (!inspected.synthetic) {
    return NextResponse.json({ error: 'Non-synthetic quotes rejected by bounded agent' }, { status: 400 });
  }
  if (inspected.terms.premiumMicros > 5_000_000n || inspected.terms.limitMicros > 100_000_000n) {
    return NextResponse.json({ error: 'Quote exceeds agent spending policy' }, { status: 400 });
  }

  const { policy } = agent.acceptQuote(quote.id, true);
  const account = body.walletAddress ?? ('0x2222222222222222222222222222222222222222' as const);
  const prep = pool
    ? agent.prepareBindAuthorization(policy.id, account)
    : null;

  repo.insertAudit('agent', policy.id, 'agent.procure_prepared', {
    quoteId: quote.id,
    policyId: policy.id,
    poolConfigured: Boolean(pool),
    synthetic: true,
  });

  return NextResponse.json({
    quote: {
      id: quote.id,
      status: quote.status,
      premiumMicros: quote.terms.premiumMicros.toString(),
      limitMicros: quote.terms.limitMicros.toString(),
      synthetic: quote.terms.synthetic,
      termsHash: inspected.termsHash,
      warnings: inspected.warnings,
    },
    policy: {
      id: policy.id,
      status: policy.status,
    },
    bindPreparation: prep
      ? {
          policyIdBytes32: prep.policyIdBytes32,
          termsHash: prep.termsHash,
          permissionScope: prep.permissionScope,
          preparedCount: prep.prepared.length,
          descriptions: prep.prepared.map((p) => p.description),
        }
      : null,
    blocker: pool
      ? null
      : 'ARCUE_X_POOL_ADDRESS unset — prepared local synthetic policy only; no on-chain bind',
    note: 'Private keys are never accepted by this API. Wallet must sign approve+bind client-side.',
  });
}
