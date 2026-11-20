import { randomUUID } from 'node:crypto';
import {
  projectReviewReadiness,
  settlementVerificationBlocker,
} from '@/lib/server/claims-review-projection';
import {
  confirmedClaimReceipt,
  isFixtureSettlementBlocked,
  recordedSettlement,
} from '@/lib/server/claims-settlement-projection';
import { recheckIndependentEvidence } from '@/lib/server/independent-evidence';
import { assertCanonicalBlock } from '@/lib/server/arc-confirmation';
import { withApiSecurity } from '@/lib/server/api-security';
import {
  prepareClaimsTransaction,
  verifyClaimsSettlement,
  verifyFailedSettlement,
} from '@/lib/server/claims-chain';
import { procurementClient, reconcile } from '@/lib/server/procurement-chain';
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

function assertAttemptAfterPreparation(prepId: string | null, caseId: string, timestamp: number) {
  const row = getDb()
    .prepare(
      `SELECT created_at FROM claims_case_events WHERE case_id=? AND reason_code='SETTLEMENT_PREPARED'
     AND json_extract(payload_json, '$.settlementPrepId')=?`,
    )
    .get(caseId, prepId) as { created_at: string } | undefined;
  if (!row || Math.floor(Date.parse(row.created_at) / 1000) > timestamp)
    throw new Error('Receipt predates settlement preparation');
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
      if (
        getRuntimeConfig().enforced &&
        (isFixtureSettlementBlocked(getRuntimeConfig().chainSource, current) ||
          repo.getProcurementPolicy(current.policyId)?.terms.synthetic !== false)
      )
        return NextResponse.json(
          { error: 'An independently verified Arc policy is required' },
          { status: 409 },
        );
      let preparedTransaction;
      let signBefore: string | undefined;
      if (
        !current.syntheticDemo &&
        repo.getProcurementPolicy(current.policyId)?.terms.synthetic === false
      ) {
        try {
          const binding = JSON.parse(current.adjudicationBindingJson ?? '{}') as {
            verificationId?: string;
          };
          const verification = await recheckIndependentEvidence(
            repo,
            current,
            binding.verificationId,
          );
          const policy = repo.getProcurementPolicy(current.policyId)!;
          signBefore = new Date(
            Math.min(verification.validUntilMs!, policy.terms.expiresAt * 1000),
          ).toISOString();
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
          const chain = await reconcile(policy, procurementClient());
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
          settlementPrepId: randomUUID(),
          expectedVersion: current.rowVersion,
        },
        auth.principal,
      );
      return NextResponse.json({
        dataClass: 'claims_case',
        case: serializeClaimsCase(next),
        preparedTransaction,
        signBefore,
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
      if (
        isFixtureSettlementBlocked(getRuntimeConfig().chainSource, current) ||
        current.evidenceAuthenticity !== 'verified_independent' ||
        repo.getProcurementPolicy(current.policyId)?.terms.synthetic !== false
      )
        return NextResponse.json(
          { error: 'An independently verified Arc policy is required' },
          { status: 409 },
        );
      try {
        const hash = txHash(body.receiptRef);
        const client = procurementClient();
        const proof = await verifyClaimsSettlement(current, hash, client);
        if (proof.termsHash !== repo.getProcurementPolicy(current.policyId)?.digest)
          throw new Error('Onchain terms differ from the accepted policy');
        if (current.status === 'PAID') {
          const recorded = recordedSettlement(getDb(), id);
          if (recorded?.hash !== hash || recorded.anchor?.blockHash !== proof.blockHash)
            throw new Error('Current receipt differs from recorded payment');
          return NextResponse.json({
            dataClass: 'claims_case',
            case: serializeClaimsCase(current),
          });
        }
        assertAttemptAfterPreparation(current.settlementPrepId, id, proof.timestamp);
        const { verificationId } = JSON.parse(current.adjudicationBindingJson ?? '{}') as {
          verificationId?: string;
        };
        // Evaluate validity at inclusion, so confirmation and restart can happen after expiry.
        await recheckIndependentEvidence(
          repo,
          current,
          verificationId,
          client,
          proof.timestamp * 1000 + 999,
        );
        await assertCanonicalBlock(client, BigInt(proof.blockNumber), proof.blockHash);
        const next = markClaimsCasePaid(
          repo,
          { caseId: id, receiptRef: hash, expectedVersion: current.rowVersion, anchor: proof },
          auth.principal,
        );
        return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
      } catch {
        return NextResponse.json(
          {
            error:
              'A confirmed matching Arc settlement with valid authorization and evidence at inclusion is required',
          },
          { status: 409 },
        );
      }
    }

    if (body.action === 'mark_failed') {
      const auth = authenticateClaimsRequest(request, ['authority']);
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
      const current = getClaimsCase(repo, id);
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      try {
        const hash = txHash(body.receiptRef);
        const timestamp = await verifyFailedSettlement(current, hash);
        if (current.status === 'SETTLEMENT_FAILED') {
          const previous = getDb()
            .prepare(
              `SELECT json_extract(payload_json, '$.receiptRef') AS hash FROM claims_case_events
             WHERE case_id=? AND reason_code='SETTLEMENT_REVERTED' ORDER BY rowid DESC LIMIT 1`,
            )
            .get(id) as { hash: string } | undefined;
          if (previous?.hash === hash)
            return NextResponse.json({
              dataClass: 'claims_case',
              case: serializeClaimsCase(current),
            });
        }
        assertAttemptAfterPreparation(current.settlementPrepId, id, timestamp);
        const next = markClaimsCaseSettlementFailed(
          repo,
          {
            caseId: id,
            reasonCode: 'SETTLEMENT_REVERTED',
            receiptRef: hash,
            expectedVersion: current.rowVersion,
          },
          auth.principal,
        );
        return NextResponse.json({ dataClass: 'claims_case', case: serializeClaimsCase(next) });
      } catch {
        return NextResponse.json(
          {
            error:
              'A confirmed reverted Arc settlement is required. Pending commitments are retained.',
          },
          { status: 409 },
        );
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ClaimsCase error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const GET = withApiSecurity(GETHandler);
export const POST = withApiSecurity(POSTHandler);
