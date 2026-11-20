import { z } from 'zod';
import { PROCUREMENT_OFFERINGS } from '@arcuex/domain';
import { procurementDigest } from '@arcuex/agent-sdk';
import { McpToolError } from '../results';
import { effectiveAgentId, ok, type ToolContext, tool, type AnyToolSpec } from '../context';
import { address, micros, uuid, visibleAgents, visibleDelegations } from './shared';

const productCode = z.enum(PROCUREMENT_OFFERINGS.map((p) => p.code) as [string, ...string[]]);

async function proposeRegistration(
  ctx: ToolContext,
  args: {
    ownerWallet: string;
    label: string;
    position: string;
    exposureMicros: string;
    productCode?: string;
  },
) {
  const offering = PROCUREMENT_OFFERINGS.find(
    (p) => p.code === (args.productCode ?? PROCUREMENT_OFFERINGS[0].code),
  )!;
  // The signer is always the authenticated wallet; agents can never name another signer.
  const proposal = {
    signer: ctx.principal.wallet,
    ownerWallet: args.ownerWallet,
    label: args.label,
    position: args.position,
    exposureMicros: args.exposureMicros,
    productCode: offering.code,
    protocol: offering.protocol,
  };
  const requestId = procurementDigest(proposal);
  const existing = (await visibleAgents(ctx)).find(
    (a) => a.signer === ctx.principal.wallet && a.exposure.position === args.position,
  );
  if (existing && existing.owner !== args.ownerWallet)
    throw new McpToolError(
      'BLOCKED',
      'OWNER_MISMATCH',
      'This signer and position are registered to a different owner wallet. Ownership cannot be claimed through MCP.',
      { resourceId: existing.id },
    );
  if (existing)
    return {
      status: 'SUCCESS' as const,
      reasonCode: 'ALREADY_REGISTERED',
      resourceId: existing.id,
      message: 'The owner has already completed this registration.',
      data: { agent: existing, requestId },
      nextAction: {
        actor: 'agent' as const,
        tool: 'arcuex_request_delegation',
        description: 'Ask the owner for a bounded procurement delegation for this agent.',
      },
    };
  return {
    status: 'ACTION_REQUIRED' as const,
    reasonCode: 'OWNER_APPROVAL_REQUIRED',
    resourceId: requestId,
    requiresHumanApproval: true,
    message:
      'Registration request prepared. Nothing is registered until the owner wallet signs in and submits it through the established agent registration flow. This tool did not store or grant anything.',
    data: { requestId, proposal, storage: 'stateless_prepared_request' },
    nextAction: {
      actor: 'owner' as const,
      description: `Owner wallet ${args.ownerWallet} must authenticate to Arcuex and register signer ${ctx.principal.wallet} (Agents page, or the endpoint below with its own session). Submitting attests that the owner controls the position. Then poll arcuex_get_registration_status.`,
      endpoint: 'POST /api/procurement/agents',
      body: {
        idempotencyKey: `mcp-registration-${requestId.slice(2, 34)}`,
        label: args.label,
        position: args.position,
        exposureMicros: args.exposureMicros,
        signer: ctx.principal.wallet,
        productCode: offering.code,
        protocol: offering.protocol,
        ownerAttestsControl: true,
      },
    },
  };
}

const registrationInput = {
  ownerWallet: address.describe('Wallet the agent believes owns it. Only that wallet can approve.'),
  label: z.string().trim().min(1).max(80),
  position: z.string().trim().min(1).max(120).describe('Insured position identifier'),
  exposureMicros: micros.describe('Position notional in USDC micros'),
  productCode: productCode.optional(),
};

