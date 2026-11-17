import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqliteDb } from './db';

const MIGRATIONS = [
  '001_init.sql',
  '002_onchain.sql',
  '003_streams_inbox.sql',
  '004_claims_cases.sql',
  '005_claims_case_binding.sql',
] as const;

export function migrate(db: SqliteDb): void {
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
    const sql = readFileSync(join(here, 'migrations', id), 'utf8');
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      ).run(id, new Date().toISOString());
    });
    run();
  }
}
