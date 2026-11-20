import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import { issueMcpToken, parseRequestedScopes } from '@/lib/mcp/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiSecurity(async (request: Request) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json(
      { error: 'JSON object required', code: 'INVALID_INPUT' },
      { status: 400 },
    );
  }
  let scopes;
  try {
    scopes = parseRequestedScopes(body.scopes);
  } catch {
    return NextResponse.json(
      { error: 'Unknown or malformed scope', code: 'INVALID_SCOPE' },
      { status: 400 },
    );
  }
  const clientName =
    typeof body.clientName === 'string' && /^[\w .:@/-]{1,80}$/.test(body.clientName)
      ? body.clientName
      : 'mcp-client';
  if (
    typeof body.nonce !== 'string' ||
    typeof body.signature !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(body.signature) ||
    (body.agentId !== undefined && typeof body.agentId !== 'string')
  )
    return NextResponse.json(
      { error: 'nonce and signature required', code: 'INVALID_INPUT' },
      { status: 400 },
    );
  try {
    const issued = await issueMcpToken({
      nonce: body.nonce,
      signature: body.signature as `0x${string}`,
      scopes,
      agentId: body.agentId as string | undefined,
      clientName,
    });
    return NextResponse.json(issued);
  } catch {
    return NextResponse.json(
      { error: 'Wallet proof, nonce or agent binding invalid', code: 'TOKEN_DENIED' },
      { status: 401 },
    );
  }
});
