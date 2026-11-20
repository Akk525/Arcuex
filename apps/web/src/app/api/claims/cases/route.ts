import { projectClaimTriage, workbenchStatuses } from '@/lib/server/claims-review-projection';
import { projectSettlementFinality } from '@/lib/server/claims-settlement-projection';
import { getRuntimeConfig } from '@/lib/server/runtime-config';
import { withApiSecurity } from '@/lib/server/api-security';
import {
  attachEvidenceManifest,
  INDEPENDENT_EVENT_REFERENCE,
  canAccessClaimsPolicy,
  intakeClaimsCase,
  completeEvidenceOrReview,
  listClaimsCases,
} from '@arcuex/insurance';
import { reconcile } from '@/lib/server/procurement-chain';
import { sameIndependentLiquidationProfile } from '@arcuex/domain';
import { configuredIndependentLiquidation } from '@/lib/server/independent-evidence';
import { NextResponse } from 'next/server';
import { getDb, getRepo } from '@/lib/server/db';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { serializeClaimsCase } from '@/lib/claims/serialize-case';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(request: Request) {
  const url = new URL(request.url);
  const workbench = url.searchParams.get('view') === 'workbench';
  const auth = authenticateClaimsRequest(
    request,
    workbench ? ['reviewer', 'authority'] : ['claimant', 'reviewer', 'authority', 'system'],
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const status = url.searchParams.get('status') ?? undefined;
  const repo = getRepo();
  const chainSource = getRuntimeConfig().chainSource;
  const db = getDb();
  const visible = listClaimsCases(repo, { limit: 500, status })
    .filter((claim) => canAccessClaimsPolicy(repo, auth.principal, claim.policyId))
    .filter((claim) => !workbench || workbenchStatuses.has(claim.status))
    .slice(0, 50);
  const projected = await Promise.all(
    visible.map(async (claim) => {
      const payment = await projectSettlementFinality(db, chainSource, claim);
      const current =
        claim.status === 'PAID' && !payment.confirmedSettlementReceipt
          ? { ...claim, status: 'SETTLEMENT_PENDING' as const }
          : claim;
      return {
        ...serializeClaimsCase(current),
        ...(workbench && {
          triage: projectClaimTriage(repo, current, auth.principal.role, chainSource === 'fixture'),
        }),
        ...payment,
      };
    }),
  );
  const cases = projected.filter((claim) => status !== 'PAID' || claim.confirmedSettlementReceipt);
  return NextResponse.json({
    dataClass: 'claims_case',
    notice:
      'ClaimsCase statuses are first-class adjudication states. Synthetic fixtures are labeled explicitly.',
    cases,
  });
}

async function POSTHandler(request: Request) {
  const session = authenticateClaimsRequest(request, [
    'claimant',
    'reviewer',
    'authority',
    'system',
  ]);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  let body: {
    action?: string;
    policyId?: string;
    exposureId?: string;
    claimantRef?: string;
    idempotencyKey?: string;
    syntheticDemo?: boolean;
    caseId?: string;
    evidenceComplete?: boolean;
    observedEventRef?: string;
    observedAt?: string;
    evidence?: {
      source: string;
      chain?: string;
      blockHash?: string;
      transactionHash?: string;
      provenance: string;
      rawEvidence: string;
      verificationMethod: string;
      sourceReliability: string;
      syntheticFixture: boolean;
    };
  };
  try {
    const raw = await request.text();
    if (raw.length > 32000)
      return NextResponse.json({ error: 'Claims request too large' }, { status: 413 });
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return NextResponse.json({ error: 'JSON object required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid claims JSON' }, { status: 400 });
  }

  const repo = getRepo();

  try {
    if (body.action === 'open') {
      const auth = authenticateClaimsRequest(request, ['claimant', 'system']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (!body.policyId || !body.exposureId || !body.idempotencyKey || !body.claimantRef) {
        return NextResponse.json({ error: 'Missing open fields' }, { status: 400 });
      }
      if (!body.observedEventRef || !body.observedAt)
        return NextResponse.json(
          { error: 'observedEventRef and observedAt required' },
          { status: 400 },
        );
      if (!canAccessClaimsPolicy(repo, auth.principal, body.policyId))
        return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
      const procurement = repo.getProcurementPolicy(body.policyId);
      if (!procurement)
        return NextResponse.json(
          {
            error:
              'New claims require a confirmed immutable procurement policy; legacy ledger intake is disabled',
          },
          { status: 409 },
        );
      const synthetic = procurement.terms.synthetic !== false;
      if (
        !synthetic &&
        (!sameIndependentLiquidationProfile(
          procurement.terms.independentProfile,
          configuredIndependentLiquidation(),
        ) ||
          !INDEPENDENT_EVENT_REFERENCE.test(body.observedEventRef))
      )
        return NextResponse.json(
          {
            error: 'Independent claim requires a provisioned profile and exact Arc event reference',
          },
          { status: 409 },
        );
      if (procurement) {
        let chain;
        try {
          chain = await reconcile(procurement);
        } catch {
          return NextResponse.json(
            { error: 'Arc reconciliation unavailable; retry intake' },
            { status: 503 },
          );
        }
        if (!chain.matches || chain.cancelled)
          return NextResponse.json(
            { error: 'Policy chain state is not eligible for claims intake' },
            { status: 409 },
          );
      }
      const collecting = intakeClaimsCase(
        repo,
        {
          policyId: body.policyId,
          exposureId: body.exposureId,
          claimantRef: auth.principal.subject,
          idempotencyKey: body.idempotencyKey,
          syntheticDemo: synthetic,
          actor: 'ignored',
          observedEventRef: body.observedEventRef,
          observedAt: body.observedAt,
        },
        auth.principal,
      );
      return NextResponse.json({
        dataClass: 'claims_case',
        case: serializeClaimsCase(collecting),
      });
    }

    if (body.action === 'attach_evidence') {
      const auth = authenticateClaimsRequest(request, ['claimant', 'system', 'reviewer']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (!body.caseId || !body.evidence) {
        return NextResponse.json({ error: 'caseId and evidence required' }, { status: 400 });
      }
      const result = attachEvidenceManifest(
        repo,
        { caseId: body.caseId, ...body.evidence },
        auth.principal,
      );
      return NextResponse.json({
        dataClass: 'claims_case',
        inserted: result.inserted,
        digest: result.digest,
        case: serializeClaimsCase(result.case),
      });
    }

    if (body.action === 'complete_evidence') {
      const auth = authenticateClaimsRequest(request, ['claimant', 'system', 'reviewer']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (!body.caseId) {
        return NextResponse.json({ error: 'caseId required' }, { status: 400 });
      }
      const next = completeEvidenceOrReview(
        repo,
        {
          caseId: body.caseId,
          evidenceComplete: body.evidenceComplete !== false,
        },
        auth.principal,
      );
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ClaimsCase error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const GET = withApiSecurity(GETHandler);
export const POST = withApiSecurity(POSTHandler);
