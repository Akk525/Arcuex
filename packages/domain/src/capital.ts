import { DomainError } from './errors';
import type { CapitalPool, CapitalReservation } from './entities';
import { addUsdc, subUsdc, usdcMicros, type UsdcMicros } from './money';
import { newId } from './ids';

/**
 * Pure USDC capital accounting under full collateralization.
 * Available capital = deposits - outstanding liabilities - active reservations.
 */
export function availableCapital(
  pool: CapitalPool,
  activeReservations: readonly CapitalReservation[],
): UsdcMicros {
  const reserved = activeReservations
    .filter((r) => r.poolId === pool.id && r.status === 'reserved')
    .reduce((acc, r) => acc + r.amountMicros, 0n);
  const available = pool.depositedMicros - pool.outstandingLiabilityMicros - reserved;
  if (available < 0n) {
    throw new DomainError('INSOLVENT', 'Pool available capital is negative');
  }
  return usdcMicros(available);
}

export function deposit(pool: CapitalPool, amount: UsdcMicros, nowIso: string): CapitalPool {
  void nowIso;
  if (amount <= 0n) throw new DomainError('VALIDATION', 'deposit must be positive');
  // Full collateralization: 1 share per micro deposited.
  return {
    ...pool,
    depositedMicros: addUsdc(pool.depositedMicros, amount),
    sharesOutstanding: pool.sharesOutstanding + amount,
  };
}

export function withdrawableCapital(
  pool: CapitalPool,
  activeReservations: readonly CapitalReservation[],
): UsdcMicros {
  return availableCapital(pool, activeReservations);
}

export function withdraw(
  pool: CapitalPool,
  amount: UsdcMicros,
  activeReservations: readonly CapitalReservation[],
): CapitalPool {
  const available = withdrawableCapital(pool, activeReservations);
  if (amount > available) {
    throw new DomainError('INSUFFICIENT_CAPITAL', 'Withdraw exceeds available capital');
  }
  if (amount > pool.sharesOutstanding) {
    throw new DomainError('INSUFFICIENT_SHARES', 'Withdraw exceeds shares outstanding');
  }
  return {
    ...pool,
    depositedMicros: subUsdc(pool.depositedMicros, amount),
    sharesOutstanding: pool.sharesOutstanding - amount,
  };
}

export function recordPremium(pool: CapitalPool, premium: UsdcMicros): CapitalPool {
  if (premium <= 0n) throw new DomainError('VALIDATION', 'premium must be positive');
  return deposit(pool, premium, new Date().toISOString());
}

export function reserveCapital(
  pool: CapitalPool,
  amount: UsdcMicros,
  claimId: string | null,
  activeReservations: readonly CapitalReservation[],
  nowIso: string,
): { pool: CapitalPool; reservation: CapitalReservation } {
  const available = availableCapital(pool, activeReservations);
  if (amount > available) {
    throw new DomainError('INSUFFICIENT_CAPITAL', 'Cannot reserve more than available capital');
  }
  const reservation: CapitalReservation = {
    id: newId(),
    poolId: pool.id,
    claimId,
    amountMicros: amount,
    status: 'reserved',
    createdAt: nowIso,
  };
  return { pool, reservation };
}

export function consumeReservation(
  pool: CapitalPool,
  reservation: CapitalReservation,
): { pool: CapitalPool; reservation: CapitalReservation } {
  if (reservation.status !== 'reserved') {
    throw new DomainError('INVALID_RESERVATION', 'Reservation is not active');
  }
  return {
    pool: {
      ...pool,
      outstandingLiabilityMicros: addUsdc(
        pool.outstandingLiabilityMicros,
        reservation.amountMicros,
      ),
      depositedMicros: subUsdc(pool.depositedMicros, reservation.amountMicros),
    },
    reservation: { ...reservation, status: 'consumed' },
  };
}

export function releaseReservation(reservation: CapitalReservation): CapitalReservation {
  if (reservation.status !== 'reserved') {
    throw new DomainError('INVALID_RESERVATION', 'Reservation is not active');
  }
  return { ...reservation, status: 'released' };
}

export function applyPayout(
  pool: CapitalPool,
  amount: UsdcMicros,
): CapitalPool {
  if (amount > pool.outstandingLiabilityMicros) {
    throw new DomainError(
      'LIABILITY_MISMATCH',
      'Payout exceeds outstanding liabilities',
    );
  }
  return {
    ...pool,
    outstandingLiabilityMicros: subUsdc(pool.outstandingLiabilityMicros, amount),
  };
}

export function assertSolvent(
  pool: CapitalPool,
  activeReservations: readonly CapitalReservation[],
): void {
  availableCapital(pool, activeReservations);
  if (pool.depositedMicros < pool.outstandingLiabilityMicros) {
    throw new DomainError('INSOLVENT', 'Deposits below outstanding liabilities');
  }
}
