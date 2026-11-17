import { describe, expect, it } from 'vitest';
import { openDatabase, migrate, InsuranceRepository } from '@arcuex/persistence';
import { acceptAndBindPolicy, requestCoverageQuote } from './quote-to-bind';
import { collectAndValidateCoverage, intakeObservedEvent } from './claims-pipeline';
import {
  createSyntheticOracleCoverageRule,
  createSyntheticOracleEvidenceProvider,
  createSyntheticOracleVerifier,
} from './synthetic-oracle-wedge';

describe('synthetic oracle wedge', () => {
  it('VERIFIED fixture yields covered synthetic payable without claiming real-world loss', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new InsuranceRepository(db);
    const quote = requestCoverageQuote(repo, {
      idempotencyKey: 'oracle-wedge-quote-1',
      policyholder: { displayName: 'Wedge Demo' },
      agent: { externalRef: 'agent://wedge', label: 'wedge' },
    });
    const { policy, exposure } = acceptAndBindPolicy(repo, {
      quoteId: quote.id,
      idempotencyKey: 'oracle-wedge-accept-1',
      fundingVerified: true,
    });
    const incident = intakeObservedEvent(repo, {
      idempotencyKey: 'oracle-wedge-incident-1',
      observedEventRef: 'synthetic:oracle-liq:fixture-1',
      observedAt: new Date().toISOString(),
      source: 'synthetic-oracle-fixture',
      policyId: policy.id,
      exposureId: exposure.id,
    });

    const result = await collectAndValidateCoverage({
      repo,
      incidentId: incident.id,
      evidenceProvider: createSyntheticOracleEvidenceProvider({
        expectedOutcome: 'VERIFIED',
        adapterRatioBps: 9000,
        canonicalRatioBps: 10000,
        wouldRemainHealthy: true,
        seizedMicros: '50000000',
        debtExtinguishedMicros: '10000000',
        deductibleMicros: '1000000',
      }),
      verifier: createSyntheticOracleVerifier(),
      coverageRule: createSyntheticOracleCoverageRule(),
    });

    expect(result.outcome).toBe('VERIFIED');
    expect(result.covered).toBe(true);
    expect(result.payableMicros).toBe(39_000_000n);
    expect(result.reason).toMatch(/SYNTHETIC/i);
  });

  it('REVIEW fixture never covers', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new InsuranceRepository(db);
    const quote = requestCoverageQuote(repo, {
      idempotencyKey: 'oracle-wedge-quote-2',
      policyholder: { displayName: 'Wedge Demo' },
      agent: { externalRef: 'agent://wedge', label: 'wedge' },
    });
    const { policy, exposure } = acceptAndBindPolicy(repo, {
      quoteId: quote.id,
      idempotencyKey: 'oracle-wedge-accept-2',
      fundingVerified: true,
    });
    const incident = intakeObservedEvent(repo, {
      idempotencyKey: 'oracle-wedge-incident-2',
      observedEventRef: 'synthetic:oracle-liq:fixture-2',
      observedAt: new Date().toISOString(),
      source: 'synthetic-oracle-fixture',
      policyId: policy.id,
      exposureId: exposure.id,
    });

    const result = await collectAndValidateCoverage({
      repo,
      incidentId: incident.id,
      evidenceProvider: createSyntheticOracleEvidenceProvider({
        expectedOutcome: 'REVIEW',
        adapterRatioBps: 9000,
        canonicalRatioBps: 10000,
        wouldRemainHealthy: true,
        seizedMicros: '50000000',
        debtExtinguishedMicros: '0',
        deductibleMicros: '0',
      }),
      verifier: createSyntheticOracleVerifier(),
      coverageRule: createSyntheticOracleCoverageRule(),
    });

    expect(result.outcome).toBe('REVIEW');
    expect(result.covered).toBe(false);
  });
});
