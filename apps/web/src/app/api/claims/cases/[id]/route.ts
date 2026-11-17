import { parseUsdcDecimal } from '@arcuex/domain';
import {
  adjudicateClaimsCase,
  authorizeSettlementPreparation,
  getClaimsCase,
  listClaimsCaseTimeline,
  markClaimsCasePaid,
  markClaimsCaseSettlementFailed,
  transitionClaimsCase,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import { serializeCaseEvent, serializeClaimsCase } from '@/lib/claims/serialize-case';
import { newId } from '@arcuex/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
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
    actor?: string;
    coverageDetermination?: 'covered' | 'not_covered' | 'review_required' | 'unknown';
    verifiedLossUsdc?: string | null;
    recoveriesUsdc?: string | null;
    requestedUsdc?: string;
    lossKey?: string | null;
    forceReviewReason?: string;
    authorityActor?: string;
    confirmedRecipient?: string;
    confirmedAmountUsdc?: string;
    receiptRef?: string;
    reasonCode?: string;
    detail?: string;
  };

  const repo = getRepo();
  const actor = body.actor?.trim() || 'reviewer:dashboard';

  try {
    if (body.action === 'adjudicate') {
      if (!body.coverageDetermination || !body.requestedUsdc) {
        return NextResponse.json({ error: 'Missing adjudication fields' }, { status: 400 });
      }
      const next = adjudicateClaimsCase(repo, {
        caseId: id,
        actor,
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
        lossKey: body.lossKey ?? null,
        forceReviewReason: body.forceReviewReason,
      });
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    if (body.action === 'reopen_investigation') {
      const current = getClaimsCase(repo, id);
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const next = transitionClaimsCase(current, {
        to: 'INVESTIGATING',
        actor,
        reasonCode: 'REOPEN_INVESTIGATION',
      });
      repo.runInTransaction(() => {
        repo.saveClaimsCase(next);
        repo.appendClaimsCaseEvent({
          id: newId(),
          caseId: next.id,
          fromStatus: current.status,
          toStatus: next.status,
          actor,
          reasonCode: 'REOPEN_INVESTIGATION',
          payloadJson: '{}',
          createdAt: next.updatedAt,
        });
      });
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    if (body.action === 'prepare_settlement') {
      if (!body.authorityActor || !body.confirmedRecipient || !body.confirmedAmountUsdc) {
        return NextResponse.json(
          { error: 'authorityActor, confirmedRecipient, confirmedAmountUsdc required' },
          { status: 400 },
        );
      }
      const next = authorizeSettlementPreparation(repo, {
        caseId: id,
        authorityActor: body.authorityActor,
        confirmedRecipient: body.confirmedRecipient,
        confirmedAmountMicros: parseUsdcDecimal(body.confirmedAmountUsdc),
        settlementPrepId: `prep:${id}:${Date.now()}`,
      });
      return NextResponse.json({
        dataClass: 'claims_case',
        case: serializeClaimsCase(next),
        notice:
          'Settlement prepared only. No on-chain broadcast from this endpoint. Broadcast requires separate explicit authorization outside this UI.',
      });
    }

    if (body.action === 'mark_paid') {
      if (!body.receiptRef) {
        return NextResponse.json({ error: 'receiptRef required' }, { status: 400 });
      }
      const next = markClaimsCasePaid(repo, {
        caseId: id,
        actor: body.authorityActor || actor,
        receiptRef: body.receiptRef,
      });
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    if (body.action === 'mark_failed') {
      const next = markClaimsCaseSettlementFailed(repo, {
        caseId: id,
        actor: body.authorityActor || actor,
        reasonCode: body.reasonCode ?? 'SETTLEMENT_FAILED',
        detail: body.detail,
      });
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ClaimsCase error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
