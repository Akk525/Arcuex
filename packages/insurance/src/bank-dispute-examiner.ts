import {
  canonicalProductJson,
  sameProductAsset,
  validateProductTemplate,
  freezeProductContent,
  type ProductTemplate,
} from '@arcuex/domain';
import {
  BankCaseSubmissionSchema,
  SignedBankObservationSchema,
  verifySyntheticObservation,
  observationReference,
  type BankCaseSubmission,
  type SignedBankObservation,
  type SyntheticEvidenceSource,
  type LossCategory,
} from './bank-dispute-evidence';

const categories: LossCategory[] = ['compensation', 'regulatory_fines', 'recoveries', 'expenses'];
type Attribution =
  'recorded_human_override' | 'recorded_ai_denial' | 'other_recorded_action' | 'uncertain';
type CheckedObservation = { item: SignedBankObservation; authenticated: boolean; issues: string[] };
function rawCaseId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return;
  const observation = Object.getOwnPropertyDescriptor(raw, 'observation')?.value;
  const value =
    observation && typeof observation === 'object'
      ? Object.getOwnPropertyDescriptor(observation, 'caseId')?.value
      : Object.getOwnPropertyDescriptor(raw, 'caseId')?.value;
  return typeof value === 'string' ? value : undefined;
}

/** Synthetic, read-only examination. No repository, reserve, decision or payment executor. */
export function examineBankDisputes(input: {
  claims: readonly unknown[];
  observations: readonly unknown[];
  template: ProductTemplate;
  trustedSources: readonly SyntheticEvidenceSource[];
}) {
  const template = validateProductTemplate(input.template);
  if (
    !template.product.content.synthetic ||
    template.product.content.productId !== 'BANK_DISPUTE_AI_LIABILITY_DEMO'
  )
    throw new Error('Synthetic bank scenario template required');
  if (input.claims.length > 5000 || input.observations.length > 40000)
    throw new Error('Scenario size limit exceeded');
  const sources = new Map(input.trustedSources.map((s) => [s.id, s]));
  if (
    sources.size !== input.trustedSources.length ||
    input.trustedSources.some((s) => s.syntheticOnly !== true)
  )
    throw new Error('Ambiguous or non-synthetic trust roots');
  const claims = new Map<string, BankCaseSubmission>(),
    duplicateClaims = new Set<string>();
  const globalUncertainty: string[] = [],
    invalid = new Map<string, string[]>();
  const addInvalid = (caseId: string | undefined, reason: string) => {
    if (!caseId || !claims.has(caseId)) {
      globalUncertainty.push(reason);
      return;
    }
    invalid.set(caseId, [...(invalid.get(caseId) ?? []), reason]);
  };
  for (const raw of input.claims) {
    try {
      canonicalProductJson(raw);
      const row = BankCaseSubmissionSchema.parse(raw);
      if (claims.has(row.caseId)) duplicateClaims.add(row.caseId);
      claims.set(row.caseId, row);
    } catch {
      globalUncertainty.push('invalid_submission');
    }
  }
  const grouped = new Map<string, CheckedObservation[]>(),
    byEvent = new Map<string, CheckedObservation[]>();
  for (const raw of input.observations) {
    try {
      canonicalProductJson(raw);
      const item = SignedBankObservationSchema.parse(raw),
        o = item.observation;
      if (!claims.has(o.caseId)) {
        globalUncertainty.push(`unclaimed_evidence:${o.eventId}`);
        continue;
      }
      const authenticated = verifySyntheticObservation(item, sources),
        issues: string[] = [];
      if (!authenticated) issues.push(`unauthenticated_record:${o.eventId}`);
      if (Date.parse(o.recordedAt) < Date.parse(o.occurredAt))
        issues.push(`recorded_before_event:${o.eventId}`);
      const checked = { item, authenticated, issues };
      grouped.set(o.caseId, [...(grouped.get(o.caseId) ?? []), checked]);
      byEvent.set(o.eventId, [...(byEvent.get(o.eventId) ?? []), checked]);
    } catch {
      addInvalid(rawCaseId(raw), 'invalid_evidence_schema');
    }
  }
  for (const [eventId, rows] of byEvent)
    if (rows.length > 1)
      for (const row of rows) row.issues.push(`duplicate_event_identity:${eventId}`);
  const humanExclusion = template.artifacts.coverage.exclusions.find(
    (e) => e.kind === 'human_intervention' && e.enabled,
  );

  const findings = [...claims.values()]
    .sort((a, b) => a.caseId.localeCompare(b.caseId))
    .map((claim) => {
      const rows = grouped.get(claim.caseId) ?? [],
        issues = [...(invalid.get(claim.caseId) ?? [])];
      if (duplicateClaims.has(claim.caseId)) issues.push('duplicate_submission_identity');
      issues.push(...rows.flatMap((r) => r.issues));
      const recommendations = rows.filter((r) => r.item.observation.kind === 'recommendation');
      const decisions = rows.filter((r) => r.item.observation.kind === 'final_decision');
      if (recommendations.length !== 1) issues.push('missing_or_multiple_recommendations');
      if (decisions.length !== 1) issues.push('missing_or_multiple_final_decisions');
      const rec = recommendations[0]?.item.observation,
        final = decisions[0]?.item.observation;
      let attribution: Attribution = 'uncertain';
      const executionIssues = [...recommendations, ...decisions].some(
        (r) => !r.authenticated || r.issues.length > 0,
      );
      if (
        rec?.kind === 'recommendation' &&
        final?.kind === 'final_decision' &&
        recommendations.length === 1 &&
        decisions.length === 1 &&
        !executionIssues &&
        !invalid.has(claim.caseId) &&
        !duplicateClaims.has(claim.caseId)
      ) {
        if (
          final.recommendationEventId !== rec.eventId ||
          final.modelVersion !== rec.modelVersion ||
          Date.parse(final.occurredAt) < Date.parse(rec.occurredAt) ||
          (final.actingPrincipal.kind === 'ai' &&
            final.actingPrincipal.id !== rec.actingPrincipal.id)
        )
          issues.push('contradictory_execution_records');
        else if (
          rec.decision === 'approve' &&
          final.decision === 'deny' &&
          final.actingPrincipal.kind === 'human'
        )
          attribution = 'recorded_human_override';
        else if (
          rec.decision === 'deny' &&
          final.decision === 'deny' &&
          final.actingPrincipal.kind === 'ai'
        )
          attribution = 'recorded_ai_denial';
        else attribution = 'other_recorded_action';
      }
      const discrepancy =
        claim.assertedCause === 'ai_only' && attribution === 'recorded_human_override';
      const missingInformation = [
        'issued_policy_and_complete_wording',
        'trigger_and_reporting_dates',
        'independent_loss_and_liability_assessment',
        'prior_compensation_and_other_insurance',
        'fine_insurability_and_coverage_review',
      ];
      if (discrepancy)
        missingInformation.push(
          'explain_submitted_attribution_vs_recorded_human_action',
          'human_override_reason_and_authority',
          'adjuster_and_SIU_review_of_possible_misrepresentation',
        );
      if (attribution === 'uncertain')
        missingInformation.push('complete_authentic_noncontradictory_execution_logs');
      const quantum = categories.map((category) => {
        const assessments = rows.filter(
          (r) =>
            r.item.observation.kind === 'loss_assessment' &&
            r.item.observation.category === category,
        );
        const row = assessments[0],
          o = row?.item.observation;
        if (
          assessments.length !== 1 ||
          !row?.authenticated ||
          row.issues.length ||
          o?.kind !== 'loss_assessment' ||
          !sameProductAsset(o.amount.asset, template.artifacts.coverage.limit.asset) ||
          o.basis === 'unknown'
        ) {
          issues.push(`uncertain_loss_category:${category}`);
          missingInformation.push(`assess_${category}`);
          return { category, status: 'uncertain' as const, units: null, evidenceRef: null };
        }
        if (o.basis === 'claimed_only') missingInformation.push(`assess_${category}`);
        return {
          category,
          status: o.basis,
          units: o.amount.units,
          evidenceRef: observationReference(o),
        };
      });
      const assessed = (category: LossCategory) =>
        quantum.find((q) => q.category === category && q.status === 'synthetic_assessed');
      const compensation = assessed('compensation'),
        expenses = assessed('expenses'),
        recoveries = assessed('recoveries');
      let economicNet: string | null = null;
      if (
        compensation?.units !== null &&
        compensation?.units !== undefined &&
        expenses?.units !== null &&
        expenses?.units !== undefined &&
        recoveries?.units !== null &&
        recoveries?.units !== undefined
      ) {
        const net = BigInt(compensation.units) + BigInt(expenses.units) - BigInt(recoveries.units);
        economicNet = (net > 0n ? net : 0n).toString();
        if (net < 0n) issues.push('recoveries_exceed_assessed_costs');
      }
      const preliminaryCoverage =
        attribution === 'uncertain'
          ? 'not_assessed_due_to_uncertainty'
          : attribution === 'recorded_human_override'
            ? humanExclusion
              ? 'potential_human_intervention_exclusion'
              : 'no_enabled_human_intervention_exclusion'
            : attribution === 'recorded_ai_denial'
              ? 'potentially_eligible_pending_further_checks'
              : 'requires_further_review';
      return {
        caseId: claim.caseId,
        assertedCause: claim.assertedCause,
        recordedAttribution: attribution,
        discrepancy,
        execution: {
          recommendation: rec?.kind === 'recommendation' ? rec : null,
          finalDecision: final?.kind === 'final_decision' ? final : null,
        },
        evidenceRefs: rows
          .filter((r) => r.authenticated && !r.issues.length)
          .map((r) => observationReference(r.item.observation)),
        uncertainty: [...new Set(issues)].sort(),
        preliminaryCoverage,
        exclusionClauseRef:
          attribution === 'recorded_human_override' && humanExclusion
            ? humanExclusion.clauseId
            : null,
        causation: 'not_established' as const,
        liability: 'not_assessed' as const,
        fraud: 'not_determined' as const,
        lossCategories: quantum,
        candidateEconomicNetUnits: economicNet,
        quantumNotice:
          'Synthetic assessed economic amounts only; not covered quantum, a reserve or a payable amount. Fines are separate and excluded from this net calculation.',
        missingInformation: [...new Set(missingInformation)],
        settlementAuthorization: 'none' as const,
      };
    });
  const counts: Record<Attribution, number> = {
    recorded_human_override: 0,
    recorded_ai_denial: 0,
    other_recorded_action: 0,
    uncertain: 0,
  };
  for (const f of findings) counts[f.recordedAttribution]++;
  const losses = categories.map((category) => {
    let assessed = 0n,
      claimed = 0n,
      uncertain = 0;
    for (const f of findings) {
      const row = f.lossCategories.find((q) => q.category === category)!;
      if (row.status === 'synthetic_assessed' && row.units !== null) assessed += BigInt(row.units);
      else if (row.status === 'claimed_only' && row.units !== null) claimed += BigInt(row.units);
      else uncertain++;
    }
    return {
      category,
      syntheticAssessedUnits: assessed.toString(),
      claimedOnlyUnits: claimed.toString(),
      uncertainEvidenceCases: uncertain,
    };
  });
  return freezeProductContent({
    schemaVersion: 1 as const,
    mode: 'synthetic_read_only' as const,
    productReference: template.product.reference,
    evidenceTrustNotice:
      'Local synthetic signatures establish fixture provenance only, not independently verified bank activity.',
    inputCounts: {
      submittedCases: input.claims.length,
      evidenceRecords: input.observations.length,
    },
    summary: {
      examinedCases: findings.length,
      attributionCounts: counts,
      discrepancies: findings.filter((f) => f.discrepancy).length,
      uncertainEvidenceCases: findings.filter((f) => f.uncertainty.length > 0).length,
      potentiallyEligiblePendingChecks: findings.filter(
        (f) => f.preliminaryCoverage === 'potentially_eligible_pending_further_checks',
      ).length,
    },
    globalUncertainty: [...new Set(globalUncertainty)].sort(),
    lossSummary: losses,
    lossAsset: template.artifacts.coverage.limit.asset,
    reviewDossier: {
      handlingTier: 'TIER_3' as const,
      recommendation: findings.some((f) => f.discrepancy)
        ? 'REFER_ADJUSTER_AND_SIU'
        : 'REFER_ADJUSTER',
      suspectedMisrepresentationIsNotProvenFraud: true,
      disputedCaseIds: findings.filter((f) => f.discrepancy).map((f) => f.caseId),
      missingInformation: [...new Set(findings.flatMap((f) => f.missingInformation))].sort(),
      limitations:
        'Preliminary policy-wording-dependent analysis only. Recorded actor attribution does not prove recommendation correctness, proximate causation, legal liability, coverage, intentional fraud or a payable amount.',
    },
    financialActions: {
      reserveChange: false,
      bindingDecision: false,
      coverageDenial: false,
      policyRescission: false,
      settlementAuthorization: false,
      payment: false,
    },
    findings,
  });
}
