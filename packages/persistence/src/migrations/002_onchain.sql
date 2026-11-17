-- On-chain lifecycle audit / reconciliation tables.
-- Contract state is authoritative; these rows are durable mirrors + idempotency.

CREATE TABLE IF NOT EXISTS onchain_transactions (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  tx_hash TEXT,
  status TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  policy_entity_id TEXT,
  claim_entity_id TEXT,
  payload_json TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS onchain_policy_links (
  policy_entity_id TEXT PRIMARY KEY REFERENCES policies(id),
  policy_id_bytes32 TEXT NOT NULL UNIQUE,
  terms_hash TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  bound_tx_hash TEXT,
  bound_at TEXT,
  last_reconciled_at TEXT,
  last_reconcile_ok INTEGER,
  last_mismatch_json TEXT
);

CREATE TABLE IF NOT EXISTS onchain_claim_settlements (
  claim_entity_id TEXT PRIMARY KEY REFERENCES claims(id),
  claim_id_bytes32 TEXT NOT NULL UNIQUE,
  policy_entity_id TEXT NOT NULL REFERENCES policies(id),
  settle_tx_hash TEXT,
  amount_micros TEXT NOT NULL,
  payout_to TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
