import { createHash, randomBytes } from 'node:crypto';
import { newId } from '@arcuex/domain';
import type { ClaimsPrincipal, ClaimsRole } from '@arcuex/insurance';
import type { InsuranceRepository } from '@arcuex/persistence';
import { verifyMessage } from 'viem';

export const CLAIMS_SESSION_COOKIE = 'arcuex_claims_sid';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;

export function normalizeClaimsWallet(address: string): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Invalid wallet address');
  }
  return address.toLowerCase() as `0x${string}`;
}

export function buildClaimsAuthMessage(input: {
  wallet: string;
  nonce: string;
  expiresAt: string;
  chainId?: number;
}): string {
  return [
    'Arcuex Claims authentication',
    `ChainId: ${input.chainId ?? 5042002}`,
    `Address: ${normalizeClaimsWallet(input.wallet)}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt}`,
    'This signature proves wallet control for claims intake only.',
    'It does not grant reviewer or claims-authority privileges.',
  ].join('\n');
}

export function issueClaimsNonce(
  repo: InsuranceRepository,
  walletRaw: string,
): { nonce: string; message: string; expiresAt: string } {
  const wallet = normalizeClaimsWallet(walletRaw);
  const nonce = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
  const message = buildClaimsAuthMessage({ wallet, nonce, expiresAt });
  repo.insertClaimsAuthNonce({
    nonce,
    walletAddress: wallet,
    message,
    expiresAt,
  });
  return { nonce, message, expiresAt };
}

export async function verifyWalletAndCreateSession(
  repo: InsuranceRepository,
  input: { wallet: string; nonce: string; signature: `0x${string}` },
): Promise<{ sessionId: string; expiresAt: string; principal: ClaimsPrincipal }> {
  const wallet = normalizeClaimsWallet(input.wallet);
  const record = repo.getClaimsAuthNonce(input.nonce);
  if (!record) throw new Error('Unknown nonce');
  if (record.consumedAt) throw new Error('Nonce already used');
  if (Date.parse(record.expiresAt) <= Date.now()) throw new Error('Nonce expired');
  if (normalizeClaimsWallet(record.walletAddress) !== wallet) {
    throw new Error('Nonce wallet mismatch');
  }

  const ok = await verifyMessage({
    address: wallet,
    message: record.message,
    signature: input.signature,
  });
  if (!ok) throw new Error('Invalid wallet signature');

  const consumed = repo.consumeClaimsAuthNonce(input.nonce, new Date().toISOString());
  if (!consumed) throw new Error('Nonce already used');

  const sessionId = createHash('sha256').update(randomBytes(32)).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();
  repo.insertClaimsSession({
    id: sessionId,
    role: 'claimant',
    walletAddress: wallet,
    subject: wallet,
    allowSyntheticSettlementPrep: false,
    expiresAt,
    createdAt,
  });

  return {
    sessionId,
    expiresAt,
    principal: {
      role: 'claimant',
      subject: wallet,
      walletAddress: wallet,
    },
  };
}

/** Exchange a server API token for an opaque httpOnly session — token is never stored in the cookie. */
export function createOpsSessionFromBearer(
  repo: InsuranceRepository,
  role: 'reviewer' | 'authority',
  subject = 'ops',
): { sessionId: string; expiresAt: string; principal: ClaimsPrincipal } {
  const sessionId = createHash('sha256').update(randomBytes(32)).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const allowSynthetic =
    role === 'authority' && process.env.CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP === '1';
  repo.insertClaimsSession({
    id: sessionId,
    role,
    walletAddress: null,
    subject: `${role}:${subject}`,
    allowSyntheticSettlementPrep: allowSynthetic,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return {
    sessionId,
    expiresAt,
    principal: {
      role,
      subject,
      allowSyntheticSettlementPrep: allowSynthetic || undefined,
    },
  };
}

export function sessionCookieValue(sessionId: string): string {
  return sessionId;
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === CLAIMS_SESSION_COOKIE) return rest.join('=') || null;
  }
  return null;
}

export function loadPrincipalFromSession(
  repo: InsuranceRepository,
  sessionId: string,
): ClaimsPrincipal | null {
  const session = repo.getClaimsSession(sessionId);
  if (!session || session.revokedAt) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) return null;
  return {
    role: session.role as ClaimsRole,
    subject: session.subject,
    walletAddress: session.walletAddress ?? undefined,
    allowSyntheticSettlementPrep: session.allowSyntheticSettlementPrep || undefined,
  };
}

export function claimsSessionCookieOptions(expiresAt: string): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  expires: Date;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.CLAIMS_COOKIE_SECURE === '1',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  };
}

export function newOpaqueId(): string {
  return newId();
}
