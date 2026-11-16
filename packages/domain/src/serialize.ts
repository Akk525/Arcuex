import { CoverageTermsSchema, type CoverageTerms } from './terms';

/** JSON-safe terms encoding (bigints as decimal strings). */
export function encodeTerms(terms: CoverageTerms): string {
  return JSON.stringify(terms, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

export function decodeTerms(json: string): CoverageTerms {
  const raw = JSON.parse(json) as Record<string, unknown>;
  return CoverageTermsSchema.parse({
    ...raw,
    limitMicros: BigInt(String(raw.limitMicros)),
    premiumMicros: BigInt(String(raw.premiumMicros)),
    deductibleMicros: BigInt(String(raw.deductibleMicros)),
  });
}
