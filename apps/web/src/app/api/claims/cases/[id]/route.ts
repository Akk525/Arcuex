import { claimListContext } from '@/lib/server/claims-list-context';
import {
  projectReviewReadiness,
  settlementVerificationBlocker,
} from '@/lib/server/claims-review-projection';
import { confirmedClaimReceipt } from '@/lib/server/claims-settlement-projection';
import { recheckIndependentEvidence } from '@/lib/server/independent-evidence';
import { withApiSecurity } from '@/lib/server/api-security';
import { prepareClaimsTransaction, verifyClaimsSettlement } from '@/lib/server/claims-chain';
import { reconcile } from '@/lib/server/procurement-chain';
import { txHash } from '@/lib/server/procurement-chain';
import type { AdjudicateInput } from '@arcuex/insurance';
import { parseUsdcDecimal } from '@arcuex/domain';
import {
  adjudicateClaimsCase,
  CLAIM_FIXTURE,
  listClaimVerifications,
  canAccessClaimsPolicy,
  authorizeSettlementPreparation,
  getClaimsCase,
  listClaimsCaseTimeline,
  markClaimsCasePaid,
  markClaimsCaseSettlementFailed,
  reopenInvestigation,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo, getDb } from '@/lib/server/db';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { serializeCaseEvent, serializeClaimsCase } from '@/lib/claims/serialize-case';
