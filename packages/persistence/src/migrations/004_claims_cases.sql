-- Additive ClaimsCase adjudication tables (feat/claims-workflow).
-- Does not alter Claim / Incident schemas. Codex A: if you also add 004_*, rename before merge.

CREATE TABLE IF NOT EXISTS claims_cases (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  exposure_id TEXT NOT NULL REFERENCES covered_exposures(id),
  incident_id TEXT REFERENCES incidents(id),
  claim_id TEXT REFERENCES claims(id),
  claimant_ref TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  synthetic_demo INTEGER NOT NULL,
  evidence_authenticity TEXT NOT NULL,
  coverage_determination TEXT NOT NULL,
  settlement_authorization TEXT NOT NULL,
  verified_loss_micros TEXT,
  deductible_micros TEXT NOT NULL,
  prior_compensation_micros TEXT NOT NULL,
  recoveries_micros TEXT,
  remaining_limit_micros TEXT,
  loss_cap_micros TEXT,
  payable_micros TEXT,
  loss_key TEXT,
  denial_reason_code TEXT,
  review_reason_code TEXT,
  authority_actor TEXT,
  settlement_prep_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims_case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES claims_cases(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims_evidence_manifests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES claims_cases(id),
  source TEXT NOT NULL,
  chain TEXT,
  block_hash TEXT,
  transaction_hash TEXT,
  provenance TEXT NOT NULL,
  raw_evidence_digest TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  source_reliability TEXT NOT NULL,
  synthetic_fixture INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(case_id, raw_evidence_digest)
);

CREATE INDEX IF NOT EXISTS idx_claims_cases_status ON claims_cases(status);
CREATE INDEX IF NOT EXISTS idx_claims_cases_policy ON claims_cases(policy_id);
CREATE INDEX IF NOT EXISTS idx_claims_case_events_case ON claims_case_events(case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_evidence_case ON claims_evidence_manifests(case_id);
