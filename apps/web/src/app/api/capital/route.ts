import { formatUsdc, parseUsdcDecimal } from '@arcuex/domain';
import {
  DEMO_POOL_NAME,
  depositToPool,
  ensureDemoPool,
  getPoolSnapshot,
  withdrawFromPool,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    amountUsdc?: string;
  };
  const repo = getRepo();
  const pool = ensureDemoPool(repo);

  try {
    if (!body.amountUsdc) {
      return NextResponse.json({ error: 'amountUsdc required' }, { status: 400 });
    }
    const amount = parseUsdcDecimal(body.amountUsdc);
    if (body.action === 'deposit') {
      const next = depositToPool(repo, pool.id, amount);
      return NextResponse.json({
        dataClass: 'synthetic',
        depositedUsdc: formatUsdc(next.depositedMicros),
      });
    }
    if (body.action === 'withdraw') {
      const next = withdrawFromPool(repo, pool.id, amount);
      return NextResponse.json({
        dataClass: 'synthetic',
        depositedUsdc: formatUsdc(next.depositedMicros),
      });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Capital error';
    return NextResponse.json({ error: message, dataClass: 'synthetic' }, { status: 400 });
  }
}
