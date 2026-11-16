import {
  newId,
  type CoverageRule,
  type EvidenceProvider,
  type IncidentVerifier,
} from '@arcuex/domain';

/**
 * Demo evidence provider — clearly synthetic attestations, not financial proofs.
 */
export function createSyntheticEvidenceProvider(): EvidenceProvider {
  return {
    id: 'synthetic-evidence-v1',
    async collect({ incident }) {
      const bundle = {
        id: newId(),
        incidentId: incident.id,
        collector: 'synthetic-evidence-v1',
        createdAt: new Date().toISOString(),
      };
      const facts = [
        {
          id: newId(),
          bundleId: bundle.id,
          key: 'observed_event_ref',
          value: incident.observedEventRef,
          provenance: 'synthetic-demo',
          observedAt: incident.observedAt,
        },
        {
          id: newId(),
          bundleId: bundle.id,
          key: 'demo_flag',
          value: 'true',
          provenance: 'synthetic-demo',
          observedAt: incident.observedAt,
        },
      ];
      return { bundle, facts };
    },
  };
}

export function createPassthroughVerifier(): IncidentVerifier {
  return {
    id: 'passthrough-verifier-v1',
    async verify({ facts }) {
      const demo = facts.find((f) => f.key === 'demo_flag' && f.value === 'true');
      if (!demo) {
        return { verified: false, reason: 'Missing synthetic demo evidence flag' };
      }
      return {
        verified: true,
        reason: 'Synthetic verifier accepted demo evidence (not a production attestation)',
      };
    },
  };
}

export function createLimitCoverageRule(): CoverageRule {
  return {
    id: 'limit-rule-v1',
    async evaluate({ terms, incident }) {
      if (terms.synthetic !== true) {
        return { covered: false, reason: 'Only synthetic terms are enabled in demo' };
      }
      if (incident.status !== 'evidenced' && incident.status !== 'validated') {
        return { covered: false, reason: 'Incident not evidenced' };
      }
      return {
        covered: true,
        reason: 'SYNTHETIC rule: evidenced incident under synthetic terms',
        payableMicros: terms.limitMicros,
      };
    },
  };
}
