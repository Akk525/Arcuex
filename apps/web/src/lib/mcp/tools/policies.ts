import type { PolicyLifecycle, ProcurementPolicy } from '@arcuex/domain';
import { McpToolError } from '../results';
import { ok, sourceMode, type ToolContext, tool, type AnyToolSpec } from '../context';
import { uuid } from './shared';
import { canonicality, coverageStatus, lifecycle } from './procurement';

type PolicyDetail = {
  policy: ProcurementPolicy;
  approvals?: Array<{ hash: string; at: number }>;
  reconciliation: unknown;
  reconciliationError?: string;
};

async function detail(ctx: ToolContext, policyId: string) {
  return ok<PolicyDetail>(await ctx.backend.call('GET', `/api/procurement/policies/${policyId}`));
}

export function policyRecord(ctx: ToolContext, p: ProcurementPolicy, l: PolicyLifecycle) {
  const t = p.terms;
  return {
    policyId: t.policyId,
    onchainPolicyId: l.onchainPolicyId,
    product: { code: t.productCode, version: t.version },
    sourceMode: sourceMode(ctx, t.synthetic),
    synthetic: t.synthetic,
    policyholder: t.owner,
    insuredAgentId: t.agentId,
    coveredPosition: t.exposure,
    purchasingActor: p.payer,
    premiumPayer: p.payer,
    beneficiary: t.beneficiary,
    delegationId: p.delegationId,
    premiumMicros: t.premiumMicros,
    limitMicros: t.limitMicros,
    deductibleMicros: t.deductibleMicros,
    effectiveAt: t.effectiveAt,
    expiresAt: t.expiresAt,
    termsDigest: p.digest,
    insuredEvent: t.insuredEvent,
    exclusions: t.exclusions,
    bindingSource: l.source ?? null,
    bindTransaction:
      l.confirmation ?? (p.bindTx ? { transactionHash: p.bindTx, canonical: false } : null),
    canonicality: canonicality(l),
    coverageStatus: coverageStatus(p, l),
    claimsEligible: l.claimsEligible,
    lifecycleState: l.state,
    completeness: l.completeness,
  };
}

export const policyTools: AnyToolSpec[] = [
  tool({
    name: 'arcuex_list_policies',
    title: 'List policies',
    description:
      'List policies where this wallet is policyholder or premium payer, with offchain state. Use arcuex_get_policy_status for canonical status.',
    scope: 'arcuex:read',
    input: {},
    readOnly: true,
    run: async (_args, ctx) => {
      const policies = ok<ProcurementPolicy[]>(
        await ctx.backend.call('GET', '/api/procurement/policies'),
      );
      return {
        status: 'SUCCESS',
        data: policies.map((p) => ({
          policyId: p.terms.policyId,
          productCode: p.terms.productCode,
          synthetic: p.terms.synthetic,
          sourceMode: sourceMode(ctx, p.terms.synthetic),
          policyholder: p.terms.owner,
          premiumPayer: p.payer,
          offchainState: p.state,
          bindTx: p.bindTx,
          effectiveAt: p.terms.effectiveAt,
          expiresAt: p.terms.expiresAt,
        })),
      };
    },
  }),
  tool({
    name: 'arcuex_get_policy',
    title: 'Get policy record',
    description:
      'Full policy record: product/version, policyholder, insured agent, covered position, payer, beneficiary, limit, deductible, windows, binding references, canonicality and claims eligibility.',
    scope: 'arcuex:read',
    input: { policyId: uuid },
    readOnly: true,
    run: async (raw, ctx) => {
      const { policyId } = raw as { policyId: string };
      const d = await detail(ctx, policyId);
      const l = await lifecycle(ctx, policyId, ctx.principal.agentId);
      return {
        status: 'SUCCESS',
        resourceId: policyId,
        sourceMode: sourceMode(ctx, d.policy.terms.synthetic),
        canonicality: canonicality(l),
        data: {
          ...policyRecord(ctx, d.policy, l),
          onchainReconciliation: d.reconciliation,
          reconciliationError: d.reconciliationError,
          notice: l.notice,
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_policy_coverage',
    title: 'Get policy coverage',
    description:
      'Coverage terms fixed by this policy (event, exclusions, limit, deductible, window).',
    scope: 'arcuex:read',
    input: { policyId: uuid },
    readOnly: true,
    run: async (raw, ctx) => {
      const { policyId } = raw as { policyId: string };
      const { policy } = await detail(ctx, policyId);
      const t = policy.terms;
      return {
        status: 'SUCCESS',
        resourceId: policyId,
        sourceMode: sourceMode(ctx, t.synthetic),
        data: {
          termsDigest: policy.digest,
          insuredEvent: t.insuredEvent,
          exclusions: t.exclusions,
          limitMicros: t.limitMicros,
          deductibleMicros: t.deductibleMicros,
          premiumMicros: t.premiumMicros,
          effectiveAt: t.effectiveAt,
          expiresAt: t.expiresAt,
          beneficiary: t.beneficiary,
          coveredPosition: t.exposure,
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_policy_status',
    title: 'Get policy status',
    description:
      'Backend-authoritative status: pending payment, pending canonical confirmation, scheduled, active, expired, reorged or synthetic fixture, with claims eligibility.',
    scope: 'arcuex:read',
    input: { policyId: uuid },
    readOnly: true,
    run: async (raw, ctx) => {
      const { policyId } = raw as { policyId: string };
      const { policy } = await detail(ctx, policyId);
      const l = await lifecycle(ctx, policyId, ctx.principal.agentId);
      const status = coverageStatus(policy, l);
      return {
        status:
          status === 'active' || status === 'scheduled'
            ? 'SUCCESS'
            : status === 'reorged'
              ? 'BLOCKED'
              : 'PENDING',
        reasonCode: status.toUpperCase(),
        resourceId: policyId,
        sourceMode: sourceMode(ctx, policy.terms.synthetic),
        canonicality: canonicality(l),
        data: { coverageStatus: status, claimsEligible: l.claimsEligible, lifecycle: l },
      };
    },
  }),
  tool({
    name: 'arcuex_get_policy_transactions',
    title: 'Get policy transactions',
    description:
      'Approval and bind receipts recorded for this policy, the canonical bind link, and any claim settlement receipts.',
    scope: 'arcuex:read',
    input: { policyId: uuid },
    readOnly: true,
    run: async (raw, ctx) => {
      const { policyId } = raw as { policyId: string };
      const d = await detail(ctx, policyId);
      const l = await lifecycle(ctx, policyId, ctx.principal.agentId);
      const refs = [
        ...(d.approvals ?? []).map((a) => a.hash),
        ...(d.policy.bindTx ? [d.policy.bindTx] : []),
      ];
      return {
        status: 'SUCCESS',
        resourceId: policyId,
        canonicality: canonicality(l),
        evidenceReferences: refs,
        data: {
          approvals: d.approvals ?? [],
          recordedBindReceipt: d.policy.bindTx,
          canonicalBind: l.confirmation,
          settlements: l.settlements,
        },
      };
    },
  }),
];

export function assertFound(value: unknown, what: string): asserts value {
  if (!value) throw new McpToolError('FAILED', 'NOT_FOUND', `${what} not found`);
}
