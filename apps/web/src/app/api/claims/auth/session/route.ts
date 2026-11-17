import { NextResponse } from 'next/server';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  return auth.ok
    ? NextResponse.json(
        { role: auth.principal.role, wallet: auth.principal.walletAddress ?? null },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    : NextResponse.json({ error: auth.error }, { status: auth.status });
}
