import { describe, expect, it } from 'vitest';
import {
  applyPayout,
  assertSolvent,
  availableCapital,
  consumeReservation,
  deposit,
  recordPremium,
  reserveCapital,
  withdraw,
} from './capital';
import { DomainError } from './errors';
import { newId } from './ids';
import { parseUsdcDecimal } from './money';
import type { CapitalPool } from './entities';

function pool(): CapitalPool {
  return {
    id: newId(),
    name: 'demo-pool',
    depositedMicros: 0n,
    outstandingLiabilityMicros: 0n,
    sharesOutstanding: 0n,
    createdAt: '2026-11-16T18:00:00.000Z',
  };
}

describe('capital accounting', () => {
  it('conserves deposits, premiums, reservations and payouts', () => {
    let p = deposit(pool(), parseUsdcDecimal('100.000000'), '2026-11-16T18:00:00.000Z');
    p = recordPremium(p, parseUsdcDecimal('1.000000'));
    expect(p.depositedMicros).toBe(101_000_000n);
    expect(p.sharesOutstanding).toBe(101_000_000n);

    const { reservation } = reserveCapital(
      p,
      parseUsdcDecimal('10.000000'),
      newId(),
      [],
      '2026-11-16T18:01:00.000Z',
    );
    expect(availableCapital(p, [reservation])).toBe(91_000_000n);

    const consumed = consumeReservation(p, reservation);
    p = consumed.pool;
    expect(p.outstandingLiabilityMicros).toBe(10_000_000n);
    expect(p.depositedMicros).toBe(91_000_000n);

    p = applyPayout(p, parseUsdcDecimal('10.000000'));
    expect(p.outstandingLiabilityMicros).toBe(0n);
    assertSolvent(p, []);
  });

  it('prevents over-withdraw and insolvency', () => {
    const p = deposit(pool(), parseUsdcDecimal('5.000000'), '2026-11-16T18:00:00.000Z');
    expect(() => withdraw(p, parseUsdcDecimal('6.000000'), [])).toThrow(DomainError);

    const { reservation } = reserveCapital(
      p,
      parseUsdcDecimal('5.000000'),
      null,
      [],
      '2026-11-16T18:00:00.000Z',
    );
    expect(() =>
      reserveCapital(p, 1n, null, [reservation], '2026-11-16T18:00:00.000Z'),
    ).toThrow(DomainError);
  });

  it('prevents duplicate consume of reservation', () => {
    const p = deposit(pool(), parseUsdcDecimal('10.000000'), '2026-11-16T18:00:00.000Z');
    const { reservation } = reserveCapital(
      p,
      parseUsdcDecimal('2.000000'),
      null,
      [],
      '2026-11-16T18:00:00.000Z',
    );
    const once = consumeReservation(p, reservation);
    expect(() => consumeReservation(once.pool, once.reservation)).toThrow(DomainError);
  });
});
