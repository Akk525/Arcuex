import {withApiSecurity} from '@/lib/server/api-security';
import { formatUsdc } from '@arcuex/domain';
import {
  DEMO_POOL_NAME,
  ensureDemoPool,
  getPoolSnapshot,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  const repo = getRepo();
  const pool = ensureDemoPool(repo);
  const snap = getPoolSnapshot(repo, pool.id);
  return NextResponse.json({
    dataClass: 'synthetic',
    notice: `Capital pool "${DEMO_POOL_NAME}" is a fully collateralized demo ledger — not on-chain.`,
    pool: {
      id: snap.pool.id,
      name: snap.pool.name,
      depositedUsdc: formatUsdc(snap.pool.depositedMicros),
      outstandingLiabilityUsdc: formatUsdc(snap.pool.outstandingLiabilityMicros),
      availableUsdc: formatUsdc(snap.availableMicros),
      sharesOutstanding: snap.pool.sharesOutstanding.toString(),
    },
    activeReservations: snap.activeReservations.map((r) => ({
      id: r.id,
      claimId: r.claimId,
      amountUsdc: formatUsdc(r.amountMicros),
      status: r.status,
    })),
  });
}

async function POSTHandler(){return NextResponse.json({error:'Legacy capital mutations are disabled in the public beta'},{status:410});}

export const GET=withApiSecurity(GETHandler);
export const POST=withApiSecurity(POSTHandler);
