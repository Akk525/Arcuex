import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { canAccessClaimsPolicy } from '@arcuex/insurance';
import { formatUsdc } from '@arcuex/domain';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const repo = getRepo();
  const quotes = repo
    .listQuotes(20)
    .filter(
      (q) =>
        auth.principal.role !== 'claimant' ||
        repo.getPolicyholder(q.policyholderId)?.walletAddress?.toLowerCase() ===
          auth.principal.walletAddress?.toLowerCase(),
    )
    .map((q) => ({
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
  const policies = repo
    .listPolicies(20)
    .filter((p) => canAccessClaimsPolicy(repo, auth.principal, p.id))
    .map((p) => ({
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
    notice:
      'Quotes/policies use the labeled synthetic underwriting product — not real insurance issuance.',
    products,
    quotes,
    policies,
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Legacy synthetic binding disabled. Use authenticated /api/procurement; fundingVerified is never accepted from callers.',
    },
    { status: 410 },
  );
}
