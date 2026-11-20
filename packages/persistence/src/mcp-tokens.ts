import type { SqliteDb } from './db';

export type McpAccessTokenRecord = {
  id: string;
  walletAddress: string;
  agentId: string | null;
  scopes: string[];
  clientName: string;
  sessionStoreId: string;
  sealedSession: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

type Row = {
  id: string;
  wallet_address: string;
  agent_id: string | null;
  scopes_json: string;
  client_name: string;
  session_store_id: string;
  sealed_session: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

const map = (r: Row): McpAccessTokenRecord => ({
  id: r.id,
  walletAddress: r.wallet_address,
  agentId: r.agent_id,
  scopes: JSON.parse(r.scopes_json) as string[],
  clientName: r.client_name,
  sessionStoreId: r.session_store_id,
  sealedSession: r.sealed_session,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
});

/** Persistence only. Token semantics and authorization live in the MCP adapter. */
export class McpTokenStore {
  constructor(readonly db: SqliteDb) {}

  insert(record: Omit<McpAccessTokenRecord, 'revokedAt'>): void {
    this.db
      .prepare(
        `INSERT INTO mcp_access_tokens
         (id, wallet_address, agent_id, scopes_json, client_name, session_store_id, sealed_session, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.walletAddress,
        record.agentId,
        JSON.stringify(record.scopes),
        record.clientName,
        record.sessionStoreId,
        record.sealedSession,
        record.createdAt,
        record.expiresAt,
      );
  }

  get(id: string): McpAccessTokenRecord | null {
    const row = this.db.prepare('SELECT * FROM mcp_access_tokens WHERE id = ?').get(id) as
      Row | undefined;
    return row ? map(row) : null;
  }

  revoke(id: string, revokedAt: string): boolean {
    return (
      this.db
        .prepare('UPDATE mcp_access_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
        .run(revokedAt, id).changes > 0
    );
  }
}
