-- Additive MCP access-token registry. Tokens are stored only as SHA-256 identifiers; the
-- backing wallet session secret is sealed with a key derived from the bearer token itself.
CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_id TEXT,
  scopes_json TEXT NOT NULL,
  client_name TEXT NOT NULL,
  session_store_id TEXT NOT NULL REFERENCES claims_sessions(id),
  sealed_session TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_wallet ON mcp_access_tokens(wallet_address);
