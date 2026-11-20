import { z } from 'zod';
import type { PolicyLifecycle, ProcurementPolicy, ProcurementQuote } from '@arcuex/domain';
import { ProcurementStore } from '@arcuex/persistence';
import { getDb } from '@/lib/server/db';
import { McpToolError } from '../results';
import {
  effectiveAgentId,
  ok,
  sourceMode,
  type ToolContext,
  tool,
  type AnyToolSpec,
} from '../context';
import { address, idempotencyKey, micros, txHash, uuid } from './shared';

const digest = z.string().regex(/^0x[0-9a-f]{64}$/, 'Exact 32-byte quote digest');

export async function lifecycle(ctx: ToolContext, policyId: string, agentId?: string | null) {
  const res = await ctx.backend.call('GET', `/api/policies/${policyId}/lifecycle`, undefined, {
    agentId,
  });
  return ok<PolicyLifecycle>(res);
}

/** Canonical status is backend-authoritative; a receipt alone never makes a policy effective. */
export function canonicality(l: PolicyLifecycle) {
  if (l.state === 'fixture_ready') return 'fixture_rehearsal_not_canonical';
  if (l.completeness === 'ORPHANED') return 'reorged_orphaned';
  if (l.state === 'confirmed' || (l.state === 'expired' && l.completeness === 'VERIFIED_LINKED'))
    return 'canonical_verified_linked';
  if (l.state === 'reconciliation_pending')
    return l.completeness
      ? `pending_${l.completeness.toLowerCase()}`
      : 'receipt_recorded_awaiting_canonical_link';
  return 'not_bound';
}

export function coverageStatus(policy: ProcurementPolicy, l: PolicyLifecycle) {
  const now = Math.floor(Date.now() / 1000);
  if (l.state === 'fixture_ready') return 'synthetic_fixture';
  if (l.completeness === 'ORPHANED') return 'reorged';
  if (l.state === 'prepared') return 'pending_payment';
  if (l.state === 'reconciliation_pending') return 'pending_canonical_confirmation';
  if (l.state === 'expired')
    return policy.state === 'confirmed' ? 'expired' : 'quote_expired_unbound';
  if (now < policy.terms.effectiveAt) return 'scheduled';
  if (now > policy.terms.expiresAt) return 'expired';
  return 'active';
}

