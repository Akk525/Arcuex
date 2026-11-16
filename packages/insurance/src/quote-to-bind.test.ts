import { FundingConditionError, QuoteExpiredError } from '@arcuex/domain';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { describe, expect, it } from 'vitest';
import { acceptAndBindPolicy, requestCoverageQuote } from './quote-to-bind';

function repo() {
  return new InsuranceRepository(openDatabase(':memory:'));
}

describe('quote-to-bind', () => {
  it('runs coverage request -> quote -> accept -> fund -> bind -> activate', () => {
    const r = repo();
    const now = new Date('2026-11-16T18:00:00.000Z');
    const quote = requestCoverageQuote(r, {
      idempotencyKey: 'cov-req-001',
      policyholder: { displayName: 'Demo Holder', walletAddress: '0x3600000000000000000000000000000000000000' },
      agent: { externalRef: 'agent-1', label: 'Demo Agent' },
      now,
    });
    expect(quote.status).toBe('offered');
    expect(quote.terms.synthetic).toBe(true);

    const bound = acceptAndBindPolicy(r, {
      quoteId: quote.id,
      idempotencyKey: 'bind-001',
      fundingVerified: true,
      now,
    });
    expect(bound.quote.status).toBe('accepted');
    expect(bound.policy.status).toBe('active');
    expect(bound.exposure.limitMicros).toBe(bound.policy.terms.limitMicros);
  });

  it('is idempotent on quote request key', () => {
    const r = repo();
    const a = requestCoverageQuote(r, {
      idempotencyKey: 'cov-req-002',
      policyholder: { displayName: 'A' },
      agent: { externalRef: 'a', label: 'A' },
    });
    const b = requestCoverageQuote(r, {
      idempotencyKey: 'cov-req-002',
      policyholder: { displayName: 'A' },
      agent: { externalRef: 'a', label: 'A' },
    });
    expect(a.id).toBe(b.id);
  });

  it('fails when funding is not verified', () => {
    const r = repo();
    const quote = requestCoverageQuote(r, {
      idempotencyKey: 'cov-req-003',
      policyholder: { displayName: 'A' },
      agent: { externalRef: 'a', label: 'A' },
    });
    expect(() =>
      acceptAndBindPolicy(r, {
        quoteId: quote.id,
        idempotencyKey: 'bind-003',
        fundingVerified: false,
      }),
    ).toThrow(FundingConditionError);
  });

  it('fails when quote expired', () => {
    const r = repo();
    const quote = requestCoverageQuote(r, {
      idempotencyKey: 'cov-req-004',
      policyholder: { displayName: 'A' },
      agent: { externalRef: 'a', label: 'A' },
      ttlSeconds: 60,
      now: new Date('2026-11-16T18:00:00.000Z'),
    });
    expect(() =>
      acceptAndBindPolicy(r, {
        quoteId: quote.id,
        idempotencyKey: 'bind-004',
        fundingVerified: true,
        now: new Date('2026-11-16T19:00:00.000Z'),
      }),
    ).toThrow(QuoteExpiredError);
  });
});
