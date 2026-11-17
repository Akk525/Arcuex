import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import { issueClaimsNonce } from '@/lib/server/claims-session';
import { getRepo } from '@/lib/server/db';
import { canonicalSigningOrigin, hasAllowedOrigin } from '@/lib/server/request-boundary';
import { getRuntimeConfig } from '@/lib/server/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(request: Request) {
  const runtime = getRuntimeConfig();
  if (!hasAllowedOrigin(request, runtime)) {
    return NextResponse.json({ error: 'Cross-origin authentication rejected' }, { status: 403 });
  }
  try {
    const body = (await request.json()) as { wallet?: string };
    if (!body.wallet) {
      return NextResponse.json({ error: 'wallet required' }, { status: 400 });
    }
    const issued = issueClaimsNonce(
      getRepo(),
      body.wallet,
      canonicalSigningOrigin(request, runtime),
    );
    return NextResponse.json({
      dataClass: 'claims_auth',
      ...issued,
      notice: 'Sign this message with the same wallet. Nonce is single-use.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nonce error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = withApiSecurity(POSTHandler);
