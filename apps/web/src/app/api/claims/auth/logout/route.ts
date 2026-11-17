import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import {
  CLAIMS_SESSION_COOKIE,
  parseSessionCookie,
  sessionStoreId,
} from '@/lib/server/claims-session';
import { getRepo } from '@/lib/server/db';
import { hasAllowedOrigin } from '@/lib/server/request-boundary';
import { getRuntimeConfig } from '@/lib/server/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(request: Request) {
  const runtime = getRuntimeConfig();
  if (!hasAllowedOrigin(request, runtime)) {
    return NextResponse.json({ error: 'Cross-origin authentication rejected' }, { status: 403 });
  }
  const sid = parseSessionCookie(request.headers.get('cookie'));
  if (sid) {
    getRepo().revokeClaimsSession(sessionStoreId(sid), new Date().toISOString());
  }
  const res = NextResponse.json({ ok: true, dataClass: 'claims_auth' });
  res.cookies.set(CLAIMS_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: runtime.secureCookies,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
  return res;
}

export const POST = withApiSecurity(POSTHandler);
