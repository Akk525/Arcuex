import { z } from 'zod';
import { PROCUREMENT_PRODUCT } from './procurement';
import {
  artifactDigest,
  canonicalProductJson,
  freezeProductContent,
  snapshotProduct,
  type InsuranceProduct,
} from './product-definition';
import {
  CoverageDefinitionSchema,
  EvidenceRequirementsSchema,
  ExposureDefinitionSchema,
} from './product-coverage';

const WordingSchema = z.object({ schemaVersion: z.literal(1), text: z.string().min(1) }).strict();
export const ProductArtifactsSchema = z
  .object({
    exposure: ExposureDefinitionSchema,
    coverage: CoverageDefinitionSchema,
    evidence: EvidenceRequirementsSchema,
    wording: WordingSchema,
  })
  .strict();
export type ProductArtifacts = z.infer<typeof ProductArtifactsSchema>;

export function defineProductTemplate(
  identity: Pick<
    InsuranceProduct,
    'organizationId' | 'productId' | 'version' | 'name' | 'description' | 'synthetic'
  >,
  input: unknown,
) {
  const artifacts = ProductArtifactsSchema.parse(input);
  const reference = (kind: keyof ProductArtifacts) => ({
    kind,
    id: `${identity.productId}.${kind}`,
    version: identity.version,
    digest: artifactDigest(kind, artifacts[kind]),
  });
  const product = snapshotProduct({
    schemaVersion: 1,
    ...identity,
    exposure: reference('exposure'),
    coverage: reference('coverage'),
    evidence: reference('evidence'),
    wording: reference('wording'),
  });
  return freezeProductContent({ product, artifacts });
}
export type ProductTemplate = ReturnType<typeof defineProductTemplate>;

/** Resolve the complete bundle and refuse substituted content or unresolved capabilities. */
export function validateProductTemplate(input: ProductTemplate): ProductTemplate {
  const product = snapshotProduct(input.product.content);
  const artifacts = ProductArtifactsSchema.parse(input.artifacts);
  if (
    product.digest !== input.product.digest ||
    canonicalProductJson(product.reference) !== canonicalProductJson(input.product.reference)
  )
    throw new Error('Product snapshot mismatch');
  if (product.content.underwriting || product.content.workflow)
    throw new Error('Unresolved optional capability reference');
  for (const kind of ['exposure', 'coverage', 'evidence', 'wording'] as const) {
    const ref = product.content[kind];
    if (
      ref.id !== `${product.content.productId}.${kind}` ||
      ref.version !== product.content.version ||
      ref.digest !== artifactDigest(kind, artifacts[kind])
    )
      throw new Error(`Artifact mismatch: ${kind}`);
  }
  return freezeProductContent({ product, artifacts });
}

export function oracleProductTemplate() {
  const asset = {
    kind: 'token',
    chainId: 5042002,
    address: '0x3600000000000000000000000000000000000000',
    scale: 6,
  };
  return defineProductTemplate(
    {
      organizationId: 'synthetic-lab',
      productId: PROCUREMENT_PRODUCT.code,
      version: 1,
      name: PROCUREMENT_PRODUCT.name,
      description: 'Descriptive compatibility template; existing runtime remains authoritative.',
      synthetic: true,
    },
    {
      exposure: {
        schemaVersion: 1,
        subjectKind: 'activity',
        description: PROCUREMENT_PRODUCT.protocol,
        requiredFacts: [
          { id: 'position', type: 'text' },
          { id: 'notionalMicros', type: 'integer' },
        ],
      },
      coverage: {
        schemaVersion: 1,
        agreementId: 'oracle-liquidation',
        eventClassification: 'first_party_loss',
        requiresLiabilityAssessment: false,
        trigger: {
          kind: 'occurrence',
          eventDate: 'eventAt',
          reporting: { kind: 'wording_review', reportDate: 'reportedAt', clauseId: 'demo-terms' },
        },
        clauses: [{ id: 'demo-terms', text: PROCUREMENT_PRODUCT.event }],
        exclusions: PROCUREMENT_PRODUCT.exclusions.map((wording, i) => ({
          id: `exclusion-${i + 1}`,
          clauseId: 'demo-terms',
          kind: i === 0 ? 'pre_existing' : 'other',
          wording,
          enabled: true,
        })),
        limit: { units: '1000000', asset },
        deductible: { units: '100000', asset },
        quantumMethod: { kind: 'indemnity', methodId: 'synthetic-oracle-net-loss-v1', version: 1 },
      },
      evidence: {
        schemaVersion: 1,
        requirements: [
          {
            id: 'oracle-replay',
            purpose: 'causation',
            sourceKind: 'chain_record',
            requiredFields: ['adapterRatioBps', 'canonicalRatioBps', 'wouldRemainHealthy'],
            verification: 'synthetic_attestation',
            confidentiality: 'public',
            retentionPolicyRef: 'synthetic-test-only',
            dependsOn: [],
          },
        ],
      },
      wording: {
        schemaVersion: 1,
        text: `${PROCUREMENT_PRODUCT.event}\n${PROCUREMENT_PRODUCT.exclusions.join('\n')}\n${PROCUREMENT_PRODUCT.limitations}`,
      },
    },
  );
}

