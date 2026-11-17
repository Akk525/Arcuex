CREATE TABLE launch_rate_limits (
 key_hash TEXT NOT NULL,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL,
 PRIMARY KEY(key_hash,window_start)
);
CREATE INDEX launch_rate_window ON launch_rate_limits(window_start);
ALTER TABLE claims_sessions ADD COLUMN config_epoch TEXT NOT NULL DEFAULT 'legacy';
-- Retire pre-launch sessions and incomplete sign-ins before enforcing the pinned domain.
UPDATE claims_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE revoked_at IS NULL;
UPDATE claims_auth_nonces SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE consumed_at IS NULL;

CREATE TABLE launch_runtime_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT INTO launch_runtime_state VALUES ('recovery_hold','0');
