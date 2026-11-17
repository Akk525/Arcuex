import {
  attachEvidenceManifest,
  beginEvidenceCollection,
  completeEvidenceOrReview,
  listClaimsCases,
  openClaimsCase,
  submitClaimsCase,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';
import { serializeClaimsCase } from '@/lib/claims/serialize-case';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const repo = getRepo();
  const cases = listClaimsCases(repo, { limit: 50, status }).map(serializeClaimsCase);
  return NextResponse.json({
    dataClass: 'claims_case',
    notice:
      'ClaimsCase statuses are first-class adjudication states. Synthetic fixtures are labeled explicitly.',
    cases,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    policyId?: string;
    exposureId?: string;
    claimantRef?: string;
    idempotencyKey?: string;
    syntheticDemo?: boolean;
    actor?: string;
    caseId?: string;
    evidenceComplete?: boolean;
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

  const repo = getRepo();
  const actor = body.actor?.trim() || 'claimant:dashboard';

  try {
    if (body.action === 'open') {
      if (!body.policyId || !body.exposureId || !body.idempotencyKey || !body.claimantRef) {
        return NextResponse.json({ error: 'Missing open fields' }, { status: 400 });
      }
      const opened = openClaimsCase(repo, {
        policyId: body.policyId,
        exposureId: body.exposureId,
        claimantRef: body.claimantRef,
        idempotencyKey: body.idempotencyKey,
        syntheticDemo: body.syntheticDemo ?? true,
        actor,
      });
      const submitted = submitClaimsCase(repo, { caseId: opened.id, actor });
      const collecting = beginEvidenceCollection(repo, { caseId: submitted.id, actor: 'system:intake' });
      return NextResponse.json({
        dataClass: 'claims_case',
        case: serializeClaimsCase(collecting),
      });
    }

    if (body.action === 'attach_evidence') {
      if (!body.caseId || !body.evidence) {
        return NextResponse.json({ error: 'caseId and evidence required' }, { status: 400 });
      }
      const result = attachEvidenceManifest(repo, {
        caseId: body.caseId,
        actor,
        ...body.evidence,
      });
      return NextResponse.json({
        dataClass: 'claims_case',
        inserted: result.inserted,
        digest: result.digest,
        case: serializeClaimsCase(result.case),
      });
    }

    if (body.action === 'complete_evidence') {
      if (!body.caseId) {
        return NextResponse.json({ error: 'caseId required' }, { status: 400 });
      }
      const next = completeEvidenceOrReview(repo, {
        caseId: body.caseId,
        actor,
        evidenceComplete: body.evidenceComplete !== false,
      });
      return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ClaimsCase error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
