import { parseUsdcDecimal } from '@arcuex/domain';
import {
  adjudicateClaimsCase,
  authorizeSettlementPreparation,
  getClaimsCase,
  listClaimsCaseTimeline,
  markClaimsCasePaid,
  markClaimsCaseSettlementFailed,
  reopenInvestigation,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import { authenticateClaimsRequest } from '@/lib/server/claims-auth';
import { serializeCaseEvent, serializeClaimsCase } from '@/lib/claims/serialize-case';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await ctx.params;
  const repo = getRepo();
  const c = getClaimsCase(repo, id);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const timeline = listClaimsCaseTimeline(repo, id).map(serializeCaseEvent);
  const manifests = repo.listEvidenceManifests(id);
  return NextResponse.json({
    dataClass: 'claims_case',
    case: serializeClaimsCase(c),
    timeline,
    evidenceManifests: manifests,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    action?: string;
    coverageDetermination?: 'covered' | 'not_covered' | 'review_required' | 'unknown';
    verifiedLossUsdc?: string | null;
    recoveriesUsdc?: string | null;
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

  const repo = getRepo();

  try {
    if (body.action === 'adjudicate') {
      const auth = authenticateClaimsRequest(request, ['reviewer', 'authority']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (!body.coverageDetermination || !body.requestedUsdc || !body.lossKey) {
        return NextResponse.json({ error: 'Missing adjudication fields' }, { status: 400 });
      }
      const next = adjudicateClaimsCase(
        repo,
        {
          caseId: id,
          coverageDetermination: body.coverageDetermination,
          verifiedLossMicros:
            body.verifiedLossUsdc === null || body.verifiedLossUsdc === undefined
              ? null
              : parseUsdcDecimal(body.verifiedLossUsdc),
          recoveriesMicros:
            body.recoveriesUsdc === null || body.recoveriesUsdc === undefined
              ? null
              : parseUsdcDecimal(body.recoveriesUsdc),
          requestedMicros: parseUsdcDecimal(body.requestedUsdc),
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
        notice:
          'Settlement prepared only. No on-chain broadcast from this endpoint.',
      });
    }

    if (body.action === 'mark_paid') {
      const auth = authenticateClaimsRequest(request, ['authority']);
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      if (!body.receiptRef) {
        return NextResponse.json({ error: 'receiptRef required' }, { status: 400 });
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
