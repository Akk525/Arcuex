import { openDatabase, InsuranceRepository, type SqliteDb } from '@arcuex/persistence';
import { ensureDemoPool } from '@arcuex/insurance';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const globalStore = globalThis as typeof globalThis & {
  __arcuexDb?: SqliteDb;
  __arcuexRepo?: InsuranceRepository;
};

function resolveDbPath(): string {
  const fromEnv = process.env.ARCUE_X_SQLITE_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'test') return ':memory:';
  return join(process.cwd(), '.data', 'arcuex.sqlite');
}

export function getDb(): SqliteDb {
  if (!globalStore.__arcuexDb) {
    const path = resolveDbPath();
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    globalStore.__arcuexDb = openDatabase(path);
  }
  return globalStore.__arcuexDb;
}

export function getRepo(): InsuranceRepository {
  if (!globalStore.__arcuexRepo) {
    const repo = new InsuranceRepository(getDb());
    ensureDemoPool(repo);
    globalStore.__arcuexRepo = repo;
  }
  return globalStore.__arcuexRepo;
}
