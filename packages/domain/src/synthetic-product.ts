import type { CoverageProduct } from './entities';
import { newId } from './ids';
import { parseUsdcDecimal, usdcMicros } from './money';
import { freezeTerms, parseCoverageTerms, type CoverageTerms } from './terms';

/**
 * Clearly labeled synthetic underwriting product for testnet / demo flows.
 * Not production pricing. Wedge-agnostic covered event class.
 */
export const SYNTHETIC_PRODUCT_CODE = 'ARCUE_X_SYNTHETIC_V1';

export function createSyntheticCoverageProduct(): CoverageProduct {
  return {
    id: newId(),
    code: SYNTHETIC_PRODUCT_CODE,
    name: 'Arcuex Synthetic Financial Protection (Demo)',
    version: '1.0.0',
    coveredEventClass: 'financial_loss',
    synthetic: true,
    active: true,
    description:
      'SYNTHETIC / NON-PRODUCTION underwriting template. Flat demo premium and limit for quote-to-bind testing. Not actuarial pricing.',
  };
}

export function buildSyntheticTerms(input: {
  coverageStartsAt: string;
  coverageEndsAt: string;
  limitUsdc?: string;
  premiumUsdc?: string;
}): Readonly<CoverageTerms> {
  const terms = parseCoverageTerms({
    version: 1,
    productCode: SYNTHETIC_PRODUCT_CODE,
    productVersion: '1.0.0',
    coveredEventClass: 'financial_loss',
    limitMicros: parseUsdcDecimal(input.limitUsdc ?? '100.000000'),
    premiumMicros: parseUsdcDecimal(input.premiumUsdc ?? '1.000000'),
    deductibleMicros: usdcMicros(0n),
    coverageStartsAt: input.coverageStartsAt,
    coverageEndsAt: input.coverageEndsAt,
    waitingPeriodSeconds: 0,
    synthetic: true,
    notes: 'SYNTHETIC TERMS — demo only, not real insurance issuance.',
  });
  return freezeTerms(terms);
}
