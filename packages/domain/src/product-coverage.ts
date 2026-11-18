import { z } from 'zod';
import { ProductAmountSchema, sameProductAsset } from './product-definition';

const Id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
export const ExposureDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    subjectKind: z.enum(['system', 'activity', 'organization', 'person', 'physical_asset']),
    description: z.string().min(1),
    requiredFacts: z
      .array(
        z.object({ id: Id, type: z.enum(['text', 'timestamp', 'integer', 'boolean']) }).strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.requiredFacts.map((f) => f.id)).size !== value.requiredFacts.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate exposure fact' });
  });

export const ReportingConditionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('during_policy_period'),
      reportDate: z.literal('reportedAt'),
      clauseId: Id,
    })
    .strict(),
  z
    .object({
      kind: z.literal('within_days'),
      reportDate: z.literal('reportedAt'),
      days: z.number().int().positive(),
      clauseId: Id,
    })
    .strict(),
  z
    .object({
      kind: z.literal('wording_review'),
      reportDate: z.literal('reportedAt'),
      clauseId: Id,
    })
    .strict(),
]);
const base = { reporting: ReportingConditionSchema };
export const CoverageTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('occurrence'), eventDate: z.literal('eventAt') }).strict(),
  z
    .object({
      ...base,
      kind: z.literal('claims_made_and_reported'),
      claimDate: z.literal('claimFirstMadeAt'),
      retroactiveDate: z.string().datetime().optional(),
      extendedReportingDays: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('discovered_and_reported'),
      discoveryDate: z.literal('discoveredAt'),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('circumstance_notice'),
      awarenessDate: z.literal('circumstanceKnownAt'),
    })
    .strict(),
]);

export const CoverageDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    agreementId: Id,
    eventClassification: z.enum([
      'first_party_loss',
      'third_party_claim',
      'accident',
      'privacy_incident',
      'regulatory_proceeding',
    ]),
    trigger: CoverageTriggerSchema,
    requiresLiabilityAssessment: z.boolean(),
    clauses: z.array(z.object({ id: Id, text: z.string().min(1) }).strict()).min(1),
    exclusions: z.array(
      z
        .object({
          id: Id,
          clauseId: Id,
          kind: z.enum(['human_intervention', 'pre_existing', 'other']),
          enabled: z.boolean(),
          wording: z.string().min(1),
        })
        .strict(),
    ),
    limit: ProductAmountSchema,
    deductible: ProductAmountSchema,
    quantumMethod: z
      .object({
        kind: z.enum(['indemnity', 'parametric']),
        methodId: Id,
        version: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.clauses.map((c) => c.id);
    if (
      new Set(ids).size !== ids.length ||
      new Set(value.exclusions.map((e) => e.id)).size !== value.exclusions.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate clause or exclusion identity' });
    for (const id of [
      value.trigger.reporting.clauseId,
      ...value.exclusions.map((e) => e.clauseId),
    ]) {
      if (!ids.includes(id)) ctx.addIssue({ code: 'custom', message: `Unknown clause ${id}` });
    }
    if (
      !sameProductAsset(value.limit.asset, value.deductible.asset) ||
      (/^(0|[1-9][0-9]*)$/.test(value.limit.units) &&
        /^(0|[1-9][0-9]*)$/.test(value.deductible.units) &&
        BigInt(value.deductible.units) > BigInt(value.limit.units))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Deductible denomination/amount incompatible with limit',
      });
  });
export type CoverageDefinition = z.infer<typeof CoverageDefinitionSchema>;

export const EvidenceRequirementsSchema = z
  .object({
    schemaVersion: z.literal(1),
    requirements: z
      .array(
        z
          .object({
            id: Id,
            purpose: z.enum([
              'attribution',
              'trigger',
              'causation',
              'liability',
              'coverage',
              'quantum',
            ]),
            sourceKind: z.enum(['execution_log', 'chain_record', 'document', 'financial_record']),
            requiredFields: z.array(Id).min(1),
            verification: z.enum(['synthetic_attestation', 'independent_source_verification']),
            confidentiality: z.enum(['public', 'confidential', 'restricted']),
            retentionPolicyRef: Id,
            dependsOn: z.array(Id),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const rows = new Map(value.requirements.map((r) => [r.id, r]));
    if (rows.size !== value.requirements.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate requirement identity' });
    const visited = new Set<string>(),
      active = new Set<string>();
    const visit = (id: string) => {
      if (active.has(id)) {
        ctx.addIssue({ code: 'custom', message: 'Cyclic evidence requirements' });
        return;
      }
      if (visited.has(id)) return;
      const row = rows.get(id);
      if (!row) {
        ctx.addIssue({ code: 'custom', message: `Unknown evidence dependency ${id}` });
        return;
      }
      active.add(id);
      for (const dep of row.dependsOn) visit(dep);
      active.delete(id);
      visited.add(id);
    };
    for (const row of value.requirements) {
      if (new Set(row.requiredFields).size !== row.requiredFields.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate required field' });
      visit(row.id);
    }
  });
export type EvidenceRequirements = z.infer<typeof EvidenceRequirementsSchema>;

/** Missing facts stay explicit; parsing a definition never determines coverage. */
export function requiredTriggerDates(trigger: z.infer<typeof CoverageTriggerSchema>): string[] {
  switch (trigger.kind) {
    case 'occurrence':
      return ['eventAt', 'reportedAt'];
    case 'claims_made_and_reported':
      return ['claimFirstMadeAt', 'reportedAt'];
    case 'discovered_and_reported':
      return ['discoveredAt', 'reportedAt'];
    case 'circumstance_notice':
      return ['circumstanceKnownAt', 'reportedAt'];
  }
}
