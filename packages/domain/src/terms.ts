import { z } from 'zod';
import { UsdcMicrosSchema } from './money';

/**
 * Immutable coverage terms snapshot. Once attached to a quote or policy,
 * fields must not be mutated — create a new version instead.
 */
export const CoverageTermsSchema = z.object({
  version: z.number().int().positive(),
  productCode: z.string().min(1),
  productVersion: z.string().min(1),
  /** Policy-agnostic event class label (e.g. "financial_loss"); not a wedge lock-in. */
  coveredEventClass: z.string().min(1),
  limitMicros: UsdcMicrosSchema,
  premiumMicros: UsdcMicrosSchema,
  deductibleMicros: UsdcMicrosSchema,
  coverageStartsAt: z.string().datetime(),
  coverageEndsAt: z.string().datetime(),
  waitingPeriodSeconds: z.number().int().nonnegative(),
  synthetic: z.boolean(),
  notes: z.string().default(''),
});

export type CoverageTerms = z.infer<typeof CoverageTermsSchema>;

export function parseCoverageTerms(input: unknown): CoverageTerms {
  const terms = CoverageTermsSchema.parse(input);
  if (Date.parse(terms.coverageEndsAt) <= Date.parse(terms.coverageStartsAt)) {
    throw new Error('coverageEndsAt must be after coverageStartsAt');
  }
  return terms;
}

export function freezeTerms(terms: CoverageTerms): Readonly<CoverageTerms> {
  return Object.freeze({ ...terms });
}
