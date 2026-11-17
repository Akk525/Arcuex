import {
  IdempotencyConflictError,
  IdempotencyKeySchema,
  ValidationError,
  associateIncident,
  authorizeClaim,
  beginClaimAssessment,
  beginSettlement,
  denyClaim,
  markIncidentEvidenced,
  newId,
  settleClaim,
  validateIncident,
  type Assessment,
  type Claim,
  type CoverageRule,
  type EvidenceFact,
  type EvidenceProvider,
  type Incident,
  type IncidentVerifier,
  type Settlement,
  type TriStateOutcome,
  type UsdcMicros,
} from '@arcuex/domain';
import type { InsuranceRepository } from '@arcuex/persistence';

export type IntakeObservedEvent = {
  idempotencyKey: string;
  observedEventRef: string;
  observedAt: string;
  source: string;
  policyId: string;
  exposureId: string;
};

/**
 * Event intake -> incident detection (observed) -> policy/exposure association.
 * Observed transactions are stored as incidents; they are not verified covered events yet.
 */
export function intakeObservedEvent(
  repo: InsuranceRepository,
  input: IntakeObservedEvent,
): Incident {
  const key = IdempotencyKeySchema.parse(input.idempotencyKey);

  return repo.runInTransaction(() => {
    const first = repo.tryMarkProcessed(key, input.source, input);
    if (!first) {
      const existing = repo
        .listIncidents(100)
        .find((i) => i.observedEventRef === input.observedEventRef);
      if (existing) return existing;
      throw new IdempotencyConflictError(
        'Event already processed but incident not found for observed ref',
      );
    }

    const policy = repo.getPolicy(input.policyId);
    if (!policy || policy.status !== 'active') {
      throw new ValidationError('Incident requires an active policy');
    }
    const exposures = repo.listExposures(policy.id);
    const exposure = exposures.find((e) => e.id === input.exposureId);
    if (!exposure) throw new ValidationError('Unknown exposure for policy');

    let incident: Incident = {
      id: newId(),
      status: 'received',
      observedEventRef: input.observedEventRef,
      observedAt: input.observedAt,
      policyId: null,
      exposureId: null,
      source: input.source,
      createdAt: new Date().toISOString(),
    };
    incident = associateIncident(incident, policy.id, exposure.id);
    repo.saveIncident(incident);
    repo.insertAudit('incident', incident.id, 'incident.associated', {
      observedEventRef: input.observedEventRef,
      policyId: policy.id,
    });
    return incident;
  });
}

export async function collectAndValidateCoverage(input: {
  repo: InsuranceRepository;
  incidentId: string;
  evidenceProvider: EvidenceProvider;
  verifier: IncidentVerifier;
  coverageRule: CoverageRule;
}): Promise<{
  incident: Incident;
  facts: EvidenceFact[];
  covered: boolean;
  reason: string;
  payableMicros?: UsdcMicros;
  outcome?: TriStateOutcome;
}> {
  const { repo } = input;
  const incident = repo.getIncident(input.incidentId);
  if (!incident) throw new ValidationError('Unknown incident');
  if (!incident.policyId) throw new ValidationError('Incident not associated');

  const policy = repo.getPolicy(incident.policyId);
  if (!policy) throw new ValidationError('Policy missing');

  const { bundle, facts } = await input.evidenceProvider.collect({ incident });
  repo.runInTransaction(() => {
    repo.saveEvidence(bundle, facts);
    const evidenced = markIncidentEvidenced(incident);
    repo.saveIncident(evidenced);
    repo.insertAudit('incident', incident.id, 'incident.evidenced', {
      collector: input.evidenceProvider.id,
      factCount: facts.length,
    });
  });

  const evidenced = repo.getIncident(incident.id);
  if (!evidenced) throw new ValidationError('Incident missing after evidence');

  const verification = await input.verifier.verify({ incident: evidenced, facts });
  const verificationOutcome = verification.outcome ?? (verification.verified ? 'VERIFIED' : 'REJECTED');
  if (!verification.verified || verificationOutcome !== 'VERIFIED') {
    repo.insertAudit('incident', evidenced.id, 'incident.verification', {
      outcome: verificationOutcome,
      reason: verification.reason,
      verifierId: input.verifier.id,
    });
    return {
      incident: evidenced,
      facts,
      covered: false,
      reason: verification.reason,
      outcome: verificationOutcome,
    };
  }

  const ruleResult = await input.coverageRule.evaluate({
    policy,
    terms: policy.terms,
    incident: evidenced,
    facts,
  });
  const ruleOutcome =
    ruleResult.outcome ?? (ruleResult.covered ? 'VERIFIED' : 'REJECTED');

  if (ruleResult.covered && ruleOutcome === 'VERIFIED') {
    repo.runInTransaction(() => {
      const validated = validateIncident(evidenced);
      repo.saveIncident(validated);
      repo.insertAudit('incident', evidenced.id, 'incident.validated', {
        ruleId: input.coverageRule.id,
        reason: ruleResult.reason,
        outcome: ruleOutcome,
      });
    });
  } else {
    repo.insertAudit('incident', evidenced.id, 'incident.rule', {
      ruleId: input.coverageRule.id,
      reason: ruleResult.reason,
      outcome: ruleOutcome,
    });
  }

  const latest = repo.getIncident(incident.id);
  if (!latest) throw new ValidationError('Incident missing after validation');

  return {
    incident: latest,
    facts,
    covered: ruleResult.covered && ruleOutcome === 'VERIFIED',
    reason: ruleResult.reason,
    payableMicros: ruleResult.payableMicros,
    outcome: ruleOutcome,
  };
}

