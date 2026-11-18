CREATE TABLE policy_reconciliation_scopes (
  scope TEXT PRIMARY KEY,
  healthy INTEGER NOT NULL CHECK(healthy IN (0,1)),
  checked_at INTEGER NOT NULL,
  through_block TEXT,
  run_id TEXT,
  through_hash TEXT
);
CREATE TABLE policy_bind_events (
  event_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL REFERENCES policy_reconciliation_scopes(scope),
  onchain_policy_id TEXT NOT NULL,
  local_policy_id TEXT REFERENCES procurement_policies(id),
  status TEXT NOT NULL CHECK(status IN ('VERIFIED_LINKED','ONCHAIN_UNLINKED','INCOMPLETE','ORPHANED')),
  canonical INTEGER NOT NULL CHECK(canonical IN (0,1)),
  block_number TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE UNIQUE INDEX canonical_policy_bind ON policy_bind_events(scope,onchain_policy_id) WHERE canonical=1;
CREATE INDEX policy_bind_local ON policy_bind_events(local_policy_id);
