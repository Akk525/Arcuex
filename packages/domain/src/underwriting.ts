import type { ProcurementAgent, ProcurementQuote } from './procurement';

export const ORACLE_UNDERWRITING_RULE = 'synthetic-oracle-underwriting-v1';
export const ORACLE_CLAIM_EVIDENCE = [
  'Liquidation event and affected position',
  'Oracle observation and causal link to the liquidation',
  'Loss calculation, recoveries and prior compensation',
] as const;

export type UnderwritingStatus = 'needs_evidence' | 'needs_review' | 'ready' | 'declined';

export type UnderwritingOperation = 'monitor' | 'manage_position';

export type UnderwritingApplicationInput = {
  idempotencyKey: string;
  agentId: string;
  delegationId?: string;
  productCode: string;
  limitMicros: string;
  durationDays: number;
  operation: UnderwritingOperation;
  activity: string;
  attestEligible: true;
};

export type UnderwritingEntry = {
  id: string;
  at: number;
  by: string;
} & (
  | { kind: 'request'; text: string }
  | { kind: 'response'; requestId: string; text: string }
  | { kind: 'message'; text: string }
  | { kind: 'decision'; outcome: 'approve' | 'decline'; text: string }
);

export type UnderwritingAction = { idempotencyKey: string } & (
  | { action: 'request' | 'message'; text: string }
  | { action: 'response'; requestId: string; text: string }
  | { action: 'decision'; outcome: 'approve' | 'decline'; text: string }
  | { action: 'quote' }
);

export type UnderwritingSnapshot = {
  applicationId: string;
  productVersion: number;
  ruleVersion: string;
  dossierDigest: string;
  reasons: string[];
  claimEvidence: readonly string[];
};

export type UnderwritingApplication = {
  id: string;
  agent: ProcurementAgent;
  applicant: string;
  delegationId: string | null;
  beneficiary: string;
  productCode: string;
  productVersion: number;
  limitMicros: string;
  durationDays: number;
  operation: UnderwritingOperation;
  activity: string;
  createdAt: number;
};

export type UnderwritingView = {
  application: UnderwritingApplication;
  entries: UnderwritingEntry[];
  status: UnderwritingStatus;
  findings: { label: string; source: string; detail: string }[];
  reasons: string[];
  premiumMicros: string;
  deductibleMicros: string;
  claimEvidence: readonly string[];
  quote: ProcurementQuote | null;
  policyState: 'prepared' | 'confirmed' | null;
};
