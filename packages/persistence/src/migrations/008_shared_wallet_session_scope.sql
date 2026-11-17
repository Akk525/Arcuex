-- Existing claimant signatures promised claims-only scope. Require a fresh shared-purpose
-- wallet signature before those sessions can authorize procurement. Preserve ops roles.
UPDATE claims_sessions
SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE role='claimant' AND revoked_at IS NULL;
UPDATE claims_auth_nonces
SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE consumed_at IS NULL;
