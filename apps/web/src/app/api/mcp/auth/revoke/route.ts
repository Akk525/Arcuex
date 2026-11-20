import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import { readBearer, revokeMcpToken } from '@/lib/mcp/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Revokes the presented token and its backing wallet session. */
export const POST = withApiSecurity(async (request: Request) =>
  revokeMcpToken(readBearer(request.headers.get('authorization')))
    ? NextResponse.json({ revoked: true })
    : NextResponse.json({ error: 'Valid bearer token required' }, { status: 401 }),
);
