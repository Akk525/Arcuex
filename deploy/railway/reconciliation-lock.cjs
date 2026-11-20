'use strict';

// The kernel releases SQLite's writer lock when the worker exits or crashes.
function acquireIndexerLock(Database, file) {
  const db = new Database(file, { timeout: 0 });
  try {
    db.exec('BEGIN IMMEDIATE');
  } catch {
    db.close();
    throw new Error('Reconciliation cursor already owned or lock unavailable');
  }
  return () => db.close();
}

module.exports = { acquireIndexerLock };
