import { formatUsdc } from '@arcuex/domain';
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

export async function POST() {
  return NextResponse.json({ error: 'Legacy synthetic binding disabled. Use authenticated /api/procurement; fundingVerified is never accepted from callers.' }, { status: 410 });
}
