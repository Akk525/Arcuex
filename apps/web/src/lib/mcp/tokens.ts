import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { McpTokenStore } from '@arcuex/persistence';
import { getDb, getRepo } from '@/lib/server/db';
import {
  loadPrincipalFromSession,
  sessionStoreId,
  verifyWalletAndCreateSession,
} from '@/lib/server/claims-session';
import { DEFAULT_MCP_SCOPES, isMcpScope, type McpScope } from './scopes';

/**
 * MCP access tokens.
 *
 * - Issued only after the wallet proves control through the existing Arcuex wallet
 *   challenge (`issueClaimsNonce` → `verifyWalletAndCreateSession`). No private keys reach MCP.
 * - The bearer token is audience-specific (`amcp_` prefix, only accepted at /api/mcp). It is
 *   never forwarded. Internally it unseals a wallet session that the existing route handlers
 *   authenticate exactly as they do for browser users, so backend authorization is unchanged.
 * - At rest we keep SHA-256(token) and the session secret sealed with a key derived from the
 *   token; a database reader can recover neither.
 */
export type McpPrincipal = {
  tokenId: string;
  wallet: `0x${string}`;
  agentId: string | null;
  scopes: McpScope[];
  clientName: string;
  expiresAt: string;
  /** Raw wallet-session secret. In-process only; never logged or returned. */
  sessionSecret: string;
};

export type McpAuthFailure = {
  ok: false;
  reasonCode:
    | 'TOKEN_MISSING'
    | 'TOKEN_MALFORMED'
    | 'TOKEN_INVALID'
    | 'TOKEN_REVOKED'
    | 'TOKEN_EXPIRED'
    | 'SESSION_INVALID'
    | 'AGENT_BINDING_INVALID';
  message: string;
};

const TOKEN_PATTERN = /^amcp_[A-Za-z0-9_-]{43}$/;
export const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');

function key(token: string) {
  return Buffer.from(hkdfSync('sha256', token, 'arcuex-mcp-session-seal', 'v1', 32));
}
function seal(secret: string, token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(token), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv, body, cipher.getAuthTag()]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}
function unseal(sealed: string, token: string): string {
  const [version, iv, body, tag] = sealed.split('.');
  if (version !== 'v1' || !iv || !body || !tag) throw new Error('Unsupported seal');
  const decipher = createDecipheriv('aes-256-gcm', key(token), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function parseRequestedScopes(raw: unknown): McpScope[] {
  if (raw === undefined) return [...DEFAULT_MCP_SCOPES];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8 || !raw.every(isMcpScope))
    throw new Error('Unknown or malformed scope');
  const scopes = [...new Set(raw)];
  // Every useful token must at least read the state it is acting on.
  return scopes.includes('arcuex:read') ? scopes : ['arcuex:read', ...scopes];
}

export async function issueMcpToken(input: {
  nonce: string;
  signature: `0x${string}`;
  scopes: McpScope[];
  agentId?: string;
  clientName: string;
}) {
  const repo = getRepo();
  const challenge = repo.getClaimsAuthNonce(input.nonce);
  if (!challenge) throw new Error('Unknown nonce');
  const session = await verifyWalletAndCreateSession(repo, {
    wallet: challenge.walletAddress,
    nonce: input.nonce,
    signature: input.signature,
  });
  const wallet = session.principal.walletAddress!.toLowerCase() as `0x${string}`;
  const storeId = sessionStoreId(session.sessionId);
  if (input.agentId) {
    const agent = repo.getProcurementAgent(input.agentId);
    if (!agent || agent.signer.toLowerCase() !== wallet) {
      repo.revokeClaimsSession(storeId, new Date().toISOString());
      throw new Error('Agent identity does not match the authenticated signer');
    }
  }
  const token = `amcp_${randomBytes(32).toString('base64url')}`;
  const id = tokenId(token);
  const createdAt = new Date().toISOString();
  new McpTokenStore(getDb()).insert({
    id,
    walletAddress: wallet,
    agentId: input.agentId ?? null,
    scopes: input.scopes,
    clientName: input.clientName,
    sessionStoreId: storeId,
    sealedSession: seal(session.sessionId, token),
    createdAt,
    expiresAt: session.expiresAt,
  });
  repo.insertAudit('mcp_token', id, 'mcp.token.issued', {
    wallet,
    agentId: input.agentId ?? null,
    scopes: input.scopes,
    clientName: input.clientName,
    expiresAt: session.expiresAt,
  });
  return {
    accessToken: token,
    tokenType: 'Bearer' as const,
    expiresAt: session.expiresAt,
    scopes: input.scopes,
    wallet,
    agentId: input.agentId ?? null,
  };
}

export function readBearer(header: string | null): string | null {
  const match = header ? /^Bearer\s+(\S+)\s*$/i.exec(header.trim()) : null;
  return match?.[1] ?? null;
}

/** Re-validated on every MCP request: token state, backing session, epoch and agent binding. */
export function authenticateMcpToken(
  token: string | null,
): { ok: true; principal: McpPrincipal } | McpAuthFailure {
  if (!token) return { ok: false, reasonCode: 'TOKEN_MISSING', message: 'Bearer token required' };
  if (!TOKEN_PATTERN.test(token))
    return { ok: false, reasonCode: 'TOKEN_MALFORMED', message: 'Malformed MCP bearer token' };
  const id = tokenId(token);
  const record = new McpTokenStore(getDb()).get(id);
  if (!record) return { ok: false, reasonCode: 'TOKEN_INVALID', message: 'Unknown MCP token' };
  if (record.revokedAt)
    return { ok: false, reasonCode: 'TOKEN_REVOKED', message: 'MCP token revoked' };
  if (!(Date.parse(record.expiresAt) > Date.now()))
    return { ok: false, reasonCode: 'TOKEN_EXPIRED', message: 'MCP token expired' };
  let secret: string;
  try {
    secret = unseal(record.sealedSession, token);
  } catch {
    return { ok: false, reasonCode: 'TOKEN_INVALID', message: 'MCP token could not be verified' };
  }
  const repo = getRepo();
  const session =
    sessionStoreId(secret) === record.sessionStoreId
      ? loadPrincipalFromSession(repo, secret)
      : null;
  if (
    !session ||
    session.role !== 'claimant' ||
    session.walletAddress?.toLowerCase() !== record.walletAddress
  )
    return {
      ok: false,
      reasonCode: 'SESSION_INVALID',
      message: 'Backing wallet session expired, revoked or rotated; request a new token',
    };
  if (record.agentId) {
    const agent = repo.getProcurementAgent(record.agentId);
    if (!agent || agent.signer.toLowerCase() !== record.walletAddress)
      return {
        ok: false,
        reasonCode: 'AGENT_BINDING_INVALID',
        message: 'Token agent binding no longer matches the registered signer',
      };
  }
  return {
    ok: true,
    principal: {
      tokenId: id,
      wallet: record.walletAddress as `0x${string}`,
      agentId: record.agentId,
      scopes: record.scopes.filter(isMcpScope),
      clientName: record.clientName,
      expiresAt: record.expiresAt,
      sessionSecret: secret,
    },
  };
}

export function revokeMcpToken(token: string | null): boolean {
  const auth = authenticateMcpToken(token);
  if (!auth.ok) return false;
  const now = new Date().toISOString();
  const store = new McpTokenStore(getDb());
  const record = store.get(auth.principal.tokenId)!;
  store.revoke(record.id, now);
  getRepo().revokeClaimsSession(record.sessionStoreId, now);
  getRepo().insertAudit('mcp_token', record.id, 'mcp.token.revoked', { at: now });
  return true;
}