import { getRuntimeConfig } from '@/lib/server/runtime-config';
import { readFixture } from '@/lib/server/fixture-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function GETHandler(request: Request, ctx: Ctx) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await ctx.params;
  const repo = getRepo();
  const c = getClaimsCase(repo, id);
  if (!c || !canAccessClaimsPolicy(repo, auth.principal, c.policyId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const timeline = listClaimsCaseTimeline(repo, id).map(serializeCaseEvent);
  const manifests = repo.listEvidenceManifests(id);
  const verifications = listClaimVerifications(repo, id, auth.principal);
  const chainSource = getRuntimeConfig().chainSource;
  return NextResponse.json({
    dataClass: 'claims_case',
    source:
      chainSource === 'fixture'
        ? readFixture(getDb(), getRuntimeConfig()).source
        : { mode: 'arc-testnet' },
    ...(c.syntheticDemo ? { fixtureCatalog: CLAIM_FIXTURE } : {}),
    linkedIncident: c.incidentId ? repo.getIncident(c.incidentId) : null,
    principalRole: auth.principal.role,
    case: serializeClaimsCase(c),
    // Read-only display labels (insured agent, product, open requests).
    context: claimListContext(repo, c),
    confirmedSettlementReceipt: confirmedClaimReceipt(getDb(), chainSource, c),
    timeline,
    evidenceManifests: manifests,
    verifications,
    ...projectReviewReadiness(repo, c, verifications),
    ...(auth.principal.role === 'authority' &&
    chainSource === 'arc-testnet' &&
    !c.syntheticDemo &&
    c.evidenceAuthenticity === 'verified_independent' &&
    ['APPROVED', 'SETTLEMENT_FAILED'].includes(c.status)
      ? { settlementVerificationBlocker: settlementVerificationBlocker(repo, c) }
      : {}),
  });
}

async function POSTHandler(request: Request, ctx: Ctx) {
  const session = authenticateClaimsRequest(request, [
    'claimant',
    'reviewer',
    'authority',
    'system',
  ]);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const { id } = await ctx.params;
  let body: {
    action?: string;
    verificationId?: string;
    contractualReview?: AdjudicateInput['contractualReview'];
    coverageDetermination?: 'covered' | 'not_covered' | 'review_required' | 'unknown';
    verifiedLossUsdc?: string | null;
    recoveriesUsdc?: string | null;
    priorCompensationUsdc?: string;
    requestedUsdc?: string;
    lossKey?: string;
    forceReviewReason?: string;
    confirmedRecipient?: string;
    confirmedAmountUsdc?: string;
    confirmedLossKey?: string;
    confirmedEvidenceRoot?: string;
    receiptRef?: string;
    reasonCode?: string;
    detail?: string;
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
    if (body.action === 'adjudicate') {
      const auth = authenticateClaimsRequest(request, ['reviewer', 'authority']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (!body.coverageDetermination || !body.requestedUsdc) {
        return NextResponse.json({ error: 'Missing adjudication fields' }, { status: 400 });
      }
      if (body.coverageDetermination === 'covered' && body.verificationId) {
        const current = getClaimsCase(repo, id);
        if (
          current &&
          !current.syntheticDemo &&
          repo.getProcurementPolicy(current.policyId)?.terms.synthetic === false
        ) {
          try {
            await recheckIndependentEvidence(repo, current, body.verificationId);
          } catch {
            return NextResponse.json(
              { error: 'Current canonical independent verification required' },
              { status: 409 },
            );
          }
        }
      }
      const next = adjudicateClaimsCase(
        repo,
        {
          caseId: id,
          verificationId: body.verificationId,
          contractualReview: body.contractualReview,
          coverageDetermination: body.coverageDetermination,
          verifiedLossMicros:
            body.verifiedLossUsdc === null || body.verifiedLossUsdc === undefined
              ? null
              : parseUsdcDecimal(body.verifiedLossUsdc),
          recoveriesMicros:
            body.recoveriesUsdc === null || body.recoveriesUsdc === undefined
              ? null
              : parseUsdcDecimal(body.recoveriesUsdc),
          priorCompensationMicros:
            repo.getProcurementPolicy(getClaimsCase(repo, id)?.policyId ?? '')?.terms.synthetic ===
              false && body.priorCompensationUsdc !== undefined
              ? parseUsdcDecimal(body.priorCompensationUsdc)
              : undefined,
          requestedMicros: parseUsdcDecimal(body.requestedUsdc),
          // lossKey ignored if present — derived canonically server-side
          lossKey: body.lossKey,
          forceReviewReason: body.forceReviewReason,
        },
        auth.principal,
      );
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    if (body.action === 'reopen_investigation') {
      const auth = authenticateClaimsRequest(request, ['reviewer', 'authority']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      const next = reopenInvestigation(repo, { caseId: id }, auth.principal);
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    if (body.action === 'prepare_settlement') {
      const auth = authenticateClaimsRequest(request, ['authority']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (getRuntimeConfig().chainSource === 'fixture')
        return NextResponse.json(
          {
            error:
              'Synthetic/fixture evidence cannot authorize settlement preparation (fixture source)',
          },
          { status: 400 },
        );
      if (
        !body.confirmedRecipient ||
        !body.confirmedAmountUsdc ||
        !body.confirmedLossKey ||
        !body.confirmedEvidenceRoot
      ) {
        return NextResponse.json(
          {
            error:
              'confirmedRecipient, confirmedAmountUsdc, confirmedLossKey, confirmedEvidenceRoot required',
          },
          { status: 400 },
        );
      }
      const current = getClaimsCase(repo, id);
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      let preparedTransaction;
      if (
        !current.syntheticDemo &&
        repo.getProcurementPolicy(current.policyId)?.terms.synthetic === false
      ) {
        try {
          const binding = JSON.parse(current.adjudicationBindingJson ?? '{}') as {
            verificationId?: string;
          };
          await recheckIndependentEvidence(repo, current, binding.verificationId);
        } catch {
          return NextResponse.json(
            { error: 'Current canonical independent verification required' },
            { status: 409 },
          );
        }
      }
      if (repo.getProcurementPolicy(current.policyId)) {
        try {
          const policy = repo.getProcurementPolicy(current.policyId)!;
          const chain = await reconcile(policy);
          if (!chain.matches) throw new Error();
          preparedTransaction = await prepareClaimsTransaction(current);
        } catch {
          return NextResponse.json(
            {
              error:
                'Onchain policy/reservation/window reconciliation failed; no settlement prepared',
            },
            { status: 409 },
          );
        }
      }
      const next = authorizeSettlementPreparation(
        repo,
        {
          caseId: id,
          confirmedRecipient: body.confirmedRecipient,
          confirmedAmountMicros: parseUsdcDecimal(body.confirmedAmountUsdc),
          confirmedLossKey: body.confirmedLossKey,
          confirmedEvidenceRoot: body.confirmedEvidenceRoot,
          settlementPrepId: `prep:${id}:${Date.now()}`,
        },
        auth.principal,
      );
      return NextResponse.json({
        dataClass: 'claims_case',
        case: serializeClaimsCase(next),
        preparedTransaction,
        notice: 'Settlement prepared only. No on-chain broadcast from this endpoint.',
      });
    }

    if (body.action === 'mark_paid') {
      const auth = authenticateClaimsRequest(request, ['authority']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (getRuntimeConfig().chainSource === 'fixture')
        return NextResponse.json(
          { error: 'Synthetic fixture source cannot confirm reimbursement' },
          { status: 400 },
        );
      if (!body.receiptRef) {
        return NextResponse.json({ error: 'receiptRef required' }, { status: 400 });
      }
      const current = getClaimsCase(repo, id);
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      try {
        await verifyClaimsSettlement(current, txHash(body.receiptRef));
      } catch {
        return NextResponse.json(
          {
            error:
              'A matching verified Arc settlement receipt is required; no paid transition recorded',
          },
          { status: 409 },
        );
      }
      const next = markClaimsCasePaid(
        repo,
        { caseId: id, receiptRef: body.receiptRef },
        auth.principal,
      );
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    if (body.action === 'mark_failed') {
      const auth = authenticateClaimsRequest(request, ['authority']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      const next = markClaimsCaseSettlementFailed(
        repo,
        {
          caseId: id,
          reasonCode: body.reasonCode ?? 'SETTLEMENT_FAILED',
          detail: body.detail,
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
