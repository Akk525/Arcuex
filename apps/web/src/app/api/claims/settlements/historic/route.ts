import { NextResponse } from 'next/server';
import { HISTORIC_TESTNET_SETTLEMENT } from '@/lib/claims/historic-settlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only verified Arc Testnet settlement receipt. Does not broadcast. */
export async function GET() {
  return NextResponse.json(HISTORIC_TESTNET_SETTLEMENT);
}
