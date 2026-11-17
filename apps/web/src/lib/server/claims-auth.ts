import { timingSafeEqual } from 'node:crypto';
import type { ClaimsPrincipal, ClaimsRole } from '@arcuex/insurance';
import { getRepo } from '@/lib/server/db';
import {
  loadPrincipalFromSession,
  parseSessionCookie,
} from '@/lib/server/claims-session';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function tokenForRole(role: ClaimsRole): string | undefined {
  switch (role) {
    case 'claimant':
      return process.env.CLAIMS_CLAIMANT_API_TOKEN?.trim();
    case 'reviewer':
      return process.env.CLAIMS_REVIEWER_API_TOKEN?.trim();
    case 'authority':
      return process.env.CLAIMS_AUTHORITY_API_TOKEN?.trim();
    case 'system':
      return process.env.CLAIMS_SYSTEM_API_TOKEN?.trim();
    default:
      return undefined;
  }
}

function enrichClaimantPrincipal(principal: ClaimsPrincipal): ClaimsPrincipal {
  if (principal.role !== 'claimant' || !principal.walletAddress) return principal;
  const repo = getRepo();
  const holder = repo.getPolicyholderByWallet(principal.walletAddress);
  if (holder) {
    return { ...principal, policyholderId: holder.id };
  }
  return principal;
}

/**
 * Authenticate claims requests.
 * Preference: httpOnly session cookie (wallet or ops-exchanged) → Bearer server tokens.
 * Client actor strings are ignored. Wallet sessions never become reviewer/authority.
 */
export function authenticateClaimsRequest(
  request: Request,
  allowed: readonly ClaimsRole[],
  opts?: { preferBearer?: boolean },
): { ok: true; principal: ClaimsPrincipal } | { ok: false; status: number; error: string } {
  const repo = getRepo();
  const bearer = readBearer(request);

  if (!opts?.preferBearer) {
    const sessionId = parseSessionCookie(request.headers.get('cookie'));
    if (sessionId) {
      const fromSession = loadPrincipalFromSession(repo, sessionId);
      if (fromSession) {
        if (!allowed.includes(fromSession.role)) {
          return {
            ok: false,
            status: 403,
            error: `Authenticated as ${fromSession.role} but action requires ${allowed.join('|')}`,
          };
        }
        return { ok: true, principal: enrichClaimantPrincipal(fromSession) };
      }
    }
  }

  if (!bearer) {
    return {
      ok: false,
      status: 401,
      error: 'Missing claims session cookie or Authorization Bearer token',
    };
  }

  let matched: ClaimsRole | null = null;
  for (const role of allowed) {
    const expected = tokenForRole(role);
    if (expected && safeEqual(bearer, expected)) {
      matched = role;
      break;
    }
  }

  if (!matched) {
    for (const role of ['claimant', 'reviewer', 'authority', 'system'] as const) {
      const expected = tokenForRole(role);
      if (expected && safeEqual(bearer, expected)) {
        return {
          ok: false,
          status: 403,
          error: `Authenticated as ${role} but action requires ${allowed.join('|')}`,
        };
      }
    }
    return { ok: false, status: 401, error: 'Invalid claims API token' };
  }

  // Bearer claimant tokens are server/automation only — still not a privileged escalation.
  const walletHeader = request.headers.get('x-arcuex-wallet')?.trim();
  const policyholderId = request.headers.get('x-arcuex-policyholder-id')?.trim();
  const agentId = request.headers.get('x-arcuex-agent-id')?.trim();
  const subject =
    request.headers.get('x-arcuex-subject')?.trim() ||
    (walletHeader ? walletHeader.toLowerCase() : 'api');

  const allowSynthetic =
    matched === 'authority' && process.env.CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP === '1';

  const principal = enrichClaimantPrincipal({
    role: matched,
    subject,
    walletAddress: walletHeader,
    policyholderId,
    agentId,
    allowSyntheticSettlementPrep: allowSynthetic || undefined,
  });

  return { ok: true, principal };
}
