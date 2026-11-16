import { formatUsdc, parseUsdcDecimal } from '@arcuex/domain';
import {
  collectAndValidateCoverage,
  createLimitCoverageRule,
  createPassthroughVerifier,
  createSyntheticEvidenceProvider,
  decideClaim,
  intakeObservedEvent,
  prepareSettlement,
  submitClaim,
  ensureDemoPool,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
    notice: 'Claims flow uses synthetic evidence/adapters. Observed events ≠ verified covered events.',
    incidents,
    claims,
    settlements,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    idempotencyKey?: string;
    policyId?: string;
    exposureId?: string;
    observedEventRef?: string;
    incidentId?: string;
    claimId?: string;
    requestedUsdc?: string;
    authorizedUsdc?: string;
    authority?: string;
    rationale?: string;
    decision?: 'authorize' | 'deny';
  };

  const repo = getRepo();
  const pool = ensureDemoPool(repo);

  try {
    if (body.action === 'intake') {
      if (!body.idempotencyKey || !body.policyId || !body.exposureId || !body.observedEventRef) {
        return NextResponse.json({ error: 'Missing intake fields' }, { status: 400 });
      }
      const incident = intakeObservedEvent(repo, {
        idempotencyKey: body.idempotencyKey,
        observedEventRef: body.observedEventRef,
        observedAt: new Date().toISOString(),
        source: 'dashboard',
        policyId: body.policyId,
        exposureId: body.exposureId,
      });
      return NextResponse.json({ dataClass: 'synthetic', incident });
    }

    if (body.action === 'validate') {
      if (!body.incidentId) {
        return NextResponse.json({ error: 'incidentId required' }, { status: 400 });
      }
      const result = await collectAndValidateCoverage({
        repo,
        incidentId: body.incidentId,
        evidenceProvider: createSyntheticEvidenceProvider(),
        verifier: createPassthroughVerifier(),
        coverageRule: createLimitCoverageRule(),
      });
      return NextResponse.json({
        dataClass: 'synthetic',
        covered: result.covered,
        reason: result.reason,
        incident: result.incident,
      });
    }

    if (body.action === 'submit_claim') {
      if (!body.policyId || !body.incidentId || !body.idempotencyKey || !body.requestedUsdc) {
        return NextResponse.json({ error: 'Missing claim fields' }, { status: 400 });
      }
      const claim = submitClaim(repo, {
        policyId: body.policyId,
        incidentId: body.incidentId,
        requestedMicros: parseUsdcDecimal(body.requestedUsdc),
        idempotencyKey: body.idempotencyKey,
      });
      return NextResponse.json({
        dataClass: 'synthetic',
        claim: {
          id: claim.id,
          status: claim.status,
          requestedUsdc: formatUsdc(claim.requestedMicros),
        },
      });
    }

    if (body.action === 'decide') {
      if (!body.claimId || !body.decision || !body.authority || !body.rationale) {
        return NextResponse.json({ error: 'Missing decision fields' }, { status: 400 });
      }
      const decided = decideClaim(repo, {
        claimId: body.claimId,
        decision: body.decision,
        authority: body.authority,
        rationale: body.rationale,
        authorizedMicros:
          body.decision === 'authorize' && body.authorizedUsdc
            ? parseUsdcDecimal(body.authorizedUsdc)
            : undefined,
      });
      return NextResponse.json({
        dataClass: 'synthetic',
        claim: {
          id: decided.claim.id,
          status: decided.claim.status,
          authorizedUsdc: decided.claim.authorizedMicros
            ? formatUsdc(decided.claim.authorizedMicros)
            : null,
        },
        assessment: decided.assessment,
      });
    }

    if (body.action === 'prepare_settlement') {
      if (!body.claimId || !body.idempotencyKey) {
        return NextResponse.json({ error: 'claimId and idempotencyKey required' }, { status: 400 });
      }
      const settlement = prepareSettlement(repo, {
        claimId: body.claimId,
        poolId: pool.id,
        idempotencyKey: body.idempotencyKey,
      });
      return NextResponse.json({
        dataClass: 'synthetic',
        settlement: {
          id: settlement.id,
          status: settlement.status,
          amountUsdc: formatUsdc(settlement.amountMicros),
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Claims error';
    return NextResponse.json({ error: message, dataClass: 'synthetic' }, { status: 400 });
  }
}
