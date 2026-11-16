import {
  ValidationError,
  applyPayout,
  assertSolvent,
  availableCapital,
  consumeReservation,
  deposit,
  newId,
  recordPremium,
  reserveCapital,
  type CapitalPool,
  type CapitalReservation,
  type UsdcMicros,
  withdraw,
} from '@arcuex/domain';
import type { InsuranceRepository } from '@arcuex/persistence';

export const DEMO_POOL_NAME = 'synthetic-demo-pool';

export function ensureDemoPool(repo: InsuranceRepository, seedMicros: UsdcMicros = 1_000_000_000n): CapitalPool {
  const existing = repo.getPoolByName(DEMO_POOL_NAME);
  if (existing) return existing;

  return repo.runInTransaction(() => {
    const again = repo.getPoolByName(DEMO_POOL_NAME);
    if (again) return again;
    let pool: CapitalPool = {
      id: newId(),
      name: DEMO_POOL_NAME,
      depositedMicros: 0n,
      outstandingLiabilityMicros: 0n,
      sharesOutstanding: 0n,
      createdAt: new Date().toISOString(),
    };
    pool = deposit(pool, seedMicros, new Date().toISOString());
    repo.savePool(pool);
    repo.insertAudit('capital_pool', pool.id, 'pool.seeded', {
      name: DEMO_POOL_NAME,
      depositedMicros: pool.depositedMicros.toString(),
      synthetic: true,
    });
    return pool;
  });
}

export function depositToPool(
  repo: InsuranceRepository,
  poolId: string,
  amount: UsdcMicros,
): CapitalPool {
  return repo.runInTransaction(() => {
    const pools = repo.listPools();
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) throw new ValidationError('Unknown pool');
    const next = deposit(pool, amount, new Date().toISOString());
    repo.savePool(next);
    repo.insertAudit('capital_pool', next.id, 'pool.deposit', {
      amount: amount.toString(),
    });
    return next;
  });
}

export function collectPremium(
  repo: InsuranceRepository,
  poolId: string,
  premium: UsdcMicros,
): CapitalPool {
  return repo.runInTransaction(() => {
    const pool = repo.listPools().find((p) => p.id === poolId);
    if (!pool) throw new ValidationError('Unknown pool');
    const next = recordPremium(pool, premium);
    repo.savePool(next);
    repo.insertAudit('capital_pool', next.id, 'pool.premium', {
      premium: premium.toString(),
    });
    return next;
  });
}

export function withdrawFromPool(
  repo: InsuranceRepository,
  poolId: string,
  amount: UsdcMicros,
): CapitalPool {
  return repo.runInTransaction(() => {
    const pool = repo.listPools().find((p) => p.id === poolId);
    if (!pool) throw new ValidationError('Unknown pool');
    const active = repo.listActiveReservations(poolId);
    const next = withdraw(pool, amount, active);
    assertSolvent(next, active);
    repo.savePool(next);
    repo.insertAudit('capital_pool', next.id, 'pool.withdraw', {
      amount: amount.toString(),
    });
    return next;
  });
}

export function reserveForClaim(
  repo: InsuranceRepository,
  poolId: string,
  claimId: string,
  amount: UsdcMicros,
): { pool: CapitalPool; reservation: CapitalReservation } {
  return repo.runInTransaction(() => {
    const pool = repo.listPools().find((p) => p.id === poolId);
    if (!pool) throw new ValidationError('Unknown pool');
    const active = repo.listActiveReservations(poolId);
    const result = reserveCapital(
      pool,
      amount,
      claimId,
      active,
      new Date().toISOString(),
    );
    repo.saveReservation(result.reservation);
    repo.insertAudit('capital_reservation', result.reservation.id, 'reservation.created', {
      claimId,
      amount: amount.toString(),
    });
    return result;
  });
}

/**
 * Consume reservation into outstanding liability and apply payout accounting.
 * Duplicate settlement idempotency is enforced by settlement keys upstream.
 */
export function executePayoutAccounting(
  repo: InsuranceRepository,
  input: {
    poolId: string;
    reservationId: string;
    amount: UsdcMicros;
  },
): CapitalPool {
  return repo.runInTransaction(() => {
    const pool = repo.listPools().find((p) => p.id === input.poolId);
    if (!pool) throw new ValidationError('Unknown pool');
    const active = repo.listActiveReservations(input.poolId);
    const reservation = active.find((r) => r.id === input.reservationId);
    if (!reservation) throw new ValidationError('Active reservation not found');
    if (reservation.amountMicros !== input.amount) {
      throw new ValidationError('Payout amount must match reservation');
    }

    const consumed = consumeReservation(pool, reservation);
    repo.saveReservation(consumed.reservation);
    const paid = applyPayout(consumed.pool, input.amount);
    const remaining = repo.listActiveReservations(input.poolId).filter(
      (r) => r.id !== reservation.id,
    );
    assertSolvent(paid, remaining);
    repo.savePool(paid);
    repo.insertAudit('capital_pool', paid.id, 'pool.payout', {
      amount: input.amount.toString(),
      reservationId: reservation.id,
    });
    return paid;
  });
}

export function getPoolSnapshot(repo: InsuranceRepository, poolId: string) {
  const pool = repo.listPools().find((p) => p.id === poolId);
  if (!pool) throw new ValidationError('Unknown pool');
  const active = repo.listActiveReservations(poolId);
  return {
    pool,
    availableMicros: availableCapital(pool, active),
    activeReservations: active,
  };
}
