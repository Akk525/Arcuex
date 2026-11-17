import { timingSafeEqual } from 'node:crypto';
import type { ClaimsPrincipal, ClaimsRole } from '@arcuex/insurance';

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

/**
 * Map verified API tokens to ClaimsPrincipal.
 * Client-supplied actor/role strings are ignored — only Bearer secrets count.
 */
export function authenticateClaimsRequest(
  request: Request,
  allowed: readonly ClaimsRole[],
): { ok: true; principal: ClaimsPrincipal } | { ok: false; status: number; error: string } {
  const bearer = readBearer(request);
  if (!bearer) {
    return {
      ok: false,
      status: 401,
      error: 'Missing Authorization Bearer token for claims action',
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

  // Also accept if token matches a role not in allowed — still reject via role check below
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

  const walletHeader = request.headers.get('x-arcuex-wallet')?.trim();
  const policyholderId = request.headers.get('x-arcuex-policyholder-id')?.trim();
  const agentId = request.headers.get('x-arcuex-agent-id')?.trim();
  const subject =
    request.headers.get('x-arcuex-subject')?.trim() ||
    (walletHeader ? walletHeader.toLowerCase() : 'api');

  const allowSynthetic =
    matched === 'authority' && process.env.CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP === '1';

  return {
    ok: true,
    principal: {
      role: matched,
      subject,
      walletAddress: walletHeader,
      policyholderId,
      agentId,
      allowSyntheticSettlementPrep: allowSynthetic || undefined,
    },
  };
}
