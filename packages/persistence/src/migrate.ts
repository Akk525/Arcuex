import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqliteDb } from './db';

const MIGRATIONS = [
  '001_init.sql',
  '002_onchain.sql',
  '003_streams_inbox.sql',
  '004_procurement.sql',
  '005_procurement_immutability.sql',
  '004_claims_cases.sql',
  '005_claims_case_binding.sql',
  '006_claims_auth_sessions.sql',
  '007_procurement_claims_integration.sql',
  '008_shared_wallet_session_scope.sql',
  '009_launch_security.sql',
  '010_policy_reconciliation.sql',
] as const;

export function migrate(db: SqliteDb, migrationDirectory?: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => (row as { id: string }).id),
  );

  const here = dirname(fileURLToPath(import.meta.url));

  for (const id of MIGRATIONS) {
    if (applied.has(id)) continue;
    const sql = readFileSync(join(migrationDirectory ?? join(here, 'migrations'), id), 'utf8');
    const run = db.transaction(() => {
      if (
        id === '007_procurement_claims_integration.sql' &&
        (db.pragma('foreign_key_check') as unknown[]).length
      )
        throw new Error('Foreign key check failed before claims integration');
      db.exec(sql);
      if (
        id === '007_procurement_claims_integration.sql' &&
        (db.pragma('foreign_key_check') as unknown[]).length
      )
        throw new Error('Foreign key check failed during claims integration');
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        id,
        new Date().toISOString(),
      );
    });
    // SQLite requires foreign keys disabled outside the transaction to rebuild a referenced table.
    const rebuild = id === '007_procurement_claims_integration.sql';
    if (rebuild) db.pragma('foreign_keys = OFF');
    try {
      run();
    } finally {
      if (rebuild) db.pragma('foreign_keys = ON');
    }
  }
}
