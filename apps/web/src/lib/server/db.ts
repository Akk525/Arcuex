import {
  openDatabase,
  openReadonlyDatabase,
  InsuranceRepository,
  type SqliteDb,
} from '@arcuex/persistence';
import { ensureDemoPool } from '@arcuex/insurance';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getRuntimeConfig } from './runtime-config';
import { assertStorageReady } from './storage';
import { assertDatabaseSource } from './fixture-source';

const globalStore = globalThis as typeof globalThis & {
  __arcuexDb?: SqliteDb;
  __arcuexRepo?: InsuranceRepository;
};

function resolveDbPath(): string {
  const c = getRuntimeConfig();
  if (c.enforced) return c.databasePath;
  const fromEnv = process.env.ARCUE_X_SQLITE_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'test') return ':memory:';
  return join(process.cwd(), '.data', 'arcuex.sqlite');
}

/** Check volume and fixture identity before the migrator can write to an existing file. */
export function openApplicationDatabase(path: string, migrations?: string): SqliteDb {
  const c = getRuntimeConfig();
  if (c.enforced) assertStorageReady(c);
  if (c.chainSource === 'fixture' && !existsSync(path))
    throw new Error('Pinned fixture database missing');
  if (path !== ':memory:' && existsSync(path)) {
    const probe = openReadonlyDatabase(path);
    try {
      if (c.chainSource === 'fixture') assertDatabaseSource(probe, c);
      else if (
        probe.prepare("SELECT name FROM sqlite_master WHERE name='candidate_fixture_source'").get()
      )
        throw new Error('Cannot migrate a fixture database in live mode');
      else if (
        probe.prepare("SELECT name FROM sqlite_master WHERE name='launch_runtime_state'").get()
      ) {
        const identity = probe
          .prepare("SELECT value FROM launch_runtime_state WHERE key='chain_source_identity'")
          .get() as { value: string } | undefined;
        if (identity && identity.value !== 'arc-testnet')
          throw new Error('Database source mismatch before migration');
      }
    } finally {
      probe.close();
    }
  }
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = openDatabase(path, migrations);
  try {
    assertDatabaseSource(db, c);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDb(): SqliteDb {
  if (!globalStore.__arcuexDb) {
    const path = resolveDbPath();
    globalStore.__arcuexDb = openApplicationDatabase(
      path,
      join(process.cwd(), '../../packages/persistence/src/migrations'),
    );
  }
  assertDatabaseSource(globalStore.__arcuexDb, getRuntimeConfig());
  return globalStore.__arcuexDb;
}

export function getRepo(): InsuranceRepository {
  const db = getDb();
  if (!globalStore.__arcuexRepo) {
    const repo = new InsuranceRepository(db);
    ensureDemoPool(repo);
    globalStore.__arcuexRepo = repo;
  }
  return globalStore.__arcuexRepo;
}
