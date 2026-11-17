import { createHash, randomBytes } from 'node:crypto';
import { newId } from '@arcuex/domain';
import type { ClaimsPrincipal, ClaimsRole } from '@arcuex/insurance';
import type { InsuranceRepository } from '@arcuex/persistence';
import { verifyMessage } from 'viem';
import { getRuntimeConfig } from './runtime-config';

export const CLAIMS_SESSION_COOKIE = 'arcuex_claims_sid';

export function normalizeClaimsWallet(address: string): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error('Invalid wallet address');
  }
  return address.toLowerCase() as `0x${string}`;
}

export function buildClaimsAuthMessage(input: {
  wallet: string;
  nonce: string;
  expiresAt: string;
  chainId?: number;
  origin?: string;
}): string {
  return [
    'Arcuex wallet authentication',
    `Origin: ${input.origin ?? 'http://localhost'}`,
    `ChainId: ${input.chainId ?? 5042002}`,
    `Address: ${normalizeClaimsWallet(input.wallet)}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt}`,
    'This signature proves wallet control for procurement and claims intake.',
    'It does not grant reviewer or claims-authority privileges.',
  ].join('\n');
}

export function issueClaimsNonce(
  repo: InsuranceRepository,
  walletRaw: string,
  origin = 'http://localhost',
): { nonce: string; message: string; expiresAt: string } {
  const c = getRuntimeConfig();
  if (c.enforced && origin !== c.origin) {
    throw new Error('Signing origin does not match deployment');
  }
  const wallet = normalizeClaimsWallet(walletRaw);
  const nonce = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + c.nonceTtlSeconds * 1000).toISOString();
  const message = buildClaimsAuthMessage({ wallet, nonce, expiresAt, origin });
  repo.runInTransaction(() =>
    repo.insertClaimsAuthNonce({
      nonce,
      walletAddress: wallet,
      message,
      expiresAt,
    }),
  );
  return { nonce, message, expiresAt };
}

export async function verifyWalletAndCreateSession(
  repo: InsuranceRepository,
  input: { wallet: string; nonce: string; signature: `0x${string}` },
): Promise<{ sessionId: string; expiresAt: string; principal: ClaimsPrincipal }> {
  const c = getRuntimeConfig();
  const wallet = normalizeClaimsWallet(input.wallet);
  const record = repo.getClaimsAuthNonce(input.nonce);
  if (!record) throw new Error('Unknown nonce');
  if (record.consumedAt) throw new Error('Nonce already used');
  if (Date.parse(record.expiresAt) <= Date.now()) throw new Error('Nonce expired');
  if (normalizeClaimsWallet(record.walletAddress) !== wallet) {
    throw new Error('Nonce wallet mismatch');
  }

  if (
    c.enforced &&
    record.message !==
      buildClaimsAuthMessage({
        wallet,
        nonce: input.nonce,
        expiresAt: record.expiresAt,
        origin: c.origin,
      })
  ) {
    throw new Error('Nonce signing domain differs from deployment');
  }

  const ok = await verifyMessage({
    address: wallet,
    message: record.message,
    signature: input.signature,
  });
  if (!ok) throw new Error('Invalid wallet signature');

  return repo.runInTransaction(() => {
    const consumed = repo.consumeClaimsAuthNonce(input.nonce, new Date().toISOString());
    if (!consumed) throw new Error('Nonce already used');

    const sessionId = createHash('sha256').update(randomBytes(32)).digest('hex');
    const expiresAt = new Date(Date.now() + getRuntimeConfig().sessionTtlSeconds * 1000).toISOString();
    const createdAt = new Date().toISOString();
    repo.insertClaimsSession({
      id: sessionStoreId(sessionId),
      configEpoch: c.sessionEpoch,
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
  });
}

/** Exchange a server API token for an opaque httpOnly session — token is never stored in the cookie. */
export function createOpsSessionFromBearer(
  repo: InsuranceRepository,
  role: 'reviewer' | 'authority',
  subject = 'ops',
): { sessionId: string; expiresAt: string; principal: ClaimsPrincipal } {
  const c = getRuntimeConfig();
  const sessionId = createHash('sha256').update(randomBytes(32)).digest('hex');
  const expiresAt = new Date(Date.now() + c.sessionTtlSeconds * 1000).toISOString();
  const allowSynthetic =
    role === 'authority' && !c.enforced && process.env.CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP === '1';
  repo.insertClaimsSession({
    id: sessionStoreId(sessionId),
    configEpoch: c.sessionEpoch,
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
  if (!/^[0-9a-f]{64}$/.test(sessionId)) return null;
  const c = getRuntimeConfig();
  const session = repo.getClaimsSession(sessionStoreId(sessionId));
  if (!session || session.revokedAt || (c.enforced && session.configEpoch !== c.sessionEpoch)) {
    return null;
  }
  if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
    return null;
  }
  return {
    role: session.role as ClaimsRole,
    subject: session.subject,
    walletAddress: session.walletAddress ?? undefined,
    allowSyntheticSettlementPrep:
      (!c.enforced &&
        session.role === 'authority' &&
        session.allowSyntheticSettlementPrep &&
        process.env.CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP === '1') ||
      undefined,
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
    secure: getRuntimeConfig().secureCookies,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  };
}

export function newOpaqueId(): string {
  return newId();
}

export function sessionStoreId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}
