import { z } from 'zod';
import type { ProcurementCatalog, ProcurementCapacity, ProcurementOffering } from '@arcuex/domain';
import { procurementDigest } from '@arcuex/agent-sdk';
import { CLAIM_FIXTURE } from '@arcuex/insurance';
import { McpToolError } from '../results';
import {
  effectiveAgentId,
  ok,
  sourceMode,
  type ToolContext,
  tool,
  type AnyToolSpec,
} from '../context';
import { micros, uuid, visibleAgents, visibleDelegations } from './shared';

async function catalog(ctx: ToolContext) {
  return ok<ProcurementCatalog>(await ctx.backend.call('GET', '/api/procurement/products'));
}
async function capacity(ctx: ToolContext) {
  return ok<ProcurementCapacity>(await ctx.backend.call('GET', '/api/procurement/capacity'));
}

/** A truthful projection of the backend offering. Pricing figures restate the published schedule. */
export function productView(ctx: ToolContext, p: ProcurementOffering, c: ProcurementCatalog) {
  return {
    code: p.code,
    version: p.version,
    name: p.name,
    sourceMode: sourceMode(ctx, p.synthetic),
    synthetic: p.synthetic,
    independentlyUnderwritten: false,
    legalInsurance: false,
    coveredRisk: p.event,
    supportedProtocols: [p.protocol],
    supportedExposures: {
      chainId: c.chainId,
      protocol: p.protocol,
      insuredPosition:
        'One owner-registered position per agent record (chainId, protocol, position, notional).',
    },
    oracleDependencies: p.synthetic
      ? []
      : [
          'Approved Arc emitter contract (runtime code hash pinned in the evidence profile)',
          'Independent canonical-ratio replay authority (signed replay envelope)',
          'Independent recovery authority (signed recovery envelope)',
        ],
    exclusions: p.exclusions,
    coverageLimitsMicros: p.limitsMicros,
    coveragePeriodDays: p.durationsDays,
    schedule: p.limitsMicros.map((limit) => ({
      limitMicros: limit,
      premiumMicros: (BigInt(limit) / 100n).toString(),
      deductibleMicros: (BigInt(limit) / 10n).toString(),
    })),
    pricingBasis: p.pricing,
    purchaseAuthority: p.purchaseAuthority,
    requiredEvidence: p.synthetic
      ? {
          intake: ['observedEventRef', 'observedAt within the coverage window'],
          proof: `Synthetic fixture ${CLAIM_FIXTURE.reference} (digest ${CLAIM_FIXTURE.digest})`,
          verification: 'Persisted fixture-consistency verification (not independent proof)',
        }
      : {
          intake: ['Exact Arc liquidation event reference'],
          verification: 'Independent replay + recovery envelopes through the verification route',
        },
    riskProvider: {
      pool: c.pool,
      chainId: c.chainId,
      description:
        'Arcuex InsurancePool on Arc Testnet. Testnet demonstration; not legal insurance.',
    },
    limitations: p.limitations,
    catalogEntryDigest: procurementDigest(p),
    catalogEntryDigestMethod: 'keccak256 over canonical JSON of the backend offering',
    termsDigest:
      'Issued per quote (quote.digest = keccak256 of canonical terms) and committed on-chain as termsHash at bind.',
  };
}

async function findProduct(ctx: ToolContext, code: string) {
  const c = await catalog(ctx);
  const product = c.products.find((p) => p.code === code);
  if (!product)
    throw new McpToolError(
      'FAILED',
      'PRODUCT_NOT_OFFERED',
      'Product is not currently offered on this host',
    );
  return { c, product };
}

const productCode = z.string().min(1).max(80);

