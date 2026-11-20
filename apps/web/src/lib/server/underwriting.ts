import { randomUUID } from 'node:crypto';
import {
  ORACLE_CLAIM_EVIDENCE,
  ORACLE_UNDERWRITING_RULE,
  PROCUREMENT_OFFERINGS,
  type ProcurementAgent,
  type ProcurementQuote,
  type UnderwritingApplication,
  type UnderwritingEntry,
  type UnderwritingView,
} from '@arcuex/domain';
import { procurementDigest, ProcurementError, type ProcurementService } from '@arcuex/agent-sdk';
import { claimsActorId, type ClaimsPrincipal } from '@arcuex/insurance';

const PRODUCT = PROCUREMENT_OFFERINGS[0];

function requireCondition(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new ProcurementError('UNDERWRITING', message, status);
}

function description(value: unknown, field: string, max = 4000) {
  requireCondition(
    typeof value === 'string' && value.trim() && value.length <= max,
    `${field} is required (max ${max} characters)`,
  );
  return value.trim();
}

export function compileUnderwriting(
  application: UnderwritingApplication,
  entries: UnderwritingEntry[],
) {
  const limit = BigInt(application.limitMicros);
  const notional = BigInt(application.agent.exposure.notionalMicros);
  const concentrated = limit * 2n > notional;
  const extended = application.durationDays > 7;
  const managesPosition = application.operation === 'manage_position';
  const responses = new Set(
    entries.flatMap((entry) => (entry.kind === 'response' ? [entry.requestId] : [])),
  );
  const open = entries.some((entry) => entry.kind === 'request' && !responses.has(entry.id));
  const decision = entries.find((entry) => entry.kind === 'decision');
  const status: UnderwritingView['status'] =
    decision?.outcome === 'decline'
      ? 'declined'
      : open
        ? 'needs_evidence'
        : decision?.outcome === 'approve'
          ? 'ready'
          : entries.some((entry) => entry.kind === 'request')
            ? 'needs_review'
            : 'ready';
  const reasons = [
    'Synthetic oracle liquidation base schedule',
    ...(concentrated
      ? ['Requested limit exceeds half the registered exposure. Premium and deductible increase.']
      : []),
    ...(extended ? ['Requested term exceeds seven days. Premium increases.'] : []),
    ...(managesPosition
      ? ['Agent actively manages the position. Premium and evidence requirements increase.']
      : []),
  ];
  return {
    status,
    findings: [
      {
        label: 'Registered exposure',
        source: 'Owner attestation on file',
        detail: `${application.agent.exposure.protocol} / ${application.agent.exposure.position}`,
      },
      {
        label: 'Requested activity',
        source: 'Applicant assertion',
        detail: `${managesPosition ? 'Manage position' : 'Monitor position'} — ${application.activity}`,
      },
      {
        label: 'Eligibility',
        source: 'Applicant attestation',
        detail: 'Reports a healthy position, control of the exposure and no known incident.',
      },
      {
        label: 'Evidence requests',
        source: 'Application records',
        detail: `${responses.size} answered. Responses are applicant submissions for human review.`,
      },
    ],
    reasons,
    premiumMicros: (
      (limit *
        BigInt(100 + (concentrated ? 50 : 0) + (extended ? 25 : 0) + (managesPosition ? 25 : 0))) /
      10000n
    ).toString(),
    deductibleMicros: ((limit * (concentrated ? 20n : 10n)) / 100n).toString(),
    claimEvidence: managesPosition
      ? [...ORACLE_CLAIM_EVIDENCE, 'Agent execution log for position changes during the incident']
      : ORACLE_CLAIM_EVIDENCE,
  };
}

export class UnderwritingService {
  constructor(private readonly procurement: ProcurementService) {}
  private get store() {
    return this.procurement.store;
  }

  private canRead(actor: ClaimsPrincipal, application: UnderwritingApplication) {
    if (actor.role === 'reviewer' || actor.role === 'authority') return true;
    if (actor.role !== 'claimant') return false;
    const wallet = actor.walletAddress?.toLowerCase();
    return actor.agentId
      ? actor.agentId === application.agent.id && wallet === application.agent.signer
      : wallet === application.agent.owner || wallet === application.agent.signer;
  }

  private entries(id: string) {
    return this.store.list<UnderwritingEntry>('underwriting_entry', id);
  }

  private currentQuote(id: string) {
    return this.store.list<ProcurementQuote>('underwriting_quote', id).at(-1) ?? null;
  }

