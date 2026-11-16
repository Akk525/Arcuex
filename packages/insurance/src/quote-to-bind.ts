import {
  FundingConditionError,
  IdempotencyConflictError,
  IdempotencyKeySchema,
  QuoteExpiredError,
  ValidationError,
  acceptQuote,
  activatePolicy,
  bindPolicy,
  buildSyntheticTerms,
  createSyntheticCoverageProduct,
  newId,
  offerQuote,
  type Agent,
  type CoveredExposure,
  type Policy,
  type Policyholder,
  type Quote,
  SYNTHETIC_PRODUCT_CODE,
} from '@arcuex/domain';
import type { InsuranceRepository } from '@arcuex/persistence';

export type CoverageRequest = {
  idempotencyKey: string;
  policyholder: {
    displayName: string;
    walletAddress?: `0x${string}`;
  };
  agent: {
    externalRef: string;
    label: string;
  };
  /** Quote lifetime in seconds (default 1 hour). */
  ttlSeconds?: number;
  now?: Date;
};

export type QuoteToBindResult = {
  quote: Quote;
  policy: Policy;
  exposure: CoveredExposure;
};

function ensureSyntheticProduct(repo: InsuranceRepository) {
  const existing = repo.getProductByCode(SYNTHETIC_PRODUCT_CODE);
  if (existing) return existing;
  const product = createSyntheticCoverageProduct();
  repo.saveProduct(product);
  return product;
}

/**
 * coverage request -> eligibility -> offered quote (expiring).
 * Uses the labeled synthetic product only.
 */
export function requestCoverageQuote(
  repo: InsuranceRepository,
  request: CoverageRequest,
): Quote {
  const key = IdempotencyKeySchema.parse(request.idempotencyKey);
  const existing = repo.getQuoteByIdempotencyKey(key);
  if (existing) {
    // Same key must return the same quote; conflicting body is rejected by caller fingerprint if needed.
    return existing;
  }

  return repo.runInTransaction(() => {
    const again = repo.getQuoteByIdempotencyKey(key);
    if (again) return again;

    const now = request.now ?? new Date();
    const product = ensureSyntheticProduct(repo);
    if (!product.active || !product.synthetic) {
      throw new ValidationError('Eligible product must be active synthetic demo product');
    }

    const policyholder: Policyholder = {
      id: newId(),
      displayName: request.policyholder.displayName,
      walletAddress: request.policyholder.walletAddress,
      createdAt: now.toISOString(),
    };
    repo.savePolicyholder(policyholder);

    const agent: Agent = {
      id: newId(),
      policyholderId: policyholder.id,
      externalRef: request.agent.externalRef,
      label: request.agent.label,
      createdAt: now.toISOString(),
    };
    repo.saveAgent(agent);

    const ttlMs = (request.ttlSeconds ?? 3600) * 1000;
    const starts = now;
    const ends = new Date(now.getTime() + 7 * 86_400_000);
    const draft: Quote = {
      id: newId(),
      productId: product.id,
      policyholderId: policyholder.id,
      agentId: agent.id,
      status: 'draft',
      terms: buildSyntheticTerms({
        coverageStartsAt: starts.toISOString(),
        coverageEndsAt: ends.toISOString(),
      }),
      idempotencyKey: key,
      offeredAt: null,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      acceptedAt: null,
      createdAt: now.toISOString(),
    };

    const offered = offerQuote(draft, now.toISOString());
    repo.saveQuote(offered);
    repo.insertAudit('quote', offered.id, 'quote.offered', {
      productCode: product.code,
      synthetic: true,
      expiresAt: offered.expiresAt,
    });
    return offered;
  });
}

export function acceptAndBindPolicy(
  repo: InsuranceRepository,
  input: {
    quoteId: string;
    idempotencyKey: string;
    fundingVerified: boolean;
    now?: Date;
  },
): QuoteToBindResult {
  const key = IdempotencyKeySchema.parse(input.idempotencyKey);
  const existingPolicy = repo.getPolicyByQuoteId(input.quoteId);
  if (existingPolicy) {
    const quote = repo.getQuote(input.quoteId);
    if (!quote) throw new ValidationError('Quote missing for existing policy');
    const exposures = repo.listExposures(existingPolicy.id);
    if (!exposures[0]) throw new ValidationError('Exposure missing for existing policy');
    return { quote, policy: existingPolicy, exposure: exposures[0] };
  }

  return repo.runInTransaction(() => {
    const quote = repo.getQuote(input.quoteId);
    if (!quote) throw new ValidationError(`Unknown quote ${input.quoteId}`);

    const prior = repo.getQuoteByIdempotencyKey(quote.idempotencyKey);
    if (prior && prior.id !== quote.id) {
      throw new IdempotencyConflictError('Quote idempotency key maps to a different quote');
    }

    const now = (input.now ?? new Date()).toISOString();
    if (Date.parse(quote.expiresAt) <= Date.parse(now)) {
      throw new QuoteExpiredError(quote.id);
    }
    if (!input.fundingVerified) {
      throw new FundingConditionError('Premium funding not verified — cannot bind');
    }

    const accepted =
      quote.status === 'accepted' ? quote : acceptQuote(quote, now);
    repo.saveQuote(accepted);
    repo.insertAudit('quote', accepted.id, 'quote.accepted', { at: now });

    let policy = repo.getPolicyByQuoteId(accepted.id);
    if (!policy) {
      policy = {
        id: newId(),
        quoteId: accepted.id,
        productId: accepted.productId,
        policyholderId: accepted.policyholderId,
        agentId: accepted.agentId,
        status: 'pending_funding',
        terms: accepted.terms,
        fundingVerifiedAt: null,
        boundAt: null,
        activatedAt: null,
        createdAt: now,
      };
    }

    const bound = bindPolicy(policy, now);
    const active = activatePolicy(bound, now);
    repo.savePolicy(active);

    let exposure = repo.listExposures(active.id)[0];
    if (!exposure) {
      exposure = {
        id: newId(),
        policyId: active.id,
        exposureKey: 'primary',
        description: 'Primary synthetic covered exposure',
        limitMicros: active.terms.limitMicros,
        createdAt: now,
      };
      repo.saveExposure(exposure);
    }

    // Bind idempotency recorded as processed event for accept step
    repo.tryMarkProcessed(key, 'quote.accept_bind', {
      quoteId: accepted.id,
      policyId: active.id,
    });

    repo.insertAudit('policy', active.id, 'policy.activated', {
      quoteId: accepted.id,
      synthetic: active.terms.synthetic,
      bindIdempotencyKey: key,
    });

    return { quote: accepted, policy: active, exposure };
  });
}
