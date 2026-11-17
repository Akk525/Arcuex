import { NextResponse } from 'next/server';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { HISTORIC_TESTNET_SETTLEMENT } from '@/lib/claims/historic-settlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only verified Arc Testnet settlement receipt. Does not broadcast. */
export async function GET(request: Request) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(HISTORIC_TESTNET_SETTLEMENT);
}
