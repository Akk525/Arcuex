import { verify } from 'node:crypto';
import { z } from 'zod';
import { canonicalProductJson, artifactDigest, ProductAmountSchema } from '@arcuex/domain';

const Id = z.string().min(1).max(160);
const Timestamp = z.string().datetime();
const common = {
  eventId: Id,
  caseId: Id,
  sourceId: Id,
  occurredAt: Timestamp,
  recordedAt: Timestamp,
};
const principal = z.object({ id: Id, kind: z.enum(['ai', 'human']) }).strict();
export const LossCategorySchema = z.enum([
  'compensation',
  'regulatory_fines',
  'recoveries',
  'expenses',
]);
export type LossCategory = z.infer<typeof LossCategorySchema>;
export const BankObservationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('recommendation'),
      decision: z.enum(['approve', 'deny']),
      actingPrincipal: principal.extend({ kind: z.literal('ai') }),
      modelVersion: Id,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('final_decision'),
      decision: z.enum(['approve', 'deny']),
      actingPrincipal: principal,
      modelVersion: Id,
      recommendationEventId: Id,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('loss_assessment'),
      category: LossCategorySchema,
      amount: ProductAmountSchema,
      basis: z.enum(['synthetic_assessed', 'claimed_only', 'unknown']),
      supportingEvidenceRefs: z.array(Id).min(1),
    })
    .strict(),
]);
export type BankObservation = z.infer<typeof BankObservationSchema>;
export const SignedBankObservationSchema = z
  .object({
    observation: BankObservationSchema,
    signature: z
      .string()
      .min(1)
      .max(2000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type SignedBankObservation = z.infer<typeof SignedBankObservationSchema>;
export const BankCaseSubmissionSchema = z
  .object({ caseId: Id, assertedCause: z.enum(['ai_only', 'human', 'unknown']) })
  .strict();
export type BankCaseSubmission = z.infer<typeof BankCaseSubmissionSchema>;

/** Trust roots are supplied by the fixture operator, not taken from an evidence item. */
export type SyntheticEvidenceSource = {
  id: string;
  publicKeyPem: string;
  syntheticOnly: true;
  permittedKinds: BankObservation['kind'][];
};

export function observationSigningBytes(observation: BankObservation): Buffer {
  return Buffer.from(
    canonicalProductJson({ profile: 'arcuex.synthetic-bank-evidence.v1', observation }),
  );
}
export function verifySyntheticObservation(
  item: SignedBankObservation,
  trustedSources: ReadonlyMap<string, SyntheticEvidenceSource>,
): boolean {
  const source = trustedSources.get(item.observation.sourceId);
  if (!source?.syntheticOnly || !source.permittedKinds.includes(item.observation.kind))
    return false;
  try {
    return verify(
      null,
      observationSigningBytes(item.observation),
      source.publicKeyPem,
      Buffer.from(item.signature, 'base64'),
    );
  } catch {
    return false;
  }
}
export function observationReference(observation: BankObservation) {
  return {
    eventId: observation.eventId,
    sourceId: observation.sourceId,
    digest: artifactDigest('evidence', observation),
  };
}
