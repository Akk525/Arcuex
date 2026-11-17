import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import { CLAIMS_SESSION_COOKIE, parseSessionCookie } from '@/lib/server/claims-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return NextResponse.json({ error: 'Cross-origin authentication rejected' }, { status: 403 });
  const sid = parseSessionCookie(request.headers.get('cookie'));
  if (sid) {
    getRepo().revokeClaimsSession(sid, new Date().toISOString());
  }
  const res = NextResponse.json({ ok: true, dataClass: 'claims_auth' });
  res.cookies.set(CLAIMS_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.CLAIMS_COOKIE_SECURE === '1',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
  return res;
}
