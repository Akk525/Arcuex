import { withApiSecurity } from '@/lib/server/api-security';
import { NextResponse } from 'next/server';
import type { SessionMe } from '@arcuex/domain';
import { getRepo } from '@/lib/server/db';
import { loadPrincipalFromSession, parseSessionCookie } from '@/lib/server/claims-session';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function GETHandler(request: Request) {
  const id = parseSessionCookie(request.headers.get('cookie'));
  const p = id ? loadPrincipalFromSession(getRepo(), id) : null;
  const body: SessionMe = {
    version: 1,
    state: p ? 'authenticated' : 'anonymous',
    wallet: p?.walletAddress ?? null,
    chainId: p?.walletAddress ? 5042002 : null,
    role: p?.role ?? null,
    capabilities: !p
      ? []
      : p.role === 'claimant'
        ? ['procurement:read', 'claims:intake']
        : p.role === 'reviewer'
          ? ['claims:review', 'reconciliation:read']
          : p.role === 'authority'
            ? ['settlement:prepare', 'reconciliation:read']
            : ['reconciliation:read'],
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
}

export const GET = withApiSecurity(GETHandler);
