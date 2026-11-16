import Database from 'better-sqlite3';
import { migrate } from './migrate';

export type SqliteDb = Database.Database;

export function openDatabase(path: string = ':memory:'): SqliteDb {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function withTransaction<T>(db: SqliteDb, fn: () => T): T {
  const trx = db.transaction(fn);
  return trx();
}
