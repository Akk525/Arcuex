-- Original migration IDs are preserved for upgrades from either branch.
-- Link to canonical procurement records without copying them into legacy policies.
CREATE TABLE claims_cases_integrated (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  exposure_id TEXT NOT NULL,
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
  updated_at TEXT NOT NULL,
  payout_to TEXT,
  evidence_root TEXT,
  adjudication_binding_json TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  procurement_policy_id TEXT REFERENCES procurement_policies(id)
);
INSERT INTO claims_cases_integrated(id,schema_version,status,policy_id,exposure_id,incident_id,claim_id,claimant_ref,idempotency_key,synthetic_demo,evidence_authenticity,coverage_determination,settlement_authorization,verified_loss_micros,deductible_micros,prior_compensation_micros,recoveries_micros,remaining_limit_micros,loss_cap_micros,payable_micros,loss_key,denial_reason_code,review_reason_code,authority_actor,settlement_prep_id,created_at,updated_at,payout_to,evidence_root,adjudication_binding_json,row_version) SELECT id,schema_version,status,policy_id,exposure_id,incident_id,claim_id,claimant_ref,idempotency_key,synthetic_demo,evidence_authenticity,coverage_determination,settlement_authorization,verified_loss_micros,deductible_micros,prior_compensation_micros,recoveries_micros,remaining_limit_micros,loss_cap_micros,payable_micros,loss_key,denial_reason_code,review_reason_code,authority_actor,settlement_prep_id,created_at,updated_at,payout_to,evidence_root,adjudication_binding_json,row_version FROM claims_cases;
DROP TABLE claims_cases;
ALTER TABLE claims_cases_integrated RENAME TO claims_cases;
CREATE INDEX idx_claims_cases_status ON claims_cases(status);
CREATE INDEX idx_claims_cases_policy ON claims_cases(policy_id);
CREATE TRIGGER claims_case_policy_link BEFORE INSERT ON claims_cases BEGIN
 SELECT CASE WHEN NEW.procurement_policy_id IS NOT NULL THEN
  CASE WHEN NOT EXISTS(SELECT 1 FROM procurement_policies p WHERE p.id=NEW.policy_id AND p.id=NEW.procurement_policy_id AND NEW.exposure_id=json_extract(p.payload,'$.terms.agentId') AND p.bind_tx IS NOT NULL) THEN RAISE(ABORT,'Invalid procurement policy/exposure link') END
 ELSE CASE WHEN NOT EXISTS(SELECT 1 FROM covered_exposures e WHERE e.policy_id=NEW.policy_id AND e.id=NEW.exposure_id) THEN RAISE(ABORT,'Invalid legacy policy/exposure link') END END;
END;
CREATE TRIGGER claims_case_identity_immutable BEFORE UPDATE ON claims_cases
 WHEN NEW.policy_id IS NOT OLD.policy_id OR NEW.exposure_id IS NOT OLD.exposure_id OR NEW.incident_id IS NOT OLD.incident_id OR NEW.procurement_policy_id IS NOT OLD.procurement_policy_id
 BEGIN SELECT RAISE(ABORT,'Claims policy/exposure/incident identity is immutable'); END;
CREATE TABLE procurement_incident_links (
 incident_id TEXT PRIMARY KEY REFERENCES incidents(id),
 policy_id TEXT NOT NULL REFERENCES procurement_policies(id),
 exposure_id TEXT NOT NULL,
 observed_event_ref TEXT NOT NULL,
 UNIQUE(policy_id,exposure_id,observed_event_ref)
);
-- Old browser bearer sessions/nonces are retired, not migrated into a parallel authenticator.
DROP TABLE procurement_auth;
DROP TABLE procurement_sessions;
