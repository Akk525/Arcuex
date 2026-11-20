export type DashboardOverview = {
  version: 1;
  state: 'anonymous' | 'authenticated';
  role: string | null;
  wallet: string | null;
  nextAction: { label: string; href: string; reason: string } | null;
  portfolio: {
    total: number;
    byStatus: Record<string, number>;
    items: Array<{
      id: string;
      status: string;
      synthetic: boolean;
      claimsEligible: boolean;
      label: string;
    }>;
  };
  agents: Array<{ id: string; label: string; status: string }>;
  delegations: Array<{
    id: string;
    agentId: string;
    validity: string;
    synthetic?: boolean;
  }>;
  claimsNeedingAttention: Array<{
    id: string;
    status: string;
    reason: string;
    href: string;
  }>;
  evidenceRequests: Array<{
    caseId: string;
    id: string;
    href: string;
  }>;
  pendingReconciliation: Array<{
    policyId: string | null;
    onchainPolicyId: string;
    completeness: string;
    href: string;
  }>;
  recentActivity: Array<{
    at: string;
    kind: string;
    summary: string;
    href?: string;
  }>;
  labels: { synthetic: string; live: string };
};

export type DashboardOverviewInput = {
  state: 'anonymous' | 'authenticated';
  role: string | null;
  wallet: string | null;
  policies: Array<{
    id: string;
    status: string;
    synthetic: boolean;
    claimsEligible: boolean;
    label: string;
  }>;
  agents: Array<{ id: string; label: string; status: string }>;
  delegations: Array<{
    id: string;
    agentId: string;
    validity: string;
    synthetic?: boolean;
  }>;
  claims: Array<{
    id: string;
    status: string;
    reason: string;
    href: string;
    hasConfirmedSettlement: boolean;
  }>;
  evidenceRequests: Array<{
    caseId: string;
    id: string;
    href: string;
  }>;
  reconciliation: Array<{
    policyId: string | null;
    onchainPolicyId: string;
    completeness: string;
    href: string;
  }>;
  recentActivity: Array<{
    at: string;
    kind: string;
    summary: string;
    href?: string;
  }>;
  labels: { synthetic: string; live: string };
};

const ATTENTION_STATUSES = new Set(['DRAFT', 'COLLECTING_EVIDENCE']);

function attentionReason(
  claim: DashboardOverviewInput['claims'][number],
  hasOutstandingEvidence: boolean,
): string | null {
  if (claim.status === 'APPROVED' && !claim.hasConfirmedSettlement) {
    return 'Approved — payment not confirmed';
  }
  if (ATTENTION_STATUSES.has(claim.status)) {
    return claim.reason || `Claim status ${claim.status}`;
  }
  if (hasOutstandingEvidence) {
    return 'Outstanding evidence request';
  }
  return null;
}

function pickNextAction(input: {
  state: DashboardOverviewInput['state'];
  portfolioTotal: number;
  claimsNeedingAttention: DashboardOverview['claimsNeedingAttention'];
  evidenceRequests: DashboardOverview['evidenceRequests'];
  pendingReconciliation: DashboardOverview['pendingReconciliation'];
}): DashboardOverview['nextAction'] {
  if (input.state === 'anonymous') {
    return {
      label: 'Explore coverage',
      href: '/coverage',
      reason: 'Connect a wallet and sign in from the account bar to see your portfolio.',
    };
  }
  const claim = input.claimsNeedingAttention[0];
  if (claim) {
    return {
      label: 'Continue claim',
      href: claim.href,
      reason: claim.reason,
    };
  }
  const evidence = input.evidenceRequests[0];
  if (evidence) {
    return {
      label: 'Respond to evidence request',
      href: evidence.href,
      reason: 'A claim has an outstanding evidence request.',
    };
  }
  const pending = input.pendingReconciliation[0];
  if (pending) {
    return {
      label: 'Review pending reconciliation',
      href: pending.href,
      reason: `Checkout or bind evidence is ${pending.completeness}.`,
    };
  }
  if (input.portfolioTotal === 0) {
    return {
      label: 'Obtain coverage',
      href: '/coverage',
      reason: 'No policies in this session yet.',
    };
  }
  return null;
}

export function buildDashboardOverview(input: DashboardOverviewInput): DashboardOverview {
  const byStatus: Record<string, number> = {};
  for (const policy of input.policies) {
    byStatus[policy.status] = (byStatus[policy.status] ?? 0) + 1;
  }

  const evidenceByCase = new Set(input.evidenceRequests.map((e) => e.caseId));
  const claimsNeedingAttention: DashboardOverview['claimsNeedingAttention'] = [];
  for (const claim of input.claims) {
    const reason = attentionReason(claim, evidenceByCase.has(claim.id));
    if (!reason) continue;
    claimsNeedingAttention.push({
      id: claim.id,
      status: claim.status,
      reason,
      href: claim.href,
    });
  }

  const pendingReconciliation = input.reconciliation.filter(
    (row) => row.completeness !== 'VERIFIED_LINKED',
  );

  const nextAction = pickNextAction({
    state: input.state,
    portfolioTotal: input.policies.length,
    claimsNeedingAttention,
    evidenceRequests: input.evidenceRequests,
    pendingReconciliation,
  });

  return {
    version: 1,
    state: input.state,
    role: input.role,
    wallet: input.wallet,
    nextAction,
    portfolio: {
      total: input.policies.length,
      byStatus,
      items: input.policies.map((p) => ({
        id: p.id,
        status: p.status,
        synthetic: p.synthetic,
        claimsEligible: p.claimsEligible === true,
        label: p.label,
      })),
    },
    agents: input.agents,
    delegations: input.delegations,
    claimsNeedingAttention,
    evidenceRequests: input.evidenceRequests,
    pendingReconciliation,
    recentActivity: input.recentActivity,
    labels: input.labels,
  };
}
