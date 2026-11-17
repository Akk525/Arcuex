import {withApiSecurity} from '@/lib/server/api-security';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { canAccessClaimsPolicy } from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { hashCoverageTerms, toPolicyIdBytes32 } from '@arcuex/onchain';
import { getRepo } from '@/lib/server/db';
import { getPoolAddress } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(request: Request) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const repo = getRepo();
  const pool = getPoolAddress();
  const policies = repo
    .listPolicies(50)
    .filter((p) => canAccessClaimsPolicy(repo, auth.principal, p.id))
    .map((p) => {
      const link = repo.getOnchainPolicyLink(p.id);
      return {
        id: p.id,
        status: p.status,
        synthetic: p.terms.synthetic,
        premiumMicros: p.terms.premiumMicros.toString(),
        limitMicros: p.terms.limitMicros.toString(),
        coverageStartsAt: p.terms.coverageStartsAt,
        coverageEndsAt: p.terms.coverageEndsAt,
        boundAt: p.boundAt,
        activatedAt: p.activatedAt,
        policyIdBytes32: link?.policyIdBytes32 ?? toPolicyIdBytes32(p.id),
        termsHash: link?.termsHash ?? hashCoverageTerms(p.terms),
        onchainLink: link,
      };
    });

  return NextResponse.json({
    poolAddress: pool,
    policies,
  });
}

export const GET=withApiSecurity(GETHandler);
