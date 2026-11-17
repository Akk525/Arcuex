import type { EvidenceBundle, EvidenceFact, Incident, Policy } from './entities';
import type { UsdcMicros } from './money';
import type { CoverageTerms } from './terms';
import type { TriStateOutcome } from './outcomes';


/**
 * Pluggable coverage rule — wedge-agnostic predicate over terms + incident + evidence.
 * `outcome` is preferred; `covered` remains for backward-compatible callers.
 */
export interface CoverageRule {
  readonly id: string;
  evaluate(input: {
    policy: Policy;
    terms: CoverageTerms;
    incident: Incident;
    facts: readonly EvidenceFact[];
  }): Promise<{
    covered: boolean;
    outcome?: TriStateOutcome;
    reason: string;
    payableMicros?: UsdcMicros;
  }>;
}

/**
 * Separates observed activity from verified covered events.
 * Implementations must not authorize money movement.
 * Prefer `outcome`; `verified === true` only when outcome is VERIFIED.
 */
export interface IncidentVerifier {
  readonly id: string;
  verify(input: {
    incident: Incident;
    facts: readonly EvidenceFact[];
  }): Promise<{ verified: boolean; outcome?: TriStateOutcome; reason: string }>;
}

/**
 * External evidence collection. Attestations are inputs to rules/verifiers,
 * never sole authorization for transfers.
 */
export interface EvidenceProvider {
  readonly id: string;
  collect(input: {
    incident: Incident;
  }): Promise<{ bundle: EvidenceBundle; facts: EvidenceFact[] }>;
}