  private view(application: UnderwritingApplication): UnderwritingView {
    const entries = this.entries(application.id);
    const quote = this.currentQuote(application.id);
    return {
      application,
      entries,
      ...compileUnderwriting(application, entries),
      quote,
      policyState: quote ? (this.store.policy(quote.terms.policyId)?.state ?? null) : null,
    };
  }

  list(actor: ClaimsPrincipal) {
    const holder = actor.walletAddress?.toLowerCase();
    requireCondition(actor.role !== 'claimant' || holder, 'Wallet session required', 403);
    const owners =
      actor.role === 'claimant'
        ? new Set([holder!, ...this.procurement.list(holder!).agents.map((agent) => agent.owner)])
        : new Set([undefined]);
    return [...owners]
      .flatMap((owner) => this.store.underwritingApplications(owner))
      .filter((application) => this.canRead(actor, application))
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((application) => this.view(application));
  }

  private application(actor: ClaimsPrincipal, id: string) {
    const application = this.store.get<UnderwritingApplication>('underwriting_application', id);
    requireCondition(application && this.canRead(actor, application), 'Application not found', 404);
    return application;
  }

  get(actor: ClaimsPrincipal, id: string) {
    return this.view(this.application(actor, id));
  }

  private replay(
    actor: ClaimsPrincipal,
    scope: string,
    input: Record<string, unknown>,
    write: () => string,
  ) {
    const identity = actor.walletAddress?.toLowerCase() ?? actor.subject;
    const key = procurementDigest([
      identity,
      actor.role,
      scope,
      description(input.idempotencyKey, 'Request ID', 160),
    ]);
    const fingerprint = procurementDigest(input);
    return this.store.db
      .transaction(() => {
        const prior = this.store.get<{ fingerprint: string; id: string }>(
          'underwriting_retry',
          key,
        );
        if (prior) {
          requireCondition(
            prior.fingerprint === fingerprint,
            'Request ID was used for different input',
            409,
          );
          return prior.id;
        }
        const id = write();
        this.store.insert('underwriting_retry', key, identity, { fingerprint, id });
        return id;
      })
      .immediate();
  }

  apply(actor: ClaimsPrincipal, input: Record<string, unknown>) {
    requireCondition(
      actor.role === 'claimant' && actor.walletAddress,
      'Wallet session required',
      403,
    );
    const wallet = actor.walletAddress.toLowerCase();
    const id = this.replay(actor, 'apply', input, () => {
      const agent = this.store.get<ProcurementAgent>(
        'agent',
        description(input.agentId, 'Agent', 160),
      );
      requireCondition(
        agent &&
          (!actor.agentId || actor.agentId === agent.id) &&
          (agent.owner === wallet || agent.signer === wallet),
        'Agent not found',
        404,
      );
      requireCondition(
        input.productCode === PRODUCT.code && agent.exposure.protocol === PRODUCT.protocol,
        'Select a registered synthetic oracle exposure',
      );
      requireCondition(input.attestEligible === true, 'Confirm the exposure is eligible');
      requireCondition(
        typeof input.limitMicros === 'string' &&
          PRODUCT.limitsMicros.some((limit) => limit === input.limitMicros),
        'Select a supported limit',
      );
      requireCondition(
        BigInt(input.limitMicros) <= BigInt(agent.exposure.notionalMicros),
        'Limit exceeds the registered exposure',
      );
      requireCondition(
        typeof input.durationDays === 'number' &&
          PRODUCT.durationsDays.some((days) => days === input.durationDays),
        'Select a supported term',
      );
      const operation = input.operation;
      requireCondition(
        operation === 'monitor' || operation === 'manage_position',
        'Select the activity the agent performs',
      );
      const grant =
        wallet === agent.owner ? null : this.procurement.authority(wallet, input.delegationId);
      requireCondition(
        !grant || (!grant.revoked && !grant.expired && grant.delegation.agentId === agent.id),
        'Active delegation for this exposure required',
        403,
      );
      const application: UnderwritingApplication = {
        id: randomUUID(),
        agent,
        applicant: wallet,
        productCode: PRODUCT.code,
        productVersion: PRODUCT.version,
        delegationId: grant?.delegation.id ?? null,
        beneficiary: grant?.delegation.beneficiary ?? agent.owner,
        operation,
        activity: description(input.activity, 'Requested activity'),
        limitMicros: input.limitMicros,
        durationDays: input.durationDays,
        createdAt: this.procurement.now(),
      };
      const rating = compileUnderwriting(application, []);
      requireCondition(
        !grant ||
          (BigInt(application.limitMicros) <= BigInt(grant.delegation.limitCapMicros) &&
            BigInt(rating.premiumMicros) <= BigInt(grant.remainingPremiumMicros)),
        'Requested cover exceeds the delegated limit or remaining premium budget',
        403,
      );
      this.store.insert('underwriting_application', application.id, agent.owner, application);
      if (rating.reasons.length > 1) {
        const entry: UnderwritingEntry = {
          id: randomUUID(),
          at: application.createdAt,
          by: 'Underwriting rules',
          kind: 'request',
          text: 'Provide a position snapshot reference, its observation time, and the controls the agent uses for this exposure.',
        };
        this.store.insert('underwriting_entry', entry.id, application.id, entry);
      }
      return application.id;
    });
    return this.get(actor, id);
  }

