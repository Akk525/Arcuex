CREATE TABLE procurement_records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  owner TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(kind, id)
);
CREATE TABLE procurement_auth (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE procurement_sessions (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE procurement_policies (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  quote_id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  bind_tx TEXT UNIQUE,
  confirmed_at INTEGER
);
