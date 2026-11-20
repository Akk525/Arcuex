import { effectiveAgentId, sourceMode, type ToolContext, tool, type AnyToolSpec } from '../context';
import { caseDetail, investigation, type CaseDetail } from './claims';
import { uuid } from './shared';

export const SETTLEMENT_STAGES = [
  'CLAIM_FILED',
  'EVIDENCE_INCOMPLETE',
  'INVESTIGATION_PENDING',
  'DENIED',
  'HUMAN_APPROVED',
  'SETTLEMENT_INTENT_PREPARED',
  'AWAITING_FINANCIAL_AUTHORITY',
  'TRANSACTION_SUBMITTED',
  'PENDING_CANONICAL_CONFIRMATION',
  'REIMBURSED',
  'FAILED',
  'REORGED',
] as const;
export type SettlementStage = (typeof SETTLEMENT_STAGES)[number];

/**
 * Derived only from backend-projected state. REIMBURSED requires the backend's
 * `paymentFinality: confirmed` with a matching canonical receipt; nothing else qualifies.
 */
export function settlementStage(d: CaseDetail, openRequests: number): SettlementStage {
  const s = d.case.status;
  if (d.paymentFinality === 'confirmed' && d.confirmedSettlementReceipt && s === 'PAID')
    return 'REIMBURSED';
  if (d.paymentFinality === 'reorged') return 'REORGED';
  if (s === 'SUBMITTED') return 'CLAIM_FILED';
  if (s === 'COLLECTING_EVIDENCE') return 'EVIDENCE_INCOMPLETE';
  if (s === 'INVESTIGATING' || s === 'REVIEW')
    return openRequests ? 'EVIDENCE_INCOMPLETE' : 'INVESTIGATION_PENDING';
  if (s === 'DENIED') return 'DENIED';
  if (s === 'APPROVED')
    return d.case.settlementAuthorization === 'pending_authority'
      ? 'AWAITING_FINANCIAL_AUTHORITY'
      : 'HUMAN_APPROVED';
  if (s === 'SETTLEMENT_PENDING')
    return d.paymentFinality === 'unverified'
      ? 'PENDING_CANONICAL_CONFIRMATION'
      : 'SETTLEMENT_INTENT_PREPARED';
  if (s === 'SETTLEMENT_FAILED') return 'FAILED';
  // PAID without a confirmed canonical receipt is never reported as reimbursed.
  return 'PENDING_CANONICAL_CONFIRMATION';
}

function financialGate(d: CaseDetail) {
  const synthetic = d.case.syntheticDemo || d.case.evidenceAuthenticity === 'synthetic_fixture';
  if (synthetic)
    return {
      state: 'BLOCKED',
      reasonCode: 'SYNTHETIC_SETTLEMENT_PROHIBITED',
      detail: 'Synthetic/fixture claims can never authorize or confirm USDC settlement.',
    };
  if (d.case.status === 'APPROVED')
    return {
      state: 'AWAITING_FINANCIAL_AUTHORITY',
      reasonCode: 'CLAIMS_AUTHORITY_REQUIRED',
      detail:
        'A separately authenticated claims authority must prepare and sign settlement. Not available to insured agents.',
    };
  if (d.case.status === 'SETTLEMENT_PENDING')
    return {
      state: 'PENDING',
      reasonCode: 'SETTLEMENT_IN_PROGRESS',
      detail: 'Awaiting authority signature or canonical confirmation.',
    };
  if (d.case.status === 'PAID' && d.paymentFinality === 'confirmed')
    return {
      state: 'SETTLED',
      reasonCode: 'CANONICAL_RECEIPT_VERIFIED',
      detail: 'Backend verified a canonical USDC settlement receipt.',
    };
  return {
    state: 'NOT_REACHED',
    reasonCode: `CLAIM_${d.case.status}`,
    detail: 'Financial gate is reached only after human approval.',
  };
}

async function load(ctx: ToolContext, raw: unknown) {
  const a = raw as { claimId: string; agentId?: string };
  const agentId = effectiveAgentId(ctx, a.agentId ?? null);
  const [d, inv] = await Promise.all([
    caseDetail(ctx, a.claimId, agentId),
    investigation(ctx, a.claimId, agentId),
  ]);
  return { d, stage: settlementStage(d, inv.outstandingRequests.length) };
}

