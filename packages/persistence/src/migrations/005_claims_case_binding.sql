-- Freeze adjudication → settlement binding fields (feat/claims-workflow security hardening).

ALTER TABLE claims_cases ADD COLUMN payout_to TEXT;
ALTER TABLE claims_cases ADD COLUMN evidence_root TEXT;
ALTER TABLE claims_cases ADD COLUMN adjudication_binding_json TEXT;
ALTER TABLE claims_cases ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
