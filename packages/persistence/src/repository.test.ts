import { IdempotencyConflictError, createSyntheticCoverageProduct, newId } from '@arcuex/domain';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './db';
import { InsuranceRepository } from './repository';

describe('InsuranceRepository', () => {
  it('migrates and stores audit + processed events transactionally', () => {
    const db = openDatabase(':memory:');
    const repo = new InsuranceRepository(db);
    const product = createSyntheticCoverageProduct();
    repo.runInTransaction(() => {
      repo.saveProduct(product);
      repo.insertAudit('coverage_product', product.id, 'product.created', { code: product.code });
      expect(repo.tryMarkProcessed('k1', 'test', { a: 1 })).toBe(true);
      expect(repo.tryMarkProcessed('k1', 'test', { a: 1 })).toBe(false);
    });
    expect(repo.getProductByCode(product.code)?.id).toBe(product.id);
    expect(repo.listAudit('coverage_product')).toHaveLength(1);
    expect(() => repo.tryMarkProcessed('k1', 'test', { a: 2 })).toThrow(IdempotencyConflictError);
  });

  it('persists bigint micros as text', () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const poolId = newId();
    repo.savePool({
      id: poolId,
      name: 't',
      depositedMicros: 123456789012345n,
      outstandingLiabilityMicros: 0n,
      sharesOutstanding: 123456789012345n,
      createdAt: new Date().toISOString(),
    });
    expect(repo.listPools()[0]?.depositedMicros).toBe(123456789012345n);
  });
});
