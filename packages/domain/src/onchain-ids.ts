import type { CoverageTerms } from './terms';
import { encodeTerms } from './serialize';

/**
 * Canonical terms payload used for on-chain termsHash commitments.
 * Keep field order stable — hash consumers depend on this encoding.
 */
export function canonicalTermsPayload(terms: CoverageTerms): string {
  return encodeTerms({
    version: terms.version,
    productCode: terms.productCode,
    productVersion: terms.productVersion,
    coveredEventClass: terms.coveredEventClass,
    limitMicros: terms.limitMicros,
    premiumMicros: terms.premiumMicros,
    deductibleMicros: terms.deductibleMicros,
    coverageStartsAt: terms.coverageStartsAt,
    coverageEndsAt: terms.coverageEndsAt,
    waitingPeriodSeconds: terms.waitingPeriodSeconds,
    synthetic: terms.synthetic,
    notes: terms.notes,
  });
}

/** Off-chain policy UUID used as preimage for bytes32 policyId. */
export function policyIdPreimage(policyEntityId: string): string {
  return `arcuex:policy:${policyEntityId}`;
}
