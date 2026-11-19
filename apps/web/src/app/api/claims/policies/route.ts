import { withApiSecurity } from '@/lib/server/api-security';
import { NextResponse } from 'next/server';
import { canAccessClaimsPolicy } from '@arcuex/insurance';
import { sameIndependentLiquidationProfile } from '@arcuex/domain';
import { configuredIndependentLiquidation } from '@/lib/server/independent-evidence';
import { getRepo } from '@/lib/server/db';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
export const dynamic = 'force-dynamic';
async function GETHandler(request: Request) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const repo = getRepo();
  const now = Math.floor(Date.now() / 1000);
  const policies = repo
    .listClaimsPolicyIds()
    .filter((id) => canAccessClaimsPolicy(repo, auth.principal, id))
    .map((id) => repo.claimsPolicyContext(id)!)
    .filter((p) => p.source === 'procurement' && p.confirmed && now >= p.effectiveAt)
    .filter(
      (p) =>
        p.synthetic ||
        (now >= p.effectiveAt &&
          now <= p.expiresAt &&
          sameIndependentLiquidationProfile(
            repo.getProcurementPolicy(p.id)?.terms.independentProfile,
            configuredIndependentLiquidation(),
          )),
    )
    .map((p) => ({
      id: p.id,
      status: 'bound',
      synthetic: p.synthetic,
      effectiveAt: p.effectiveAt,
      expiresAt: p.expiresAt,
      exposures: p.exposures.map((e) => ({ ...e, limitMicros: e.limitMicros.toString() })),
    }));
  return NextResponse.json(
    { policies, dataClass: 'claims_case' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiSecurity(GETHandler);
