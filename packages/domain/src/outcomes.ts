import { z } from 'zod';

/**
 * Tri-state coverage/evidence outcome.
 * REVIEW must never authorize payouts or be treated as VERIFIED external loss.
 */
export const TriStateOutcomeSchema = z.enum(['VERIFIED', 'REJECTED', 'REVIEW']);
export type TriStateOutcome = z.infer<typeof TriStateOutcomeSchema>;

export function outcomeAllowsCoverage(outcome: TriStateOutcome): boolean {
  return outcome === 'VERIFIED';
}
