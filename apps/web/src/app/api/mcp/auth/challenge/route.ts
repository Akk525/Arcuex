import { NextResponse } from 'next/server';
import { withApiSecurity } from '@/lib/server/api-security';
import { getRepo } from '@/lib/server/db';
import { issueClaimsNonce } from '@/lib/server/claims-session';
import { canonicalSigningOrigin } from '@/lib/server/request-boundary';
import { getRuntimeConfig } from '@/lib/server/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same wallet challenge as browser sign-in; signing happens in the agent's own wallet. */
export const POST = withApiSecurity(async (request: Request) => {
  try {
    const body = (await request.json()) as { address?: unknown };
    if (typeof body?.address !== 'string') throw new Error('address required');
    const challenge = issueClaimsNonce(
      getRepo(),
      body.address,
      canonicalSigningOrigin(request, getRuntimeConfig()),
    );
    return NextResponse.json({
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
    });
  } catch {
    return NextResponse.json(
      { error: 'A valid nonzero wallet address is required' },
      { status: 400 },
    );
  }
});
