PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policyholders (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  wallet_address TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  policyholder_id TEXT NOT NULL REFERENCES policyholders(id),
  external_ref TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coverage_products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  covered_event_class TEXT NOT NULL,
  synthetic INTEGER NOT NULL,
  active INTEGER NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES coverage_products(id),
  policyholder_id TEXT NOT NULL REFERENCES policyholders(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL,
  terms_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  offered_at TEXT,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),
  product_id TEXT NOT NULL REFERENCES coverage_products(id),
  policyholder_id TEXT NOT NULL REFERENCES policyholders(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL,
  terms_json TEXT NOT NULL,
  funding_verified_at TEXT,
  bound_at TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS covered_exposures (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  exposure_key TEXT NOT NULL,
  description TEXT NOT NULL,
  limit_micros TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(policy_id, exposure_key)
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  observed_event_ref TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  policy_id TEXT REFERENCES policies(id),
  exposure_id TEXT REFERENCES covered_exposures(id),
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_bundles (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  collector TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_facts (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES evidence_bundles(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  provenance TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  status TEXT NOT NULL,
  requested_micros TEXT NOT NULL,
  authorized_micros TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  decision TEXT NOT NULL,
  authorized_micros TEXT,
  authority TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capital_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  deposited_micros TEXT NOT NULL,
  outstanding_liability_micros TEXT NOT NULL,
  shares_outstanding TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capital_reservations (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES capital_pools(id),
  claim_id TEXT REFERENCES claims(id),
  amount_micros TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  pool_id TEXT NOT NULL REFERENCES capital_pools(id),
  amount_micros TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_events (
  idempotency_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_audit_aggregate ON audit_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_incidents_observed_ref ON incidents(observed_event_ref);