export function bankDisputeProductTemplate(humanInterventionExcluded = true) {
  const asset = { kind: 'currency', code: 'USD', scale: 2 };
  return defineProductTemplate(
    {
      organizationId: 'synthetic-lab',
      productId: 'BANK_DISPUTE_AI_LIABILITY_DEMO',
      version: humanInterventionExcluded ? 1 : 2,
      name: 'Bank dispute AI liability scenario',
      description:
        'Synthetic, unapproved wording for examiner tests. No insurance offer, legal determination or payment rail.',
      synthetic: true,
    },
    {
      exposure: {
        schemaVersion: 1,
        subjectKind: 'system',
        description: 'Bank dispute-resolution system',
        requiredFacts: [
          { id: 'insuredBank', type: 'text' },
          { id: 'systemId', type: 'text' },
        ],
      },
      coverage: {
        schemaVersion: 1,
        agreementId: 'ai-decision-liability',
        eventClassification: 'third_party_claim',
        requiresLiabilityAssessment: true,
        trigger: {
          kind: 'claims_made_and_reported',
          claimDate: 'claimFirstMadeAt',
          reporting: { kind: 'during_policy_period', reportDate: 'reportedAt', clauseId: 'notice' },
        },
        clauses: [
          {
            id: 'notice',
            text: 'Synthetic specimen: claim first made and reported in the specified period; actual wording requires review.',
          },
          {
            id: 'human-action',
            text: 'Synthetic specimen human-intervention condition; exact wording and applicability require adjuster review.',
          },
        ],
        exclusions: [
          {
            id: 'human-intervention',
            clauseId: 'human-action',
            kind: 'human_intervention',
            enabled: humanInterventionExcluded,
            wording:
              'Loss attributed to a human overriding an AI recommendation may fall outside the specimen agreement or exclusion, subject to full policy and causation review.',
          },
        ],
        limit: { units: '100000000', asset },
        deductible: { units: '10000', asset },
        quantumMethod: {
          kind: 'indemnity',
          methodId: 'individually-assessed-net-loss',
          version: 1,
        },
      },
      evidence: {
        schemaVersion: 1,
        requirements: [
          {
            id: 'case-audit',
            purpose: 'attribution',
            sourceKind: 'execution_log',
            requiredFields: [
              'aiRecommendation',
              'finalDecision',
              'actingPrincipal',
              'recommendedAt',
              'decidedAt',
              'modelVersion',
              'source',
            ],
            verification: 'synthetic_attestation',
            confidentiality: 'restricted',
            retentionPolicyRef: 'synthetic-test-only',
            dependsOn: [],
          },
        ],
      },
      wording: {
        schemaVersion: 1,
        text: 'SYNTHETIC unapproved liability specimen. Regulatory fines, compensation, recoveries and expenses require individual legal, coverage and quantum assessment. Evidence attribution is not proven causation or fraud.',
      },
    },
  );
}
