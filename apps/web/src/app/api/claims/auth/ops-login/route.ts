import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import {
  CLAIMS_SESSION_COOKIE,
  claimsSessionCookieOptions,
  createOpsSessionFromBearer,
} from '@/lib/server/claims-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchange a server-held reviewer/authority API token for an opaque httpOnly session.
 * The API secret is never written into the cookie value or returned to the browser.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { role?: 'reviewer' | 'authority' };
  if (body.role !== 'reviewer' && body.role !== 'authority') {
    return NextResponse.json({ error: 'role must be reviewer|authority' }, { status: 400 });
  }
  const auth = authenticateClaimsRequest(request, [body.role], { preferBearer: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  // Re-auth was via Bearer; mint opaque session (do not echo the bearer secret).
  const session = createOpsSessionFromBearer(getRepo(), body.role, auth.principal.subject);
  const res = NextResponse.json({
    dataClass: 'claims_auth',
    role: body.role,
    expiresAt: session.expiresAt,
    allowSyntheticSettlementPrep: !!session.principal.allowSyntheticSettlementPrep,
    notice:
      'Ops session cookie set. Privileges come from provisioned tokens, not wallet possession.',
  });
  res.cookies.set(
    CLAIMS_SESSION_COOKIE,
    session.sessionId,
    claimsSessionCookieOptions(session.expiresAt),
  );
  return res;
}
