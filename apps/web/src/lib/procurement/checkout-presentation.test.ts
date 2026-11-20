import { describe, expect, it } from 'vitest';
import {
  checkoutStatus,
  coverageStartCopy,
  endsSoon,
  paymentSteps,
  portfolioState,
  quoteCountdown,
  type CheckoutFacts,
} from './checkout-presentation';

const base: CheckoutFacts = {
  hasQuote: true,
  accepted: true,
  quoteExpired: false,
  allowanceConfirmed: false,
  allowanceHash: false,
  bindHash: false,
  bindUncertain: false,
  phase: 'prepared',
};

describe('checkoutStatus', () => {
  it('never reports coverage before reconciliation', () => {
    for (const phase of ['prepared', 'submitted', 'reconciling', 'unknown'] as const) {
      const status = checkoutStatus({ ...base, bindHash: true, phase });
      expect(status?.label).not.toMatch(/confirmed|in force|open/i);
      expect(status?.tone).not.toBe('ok');
    }
  });

  it('treats allowance confirmation as distinct from payment', () => {
    expect(checkoutStatus({ ...base, allowanceConfirmed: true })?.label).toBe(
      'Allowance confirmed · bind required',
    );
  });

  it('distinguishes accepted, quoted and confirmed states', () => {
    expect(checkoutStatus({ ...base })?.label).toBe('Awaiting wallet authorization');
    expect(checkoutStatus({ ...base, accepted: false })?.label).toBe('Quote ready · not accepted');
    expect(checkoutStatus({ ...base, phase: 'scheduled' })).toEqual({
      label: 'Confirmed · coverage scheduled',
      tone: 'ok',
    });
  });

  it('prioritises an uncertain bind over an expired quote', () => {
    expect(checkoutStatus({ ...base, bindUncertain: true, quoteExpired: true })?.tone).toBe('warn');
    expect(checkoutStatus({ ...base, bindUncertain: true, quoteExpired: true })?.label).toMatch(
      /unknown/,
    );
  });
});

describe('paymentSteps', () => {
  it('keeps reconciliation waiting until a bind exists', () => {
    const [allowance, bind, reconcile] = paymentSteps(base);
    expect(allowance?.state).toBe('current');
    expect(bind?.state).toBe('waiting');
    expect(reconcile?.state).toBe('waiting');
  });

  it('marks reconciliation current, not done, after a submitted bind', () => {
    const steps = paymentSteps({ ...base, allowanceConfirmed: true, bindHash: true, phase: 'reconciling' });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current']);
  });

  it('does not invite a new allowance while a bind is unaccounted for', () => {
    const [allowance, bind] = paymentSteps({ ...base, bindUncertain: true });
    expect(allowance).toMatchObject({ state: 'waiting', status: 'Check the bind first' });
    expect(bind?.state).toBe('attention');
  });

  it('flags an uncertain bind for attention', () => {
    expect(paymentSteps({ ...base, allowanceConfirmed: true, bindUncertain: true })[1]?.state).toBe(
      'attention',
    );
  });

  it('completes only when the phase is confirmed', () => {
    expect(paymentSteps({ ...base, bindHash: true, phase: 'effective' })[2]).toMatchObject({
      state: 'done',
      status: 'Verified on Arc Testnet',
    });
  });
});

describe('quoteCountdown', () => {
  it('formats remaining time and expiry', () => {
    expect(quoteCountdown(100, 100)).toBe('Expired');
    expect(quoteCountdown(130, 100)).toBe('30s left');
    expect(quoteCountdown(100 + 15 * 60, 100)).toBe('15 min left');
    expect(quoteCountdown(100 + 3 * 3600 + 120, 100)).toBe('3 h 2 min left');
  });
});

describe('coverageStartCopy', () => {
  it('states that acceptance alone does not start coverage', () => {
    expect(coverageStartCopy('prepared', 'Nov 20')).toMatch(/does not start coverage/);
    expect(coverageStartCopy('reconciling', 'Nov 20')).toMatch(/^Not yet/);
  });
});

describe('portfolioState', () => {
  it('groups phases without treating bound-but-unreconciled as in force', () => {
    expect(portfolioState('reconciling').category).toBe('pending');
    expect(portfolioState('effective').category).toBe('in_force');
    expect(portfolioState('scheduled').category).toBe('scheduled');
    expect(portfolioState('prepared').category).toBe('action');
    expect(portfolioState('effective', { mismatch: true })).toEqual({ category: 'action', tone: 'error' });
  });
});

describe('endsSoon', () => {
  it('flags only future expiries inside the window', () => {
    expect(endsSoon(1_000 + 86_400, 1_000)).toBe(true);
    expect(endsSoon(1_000 + 30 * 86_400, 1_000)).toBe(false);
    expect(endsSoon(900, 1_000)).toBe(false);
  });
});