export function submitClaim(
  repo: InsuranceRepository,
  input: {
    policyId: string;
    incidentId: string;
    requestedMicros: UsdcMicros;
    idempotencyKey: string;
  },
): Claim {
  const key = IdempotencyKeySchema.parse(input.idempotencyKey);
  const existing = repo.getClaimByIdempotencyKey(key);
  if (existing) return existing;

  return repo.runInTransaction(() => {
    const again = repo.getClaimByIdempotencyKey(key);
    if (again) return again;

    const incident = repo.getIncident(input.incidentId);
    if (!incident || incident.status !== 'validated') {
      throw new ValidationError('Claim requires a validated incident');
    }
    const policy = repo.getPolicy(input.policyId);
    if (!policy || policy.status !== 'active') {
      throw new ValidationError('Claim requires an active policy');
    }
    if (input.requestedMicros > policy.terms.limitMicros) {
      throw new ValidationError('Requested amount exceeds policy limit');
    }

    const claim: Claim = {
      id: newId(),
      policyId: policy.id,
      incidentId: incident.id,
      status: 'submitted',
      requestedMicros: input.requestedMicros,
      authorizedMicros: null,
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    };
    repo.saveClaim(claim);
    repo.insertAudit('claim', claim.id, 'claim.submitted', {
      requestedMicros: claim.requestedMicros.toString(),
    });
    return claim;
  });
}

/**
 * Authorized claims decision. Authority must be an explicit rule/human record —
 * never an AI majority vote alone.
 */
export function decideClaim(
  repo: InsuranceRepository,
  input: {
    claimId: string;
    decision: 'authorize' | 'deny';
    authority: string;
    rationale: string;
    authorizedMicros?: UsdcMicros;
  },
): { claim: Claim; assessment: Assessment } {
  if (/ai.*(?:majority[_-\s]*)?vote|majority[_-\s]*vote/i.test(input.authority)) {
    throw new ValidationError(
      'AI model majority votes cannot authorize money transfers',
    );
  }

  return repo.runInTransaction(() => {
    const claim = repo.getClaim(input.claimId);
    if (!claim) throw new ValidationError('Unknown claim');

    let next = beginClaimAssessment(claim);
    if (input.decision === 'authorize') {
      if (input.authorizedMicros === undefined) {
        throw new ValidationError('authorizedMicros required');
      }
      next = authorizeClaim(next, input.authorizedMicros);
    } else {
      next = denyClaim(next);
    }
    repo.saveClaim(next);

    const assessment: Assessment = {
      id: newId(),
      claimId: next.id,
      decision: input.decision,
      authorizedMicros: input.decision === 'authorize' ? input.authorizedMicros! : null,
      authority: input.authority,
      rationale: input.rationale,
      createdAt: new Date().toISOString(),
    };
    repo.saveAssessment(assessment);

    repo.insertAudit('claim', next.id, `claim.${input.decision}`, {
      authority: input.authority,
      rationale: input.rationale,
    });

    return { claim: next, assessment };
  });
}

export function prepareSettlement(
  repo: InsuranceRepository,
  input: {
    claimId: string;
    poolId: string;
    idempotencyKey: string;
  },
): Settlement {
  const key = IdempotencyKeySchema.parse(input.idempotencyKey);
  const existing = repo.getSettlementByIdempotencyKey(key);
  if (existing) return existing;

  return repo.runInTransaction(() => {
    const again = repo.getSettlementByIdempotencyKey(key);
    if (again) return again;

    const claim = repo.getClaim(input.claimId);
    if (!claim || claim.status !== 'authorized' || claim.authorizedMicros === null) {
      throw new ValidationError('Settlement requires an authorized claim');
    }

    const settling = beginSettlement(claim);
    repo.saveClaim(settling);

    const settlement: Settlement = {
      id: newId(),
      claimId: claim.id,
      poolId: input.poolId,
      amountMicros: claim.authorizedMicros,
      status: 'prepared',
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    };
    repo.saveSettlement(settlement);
    repo.insertAudit('settlement', settlement.id, 'settlement.prepared', {
      amountMicros: settlement.amountMicros.toString(),
      claimId: claim.id,
    });
    return settlement;
  });
}

export function markSettlementExecuted(
  repo: InsuranceRepository,
  settlementId: string,
  claimId: string,
): { settlement: Settlement; claim: Claim } {
  return repo.runInTransaction(() => {
    const settlement = repo.getSettlement(settlementId);
    if (!settlement) throw new ValidationError('Unknown settlement');
    if (settlement.status === 'executed') {
      const claim = repo.getClaim(claimId);
      if (!claim) throw new ValidationError('Unknown claim');
      return { settlement, claim };
    }
    const claim = repo.getClaim(claimId);
    if (!claim) throw new ValidationError('Unknown claim');
    const settling = claim.status === 'settling' ? claim : beginSettlement(claim);
    const settled = settleClaim(settling);
    repo.saveClaim(settled);
    const next: Settlement = { ...settlement, status: 'executed' };
    repo.saveSettlement(next);
    repo.insertAudit('settlement', next.id, 'settlement.executed', {
      claimId: settled.id,
    });
    return { settlement: next, claim: settled };
  });
}
