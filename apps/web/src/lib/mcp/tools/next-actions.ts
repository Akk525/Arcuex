import type { ProcurementPolicy } from '@arcuex/domain';
import { ok, tool, type AnyToolSpec } from '../context';
import type { NextAction } from '../results';
import { investigation } from './claims';
import { visibleAgents, visibleDelegations } from './shared';

type Item = NextAction & { resourceId?: string; reasonCode: string };

export const nextActionTools: AnyToolSpec[] = [
  tool({
    name: 'arcuex_get_next_actions',
    title: 'Get next actions',
    description:
      'Derive what this wallet/agent can or must do next from current backend state (registrations, delegations, unpaid or unconfirmed policies, claims awaiting evidence). Use this instead of polling every resource.',
    scope: 'arcuex:read',
    input: {},
    readOnly: true,
    run: async (_args, ctx) => {
      const w = ctx.principal.wallet;
      const agentId = ctx.principal.agentId;
      const [agents, delegations, policies, claims] = await Promise.all([
        visibleAgents(ctx),
        visibleDelegations(ctx),
        ok<ProcurementPolicy[]>(await ctx.backend.call('GET', '/api/procurement/policies')),
        ok<{
          cases: Array<{ id: string; status: string; policyId: string; paymentFinality: string }>;
        }>(await ctx.backend.call('GET', '/api/claims/cases', undefined, { agentId })),
      ]);
      const items: Item[] = [];
      const signerFor = agents.filter((a) => a.signer === w);
      if (!agents.length)
        items.push({
          actor: 'agent',
          tool: 'arcuex_register_agent',
          reasonCode: 'NOT_REGISTERED',
          description:
            'No registration found for this wallet. Prepare an owner registration request.',
        });
      for (const a of signerFor.filter((x) => x.owner !== w)) {
        const grants = delegations.filter((d) => d.agentId === a.id);
        if (!grants.some((d) => d.validity === 'active'))
          items.push({
            actor: 'agent',
            tool: 'arcuex_request_delegation',
            resourceId: a.id,
            reasonCode: grants.length ? 'DELEGATION_INACTIVE' : 'NO_DELEGATION',
            description: 'No active owner delegation; procurement requires owner approval.',
          });
      }
      const now = Math.floor(Date.now() / 1000);
      for (const p of policies) {
        if (p.state === 'prepared' && p.payer === w && p.terms.quoteExpiresAt > now)
          items.push({
            actor: 'agent',
            tool: 'arcuex_prepare_policy_purchase',
            resourceId: p.terms.policyId,
            reasonCode: 'PAYMENT_PENDING',
            description: 'Accepted but unbound: prepare approve/bind for the payer wallet to sign.',
          });
        if (p.state === 'confirmed')
          items.push({
            actor: 'agent',
            tool: 'arcuex_get_policy_status',
            resourceId: p.terms.policyId,
            reasonCode: 'CHECK_CANONICAL_STATUS',
            description: 'Receipt confirmed; read canonical status before relying on coverage.',
          });
      }
      for (const c of claims.cases
        .filter((x) => ['COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'].includes(x.status))
        .slice(0, 10)) {
        const inv = await investigation(ctx, c.id, agentId);
        if (inv.outstandingRequests.length)
          items.push({
            actor: 'agent',
            tool: 'arcuex_respond_to_evidence_request',
            resourceId: c.id,
            reasonCode: 'EVIDENCE_REQUESTED',
            description: `${inv.outstandingRequests.length} open evidence request(s).`,
          });
        else if (c.status === 'COLLECTING_EVIDENCE')
          items.push({
            actor: 'agent',
            tool: 'arcuex_get_claim_requirements',
            resourceId: c.id,
            reasonCode: 'EVIDENCE_COLLECTION_OPEN',
            description: 'Submit proof, then mark evidence complete.',
          });
        else
          items.push({
            actor: 'reviewer',
            resourceId: c.id,
            reasonCode: 'AWAITING_HUMAN_REVIEW',
            description: 'Awaiting human reviewer; nothing for the agent to do.',
          });
      }
      for (const c of claims.cases.filter((x) =>
        ['APPROVED', 'SETTLEMENT_PENDING'].includes(x.status),
      ))
        items.push({
          actor: 'claims_authority',
          resourceId: c.id,
          reasonCode: 'AWAITING_SETTLEMENT',
          description: 'Approved but not reimbursed; track with arcuex_get_settlement_status.',
        });
      const agentItems = items.filter((i) => i.actor === 'agent');
      return {
        status: agentItems.length ? 'ACTION_REQUIRED' : items.length ? 'PENDING' : 'SUCCESS',
        data: { actions: items, derivedFrom: 'backend state at call time' },
        nextAction: agentItems[0] ?? items[0],
      };
    },
  }),
];
