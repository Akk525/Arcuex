import { formatUsdc } from '@arcuex/domain';
import { acceptAndBindPolicy, requestCoverageQuote } from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const repo = getRepo();
  const quotes = repo.listQuotes(20).map((q) => ({
    ...q,
    terms: {
      ...q.terms,
      limitMicros: q.terms.limitMicros.toString(),
      premiumMicros: q.terms.premiumMicros.toString(),
      deductibleMicros: q.terms.deductibleMicros.toString(),
      limitUsdc: formatUsdc(q.terms.limitMicros),
      premiumUsdc: formatUsdc(q.terms.premiumMicros),
    },
  }));
  const policies = repo.listPolicies(20).map((p) => ({
    ...p,
    terms: {
      ...p.terms,
      limitMicros: p.terms.limitMicros.toString(),
      premiumMicros: p.terms.premiumMicros.toString(),
      deductibleMicros: p.terms.deductibleMicros.toString(),
      limitUsdc: formatUsdc(p.terms.limitMicros),
      premiumUsdc: formatUsdc(p.terms.premiumMicros),
    },
  }));
  const products = repo.listProducts();
  return NextResponse.json({
    dataClass: 'synthetic',
    notice: 'Quotes/policies use the labeled synthetic underwriting product — not real insurance issuance.',
    products,
    quotes,
    policies,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    idempotencyKey?: string;
    quoteId?: string;
    fundingVerified?: boolean;
    displayName?: string;
    walletAddress?: `0x${string}`;
    agentRef?: string;
    agentLabel?: string;
  };

  const repo = getRepo();

  try {
    if (body.action === 'request_quote') {
      if (!body.idempotencyKey || !body.displayName) {
        return NextResponse.json({ error: 'idempotencyKey and displayName required' }, { status: 400 });
      }
      const quote = requestCoverageQuote(repo, {
        idempotencyKey: body.idempotencyKey,
        policyholder: {
          displayName: body.displayName,
          walletAddress: body.walletAddress,
        },
        agent: {
          externalRef: body.agentRef ?? 'dashboard-agent',
          label: body.agentLabel ?? 'Dashboard Agent',
        },
      });
      return NextResponse.json({
        dataClass: 'synthetic',
        quote: {
          id: quote.id,
          status: quote.status,
          expiresAt: quote.expiresAt,
          premiumUsdc: formatUsdc(quote.terms.premiumMicros),
          limitUsdc: formatUsdc(quote.terms.limitMicros),
          synthetic: quote.terms.synthetic,
        },
      });
    }

    if (body.action === 'accept_bind') {
      if (!body.quoteId || !body.idempotencyKey) {
        return NextResponse.json({ error: 'quoteId and idempotencyKey required' }, { status: 400 });
      }
      const result = acceptAndBindPolicy(repo, {
        quoteId: body.quoteId,
        idempotencyKey: body.idempotencyKey,
        fundingVerified: Boolean(body.fundingVerified),
      });
      return NextResponse.json({
        dataClass: 'synthetic',
        policy: {
          id: result.policy.id,
          status: result.policy.status,
          quoteId: result.quote.id,
          synthetic: result.policy.terms.synthetic,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Coverage error';
    return NextResponse.json({ error: message, dataClass: 'synthetic' }, { status: 400 });
  }
}
