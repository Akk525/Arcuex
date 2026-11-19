import { NextResponse } from 'next/server';
import {
  verifyClaimFixture,
  verifyIndependentLiquidation,
  listClaimVerifications,
  canAccessClaimsPolicy,
  getClaimsCase,
} from '@arcuex/insurance';
import { withApiSecurity } from '@/lib/server/api-security';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { getRepo } from '@/lib/server/db';
import { configuredIndependentLiquidation } from '@/lib/server/independent-evidence';
import { independentLiquidationSource } from '@/lib/server/independent-liquidation-chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
async function handle(request: Request, ctx: Ctx) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;
  const repo = getRepo();
  const c = getClaimsCase(repo, id);
  if (!c || !canAccessClaimsPolicy(repo, auth.principal, c.policyId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const dataClass = c.syntheticDemo
    ? 'synthetic_fixture_verification'
    : 'independent_liquidation_verification';
  if (request.method === 'GET')
    return NextResponse.json({
      dataClass,
      verifications: listClaimVerifications(repo, id, auth.principal),
    });
  const raw = await request.text();
  if (raw.length > 16000)
    return NextResponse.json({ error: 'Envelope too large' }, { status: 413 });
  try {
    const input: unknown = JSON.parse(raw);
    const profile = c.syntheticDemo ? undefined : configuredIndependentLiquidation();
    if (!c.syntheticDemo && !profile)
      return NextResponse.json(
        { error: 'Independent evidence profile unavailable' },
        { status: 409 },
      );
    const record = profile
      ? await verifyIndependentLiquidation(
          repo,
          id,
          input,
          auth.principal,
          profile,
          independentLiquidationSource(),
        )
      : await verifyClaimFixture(repo, id, input, auth.principal);
    return NextResponse.json({ dataClass, verification: record });
  } catch {
    return NextResponse.json(
      { error: 'Invalid envelope or investigation unavailable' },
      { status: 400 },
    );
  }
}
export const GET = withApiSecurity(handle);
export const POST = withApiSecurity(handle);
