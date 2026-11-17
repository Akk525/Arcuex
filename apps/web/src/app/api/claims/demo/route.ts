import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Legacy one-click demo that authorized and prepared settlements without auth.
 * Disabled for public Arc Testnet beta. Use ClaimsCase UI with wallet + ops sessions.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Legacy /api/claims/demo mutations are disabled. Synthetic ClaimsCase flows require authenticated sessions and do not broadcast.',
      mutationsEnabled: false,
      dataClass: 'synthetic',
    },
    { status: 403 },
  );
}

export async function GET() {
  return NextResponse.json({
    dataClass: 'synthetic',
    mutationsEnabled: false,
    notice:
      'Demo mutation endpoint disabled. See /claims for ClaimsCase adjudication (wallet session required).',
  });
}
