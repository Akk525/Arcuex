type PillTone = 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'live' | 'synthetic';

const POLICY_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending_funding: { label: 'Awaiting funding', tone: 'pending' },
  bound: { label: 'Bound', tone: 'live' },
  active: { label: 'Active', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  exhausted: { label: 'Limit exhausted', tone: 'warn' },
};

/** Lifecycle status only. Claims eligibility is shown separately and comes from reconciliation. */
export function policyStatusPill(status: string): { label: string; tone: PillTone } {
  return POLICY_STATUS[status.toLowerCase()] ?? { label: status, tone: 'neutral' };
}

const CLAIM_TONE: Record<string, PillTone> = {
  DRAFT: 'warn',
  COLLECTING_EVIDENCE: 'warn',
  SUBMITTED: 'pending',
  INVESTIGATING: 'pending',
  REVIEW: 'pending',
  APPROVED: 'live',
  DENIED: 'neutral',
  SETTLEMENT_PENDING: 'pending',
  SETTLEMENT_FAILED: 'error',
  PAID: 'ok',
};

export function claimTone(status: string): PillTone {
  return CLAIM_TONE[status] ?? 'neutral';
}

const COMPLETENESS: Record<string, string> = {
  INCOMPLETE: 'Bind evidence incomplete',
  ONCHAIN_UNLINKED: 'On-chain policy not yet linked',
  ORPHANED: 'On-chain record without a local policy',
  REORG: 'Chain reorganized, re-checking',
  VERIFIED_LINKED: 'Reconciled',
};

export function reconciliationLabel(completeness: string): string {
  return COMPLETENESS[completeness] ?? completeness.replaceAll('_', ' ').toLowerCase();
}

/** Turn backend activity summaries like "Claim COLLECTING_EVIDENCE" into a title + status. */
export function activityPresentation(
  kind: string,
  summary: string,
  claimLabel: (status: string) => string,
): { title: string; status: { label: string; tone: PillTone } | null } {
  const match = /^(Claim|Synthetic|Policy) ([A-Za-z_]+)$/.exec(summary);
  if (!match) return { title: summary, status: null };
  const [, noun, status = ''] = match;
  if (kind === 'claim') {
    const label = claimLabel(status);
    // A PAID status without a verified receipt label must never read as settled.
    const tone = status === 'PAID' && label !== 'Payment confirmed' ? 'warn' : claimTone(status);
    return { title: 'Claim updated', status: { label, tone } };
  }
  return {
    title: noun === 'Synthetic' ? 'Synthetic policy recorded' : 'Policy recorded',
    status: policyStatusPill(status),
  };
}
