-- Claims wallet/ops session store (feat/claims-workflow). Opaque session ids only — never store API secrets.

CREATE TABLE IF NOT EXISTS claims_auth_nonces (
  nonce TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE IF NOT EXISTS claims_sessions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  wallet_address TEXT,
  subject TEXT NOT NULL,
  allow_synthetic_settlement_prep INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_claims_sessions_expires ON claims_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_claims_nonces_wallet ON claims_auth_nonces(wallet_address);