export const procurementTools: AnyToolSpec[] = [
  tool({
    name: 'arcuex_request_quote',
    title: 'Request quote',
    description:
      'Request a schedule-priced quote for a registered exposure. An agent needs an active owner delegation (delegationId); owners quote directly. Attestations must be true. Returns terms and the exact digest you must accept.',
    scope: 'arcuex:quote',
    input: {
      idempotencyKey,
      agentId: uuid,
      productCode: z.string().min(1).max(80),
      productVersion: z.number().int().positive(),
      limitMicros: micros,
      durationDays: z.number().int().positive(),
      delegationId: uuid.optional(),
      beneficiary: address.optional(),
      attestations: z
        .object({
          positionHealthy: z.literal(true),
          noKnownIncident: z.literal(true),
          ownerAttestsControl: z.literal(true),
        })
        .strict()
        .describe(
          'Each must be literally true; known incidents and unhealthy positions are excluded.',
        ),
    },
    readOnly: false,
    idempotent: true,
    run: async (raw, ctx) => {
      const a = raw as {
        idempotencyKey: string;
        agentId: string;
        productCode: string;
        productVersion: number;
        limitMicros: string;
        durationDays: number;
        delegationId?: string;
        beneficiary?: string;
        attestations: Record<string, true>;
      };
      const agentId = effectiveAgentId(ctx, a.agentId);
      const res = await ctx.backend.call('POST', '/api/procurement/quotes', {
        idempotencyKey: a.idempotencyKey,
        agentId,
        productCode: a.productCode,
        productVersion: a.productVersion,
        limitMicros: a.limitMicros,
        durationDays: a.durationDays,
        delegationId: a.delegationId,
        beneficiary: a.beneficiary,
        eligibility: {
          ...a.attestations,
          syntheticOnly: a.productCode === 'ARC_ORACLE_LIQUIDATION_DEMO_V1',
        },
      });
      const refusal = (res.body as { error?: string } | null)?.error ?? '';
      if (
        (res.status === 403 && refusal.includes('Delegation')) ||
        (res.status === 400 && refusal.includes('delegationId'))
      )
        throw new McpToolError(
          'ACTION_REQUIRED',
          'DELEGATION_REQUIRED',
          'No active owner delegation covers this quote. Human owner approval is required before an agent can procure.',
          {
            requiresHumanApproval: true,
            nextAction: {
              actor: 'agent',
              tool: 'arcuex_request_delegation',
              description: 'Prepare a delegation request for the owner.',
            },
          },
        );
      const quote = ok<ProcurementQuote & { capacityStatus: string }>(res);
      return {
        status: 'SUCCESS',
        resourceId: quote.terms.quoteId,
        sourceMode: sourceMode(ctx, quote.terms.synthetic),
        requiresHumanApproval: false,
        data: {
          quote,
          quoteExpiresAt: quote.terms.quoteExpiresAt,
          authorityBasis: a.delegationId ? `owner_delegation:${a.delegationId}` : 'owner',
        },
        nextAction: {
          actor: 'agent',
          tool: 'arcuex_accept_quote',
          description: `Review terms and exclusions, then accept exactly digest ${quote.digest} before ${new Date(quote.terms.quoteExpiresAt * 1000).toISOString()}.`,
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_quote',
    title: 'Get quote',
    description:
      'Read a quote issued to this wallet, with expiry and whether it has been accepted.',
    scope: 'arcuex:read',
    input: { quoteId: uuid },
    readOnly: true,
    run: async (raw, ctx) => {
      const { quoteId } = raw as { quoteId: string };
      const store = new ProcurementStore(getDb());
      const quote = store.get<ProcurementQuote>('quote', quoteId);
      const authority = store.get<{ actor: string; delegationId: string | null }>(
        'quote_authority',
        quoteId,
      );
      // Same visibility as acceptance: the quoted payer or the policy owner.
      if (
        !quote ||
        (authority?.actor !== ctx.principal.wallet && quote.terms.owner !== ctx.principal.wallet)
      )
        throw new McpToolError('FAILED', 'NOT_FOUND', 'Quote not found');
      const policy = store.policy(quote.terms.policyId);
      const expired = quote.terms.quoteExpiresAt <= Math.floor(Date.now() / 1000);
      return {
        status: policy ? 'SUCCESS' : expired ? 'BLOCKED' : 'SUCCESS',
        reasonCode: policy ? 'ACCEPTED' : expired ? 'QUOTE_EXPIRED' : 'OPEN',
        resourceId: quoteId,
        sourceMode: sourceMode(ctx, quote.terms.synthetic),
        data: { quote, issuedTo: authority, acceptedPolicyState: policy?.state ?? null },
      };
    },
  }),
  tool({
    name: 'arcuex_accept_quote',
    title: 'Accept quote',
    description:
      'Consequential. Accept the exact terms digest of an unexpired quote issued to this wallet. Records acceptance offchain and reserves delegated budget; it does not bind coverage or move funds.',
    scope: 'arcuex:purchase',
    input: { quoteId: uuid, acceptedDigest: digest, delegationId: uuid.optional() },
    readOnly: false,
    idempotent: true,
    run: async (raw, ctx) => {
      const res = ok<{ policy: ProcurementPolicy }>(
        await ctx.backend.call('POST', '/api/procurement/accept', raw),
      );
      return {
        status: res.policy.state === 'confirmed' ? 'SUCCESS' : 'PENDING',
        reasonCode: res.policy.state === 'confirmed' ? 'ALREADY_BOUND' : 'ACCEPTED_OFFCHAIN',
        resourceId: res.policy.terms.policyId,
        sourceMode: sourceMode(ctx, res.policy.terms.synthetic),
        canonicality: 'not_bound',
        data: res,
        nextAction: {
          actor: 'agent',
          tool: 'arcuex_prepare_policy_purchase',
          description: 'Prepare the USDC approve step, then the bind step.',
        },
      };
    },
  }),
  tool({
    name: 'arcuex_prepare_policy_purchase',
    title: 'Prepare policy purchase transaction',
    description:
      'Return the backend-authorized unsigned transaction for one payment stage (approve, then bind) after capacity/authority preflight. MCP never signs: the payer wallet signs outside MCP, then call arcuex_reconcile_policy_binding.',
    scope: 'arcuex:purchase',
    input: { policyId: uuid, acceptedDigest: digest, stage: z.enum(['approve', 'bind']) },
    readOnly: false,
    idempotent: true,
    run: async (raw, ctx) => {
      const a = raw as { policyId: string; stage: 'approve' | 'bind' };
      const res = ok<{ policy: ProcurementPolicy; transaction: Record<string, unknown> | null }>(
        await ctx.backend.call('POST', '/api/procurement/payment', raw),
      );
      if (!res.transaction)
        return {
          status: 'SUCCESS',
          reasonCode: 'ALREADY_BOUND',
          resourceId: a.policyId,
          data: res,
        };
      return {
        status: 'ACTION_REQUIRED',
        reasonCode: 'WALLET_SIGNATURE_REQUIRED',
        resourceId: a.policyId,
        sourceMode: sourceMode(ctx, res.policy.terms.synthetic),
        requiresWalletSignature: true,
        message:
          'Unsigned transaction prepared. No purchase has occurred. Only the accepted payer wallet may sign it.',
        data: {
          stage: a.stage,
          chainId: 5042002,
          transaction: res.transaction,
          payer: res.policy.payer,
        },
        nextAction: {
          actor: 'payer_wallet',
          description: `Payer ${res.policy.payer} must review, sign and broadcast this ${a.stage} transaction on Arc Testnet, then call arcuex_reconcile_policy_binding with stage "${a.stage === 'approve' ? 'approval' : 'bind'}" and the transaction hash.`,
        },
      };
    },
  }),
  tool({
    name: 'arcuex_reconcile_policy_binding',
    title: 'Reconcile policy binding',
    description:
      'Submit a broadcast transaction hash for backend verification. stage=approval verifies the USDC allowance receipt; stage=bind verifies the bind receipt, bind-block authority and on-chain terms. Coverage counts only once the backend links a canonical bind.',
    scope: 'arcuex:purchase',
    input: { policyId: uuid, stage: z.enum(['approval', 'bind']), transactionHash: txHash },
    readOnly: false,
    idempotent: true,
    run: async (raw, ctx) => {
      const a = raw as { policyId: string; stage: 'approval' | 'bind'; transactionHash: string };
      const hash = a.transactionHash.toLowerCase();
      if (a.stage === 'approval') {
        ok(
          await ctx.backend.call('POST', '/api/procurement/approvals', {
            policyId: a.policyId,
            hash,
          }),
        );
        return {
          status: 'PENDING',
          reasonCode: 'APPROVAL_VERIFIED',
          resourceId: a.policyId,
          transactionHash: hash,
          canonicality: 'not_bound',
          nextAction: {
            actor: 'agent',
            tool: 'arcuex_prepare_policy_purchase',
            description: 'Prepare the bind stage transaction.',
          },
        };
      }
      ok(
        await ctx.backend.call('POST', '/api/procurement/confirm', { policyId: a.policyId, hash }),
      );
      const state = await lifecycle(ctx, a.policyId, ctx.principal.agentId);
      const c = canonicality(state);
      const bound = c === 'canonical_verified_linked';
      return {
        status: bound ? 'SUCCESS' : 'PENDING',
        reasonCode: bound ? 'POLICY_BOUND' : 'RECEIPT_VERIFIED_AWAITING_CANONICAL_LINK',
        resourceId: a.policyId,
        transactionHash: hash,
        canonicality: c,
        message: bound
          ? 'Backend linked the canonical bind.'
          : 'Receipt verified. The policy is not treated as bound until the backend reconciler links the canonical PolicyBound event; poll arcuex_get_purchase_status.',
        data: { lifecycle: state },
      };
    },
  }),
  tool({
    name: 'arcuex_get_purchase_status',
    title: 'Get purchase status',
    description:
      'Backend-authoritative purchase progress: prepared, reconciliation pending, canonically bound, scheduled/active/expired.',
    scope: 'arcuex:read',
    input: { policyId: uuid },
    readOnly: true,
    run: async (raw, ctx) => {
      const { policyId } = raw as { policyId: string };
      const detail = ok<{ policy: ProcurementPolicy; approvals?: unknown[] }>(
        await ctx.backend.call('GET', `/api/procurement/policies/${policyId}`),
      );
      const state = await lifecycle(ctx, policyId, ctx.principal.agentId);
      const c = canonicality(state);
      const coverage = coverageStatus(detail.policy, state);
      return {
        status:
          c === 'canonical_verified_linked'
            ? 'SUCCESS'
            : state.state === 'expired'
              ? 'BLOCKED'
              : state.state === 'prepared'
                ? 'ACTION_REQUIRED'
                : 'PENDING',
        reasonCode: coverage.toUpperCase(),
        resourceId: policyId,
        sourceMode: sourceMode(ctx, detail.policy.terms.synthetic),
        canonicality: c,
        transactionHash: state.confirmation?.transactionHash ?? detail.policy.bindTx ?? undefined,
        requiresWalletSignature: state.state === 'prepared' || undefined,
        data: {
          coverageStatus: coverage,
          offchainState: detail.policy.state,
          lifecycle: state,
          approvals: detail.approvals ?? [],
        },
      };
    },
  }),
];
