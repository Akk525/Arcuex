import type {
  Agent,
  AuditEvent,
  CapitalPool,
  CapitalReservation,
  Claim,
  CoveredExposure,
  CoverageProduct,
  Incident,
  Policy,
  Policyholder,
  Quote,
  Settlement,
} from '@arcuex/domain';
import { decodeTerms } from '@arcuex/domain';

export function mapPolicyholder(row: Record<string, unknown>): Policyholder {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    walletAddress: row.wallet_address ? String(row.wallet_address) : undefined,
    createdAt: String(row.created_at),
  };
}

export function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    policyholderId: String(row.policyholder_id),
    externalRef: String(row.external_ref),
    label: String(row.label),
    createdAt: String(row.created_at),
  };
}

export function mapProduct(row: Record<string, unknown>): CoverageProduct {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    version: String(row.version),
    coveredEventClass: String(row.covered_event_class),
    synthetic: Boolean(row.synthetic),
    active: Boolean(row.active),
    description: String(row.description),
  };
}

export function mapQuote(row: Record<string, unknown>): Quote {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    policyholderId: String(row.policyholder_id),
    agentId: String(row.agent_id),
    status: String(row.status) as Quote['status'],
    terms: decodeTerms(String(row.terms_json)),
    idempotencyKey: String(row.idempotency_key),
    offeredAt: row.offered_at ? String(row.offered_at) : null,
    expiresAt: String(row.expires_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    createdAt: String(row.created_at),
  };
}

export function mapPolicy(row: Record<string, unknown>): Policy {
  return {
    id: String(row.id),
    quoteId: String(row.quote_id),
    productId: String(row.product_id),
    policyholderId: String(row.policyholder_id),
    agentId: String(row.agent_id),
    status: String(row.status) as Policy['status'],
    terms: decodeTerms(String(row.terms_json)),

    fundingVerifiedAt: row.funding_verified_at ? String(row.funding_verified_at) : null,
    boundAt: row.bound_at ? String(row.bound_at) : null,
    activatedAt: row.activated_at ? String(row.activated_at) : null,
    createdAt: String(row.created_at),
  };
}

export function mapExposure(row: Record<string, unknown>): CoveredExposure {
  return {
    id: String(row.id),
    policyId: String(row.policy_id),
    exposureKey: String(row.exposure_key),
    description: String(row.description),
    limitMicros: BigInt(String(row.limit_micros)),
    createdAt: String(row.created_at),
  };
}

export function mapIncident(row: Record<string, unknown>): Incident {
  return {
    id: String(row.id),
    status: String(row.status) as Incident['status'],
    observedEventRef: String(row.observed_event_ref),
    observedAt: String(row.observed_at),
    policyId: row.policy_id ? String(row.policy_id) : null,
    exposureId: row.exposure_id ? String(row.exposure_id) : null,
    source: String(row.source),
    createdAt: String(row.created_at),
  };
}

export function mapClaim(row: Record<string, unknown>): Claim {
  return {
    id: String(row.id),
    policyId: String(row.policy_id),
    incidentId: String(row.incident_id),
    status: String(row.status) as Claim['status'],
    requestedMicros: BigInt(String(row.requested_micros)),
    authorizedMicros: row.authorized_micros
      ? BigInt(String(row.authorized_micros))
      : null,
    idempotencyKey: String(row.idempotency_key),
    createdAt: String(row.created_at),
  };
}

export function mapPool(row: Record<string, unknown>): CapitalPool {
  return {
    id: String(row.id),
    name: String(row.name),
    depositedMicros: BigInt(String(row.deposited_micros)),
    outstandingLiabilityMicros: BigInt(String(row.outstanding_liability_micros)),
    sharesOutstanding: BigInt(String(row.shares_outstanding)),
    createdAt: String(row.created_at),
  };
}

export function mapReservation(row: Record<string, unknown>): CapitalReservation {
  return {
    id: String(row.id),
    poolId: String(row.pool_id),
    claimId: row.claim_id ? String(row.claim_id) : null,
    amountMicros: BigInt(String(row.amount_micros)),
    status: String(row.status) as CapitalReservation['status'],
    createdAt: String(row.created_at),
  };
}

export function mapSettlement(row: Record<string, unknown>): Settlement {
  return {
    id: String(row.id),
    claimId: String(row.claim_id),
    poolId: String(row.pool_id),
    amountMicros: BigInt(String(row.amount_micros)),
    status: String(row.status) as Settlement['status'],
    idempotencyKey: String(row.idempotency_key),
    createdAt: String(row.created_at),
  };
}

export function mapAudit(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    eventType: String(row.event_type),
    payloadJson: String(row.payload_json),
    createdAt: String(row.created_at),
  };
}
