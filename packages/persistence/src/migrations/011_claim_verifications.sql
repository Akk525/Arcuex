-- Additive, append-only execution records. Existing case state/accounting is untouched.
CREATE TABLE claim_verifications (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES claims_cases(id),
  request_digest TEXT NOT NULL,
  record_json TEXT NOT NULL,
  UNIQUE(case_id, request_digest)
);
CREATE TRIGGER claim_verifications_no_update BEFORE UPDATE ON claim_verifications
BEGIN SELECT RAISE(ABORT, 'verification records are immutable'); END;
CREATE TRIGGER claim_verifications_no_delete BEFORE DELETE ON claim_verifications
BEGIN SELECT RAISE(ABORT, 'verification records are immutable'); END;
