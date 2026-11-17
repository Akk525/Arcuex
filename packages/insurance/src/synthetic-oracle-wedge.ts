import {
  newId,
  outcomeAllowsCoverage,
  type CoverageRule,
  type EvidenceProvider,
  type IncidentVerifier,
  type TriStateOutcome,
} from '@arcuex/domain';

/**
 * Synthetic oracle-ratio liquidation demonstration wedge.
 * Labeled synthetic only — never proof of a real-world loss.
 * Research recommendation (coverage-wedges decision brief) — implemented via
 * existing EvidenceProvider / IncidentVerifier / CoverageRule interfaces only.
 */
export const SYNTHETIC_ORACLE_WEDGE_ID = 'synthetic-oracle-ratio-v1';

export type SyntheticOracleFixture = {
  /** VERIFIED | REJECTED | REVIEW */
  expectedOutcome: TriStateOutcome;
  /** Adapter understated ratio vs canonical (basis points). */
  adapterRatioBps: number;
  canonicalRatioBps: number;
  wouldRemainHealthy: boolean;
  seizedMicros: string;
  debtExtinguishedMicros: string;
  deductibleMicros: string;
};

function fact(
  bundleId: string,
  key: string,
  value: string,
  observedAt: string,
) {
  return {
    id: newId(),
    bundleId,
    key,
    value,
    provenance: 'synthetic-oracle-fixture',
    observedAt,
  };
}

export function createSyntheticOracleEvidenceProvider(
  fixture: SyntheticOracleFixture,
): EvidenceProvider {
  return {
    id: SYNTHETIC_ORACLE_WEDGE_ID,
    async collect({ incident }) {
      const bundle = {
        id: newId(),
        incidentId: incident.id,
        collector: SYNTHETIC_ORACLE_WEDGE_ID,
        createdAt: new Date().toISOString(),
      };
      const at = incident.observedAt;
      const facts = [
        fact(bundle.id, 'mode', 'synthetic', at),
        fact(bundle.id, 'product_code', 'oracle-ratio-v1', at),
        fact(bundle.id, 'wedge_label', 'SYNTHETIC oracle adapter error — not a real-world loss', at),
        fact(bundle.id, 'expected_outcome', fixture.expectedOutcome, at),
        fact(bundle.id, 'adapter_ratio_bps', String(fixture.adapterRatioBps), at),
        fact(bundle.id, 'canonical_ratio_bps', String(fixture.canonicalRatioBps), at),
        fact(bundle.id, 'would_remain_healthy', fixture.wouldRemainHealthy ? 'true' : 'false', at),
        fact(bundle.id, 'seized_micros', fixture.seizedMicros, at),
        fact(bundle.id, 'debt_extinguished_micros', fixture.debtExtinguishedMicros, at),
        fact(bundle.id, 'deductible_micros', fixture.deductibleMicros, at),
        fact(bundle.id, 'observed_event_ref', incident.observedEventRef, at),
      ];
      return { bundle, facts };
    },
  };
}

export function createSyntheticOracleVerifier(): IncidentVerifier {
  return {
    id: `${SYNTHETIC_ORACLE_WEDGE_ID}:verifier`,
    async verify({ facts }) {
      const mode = facts.find((f) => f.key === 'mode')?.value;
      if (mode !== 'synthetic') {
        return {
          verified: false,
          outcome: 'REJECTED',
          reason: 'Synthetic oracle verifier rejects non-synthetic evidence envelopes',
        };
      }
      const expected = facts.find((f) => f.key === 'expected_outcome')?.value as
        | TriStateOutcome
        | undefined;
      if (!expected || !['VERIFIED', 'REJECTED', 'REVIEW'].includes(expected)) {
        return {
          verified: false,
          outcome: 'REVIEW',
          reason: 'Missing or invalid expected_outcome — routed to REVIEW',
        };
      }
      if (expected === 'REVIEW') {
        return {
          verified: false,
          outcome: 'REVIEW',
          reason: 'SYNTHETIC fixture requests REVIEW — no automatic coverage',
        };
      }
      if (expected === 'REJECTED') {
        return {
          verified: false,
          outcome: 'REJECTED',
          reason: 'SYNTHETIC fixture rejected (e.g. healthy position / invalid ratios)',
        };
      }
      const healthy = facts.find((f) => f.key === 'would_remain_healthy')?.value === 'true';
      const adapter = Number(facts.find((f) => f.key === 'adapter_ratio_bps')?.value ?? '0');
      const canonical = Number(facts.find((f) => f.key === 'canonical_ratio_bps')?.value ?? '0');
      if (!healthy || !(adapter < canonical)) {
        return {
          verified: false,
          outcome: 'REJECTED',
          reason: 'Causal replay conditions not met for synthetic oracle liquidation',
        };
      }
      return {
        verified: true,
        outcome: 'VERIFIED',
        reason:
          'SYNTHETIC verification only — adapter understated ratio and replay shows wrongful liquidation. Not external loss proof.',
      };
    },
  };
}

export function createSyntheticOracleCoverageRule(): CoverageRule {
  return {
    id: `${SYNTHETIC_ORACLE_WEDGE_ID}:rule`,
    async evaluate({ terms, facts }) {
      if (!terms.synthetic) {
        return {
          covered: false,
          outcome: 'REJECTED',
          reason: 'Synthetic oracle rule only applies to synthetic terms',
        };
      }
      const mode = facts.find((f) => f.key === 'mode')?.value;
      if (mode !== 'synthetic') {
        return {
          covered: false,
          outcome: 'REJECTED',
          reason: 'Refusing non-synthetic evidence for synthetic oracle rule',
        };
      }
      const expected = (facts.find((f) => f.key === 'expected_outcome')?.value ??
        'REVIEW') as TriStateOutcome;
      if (!outcomeAllowsCoverage(expected)) {
        return {
          covered: false,
          outcome: expected,
          reason: `Outcome ${expected} does not authorize coverage`,
        };
      }
      const seized = BigInt(facts.find((f) => f.key === 'seized_micros')?.value ?? '0');
      const debt = BigInt(facts.find((f) => f.key === 'debt_extinguished_micros')?.value ?? '0');
      const deductible = BigInt(facts.find((f) => f.key === 'deductible_micros')?.value ?? '0');
      let payable = seized - debt - deductible;
      if (payable < 0n) payable = 0n;
      if (payable > terms.limitMicros) payable = terms.limitMicros;
      if (payable === 0n) {
        return {
          covered: false,
          outcome: 'REJECTED',
          reason: 'Net synthetic loss is zero after debt/deductible',
        };
      }
      return {
        covered: true,
        outcome: 'VERIFIED',
        reason:
          'SYNTHETIC payable = seized - debt - deductible, capped by limit (demo only)',
        payableMicros: payable,
      };
    },
  };
}
