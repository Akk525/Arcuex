import { ValidationError, parseUsdcDecimal } from '@arcuex/domain';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { describe, expect, it } from 'vitest';
import {
  createLimitCoverageRule,
  createPassthroughVerifier,
  createSyntheticEvidenceProvider,
} from './demo-adapters';
import {
  collectAndValidateCoverage,
  decideClaim,
  intakeObservedEvent,
  prepareSettlement,
  submitClaim,
} from './claims-pipeline';
import { ensureDemoPool } from './capital-service';
import { acceptAndBindPolicy, requestCoverageQuote } from './quote-to-bind';

async function seededPolicy(repo: InsuranceRepository) {
  const quote = requestCoverageQuote(repo, {
    idempotencyKey: `q-${Math.random().toString(16).slice(2)}`,
    policyholder: { displayName: 'Holder' },
    agent: { externalRef: 'agent', label: 'Agent' },
  });
  return acceptAndBindPolicy(repo, {
    quoteId: quote.id,
    idempotencyKey: `b-${Math.random().toString(16).slice(2)}`,
    fundingVerified: true,
  });
}

describe('claims pipeline', () => {
  it('separates observed intake from validated covered events and prepares settlement', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const { policy, exposure } = await seededPolicy(repo);
    const pool = ensureDemoPool(repo);

    const incident = intakeObservedEvent(repo, {
      idempotencyKey: 'evt-intake-001',
      observedEventRef: 'tx:0xabc',
      observedAt: '2026-11-16T18:10:00.000Z',
      source: 'manual-demo',
      policyId: policy.id,
      exposureId: exposure.id,
    });
    expect(incident.status).toBe('associated');

    const replay = intakeObservedEvent(repo, {
      idempotencyKey: 'evt-intake-001',
      observedEventRef: 'tx:0xabc',
      observedAt: '2026-11-16T18:10:00.000Z',
      source: 'manual-demo',
      policyId: policy.id,
      exposureId: exposure.id,
    });
    expect(replay.id).toBe(incident.id);

    const validated = await collectAndValidateCoverage({
      repo,
      incidentId: incident.id,
      evidenceProvider: createSyntheticEvidenceProvider(),
      verifier: createPassthroughVerifier(),
      coverageRule: createLimitCoverageRule(),
    });
    expect(validated.covered).toBe(true);
    expect(validated.incident.status).toBe('validated');

    const claim = submitClaim(repo, {
      policyId: policy.id,
      incidentId: incident.id,
      requestedMicros: parseUsdcDecimal('10.000000'),
      idempotencyKey: 'claim-key-001',
    });

    expect(() =>
      decideClaim(repo, {
        claimId: claim.id,
        decision: 'authorize',
        authority: 'ai_majority_vote',
        rationale: 'models agree',
        authorizedMicros: parseUsdcDecimal('10.000000'),
      }),
    ).toThrow(ValidationError);

    const decided = decideClaim(repo, {
      claimId: claim.id,
      decision: 'authorize',
      authority: 'coverage-rule:limit-rule-v1',
      rationale: 'Synthetic rule authorized within limit',
      authorizedMicros: parseUsdcDecimal('10.000000'),
    });
    expect(decided.claim.status).toBe('authorized');

    const settlement = prepareSettlement(repo, {
      claimId: claim.id,
      poolId: pool.id,
      idempotencyKey: 'settle-key-001',
    });
    expect(settlement.status).toBe('prepared');
    expect(prepareSettlement(repo, {
      claimId: claim.id,
      poolId: pool.id,
      idempotencyKey: 'settle-key-001',
    }).id).toBe(settlement.id);
  });
});
