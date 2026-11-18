import { describe, expect, it } from 'vitest';
import {
  CoverageDefinitionSchema,
  EvidenceRequirementsSchema,
  requiredTriggerDates,
} from './product-coverage';
import {
  bankDisputeProductTemplate,
  oracleProductTemplate,
  validateProductTemplate,
  type ProductArtifacts,
} from './product-templates';
import { PROCUREMENT_PRODUCT } from './procurement';

describe('concrete coverage and evidence contracts', () => {
  it('models materially different first-party Arc and bank-liability products', () => {
    const oracle = validateProductTemplate(oracleProductTemplate()),
      bank = validateProductTemplate(bankDisputeProductTemplate());
    expect(oracle.artifacts.coverage.eventClassification).toBe('first_party_loss');
    expect(bank.artifacts.coverage.requiresLiabilityAssessment).toBe(true);
    expect(bank.artifacts.coverage.limit.asset.kind).toBe('currency');
    expect(requiredTriggerDates(bank.artifacts.coverage.trigger)).toEqual([
      'claimFirstMadeAt',
      'reportedAt',
    ]);
    expect(requiredTriggerDates(oracle.artifacts.coverage.trigger)).toEqual([
      'eventAt',
      'reportedAt',
    ]);
    expect(oracle.artifacts.coverage.clauses[0]!.text).toBe(PROCUREMENT_PRODUCT.event);
    expect(oracle.artifacts.coverage.exclusions.map((e) => e.wording)).toEqual(
      PROCUREMENT_PRODUCT.exclusions,
    );
  });
  it('rejects undefined clauses, asset mixing and executable conditions', () => {
    const coverage = bankDisputeProductTemplate().artifacts.coverage;
    expect(() =>
      CoverageDefinitionSchema.parse({
        ...coverage,
        exclusions: [{ ...coverage.exclusions[0], clauseId: 'missing' }],
      }),
    ).toThrow();
    expect(() =>
      CoverageDefinitionSchema.parse({
        ...coverage,
        deductible: { ...coverage.deductible, asset: { kind: 'currency', code: 'EUR', scale: 2 } },
      }),
    ).toThrow();
    expect(() =>
      CoverageDefinitionSchema.parse({
        ...coverage,
        trigger: { ...coverage.trigger, evaluate: 'return true' },
      }),
    ).toThrow();
  });
  it('refuses content substitution even when envelope and ref appear valid', () => {
    const source = bankDisputeProductTemplate();
    const changed = { ...source, artifacts: structuredClone(source.artifacts) as ProductArtifacts };
    changed.artifacts.coverage.exclusions[0]!.enabled = false;
    expect(() => validateProductTemplate(changed)).toThrow('Artifact mismatch');
    expect(bankDisputeProductTemplate(false).product.digest).not.toBe(source.product.digest);
  });
  it('rejects duplicate and cyclic evidence requirements and unrecognized verification', () => {
    const requirement = bankDisputeProductTemplate().artifacts.evidence.requirements[0]!;
    for (const requirements of [
      [requirement, requirement],
      [{ ...requirement, dependsOn: [requirement.id] }],
      [{ ...requirement, dependsOn: ['absent'] }],
      [{ ...requirement, verification: 'LLM_CONFIDENT' }],
    ]) {
      expect(() => EvidenceRequirementsSchema.parse({ schemaVersion: 1, requirements })).toThrow();
    }
  });
});
