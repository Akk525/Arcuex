import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Process liveness only — no database, RPC, secrets, or env diagnostics. */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: 'arcuex', status: 'live' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