export const coverageTools: AnyToolSpec[] = [
  tool({
    name: 'arcuex_list_products',
    title: 'List insurance products',
    description:
      'List products currently offered by this host with versioned terms, exclusions, limits, deductibles, periods, required evidence and synthetic/live source identity. Synthetic products are demos, never real underwritten offers.',
    scope: 'arcuex:read',
    input: {},
    readOnly: true,
    run: async (_args, ctx) => {
      const [c, cap] = await Promise.all([catalog(ctx), capacity(ctx)]);
      return {
        status: 'SUCCESS',
        sourceMode: sourceMode(ctx),
        data: {
          chainId: c.chainId,
          pool: c.pool,
          paymentMode: c.paymentMode,
          capacity: cap,
          products: c.products.map((p) => productView(ctx, p, c)),
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_product',
    title: 'Get product',
    description: 'Get one offered product by code with full versioned detail.',
    scope: 'arcuex:read',
    input: { productCode },
    readOnly: true,
    run: async (args, ctx) => {
      const { c, product } = await findProduct(ctx, (args as { productCode: string }).productCode);
      return {
        status: 'SUCCESS',
        resourceId: product.code,
        sourceMode: sourceMode(ctx, product.synthetic),
        data: productView(ctx, product, c),
      };
    },
  }),
  tool({
    name: 'arcuex_get_coverage_terms',
    title: 'Get coverage terms',
    description:
      'Get the insured event, exclusions, limits, deductibles and periods for a product version. Binding terms are fixed per quote by the quote digest.',
    scope: 'arcuex:read',
    input: { productCode },
    readOnly: true,
    run: async (args, ctx) => {
      const { c, product } = await findProduct(ctx, (args as { productCode: string }).productCode);
      const v = productView(ctx, product, c);
      return {
        status: 'SUCCESS',
        resourceId: `${product.code}@${product.version}`,
        sourceMode: v.sourceMode,
        data: {
          productCode: v.code,
          productVersion: v.version,
          insuredEvent: v.coveredRisk,
          exclusions: v.exclusions,
          schedule: v.schedule,
          coveragePeriodDays: v.coveragePeriodDays,
          pricingBasis: v.pricingBasis,
          limitations: v.limitations,
          catalogEntryDigest: v.catalogEntryDigest,
          termsDigest: v.termsDigest,
        },
      };
    },
  }),
  tool({
    name: 'arcuex_check_eligibility',
    title: 'Check eligibility (advisory)',
    description:
      'Advisory pre-check of an agent exposure against the published schedule, delegation caps and pool capacity. Not authoritative: the backend re-evaluates eligibility and attestations at quote time.',
    scope: 'arcuex:read',
    input: {
      agentId: uuid,
      productCode,
      limitMicros: micros,
      durationDays: z.number().int().positive(),
      delegationId: uuid.optional(),
    },
    readOnly: true,
    run: async (raw, ctx) => {
      const args = raw as {
        agentId: string;
        productCode: string;
        limitMicros: string;
        durationDays: number;
        delegationId?: string;
      };
      const agentId = effectiveAgentId(ctx, args.agentId)!;
      const [{ product }, agents, delegations, cap] = await Promise.all([
        findProduct(ctx, args.productCode),
        visibleAgents(ctx),
        visibleDelegations(ctx),
        capacity(ctx),
      ]);
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) throw new McpToolError('FAILED', 'NOT_FOUND', 'Agent not found');
      const isOwner = agent.owner === ctx.principal.wallet;
      const grant = delegations.find((d) => d.id === args.delegationId);
      const limit = BigInt(args.limitMicros);
      const checks = [
        { check: 'protocol_matches_product', ok: agent.exposure.protocol === product.protocol },
        { check: 'limit_in_schedule', ok: product.limitsMicros.some((l) => BigInt(l) === limit) },
        {
          check: 'duration_in_schedule',
          ok: product.durationsDays.some((d) => d === args.durationDays),
        },
        { check: 'limit_within_exposure', ok: limit <= BigInt(agent.exposure.notionalMicros) },
        {
          check: 'purchase_authority',
          ok: isOwner || (product.purchaseAuthority !== 'owner' && grant?.validity === 'active'),
          detail: isOwner
            ? 'owner'
            : grant
              ? `delegation ${grant.validity}`
              : 'no delegation supplied',
        },
        ...(grant && !isOwner
          ? [
              { check: 'within_limit_cap', ok: limit <= BigInt(grant.limitCapMicros) },
              {
                check: 'within_remaining_premium_budget',
                ok: limit / 100n <= BigInt(grant.remainingPremiumMicros),
              },
            ]
          : []),
        {
          check: 'pool_capacity',
          ok: cap.status === 'verified' ? BigInt(cap.availableMicros ?? '0') >= limit : null,
          detail: cap.status,
        },
      ];
      const failed = checks.filter((c) => c.ok === false);
      return {
        status: failed.length ? 'BLOCKED' : 'SUCCESS',
        reasonCode: failed.length ? 'PRECHECK_FAILED' : 'PRECHECK_PASSED',
        resourceId: agent.id,
        sourceMode: sourceMode(ctx, product.synthetic),
        requiresHumanApproval: !isOwner && !grant,
        data: {
          authoritative: false,
          checks,
          attestationsRequiredAtQuote: [
            'positionHealthy',
            'noKnownIncident',
            'ownerAttestsControl',
          ],
        },
      };
    },
  }),
  tool({
    name: 'arcuex_get_underwriting_requirements',
    title: 'Get underwriting requirements',
    description:
      'Explain what the backend requires before a quote and bind for a product: attestations, purchase authority, human approval basis, wallet signature, capacity. Arcuex V1 has no separate underwriter review service.',
    scope: 'arcuex:read',
    input: { productCode },
    readOnly: true,
    run: async (args, ctx) => {
      const { product } = await findProduct(ctx, (args as { productCode: string }).productCode);
      return {
        status: 'SUCCESS',
        resourceId: product.code,
        sourceMode: sourceMode(ctx, product.synthetic),
        requiresHumanApproval: true,
        requiresWalletSignature: true,
        data: {
          attestations: {
            positionHealthy: true,
            noKnownIncident: true,
            ownerAttestsControl: true,
            syntheticOnly: product.synthetic,
          },
          pricing: product.pricing,
          purchaseAuthority: product.purchaseAuthority,
          humanApproval:
            product.purchaseAuthority === 'owner'
              ? 'Owner-purchased only: the human owner must accept and sign. Agents cannot buy this product.'
              : 'An agent may buy only under an owner-created delegation (product, position, beneficiary, premium/limit caps, expiry). The owner delegation is the human approval.',
          underwriterReview:
            'NOT_IMPLEMENTED: the backend has no underwriter role or approval record. Quotes are schedule-priced. Live (non-synthetic) binding stays owner-only.',
          walletSignature:
            'Payer wallet signs USDC approve and InsurancePool.bindPolicy outside MCP; receipts are then reconciled by the backend.',
          capacity: 'Pool capacity is verified at quote and again before payment preparation.',
        },
      };
    },
  }),
];