  act(actor: ClaimsPrincipal, id: string, input: Record<string, unknown>) {
    const application = this.application(actor, id);
    this.replay(actor, id, input, () => {
      const view = this.view(application);
      const wallet = actor.walletAddress?.toLowerCase();
      const reviewer = actor.role === 'reviewer' || actor.role === 'authority';
      const by = claimsActorId(actor);
      const at = this.procurement.now();

      if (input.action === 'quote') {
        requireCondition(
          !reviewer && wallet === application.applicant,
          'Only the applicant can request the offer',
          403,
        );
        requireCondition(
          view.status === 'ready',
          'Application needs a decision or evidence before quoting',
          409,
        );
        if (view.policyState || (view.quote && view.quote.terms.quoteExpiresAt > at)) return id;
        const quote = this.procurement.quote(
          wallet,
          {
            idempotencyKey: procurementDigest(['underwriting', id, input.idempotencyKey]),
            agentId: application.agent.id,
            delegationId: application.delegationId,
            beneficiary: application.beneficiary,
            productCode: application.productCode,
            productVersion: application.productVersion,
            limitMicros: application.limitMicros,
            durationDays: application.durationDays,
            eligibility: {
              positionHealthy: true,
              noKnownIncident: true,
              ownerAttestsControl: true,
              syntheticOnly: true,
            },
          },
          {
            snapshot: {
              applicationId: id,
              productVersion: application.productVersion,
              ruleVersion: ORACLE_UNDERWRITING_RULE,
              dossierDigest: procurementDigest([
                application,
                view.entries.filter((entry) => entry.kind !== 'message'),
              ]),
              reasons: view.reasons,
              claimEvidence: view.claimEvidence,
            },
            premiumMicros: view.premiumMicros,
            deductibleMicros: view.deductibleMicros,
          },
        );
        this.store.insert('underwriting_quote', quote.terms.quoteId, id, quote);
        return id;
      }

      const text = description(input.text, 'Message or rationale');
      const base = { id: randomUUID(), at, by, text };
      const decided = view.entries.some((entry) => entry.kind === 'decision');
      const frozen = view.quote !== null || decided;
      let entry: UnderwritingEntry;
      switch (input.action) {
        case 'request':
          requireCondition(reviewer, 'Only an insurer can request proof', 403);
          requireCondition(!frozen, 'The underwriting decision is frozen', 409);
          entry = { ...base, kind: 'request' };
          break;
        case 'response': {
          requireCondition(!reviewer, 'Only the applicant or policy owner can supply proof', 403);
          requireCondition(!frozen, 'The underwriting decision is frozen', 409);
          const requestId = description(input.requestId, 'Evidence request', 160);
          requireCondition(
            view.entries.some((item) => item.kind === 'request' && item.id === requestId),
            'Evidence request not found',
            404,
          );
          requireCondition(
            !view.entries.some((item) => item.kind === 'response' && item.requestId === requestId),
            'Evidence request was already answered',
            409,
          );
          entry = { ...base, kind: 'response', requestId };
          break;
        }
        case 'decision':
          requireCondition(reviewer, 'Only an insurer can make a decision', 403);
          requireCondition(!frozen, 'The underwriting decision is frozen', 409);
          requireCondition(
            input.outcome === 'approve' || input.outcome === 'decline',
            'Select a decision',
          );
          requireCondition(
            input.outcome === 'decline' || view.status !== 'needs_evidence',
            'Evidence requests are still open',
            409,
          );
          entry = { ...base, kind: 'decision', outcome: input.outcome };
          break;
        case 'message':
          entry = { ...base, kind: 'message' };
          break;
        default:
          throw new ProcurementError('UNDERWRITING', 'Unknown application action');
      }
      this.store.insert('underwriting_entry', entry.id, id, entry);
      return id;
    });
    return this.get(actor, id);
  }
}
