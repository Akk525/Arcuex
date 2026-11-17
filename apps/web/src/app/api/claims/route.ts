import { formatUsdc } from '@arcuex/domain';
import { NextResponse } from 'next/server';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only legacy synthetic ledger view.
 * Mutations are disabled — use ClaimsCase APIs under /api/claims/cases.
 */
export async function GET(request: Request) {
  const auth = authenticateClaimsRequest(request, ['reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const repo = getRepo();
  const incidents = repo.listIncidents(20);
  const claims = repo.listClaims(20).map((c) => ({
    ...c,
    requestedMicros: c.requestedMicros.toString(),
    authorizedMicros: c.authorizedMicros?.toString() ?? null,
    requestedUsdc: formatUsdc(c.requestedMicros),
    authorizedUsdc: c.authorizedMicros ? formatUsdc(c.authorizedMicros) : null,
  }));
  const settlements = repo.listSettlements(20).map((s) => ({
    ...s,
    amountMicros: s.amountMicros.toString(),
    amountUsdc: formatUsdc(s.amountMicros),
  }));
  return NextResponse.json({
    dataClass: 'synthetic',
    mutationsEnabled: false,
    notice:
      'Read-only synthetic ledger. Mutations disabled. Use /api/claims/cases with wallet/ops session.',
    incidents,
    claims,
    settlements,
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Legacy /api/claims mutations are disabled. Use authenticated ClaimsCase routes under /api/claims/cases.',
      mutationsEnabled: false,
      dataClass: 'synthetic',
    },
    { status: 403 },
  );
}
