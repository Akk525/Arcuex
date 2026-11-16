import { formatUsdc, parseUsdcDecimal } from '@arcuex/domain';
import {
  collectAndValidateCoverage,
  createLimitCoverageRule,
  createPassthroughVerifier,
  createSyntheticEvidenceProvider,
  decideClaim,
  ensureDemoPool,
  intakeObservedEvent,
  prepareSettlement,
  submitClaim,
} from '@arcuex/insurance';
import { NextResponse } from 'next/server';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-click synthetic demo: requires an active policy in the ledger.
 * Uses synthetic evidence/adapters only — not financial-event proofs.
 */
export async function POST() {
  const repo = getRepo();
  const policies = repo.listPolicies(20);
  const policy = policies.find((p) => p.status === 'active');
  if (!policy) {
    return NextResponse.json(
      {
        error: 'No active synthetic policy. Request and bind a quote in Coverage first.',
        dataClass: 'synthetic',
      },
      { status: 400 },
    );
  }

  const exposure = repo.listExposures(policy.id)[0];
  if (!exposure) {
    return NextResponse.json({ error: 'Policy has no exposure', dataClass: 'synthetic' }, { status: 400 });
  }

  const pool = ensureDemoPool(repo);
  const stamp = Date.now();

  try {
    const incident = intakeObservedEvent(repo, {
      idempotencyKey: `demo-evt-${stamp}`,
      observedEventRef: `demo-tx-${stamp}`,
      observedAt: new Date().toISOString(),
      source: 'dashboard-demo',
      policyId: policy.id,
      exposureId: exposure.id,
    });

    const validated = await collectAndValidateCoverage({
      repo,
      incidentId: incident.id,
      evidenceProvider: createSyntheticEvidenceProvider(),
      verifier: createPassthroughVerifier(),
      coverageRule: createLimitCoverageRule(),
    });

    if (!validated.covered) {
      return NextResponse.json(
        { error: validated.reason, dataClass: 'synthetic', incident: validated.incident },
        { status: 400 },
      );
    }

    const claim = submitClaim(repo, {
      policyId: policy.id,
      incidentId: incident.id,
      requestedMicros: parseUsdcDecimal('10.000000'),
      idempotencyKey: `demo-claim-${stamp}`,
    });

    const decided = decideClaim(repo, {
      claimId: claim.id,
      decision: 'authorize',
      authority: 'coverage-rule:limit-rule-v1',
      rationale: 'Dashboard synthetic demo authorization',
      authorizedMicros: parseUsdcDecimal('10.000000'),
    });

    const settlement = prepareSettlement(repo, {
      claimId: decided.claim.id,
      poolId: pool.id,
      idempotencyKey: `demo-settle-${stamp}`,
    });

    return NextResponse.json({
      dataClass: 'synthetic',
      notice: 'Synthetic demo path complete. Settlement is prepared in the ledger only — no on-chain payout.',
      policyId: policy.id,
      exposureId: exposure.id,
      incidentId: incident.id,
      claimId: decided.claim.id,
      settlementId: settlement.id,
      authorizedUsdc: formatUsdc(decided.claim.authorizedMicros ?? 0n),
      settlementStatus: settlement.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Demo claim flow failed';
    return NextResponse.json({ error: message, dataClass: 'synthetic' }, { status: 400 });
  }
}
