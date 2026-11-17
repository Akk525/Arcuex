import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import { issueClaimsNonce } from '@/lib/server/claims-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return NextResponse.json({ error: 'Cross-origin authentication rejected' }, { status: 403 });
  try {
    const body = (await request.json()) as { wallet?: string };
    if (!body.wallet) {
      return NextResponse.json({ error: 'wallet required' }, { status: 400 });
    }
    const issued = issueClaimsNonce(getRepo(), body.wallet, new URL(request.url).origin);
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
