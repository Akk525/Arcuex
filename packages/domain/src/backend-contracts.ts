/** Versioned, JSON-safe read contracts shared with the dashboard. No credentials. */
export type SessionMe = {
  version: 1;
  state: 'authenticated' | 'anonymous';
  wallet: string | null;
  chainId: 5042002 | null;
  role: 'claimant' | 'reviewer' | 'authority' | 'system' | null;
  capabilities: Array<
    | 'procurement:read'
    | 'claims:intake'
    | 'claims:review'
    | 'settlement:prepare'
    | 'reconciliation:read'
  >;
};
export type PolicyLifecycle = {
  version: 1;
  policyId: string;
  onchainPolicyId: string;
  state:
    | 'prepared'
    | 'submitted'
    | 'confirmed'
    | 'expired'
    | 'failed'
    | 'reconciliation_pending'
    | 'fixture_ready';
  source?: {
    mode: 'arc-testnet' | 'fixture';
    id: string;
    digest?: string;
    checkpoint?: { sequence: number; createdAt: number; validUntil: number };
  };
  completeness: 'VERIFIED_LINKED' | 'ONCHAIN_UNLINKED' | 'INCOMPLETE' | 'ORPHANED' | null;
  chainId: 5042002;
  pool: string;
  claimsEligible: boolean;
  checkedAt: number | null;
  confirmation: {
    transactionHash: string;
    explorerUrl: string | null;
    blockNumber: string;
    blockHash: string;
    logIndex: number;
  } | null;
  settlements: Array<{
    caseId: string;
    state: string;
    paymentFinality?: 'not_paid' | 'unverified' | 'confirmed' | 'reorged';
    receiptRef: string | null;
    explorerUrl: string | null;
  }>;
  notice: string;
};
