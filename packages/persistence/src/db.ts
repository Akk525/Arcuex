import Database from 'better-sqlite3';
import { migrate } from './migrate';

export type SqliteDb = Database.Database;

/** Inspect an existing database before any migration or journal-mode mutation. */
export function openReadonlyDatabase(path: string): SqliteDb {
  return new Database(path, { readonly: true, fileMustExist: true });
}

export function openDatabase(path: string = ':memory:', migrationDirectory?: string): SqliteDb {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db, migrationDirectory);
  return db;
}

export function withTransaction<T>(db: SqliteDb, fn: () => T): T {
  const trx = db.transaction(fn);
  return trx();
}
