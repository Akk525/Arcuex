import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Claims-owned policy picker: active/bound policies with registered exposures. */
export async function GET(request: Request) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const repo = getRepo();
  const policies = repo
    .listPolicies(50)
    .filter((p) => p.status === 'active' || p.status === 'bound')
    .map((p) => ({
      id: p.id,
      status: p.status,
      synthetic: p.terms.synthetic,
      exposures: repo.listExposures(p.id).map((e) => ({
        id: e.id,
        exposureKey: e.exposureKey,
        description: e.description,
        limitMicros: e.limitMicros.toString(),
      })),
    }));
  return NextResponse.json({
    dataClass: 'claims_case',
    notice: 'Read-only policy/exposure list for claims intake.',
    policies,
  });
}
