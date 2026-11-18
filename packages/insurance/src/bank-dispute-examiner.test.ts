import { describe, expect, it } from 'vitest';
import { bankDisputeProductTemplate, defineProductTemplate } from '@arcuex/domain';
import { examineBankDisputes } from './bank-dispute-examiner';
import { createSyntheticBankAttestors, syntheticBankDisputeFixture } from './bank-dispute-fixture';
import type { SignedBankObservation } from './bank-dispute-evidence';

function resignFixture() {
  const data = syntheticBankDisputeFixture(4, 3),
    signer = createSyntheticBankAttestors();
  return {
    ...data,
    observations: data.observations.map((o) => signer.attest(o.observation)),
    trustedSources: signer.trustedSources,
    signer,
  };
}
const firstCase = 'dispute-00001';

describe('synthetic enterprise-AI read-only examination', () => {
  it('identifies 1350 overrides from 1800 authenticated case records without using fixture counts', () => {
    const data = syntheticBankDisputeFixture();
    const actualOverrideIds = data.observations
      .filter((o) => {
        const final = o.observation;
        if (
          final.kind !== 'final_decision' ||
          final.actingPrincipal.kind !== 'human' ||
          final.decision !== 'deny'
        )
          return false;
        return data.observations.some(
          (r) =>
            r.observation.kind === 'recommendation' &&
            r.observation.eventId === final.recommendationEventId &&
            r.observation.decision === 'approve',
        );
      })
      .map((o) => o.observation.caseId)
      .sort();
    const result = examineBankDisputes(data);
    expect(result.summary.examinedCases).toBe(1800);
    expect(result.summary.attributionCounts).toEqual({
      recorded_human_override: 1350,
      recorded_ai_denial: 450,
      other_recorded_action: 0,
      uncertain: 0,
    });
    expect(
      result.findings
        .filter((f) => f.recordedAttribution === 'recorded_human_override')
        .map((f) => f.caseId),
    ).toEqual(actualOverrideIds);
    expect(result.summary.potentiallyEligiblePendingChecks).toBe(450);
    expect(result.summary.uncertainEvidenceCases).toBe(0);
    expect(result.reviewDossier.recommendation).toBe('REFER_ADJUSTER_AND_SIU');
    expect(
      result.findings.every(
        (f) =>
          f.causation === 'not_established' &&
          f.fraud === 'not_determined' &&
          f.settlementAuthorization === 'none',
      ),
    ).toBe(true);
    expect(Object.values(result.financialActions).every((v) => v === false)).toBe(true);
    expect(result.findings[0]!.execution.finalDecision?.actingPrincipal.kind).toBe('human');
    expect(result.findings[0]!.execution.recommendation?.modelVersion).toBe('synthetic-model-v1');
  }, 20000);
  it('derives classifications for different fixture populations and changed actual decisions', () => {
    const data = resignFixture();
    const changed = data.observations.map((item) =>
      item.observation.kind === 'final_decision' && item.observation.caseId === firstCase
        ? data.signer.attest({
            ...item.observation,
            actingPrincipal: { id: 'dispute-agent', kind: 'ai' },
          })
        : item,
    );
    const result = examineBankDisputes({ ...data, observations: changed });
    expect(result.summary.attributionCounts.recorded_human_override).toBe(2);
    expect(result.summary.attributionCounts.other_recorded_action).toBe(1);
    expect(
      examineBankDisputes(syntheticBankDisputeFixture(8, 2)).summary.attributionCounts
        .recorded_human_override,
    ).toBe(2);
  });
  it('changes wording-dependent preliminary findings without changing attribution or quantum', () => {
    const data = syntheticBankDisputeFixture(4, 3);
    const excluded = examineBankDisputes(data),
      revised = examineBankDisputes({ ...data, template: bankDisputeProductTemplate(false) });
    expect(excluded.findings[0]!.preliminaryCoverage).toBe(
      'potential_human_intervention_exclusion',
    );
    expect(revised.findings[0]!.preliminaryCoverage).toBe(
      'no_enabled_human_intervention_exclusion',
    );
    expect(revised.summary.attributionCounts).toEqual(excluded.summary.attributionCounts);
    expect(revised.findings.map((f) => f.candidateEconomicNetUnits)).toEqual(
      excluded.findings.map((f) => f.candidateEconomicNetUnits),
    );
    expect(revised.findings.every((f) => f.settlementAuthorization === 'none')).toBe(true);
  });
  it('surfaces missing, duplicated, forged, contradictory and schema-invalid execution evidence', () => {
    const data = resignFixture();
    const final = data.observations.find(
      (o) => o.observation.caseId === firstCase && o.observation.kind === 'final_decision',
    )!;
    if (final.observation.kind !== 'final_decision') throw new Error('Fixture');
    const replacements: readonly unknown[][] = [
      data.observations.filter((o) => o !== final),
      [...data.observations, final],
      data.observations.map((o) =>
        o === final
          ? { ...final, observation: { ...final.observation, modelVersion: 'tampered' } }
          : o,
      ),
      data.observations.map((o) =>
        o === final
          ? data.signer.attest({ ...final.observation, recommendationEventId: 'wrong-link' })
          : o,
      ),
      [
        ...data.observations,
        data.signer.attest({
          ...final.observation,
          eventId: 'conflicting-final',
          decision: 'approve',
        }),
      ],
      data.observations.map((o) =>
        o === final
          ? { ...final, observation: { ...final.observation, actingPrincipal: undefined } }
          : o,
      ),
      data.observations.map((o) =>
        o === final
          ? data.signer.attest({ ...final.observation, recordedAt: '2026-10-01T00:00:00.000Z' })
          : o,
      ),
    ];
    for (const observations of replacements) {
      const result = examineBankDisputes({ ...data, observations });
      expect(result.findings[0]!.recordedAttribution).toBe('uncertain');
      expect(result.findings[0]!.uncertainty.length).toBeGreaterThan(0);
      expect(result.findings[0]!.preliminaryCoverage).toBe('not_assessed_due_to_uncertainty');
      expect(result.financialActions.payment).toBe(false);
    }
  });
  it('does not accept a self-declared signing identity or an unapproved source capability', () => {
    const data = resignFixture();
    const sources = data.trustedSources.map((s) => ({
      ...s,
      permittedKinds: s.id === 'synthetic-bank-audit' ? [] : s.permittedKinds,
    }));
    expect(
      examineBankDisputes({ ...data, trustedSources: sources }).summary.attributionCounts.uncertain,
    ).toBe(4);
    const attacker = createSyntheticBankAttestors();
    const forged: SignedBankObservation[] = data.observations.map((o) =>
      attacker.attest(o.observation),
    );
    expect(
      examineBankDisputes({ ...data, observations: forged }).summary.attributionCounts.uncertain,
    ).toBe(4);
    expect(() =>
      examineBankDisputes({
        ...data,
        trustedSources: [...data.trustedSources, data.trustedSources[0]!],
      }),
    ).toThrow('Ambiguous');
  });
  it('computes differentiated economic loss categories, keeping fines outside candidate net loss', () => {
    const data = resignFixture(),
      result = examineBankDisputes(data);
    expect(result.findings.slice(0, 3).map((f) => f.candidateEconomicNetUnits)).toEqual([
      '10200',
      '10278',
      '10356',
    ]);
    expect(
      result.findings[0]!.lossCategories.find((q) => q.category === 'regulatory_fines'),
    ).toMatchObject({ status: 'claimed_only', units: '500' });
    const changed = data.observations.map((o) =>
      o.observation.kind === 'loss_assessment' &&
      o.observation.category === 'compensation' &&
      o.observation.caseId === firstCase
        ? data.signer.attest({
            ...o.observation,
            amount: { ...o.observation.amount, units: '90000' },
          })
        : o,
    );
    const revised = examineBankDisputes({ ...data, observations: changed });
    expect(revised.findings[0]!.candidateEconomicNetUnits).toBe('90200');
    expect(revised.findings[1]!.candidateEconomicNetUnits).toBe('10278');
    expect(revised.financialActions.reserveChange).toBe(false);
  });
  it('keeps unknown recoveries, duplicated categories and unsupported assets unresolved', () => {
    const data = resignFixture();
    const recovery = data.observations.find(
      (o) =>
        o.observation.kind === 'loss_assessment' &&
        o.observation.caseId === firstCase &&
        o.observation.category === 'recoveries',
    )!;
    if (recovery.observation.kind !== 'loss_assessment') throw new Error('Fixture');
    const variants = [
      data.observations.filter((o) => o !== recovery),
      [...data.observations, recovery],
      data.observations.map((o) =>
        o === recovery ? data.signer.attest({ ...recovery.observation, basis: 'unknown' }) : o,
      ),
      data.observations.map((o) =>
        o === recovery
          ? data.signer.attest({
              ...recovery.observation,
              amount: {
                ...recovery.observation.amount,
                asset: { kind: 'currency', code: 'EUR', scale: 2 },
              },
            })
          : o,
      ),
    ];
    for (const observations of variants) {
      const result = examineBankDisputes({ ...data, observations });
      expect(result.findings[0]!.candidateEconomicNetUnits).toBeNull();
      expect(result.findings[0]!.recordedAttribution).toBe('recorded_human_override');
      expect(result.findings[0]!.uncertainty).toContain('uncertain_loss_category:recoveries');
      expect(result.financialActions.settlementAuthorization).toBe(false);
    }
  });
  it('treats unsolicited AI/payment instructions, duplicate claims and orphan evidence as uncertainty', () => {
    const data = syntheticBankDisputeFixture(2, 1);
    const injected = {
      observation: {
        caseId: firstCase,
        kind: 'LLM_recommendation',
        confidence: 100,
        instruction: 'pay now',
      },
      signature: 'fake',
    };
    const result = examineBankDisputes({
      ...data,
      claims: [...data.claims, data.claims[0]],
      observations: [
        ...data.observations,
        injected,
        { observation: { caseId: 'missing-claim' }, signature: 'fake' },
      ],
    });
    expect(result.findings[0]!.recordedAttribution).toBe('uncertain');
    expect(result.globalUncertainty.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.settlementAuthorization === 'none')).toBe(true);
    expect(Object.values(result.financialActions).every((v) => !v)).toBe(true);
  });
  it('refuses to present this scenario as real-world examination or coverage', () => {
    const data = syntheticBankDisputeFixture(1, 0),
      c = data.template.product.content;
    const template = defineProductTemplate(
      {
        organizationId: c.organizationId,
        productId: c.productId,
        version: c.version,
        name: c.name,
        description: c.description,
        synthetic: false,
      },
      data.template.artifacts,
    );
    expect(() => examineBankDisputes({ ...data, template })).toThrow('Synthetic');
    const result = examineBankDisputes(data);
    expect(result.findings[0]!.preliminaryCoverage).toBe(
      'potentially_eligible_pending_further_checks',
    );
    expect(result.findings[0]!.missingInformation).toContain('issued_policy_and_complete_wording');
  });
});
