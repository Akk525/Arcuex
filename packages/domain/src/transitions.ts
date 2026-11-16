import { InvalidTransitionError, QuoteExpiredError, ValidationError } from './errors';
import type {
  Claim,
  ClaimStatus,
  Incident,
  IncidentStatus,
  Policy,
  PolicyStatus,
  Quote,
  QuoteStatus,
} from './entities';
import { freezeTerms } from './terms';

const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['offered', 'rejected'],
  offered: ['accepted', 'expired', 'rejected'],
  accepted: [],
  expired: [],
  rejected: [],
};

const POLICY_TRANSITIONS: Record<PolicyStatus, readonly PolicyStatus[]> = {
  pending_funding: ['bound', 'cancelled'],
  bound: ['active', 'cancelled'],
  active: ['cancelled', 'expired', 'exhausted'],
  cancelled: [],
  expired: [],
  exhausted: [],
};

const INCIDENT_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  received: ['associated', 'rejected'],
  associated: ['evidenced', 'rejected'],
  evidenced: ['validated', 'rejected'],
  validated: [],
  rejected: [],
};

const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  submitted: ['assessing', 'denied'],
  assessing: ['authorized', 'denied'],
  authorized: ['settling'],
  denied: [],
  settling: ['settled'],
  settled: [],
};

function assertTransition<S extends string>(
  entity: string,
  from: S,
  to: S,
  allowed: Record<S, readonly S[]>,
): void {
  if (!allowed[from]?.includes(to)) {
    throw new InvalidTransitionError(entity, from, to);
  }
}

export function offerQuote(quote: Quote, nowIso: string): Quote {
  assertTransition('Quote', quote.status, 'offered', QUOTE_TRANSITIONS);
  if (Date.parse(quote.expiresAt) <= Date.parse(nowIso)) {
    throw new QuoteExpiredError(quote.id);
  }
  return {
    ...quote,
    status: 'offered',
    offeredAt: nowIso,
    terms: freezeTerms(quote.terms),
  };
}

export function acceptQuote(quote: Quote, nowIso: string): Quote {
  assertTransition('Quote', quote.status, 'accepted', QUOTE_TRANSITIONS);
  if (Date.parse(quote.expiresAt) <= Date.parse(nowIso)) {
    throw new QuoteExpiredError(quote.id);
  }
  return {
    ...quote,
    status: 'accepted',
    acceptedAt: nowIso,
    terms: freezeTerms(quote.terms),
  };
}

export function expireQuote(quote: Quote): Quote {
  assertTransition('Quote', quote.status, 'expired', QUOTE_TRANSITIONS);
  return { ...quote, status: 'expired', terms: freezeTerms(quote.terms) };
}

export function rejectQuote(quote: Quote): Quote {
  assertTransition('Quote', quote.status, 'rejected', QUOTE_TRANSITIONS);
  return { ...quote, status: 'rejected', terms: freezeTerms(quote.terms) };
}

export function bindPolicy(policy: Policy, fundingVerifiedAt: string): Policy {
  assertTransition('Policy', policy.status, 'bound', POLICY_TRANSITIONS);
  if (!fundingVerifiedAt) {
    throw new ValidationError('fundingVerifiedAt required to bind policy');
  }
  return {
    ...policy,
    status: 'bound',
    fundingVerifiedAt,
    boundAt: fundingVerifiedAt,
    terms: freezeTerms(policy.terms),
  };
}

export function activatePolicy(policy: Policy, activatedAt: string): Policy {
  assertTransition('Policy', policy.status, 'active', POLICY_TRANSITIONS);
  return {
    ...policy,
    status: 'active',
    activatedAt,
    terms: freezeTerms(policy.terms),
  };
}

export function cancelPolicy(policy: Policy): Policy {
  assertTransition('Policy', policy.status, 'cancelled', POLICY_TRANSITIONS);
  return { ...policy, status: 'cancelled', terms: freezeTerms(policy.terms) };
}

export function associateIncident(
  incident: Incident,
  policyId: string,
  exposureId: string,
): Incident {
  assertTransition('Incident', incident.status, 'associated', INCIDENT_TRANSITIONS);
  return {
    ...incident,
    status: 'associated',
    policyId,
    exposureId,
  };
}

export function markIncidentEvidenced(incident: Incident): Incident {
  assertTransition('Incident', incident.status, 'evidenced', INCIDENT_TRANSITIONS);
  return { ...incident, status: 'evidenced' };
}

export function validateIncident(incident: Incident): Incident {
  assertTransition('Incident', incident.status, 'validated', INCIDENT_TRANSITIONS);
  if (!incident.policyId || !incident.exposureId) {
    throw new ValidationError('Incident must be associated before validation');
  }
  return { ...incident, status: 'validated' };
}

export function rejectIncident(incident: Incident): Incident {
  assertTransition('Incident', incident.status, 'rejected', INCIDENT_TRANSITIONS);
  return { ...incident, status: 'rejected' };
}

export function beginClaimAssessment(claim: Claim): Claim {
  assertTransition('Claim', claim.status, 'assessing', CLAIM_TRANSITIONS);
  return { ...claim, status: 'assessing' };
}

export function authorizeClaim(claim: Claim, authorizedMicros: bigint): Claim {
  assertTransition('Claim', claim.status, 'authorized', CLAIM_TRANSITIONS);
  if (authorizedMicros <= 0n) {
    throw new ValidationError('authorizedMicros must be positive');
  }
  if (authorizedMicros > claim.requestedMicros) {
    throw new ValidationError('authorizedMicros cannot exceed requestedMicros');
  }
  return {
    ...claim,
    status: 'authorized',
    authorizedMicros,
  };
}

export function denyClaim(claim: Claim): Claim {
  if (claim.status !== 'submitted' && claim.status !== 'assessing') {
    throw new InvalidTransitionError('Claim', claim.status, 'denied');
  }
  return { ...claim, status: 'denied', authorizedMicros: null };
}

export function beginSettlement(claim: Claim): Claim {
  assertTransition('Claim', claim.status, 'settling', CLAIM_TRANSITIONS);
  return { ...claim, status: 'settling' };
}

export function settleClaim(claim: Claim): Claim {
  assertTransition('Claim', claim.status, 'settled', CLAIM_TRANSITIONS);
  return { ...claim, status: 'settled' };
}

export {
  QUOTE_TRANSITIONS,
  POLICY_TRANSITIONS,
  INCIDENT_TRANSITIONS,
  CLAIM_TRANSITIONS,
};
