import { ValidationError } from '@arcuex/domain';

export type ClaimsRole = 'claimant' | 'reviewer' | 'authority' | 'system';

/**
 * Server-issued principal. Clients cannot mint this by sending actor strings —
 * HTTP adapters must map verified secrets/sessions into this type.
 */
export type ClaimsPrincipal = {
  role: ClaimsRole;
  /** Stable id assigned by the authenticator (not a client-supplied role label). */
  subject: string;
  walletAddress?: string;
  policyholderId?: string;
  agentId?: string;
  /** Set only by server when CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP=1. */
  allowSyntheticSettlementPrep?: boolean;
};

export function claimsActorId(principal: ClaimsPrincipal): string {
  return `${principal.role}:${principal.subject}${principal.agentId ? `/agent:${principal.agentId}` : ''}`;
}

export function assertClaimsRole(principal: ClaimsPrincipal, allowed: readonly ClaimsRole[]): void {
  if (!allowed.includes(principal.role)) {
    throw new ValidationError(
      `Claims action requires role ${allowed.join('|')} (got ${principal.role})`,
    );
  }
}

export function normalizeWallet(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new ValidationError('Invalid wallet address');
  }
  return address.toLowerCase();
}
