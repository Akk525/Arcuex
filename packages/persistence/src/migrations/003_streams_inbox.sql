-- QuickNode Streams persistent inbox (authenticated webhook deliveries).
-- Webhook acceptance is transport proof only — never payout authorization.

CREATE TABLE IF NOT EXISTS streams_inbox (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tx_hash TEXT,
  block_number TEXT,
  log_index TEXT,
  payload_json TEXT NOT NULL,
  signature_ok INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_streams_inbox_processed ON streams_inbox(processed, received_at);