const statusFor = (stage: SettlementStage) =>
  stage === 'REIMBURSED'
    ? 'SUCCESS'
    : stage === 'FAILED' || stage === 'REORGED' || stage === 'DENIED'
      ? 'BLOCKED'
      : stage === 'EVIDENCE_INCOMPLETE'
        ? 'ACTION_REQUIRED'
        : ['CLAIM_FILED', 'INVESTIGATION_PENDING'].includes(stage)
          ? 'UNDER_REVIEW'
          : 'PENDING';

const input = { claimId: uuid, agentId: uuid.optional() };
export const settlementTools: AnyToolSpec[] = [
  tool({
    name: 'arcuex_get_settlement_status',
    title: 'Get settlement status',
    description: `Read-only settlement stage: one of ${SETTLEMENT_STAGES.join(', ')}. REIMBURSED only after the backend verifies a matching canonical USDC receipt.`,
    scope: 'arcuex:read',
    input,
    readOnly: true,
    run: async (raw, ctx) => {
      const { d, stage } = await load(ctx, raw);
      return {
        status: statusFor(stage),
        reasonCode: stage,
        resourceId: d.case.id,
        sourceMode: sourceMode(ctx, d.case.syntheticDemo),
        canonicality: d.paymentFinality,
        transactionHash: d.confirmedSettlementReceipt ?? undefined,
        data: {
          stage,
          claimStatus: d.case.status,
          paymentFinality: d.paymentFinality,
          financialGate: financialGate(d),
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_reimbursement_details',
    title: 'Get reimbursement details',
    description:
      'Read-only approved amounts, recipient and payment finality. Approved amounts are not paid amounts until REIMBURSED.',
    scope: 'arcuex:read',
    input,
    readOnly: true,
    run: async (raw, ctx) => {
      const { d, stage } = await load(ctx, raw);
      return {
        status: statusFor(stage),
        reasonCode: stage,
        resourceId: d.case.id,
        data: {
          stage,
          payable: d.case.payable,
          verifiedLoss: d.case.verifiedLoss,
          deductible: d.case.deductible,
          recoveries: d.case.recoveries,
          remainingLimit: d.case.remainingLimit,
          recipient: d.case.payoutTo,
          paidAmount: stage === 'REIMBURSED' ? d.case.payable : null,
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_financial_gate',
    title: 'Get financial gate',
    description:
      'Read-only: what stands between this claim and payment (synthetic prohibition, claims authority, confirmation).',
    scope: 'arcuex:read',
    input,
    readOnly: true,
    run: async (raw, ctx) => {
      const { d, stage } = await load(ctx, raw);
      const gate = financialGate(d);
      return {
        status:
          gate.state === 'SETTLED' ? 'SUCCESS' : gate.state === 'BLOCKED' ? 'BLOCKED' : 'PENDING',
        reasonCode: gate.reasonCode,
        resourceId: d.case.id,
        data: { stage, gate, settlementAuthorization: d.case.settlementAuthorization },
        nextAction:
          gate.state === 'AWAITING_FINANCIAL_AUTHORITY'
            ? {
                actor: 'claims_authority',
                description: 'Claims authority action required; agents cannot act here.',
              }
            : undefined,
      };
    },
  }),
  tool({
    name: 'arcuex_get_payment_receipt',
    title: 'Get payment receipt',
    description:
      'Read-only canonical USDC settlement receipt, returned only when the backend has verified it as confirmed.',
    scope: 'arcuex:read',
    input,
    readOnly: true,
    run: async (raw, ctx) => {
      const { d, stage } = await load(ctx, raw);
      if (stage !== 'REIMBURSED')
        return {
          status: statusFor(stage),
          reasonCode: stage === 'REORGED' ? 'RECEIPT_REORGED' : 'NO_CONFIRMED_RECEIPT',
          resourceId: d.case.id,
          canonicality: d.paymentFinality,
          data: { stage, receipt: null },
        };
      return {
        status: 'SUCCESS',
        reasonCode: 'REIMBURSED',
        resourceId: d.case.id,
        transactionHash: d.confirmedSettlementReceipt!,
        canonicality: 'confirmed',
        data: {
          stage,
          receipt: {
            transactionHash: d.confirmedSettlementReceipt,
            chainId: 5042002,
            asset: 'USDC',
            amount: d.case.payable,
            recipient: d.case.payoutTo,
          },
        },
      };
    },
  }),
];