export const identityTools: AnyToolSpec[] = [
  tool({
    name: 'arcuex_get_identity',
    title: 'Get authenticated identity',
    description:
      'Return who this MCP token authenticates (wallet, bound agent, scopes, expiry) and the agents this wallet owns or signs for. Call first.',
    scope: 'arcuex:read',
    input: {},
    readOnly: true,
    run: async (_args, ctx) => {
      const agents = await visibleAgents(ctx);
      const p = ctx.principal;
      return {
        status: 'SUCCESS',
        resourceId: p.wallet,
        sourceMode: ctx.chainSource === 'fixture' ? 'fixture_rehearsal' : 'arc_testnet',
        authorizedActions: p.scopes,
        data: {
          wallet: p.wallet,
          boundAgentId: p.agentId,
          scopes: p.scopes,
          client: p.clientName,
          tokenExpiresAt: p.expiresAt,
          ownedAgents: agents.filter((a) => a.owner === p.wallet).map((a) => a.id),
          signerForAgents: agents.filter((a) => a.signer === p.wallet).map((a) => a.id),
          authenticationBasis:
            'Wallet signature over the Arcuex authentication challenge. Authentication alone grants no ownership, delegation or payment authority.',
        },
      };
    },
  }),
  tool({
    name: 'arcuex_register_agent',
    title: 'Request agent registration',
    description:
      'Agent-initiated registration request. Prepares (does not perform) the owner registration that binds this wallet as signer for an insured position. Returns ACTION_REQUIRED with the exact owner action. Idempotent: identical input yields the same requestId.',
    scope: 'arcuex:register',
    input: registrationInput,
    readOnly: false,
    idempotent: true,
    run: (args, ctx) => proposeRegistration(ctx, args as never),
  }),
  tool({
    name: 'arcuex_register_exposure',
    title: 'Request exposure registration',
    description:
      'Request registration of an additional insured position. In Arcuex each exposure is its own owner-approved agent registration record, so this prepares the same owner action as arcuex_register_agent.',
    scope: 'arcuex:register',
    input: registrationInput,
    readOnly: false,
    idempotent: true,
    run: (args, ctx) => proposeRegistration(ctx, args as never),
  }),
  tool({
    name: 'arcuex_get_registration_status',
    title: 'Get registration status',
    description:
      'Check whether the owner completed registration of this signer for a position, and that it was completed by the expected owner wallet.',
    scope: 'arcuex:read',
    input: { ownerWallet: address, position: z.string().trim().min(1).max(120) },
    readOnly: true,
    run: async (args, ctx) => {
      const { ownerWallet, position } = args as { ownerWallet: string; position: string };
      const agent = (await visibleAgents(ctx)).find(
        (a) => a.signer === ctx.principal.wallet && a.exposure.position === position,
      );
      if (!agent)
        return {
          status: 'ACTION_REQUIRED',
          reasonCode: 'OWNER_APPROVAL_PENDING',
          requiresHumanApproval: true,
          message: 'No owner has registered this signer for that position yet.',
          nextAction: {
            actor: 'owner',
            description: `Owner ${ownerWallet} must complete registration (see arcuex_register_agent output).`,
          },
        };
      if (agent.owner !== ownerWallet)
        return {
          status: 'BLOCKED',
          reasonCode: 'OWNER_MISMATCH',
          resourceId: agent.id,
          message: 'Registered by a different owner wallet than expected. Do not proceed.',
        };
      return {
        status: 'SUCCESS',
        reasonCode: 'REGISTERED',
        resourceId: agent.id,
        data: { agent, ownerVerified: true, signerVerified: true },
        nextAction: {
          actor: 'agent',
          tool: 'arcuex_request_delegation',
          description:
            'Registered. Request a bounded delegation so the owner can authorize procurement.',
        },
      };
    },
  }),
  tool({
    name: 'arcuex_list_owned_agents',
    title: 'List owned agents',
    description: 'List agents owned by this wallet and agents this wallet signs for.',
    scope: 'arcuex:read',
    input: {},
    readOnly: true,
    run: async (_args, ctx) => {
      const agents = await visibleAgents(ctx);
      return {
        status: 'SUCCESS',
        data: {
          owned: agents.filter((a) => a.owner === ctx.principal.wallet),
          signerFor: agents.filter((a) => a.signer === ctx.principal.wallet),
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_agent',
    title: 'Get agent',
    description: 'Get one agent visible to this wallet (as owner or signer).',
    scope: 'arcuex:read',
    input: { agentId: uuid },
    readOnly: true,
    run: async (args, ctx) => {
      const agent = (await visibleAgents(ctx)).find(
        (a) => a.id === (args as { agentId: string }).agentId,
      );
      if (!agent) throw new McpToolError('FAILED', 'NOT_FOUND', 'Agent not found');
      return {
        status: 'SUCCESS',
        resourceId: agent.id,
        data: {
          agent,
          relationship: agent.owner === ctx.principal.wallet ? 'owner' : 'signer',
        },
      };
    },
  }),
  tool({
    name: 'arcuex_list_exposures',
    title: 'List insured exposures',
    description: 'List registered insured positions visible to this wallet.',
    scope: 'arcuex:read',
    input: {},
    readOnly: true,
    run: async (_args, ctx) => ({
      status: 'SUCCESS',
      data: (await visibleAgents(ctx)).map((a) => ({
        agentId: a.id,
        owner: a.owner,
        signer: a.signer,
        relationship: a.owner === ctx.principal.wallet ? 'owner' : 'signer',
        ...a.exposure,
      })),
    }),
  }),
  tool({
    name: 'arcuex_get_delegation',
    title: 'Get delegation',
    description:
      'Read a procurement delegation with backend-computed validity (active/expired/revoked), remaining premium budget and scope limitations.',
    scope: 'arcuex:read',
    input: { delegationId: uuid },
    readOnly: true,
    run: async (args, ctx) => {
      const view = ok<{ validity: string; delegation: { id: string } }>(
        await ctx.backend.call('POST', '/api/procurement/authority', {
          delegationId: (args as { delegationId: string }).delegationId,
        }),
      );
      return {
        status: view.validity === 'active' ? 'SUCCESS' : 'BLOCKED',
        reasonCode:
          view.validity === 'active' ? undefined : `DELEGATION_${view.validity.toUpperCase()}`,
        resourceId: view.delegation.id,
        data: view,
      };
    },
  }),
  tool({
    name: 'arcuex_request_delegation',
    title: 'Request procurement delegation',
    description:
      'Prepare a bounded delegation request (premium cap, limit cap, expiry, beneficiary) for the owner. Grants nothing: only the owner can create a delegation through the established flow.',
    scope: 'arcuex:register',
    input: {
      agentId: uuid,
      premiumCapMicros: micros,
      limitCapMicros: micros,
      expiresInSeconds: z
        .number()
        .int()
        .min(300)
        .max(30 * 86400),
      beneficiary: address.optional().describe('Defaults to the owner wallet'),
    },
    readOnly: false,
    idempotent: true,
    run: async (raw, ctx) => {
      const args = raw as {
        agentId: string;
        premiumCapMicros: string;
        limitCapMicros: string;
        expiresInSeconds: number;
        beneficiary?: string;
      };
      const agentId = effectiveAgentId(ctx, args.agentId)!;
      const agent = (await visibleAgents(ctx)).find((a) => a.id === agentId);
      if (!agent || agent.signer !== ctx.principal.wallet)
        throw new McpToolError(
          'BLOCKED',
          'FORBIDDEN',
          'Only the registered signer may request delegation',
        );
      if (agent.exposure.protocol !== PROCUREMENT_OFFERINGS[0].protocol)
        throw new McpToolError(
          'BLOCKED',
          'OWNER_PURCHASE_ONLY',
          'This product is owner-purchased only; it cannot be delegated to an agent.',
        );
      const expiresAt = Math.floor(Date.now() / 1000) + args.expiresInSeconds;
      return {
        status: 'ACTION_REQUIRED',
        reasonCode: 'OWNER_APPROVAL_REQUIRED',
        requiresHumanApproval: true,
        resourceId: agent.id,
        message:
          'Delegation request prepared. No permission exists until the owner creates the delegation.',
        nextAction: {
          actor: 'owner',
          description: `Owner ${agent.owner} must review and create this delegation (Agents page or endpoint below). Revocation remains owner-only.`,
          endpoint: 'POST /api/procurement/delegations',
          body: {
            idempotencyKey: `mcp-delegation-${procurementDigest({ ...args, expiresAt }).slice(2, 34)}`,
            agentId: agent.id,
            premiumCapMicros: args.premiumCapMicros,
            limitCapMicros: args.limitCapMicros,
            expiresAt,
            ...(args.beneficiary ? { beneficiary: args.beneficiary } : {}),
          },
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_permissions',
    title: 'Get effective permissions',
    description:
      'Return token scopes plus backend-evaluated delegations (validity, remaining budget). Use before quoting or buying.',
    scope: 'arcuex:read',
    input: {},
    readOnly: true,
    run: async (_args, ctx) => {
      const [agents, delegations] = await Promise.all([
        visibleAgents(ctx),
        visibleDelegations(ctx),
      ]);
      const signerAgents = agents.filter((a) => a.signer === ctx.principal.wallet).map((a) => a.id);
      const active = delegations.filter(
        (d) => d.validity === 'active' && signerAgents.includes(d.agentId),
      );
      const s = ctx.principal.scopes;
      const actions = [
        ...(s.includes('arcuex:register') ? ['request_registration', 'request_delegation'] : []),
        ...(s.includes('arcuex:quote') &&
        (active.length || agents.some((a) => a.owner === ctx.principal.wallet))
          ? ['request_quote']
          : []),
        ...(s.includes('arcuex:purchase') &&
        (active.length || agents.some((a) => a.owner === ctx.principal.wallet))
          ? ['accept_quote', 'prepare_policy_purchase', 'reconcile_policy_binding']
          : []),
        ...(s.includes('arcuex:claims') ? ['file_claim', 'submit_claim_evidence'] : []),
      ];
      return {
        status: 'SUCCESS',
        authorizedActions: actions,
        data: {
          scopes: s,
          boundAgentId: ctx.principal.agentId,
          delegations,
          neverAvailableViaMcp: [
            'grant_or_revoke_delegation',
            'complete_owner_registration',
            'adjudicate_claim',
            'prepare_or_sign_settlement',
            'confirm_or_fail_settlement',
          ],
          note: 'authorizedActions is a hint; every call is re-authorized by the backend.',
        },
      };
    },
  }),
];
