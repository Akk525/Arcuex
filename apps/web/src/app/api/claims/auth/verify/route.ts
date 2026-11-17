import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import {
  CLAIMS_SESSION_COOKIE,
  claimsSessionCookieOptions,
  verifyWalletAndCreateSession,
} from '@/lib/server/claims-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
      nonce?: string;
      signature?: `0x${string}`;
    };
    if (!body.wallet || !body.nonce || !body.signature) {
      return NextResponse.json({ error: 'wallet, nonce, signature required' }, { status: 400 });
    }
    const session = await verifyWalletAndCreateSession(getRepo(), {
      wallet: body.wallet,
      nonce: body.nonce,
      signature: body.signature,
    });
    const res = NextResponse.json({
      dataClass: 'claims_auth',
      role: 'claimant',
      wallet: session.principal.walletAddress,
      expiresAt: session.expiresAt,
      notice:
        'Wallet session established (httpOnly cookie). Wallet alone does not grant reviewer/authority.',
    });
    const opts = claimsSessionCookieOptions(session.expiresAt);
    res.cookies.set(CLAIMS_SESSION_COOKIE, session.sessionId, opts);
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verify error';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
