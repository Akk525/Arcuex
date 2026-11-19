-- Additive investigation journal; existing evidence/verification and financial tables stay intact.
CREATE TABLE claim_investigation_entries (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES claims_cases(id),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  kind TEXT NOT NULL CHECK(kind IN ('message','proof_request','proof_submission','request_resolution','escalation','examiner_request','examiner_started','examiner_report','examiner_failure')),
  actor TEXT NOT NULL,
  request_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  UNIQUE(case_id, sequence),
  UNIQUE(case_id, actor, request_key)
);
CREATE TRIGGER claim_investigation_no_update BEFORE UPDATE ON claim_investigation_entries
BEGIN SELECT RAISE(ABORT, 'investigation entries are immutable'); END;
CREATE TRIGGER claim_investigation_no_delete BEFORE DELETE ON claim_investigation_entries
BEGIN SELECT RAISE(ABORT, 'investigation entries are immutable'); END;
