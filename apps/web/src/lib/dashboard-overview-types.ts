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
