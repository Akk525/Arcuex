import { describe, expect, it } from 'vitest';
import { QuoteExpiredError, InvalidTransitionError } from './errors';
import { newId } from './ids';
import { parseUsdcDecimal } from './money';
import { buildSyntheticTerms } from './synthetic-product';
import {
  acceptQuote,
  activatePolicy,
  authorizeClaim,
  bindPolicy,
  expireQuote,
  offerQuote,
} from './transitions';
import type { Claim, Policy, Quote } from './entities';

function sampleQuote(overrides?: Partial<Quote>): Quote {
  const now = Date.parse('2026-11-16T18:00:00.000Z');
  return {
    id: newId(),
    productId: newId(),
    policyholderId: newId(),
    agentId: newId(),
    status: 'draft',
    terms: buildSyntheticTerms({
      coverageStartsAt: new Date(now).toISOString(),
      coverageEndsAt: new Date(now + 7 * 86_400_000).toISOString(),
    }),
    idempotencyKey: 'quote-key-001',
    offeredAt: null,
    expiresAt: new Date(now + 3_600_000).toISOString(),
    acceptedAt: null,
    createdAt: new Date(now).toISOString(),
    ...overrides,
  };
}

describe('quote transitions', () => {
  it('offers and accepts before expiry', () => {
    const now = '2026-11-16T18:00:00.000Z';
    const offered = offerQuote(sampleQuote(), now);
    expect(offered.status).toBe('offered');
    const accepted = acceptQuote(offered, now);
    expect(accepted.status).toBe('accepted');
    expect(Object.isFrozen(accepted.terms)).toBe(true);
  });

  it('rejects acceptance after expiry', () => {
    const quote = offerQuote(sampleQuote(), '2026-11-16T18:00:00.000Z');
    expect(() => acceptQuote(quote, '2026-11-16T20:00:00.000Z')).toThrow(QuoteExpiredError);
  });

  it('expires offered quotes', () => {
    const offered = offerQuote(sampleQuote(), '2026-11-16T18:00:00.000Z');
    expect(expireQuote(offered).status).toBe('expired');
  });
});

describe('policy transitions', () => {
  it('binds then activates after funding', () => {
    const terms = buildSyntheticTerms({
      coverageStartsAt: '2026-11-16T18:00:00.000Z',
      coverageEndsAt: '2026-11-23T18:00:00.000Z',
    });
    const policy: Policy = {
      id: newId(),
      quoteId: newId(),
      productId: newId(),
      policyholderId: newId(),
      agentId: newId(),
      status: 'pending_funding',
      terms,
      fundingVerifiedAt: null,
      boundAt: null,
      activatedAt: null,
      createdAt: '2026-11-16T18:00:00.000Z',
    };
    const bound = bindPolicy(policy, '2026-11-16T18:05:00.000Z');
    expect(bound.status).toBe('bound');
    const active = activatePolicy(bound, '2026-11-16T18:06:00.000Z');
    expect(active.status).toBe('active');
  });
});

describe('claim transitions', () => {
  it('authorizes within requested amount', () => {
    const claim: Claim = {
      id: newId(),
      policyId: newId(),
      incidentId: newId(),
      status: 'assessing',
      requestedMicros: parseUsdcDecimal('10.000000'),
      authorizedMicros: null,
      idempotencyKey: 'claim-key-001',
      createdAt: '2026-11-16T18:00:00.000Z',
    };
    const authorized = authorizeClaim(claim, parseUsdcDecimal('5.000000'));
    expect(authorized.status).toBe('authorized');
    expect(authorized.authorizedMicros).toBe(5_000_000n);
    expect(() => authorizeClaim(claim, parseUsdcDecimal('11.000000'))).toThrow();
  });

  it('blocks invalid jump to settled', () => {
    const claim: Claim = {
      id: newId(),
      policyId: newId(),
      incidentId: newId(),
      status: 'submitted',
      requestedMicros: 1n,
      authorizedMicros: null,
      idempotencyKey: 'claim-key-002',
      createdAt: '2026-11-16T18:00:00.000Z',
    };
    expect(() => authorizeClaim(claim, 1n)).toThrow(InvalidTransitionError);
  });
});
