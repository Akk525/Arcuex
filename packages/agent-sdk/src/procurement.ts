import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isAddress, keccak256, stringToHex, verifyMessage, type Address, type Hex } from 'viem';
import {
  PROCUREMENT_PRODUCT as PRODUCT,
  type ProcurementAgent,
  type ProcurementDelegation,
  type ProcurementPolicy,
  type ProcurementQuote,
} from '@arcuex/domain';
import type { ProcurementStore } from '@arcuex/persistence';
import {
  prepareBindPolicy,
  prepareUsdcApprove,
  toPolicyIdBytes32,
  type PreparedTx,
} from '@arcuex/onchain';

export class ProcurementError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
function requireThat(ok: unknown, code: string, message: string, status = 400): asserts ok {
  if (!ok) throw new ProcurementError(code, message, status);
}
function text(value: unknown, name: string, max = 160): string {
  requireThat(
    typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    'INVALID_INPUT',
    `${name} is required (max ${max})`,
  );
  return value.trim();
}
function address(value: unknown): string {
  requireThat(
    typeof value === 'string' && isAddress(value) && !/^0x0{40}$/i.test(value),
    'INVALID_ADDRESS',
    'A nonzero wallet address is required',
  );
  return value.toLowerCase();
}
function micros(value: unknown): bigint {
  requireThat(
    typeof value === 'string' && /^[1-9][0-9]{0,11}$/.test(value),
    'INVALID_AMOUNT',
    'Use positive integer USDC micros',
  );
  return BigInt(value);
}
function timestamp(value: unknown): number {
  requireThat(
    typeof value === 'number' && Number.isSafeInteger(value),
    'INVALID_TIME',
    'Use integer Unix seconds',
  );
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function procurementDigest(value: unknown): Hex {
  return keccak256(stringToHex(canonical(value)));
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** No wallet or signer lives here. All permissions are backend-only. */
export class ProcurementService {
  constructor(
    readonly store: ProcurementStore,
    readonly pool: Address,
    readonly usdc: Address,
    readonly now = () => Math.floor(Date.now() / 1000),
  ) {}

  challenge(wallet: unknown, origin: string) {
    const who = address(wallet),
      id = randomUUID(),
      expiresAt = this.now() + 300;
    const message = `Arcuex procurement sign-in\nOrigin: ${origin}\nChain: 5042002\nAddress: ${who}\nNonce: ${id}\nExpires: ${expiresAt}\nThis signature authorizes a one-hour backend session. It does not authorize token transfers.`;
    this.store.db.transaction(() =>
      this.store.db
        .prepare('INSERT INTO procurement_auth(id,address,message,expires_at) VALUES (?,?,?,?)')
        .run(id, who, message, expiresAt),
    )();
    return { id, message, expiresAt };
  }
  async authenticate(id: unknown, signature: unknown) {
    const row = this.store.db
      .prepare('SELECT * FROM procurement_auth WHERE id=?')
      .get(text(id, 'challenge')) as
      { address: Address; message: string; expires_at: number; consumed: number } | undefined;
    requireThat(
      row && !row.consumed && row.expires_at > this.now(),
      'AUTH_EXPIRED',
      'Challenge expired or already used',
      401,
    );
    const sig = text(signature, 'signature', 132);
    requireThat(
      /^0x[0-9a-f]{130}$/i.test(sig),
      'AUTH_SIGNATURE',
      'Expected EOA personal_sign signature',
      401,
    );
    const valid = await verifyMessage({
      address: row.address,
      message: row.message,
      signature: sig as Hex,
    }).catch(() => false);
    requireThat(valid, 'AUTH_SIGNATURE', 'Wallet signature does not match', 401);
    const token = randomBytes(32).toString('hex'),
      expiresAt = this.now() + 3600;
    this.store.db.transaction(() => {
      const updated = this.store.db
        .prepare('UPDATE procurement_auth SET consumed=1 WHERE id=? AND consumed=0')
        .run(id);
      requireThat(updated.changes === 1, 'AUTH_REPLAY', 'Challenge already used', 401);
      this.store.db
        .prepare('INSERT INTO procurement_sessions VALUES (?,?,?)')
        .run(tokenHash(token), row.address, expiresAt);
    })();
    return { token, address: row.address, expiresAt };
  }
  identity(token: string | undefined): string {
    requireThat(
      token && token.length === 64,
      'UNAUTHENTICATED',
      'Sign in with your wallet first',
      401,
    );
    const row = this.store.db
      .prepare('SELECT address, expires_at FROM procurement_sessions WHERE token_hash=?')
      .get(tokenHash(token)) as { address: string; expires_at: number } | undefined;
    requireThat(
      row && row.expires_at > this.now(),
      'UNAUTHENTICATED',
      'Session expired; sign in again',
      401,
    );
    return row.address;
  }
  private idempotent<T>(
    actor: string,
    action: string,
    key: unknown,
    input: unknown,
    run: () => T,
  ): T {
    const id = procurementDigest([actor, action, text(key, 'idempotencyKey')]);
    const fingerprint = procurementDigest(input);
    return this.store.db.transaction(() => {
      const existing = this.store.get<{ fingerprint: string; result: T }>('request', id);
      if (existing) {
        requireThat(
          existing.fingerprint === fingerprint,
          'IDEMPOTENCY_CONFLICT',
          'Key already used with different input',
          409,
        );
        return existing.result;
      }
      const result = run();
      this.store.insert('request', id, actor, { fingerprint, result });
      return result;
    })();
  }
  register(actor: string, input: Record<string, unknown>) {
    return this.idempotent(actor, 'register', input.idempotencyKey, input, () => {
      const agent: ProcurementAgent = {
        id: randomUUID(),
        owner: actor,
        signer: address(input.signer),
        label: text(input.label, 'label', 80),
        exposure: {
          chainId: 5042002,
          protocol: PRODUCT.protocol,
          position: text(input.position, 'position', 120),
          notionalMicros: micros(input.exposureMicros).toString(),
        },
      };
      requireThat(
        (input.chainId === undefined || input.chainId === 5042002) &&
          (input.protocol === undefined || input.protocol === PRODUCT.protocol),
        'INELIGIBLE',
        'Only the synthetic Arc lending protocol is eligible',
      );
      requireThat(
        input.ownerAttestsControl === true,
        'INELIGIBLE',
        'Owner must attest control of this synthetic position',
      );
      this.store.insert('agent', agent.id, actor, agent);
      return agent;
    });
  }
  private agent(id: unknown) {
    const agent = this.store.get<ProcurementAgent>('agent', text(id, 'agentId'));
    requireThat(agent, 'NOT_FOUND', 'Agent not found', 404);
    return agent;
  }
  private delegation(actor: string, agent: ProcurementAgent, id: unknown) {
    const d = this.store.get<ProcurementDelegation>('delegation', text(id, 'delegationId'));
    requireThat(
      d &&
        d.owner === agent.owner &&
        d.agentId === agent.id &&
        agent.signer === actor &&
        d.expiresAt > this.now() &&
        !this.store.get('revocation', d.id),
      'FORBIDDEN',
      'Delegation missing, expired, revoked or not yours',
      403,
    );
    requireThat(
      d.productCode === PRODUCT.code && d.position === agent.exposure.position,
      'FORBIDDEN',
      'Delegation does not allow this exposure or beneficiary',
      403,
    );
    return d;
  }
  delegate(actor: string, input: Record<string, unknown>) {
    return this.idempotent(actor, 'delegate', input.idempotencyKey, input, () => {
      const agent = this.agent(input.agentId);
      requireThat(
        agent.owner === actor,
        'FORBIDDEN',
        'Only the authenticated owner may delegate',
        403,
      );
      const expiresAt = timestamp(input.expiresAt);
      requireThat(
        expiresAt > this.now() && expiresAt <= this.now() + 30 * 86400,
        'INVALID_TIME',
        'Delegation must expire within 30 days',
      );
      const d: ProcurementDelegation = {
        id: randomUUID(),
        owner: actor,
        agentId: agent.id,
        productCode: PRODUCT.code,
        position: agent.exposure.position,
        beneficiary: input.beneficiary === undefined ? actor : address(input.beneficiary),
        premiumCapMicros: micros(input.premiumCapMicros).toString(),
        limitCapMicros: micros(input.limitCapMicros).toString(),
        expiresAt,
      };
      this.store.insert('delegation', d.id, actor, d);
      return d;
    });
  }
  revoke(actor: string, id: unknown) {
    const d = this.store.get<ProcurementDelegation>('delegation', text(id, 'delegationId'));
    requireThat(d?.owner === actor, 'FORBIDDEN', 'Only the owner may revoke', 403);
    if (!this.store.get('revocation', d.id))
      this.store.insert('revocation', d.id, actor, { at: this.now() });
    return {
      revoked: true,
      notice:
        'Previously prepared transactions remain executable onchain. No onchain delegation exists.',
    };
  }
  quote(actor: string, input: Record<string, unknown>) {
    return this.idempotent(actor, 'quote', input.idempotencyKey, input, () => {
      const agent = this.agent(input.agentId);
      const d = agent.owner === actor ? null : this.delegation(actor, agent, input.delegationId);
      const eligibility = input.eligibility as Record<string, unknown> | undefined;
      requireThat(
        eligibility &&
          ['positionHealthy', 'noKnownIncident', 'syntheticOnly', 'ownerAttestsControl'].every(
            (k) => eligibility[k] === true,
          ),
        'INELIGIBLE',
        'All eligibility attestations must be true; known incidents and unhealthy positions are excluded',
      );
      const limit = micros(input.limitMicros);
      requireThat(
        [1_000_000n, 10_000_000n, 50_000_000n, 100_000_000n].includes(limit),
        'INVALID_LIMIT',
        'Demo limits: 1, 10, 50 or 100 USDC',
      );
      requireThat(
        limit <= BigInt(agent.exposure.notionalMicros),
        'INVALID_LIMIT',
        'Coverage limit cannot exceed registered exposure',
      );
      const days = timestamp(input.durationDays);
      requireThat([1, 7, 30].includes(days), 'INVALID_DURATION', 'Demo durations: 1, 7 or 30 days');
      if (d)
        requireThat(
          limit <= BigInt(d.limitCapMicros) && limit / 100n <= BigInt(d.premiumCapMicros),
          'CAP_EXCEEDED',
          'Quote exceeds delegated cap',
          403,
        );
      const beneficiary =
        input.beneficiary === undefined ? agent.owner : address(input.beneficiary);
      requireThat(
        !d || beneficiary === d.beneficiary,
        'FORBIDDEN',
        'Beneficiary is outside owner delegation',
        403,
      );
      const now = this.now();
      const terms: ProcurementQuote['terms'] = {
        version: 1,
        policyId: randomUUID(),
        quoteId: randomUUID(),
        productCode: PRODUCT.code,
        agentId: agent.id,
        owner: agent.owner,
        beneficiary,
        exposure: agent.exposure,
        eligibility: {
          positionHealthy: true,
          noKnownIncident: true,
          syntheticOnly: true,
          ownerAttestsControl: true,
        },
        premiumMicros: (limit / 100n).toString(),
        limitMicros: limit.toString(),
        deductibleMicros: (limit / 10n).toString(),
        effectiveAt: now + 900,
        expiresAt: now + 900 + days * 86400,
        quoteExpiresAt: now + 600,
        insuredEvent: PRODUCT.event,
        exclusions: [...PRODUCT.exclusions],
        synthetic: true,
      };
      const quote: ProcurementQuote = { terms, digest: procurementDigest(terms) };
      this.store.insert('quote', terms.quoteId, agent.owner, quote);
      return quote;
    });
  }
  prepare(actor: string, input: Record<string, unknown>) {
    const quote = this.store.get<ProcurementQuote>('quote', text(input.quoteId, 'quoteId'));
    requireThat(quote, 'NOT_FOUND', 'Quote not found', 404);
    const agent = this.agent(quote.terms.agentId);
    const d = actor === agent.owner ? null : this.delegation(actor, agent, input.delegationId);
    requireThat(
      input.acceptedDigest === quote.digest,
      'TERMS_NOT_ACCEPTED',
      'Explicitly accept the exact terms digest',
    );
    requireThat(
      !d || quote.terms.beneficiary === d.beneficiary,
      'FORBIDDEN',
      'Quote beneficiary is outside delegation',
      403,
    );
    return this.store.db.transaction(() => {
      const existing = this.store.policy(quote.terms.policyId);
      if (existing) {
        requireThat(
          existing.payer === actor && existing.delegationId === (d?.id ?? null),
          'ALREADY_PREPARED',
          'Quote already prepared by another authority',
          409,
        );
        requireThat(
          existing.state === 'confirmed' || quote.terms.quoteExpiresAt > this.now(),
          'QUOTE_EXPIRED',
          'Quote expired; request a new quote',
          409,
        );
        return {
          policy: existing,
          transactions: existing.state === 'confirmed' ? [] : this.transactions(existing),
        };
      }
      requireThat(
        quote.terms.quoteExpiresAt > this.now(),
        'QUOTE_EXPIRED',
        'Quote expired; request a new quote',
        409,
      );
      if (d) {
        const spent = this.store
          .policies(agent.owner)
          .filter((p) => p.delegationId === d.id)
          .reduce((sum, p) => sum + BigInt(p.terms.premiumMicros), 0n);
        requireThat(
          spent + BigInt(quote.terms.premiumMicros) <= BigInt(d.premiumCapMicros) &&
            BigInt(quote.terms.limitMicros) <= BigInt(d.limitCapMicros),
          'CAP_EXCEEDED',
          'Cumulative premium or policy limit cap exceeded',
          403,
        );
      }
      const policy: ProcurementPolicy = {
        ...quote,
        payer: actor,
        delegationId: d?.id ?? null,
        state: 'prepared',
        bindTx: null,
        confirmedAt: null,
      };
      this.store.insertPolicy(policy);
      this.store.insert('acceptance', policy.terms.policyId, actor, {
        digest: quote.digest,
        actor,
        at: this.now(),
      });
      return { policy, transactions: this.transactions(policy) };
    })();
  }
  transactions(p: ProcurementPolicy): PreparedTx[] {
    const t = p.terms;
    return [
      prepareUsdcApprove({
        usdc: this.usdc,
        spender: this.pool,
        amount: BigInt(t.premiumMicros),
        account: p.payer as Address,
      }),
      prepareBindPolicy({
        pool: this.pool,
        account: p.payer as Address,
        policyId: toPolicyIdBytes32(t.policyId),
        termsHash: p.digest,
        beneficiary: t.beneficiary as Address,
        premium: BigInt(t.premiumMicros),
        limit: BigInt(t.limitMicros),
        coverageStart: BigInt(t.effectiveAt),
        coverageEnd: BigInt(t.expiresAt),
      }),
    ];
  }
  inspect(actor: string, id: unknown) {
    const p = this.store.policy(text(id, 'policyId'));
    requireThat(
      p && (p.terms.owner === actor || p.payer === actor),
      'NOT_FOUND',
      'Policy not found',
      404,
    );
    return p;
  }
  authority(actor: string, id: unknown) {
    const d = this.store.get<ProcurementDelegation>('delegation', text(id, 'delegationId'));
    requireThat(d, 'NOT_FOUND', 'Delegation not found', 404);
    const agent = this.agent(d.agentId);
    requireThat(
      actor === d.owner || actor === agent.signer,
      'FORBIDDEN',
      'Delegation is not yours',
      403,
    );
    const reserved = this.store
      .policies(d.owner)
      .filter((p) => p.delegationId === d.id)
      .reduce((sum, p) => sum + BigInt(p.terms.premiumMicros), 0n);
    return {
      delegation: d,
      reservedPremiumMicros: reserved.toString(),
      remainingPremiumMicros: (BigInt(d.premiumCapMicros) - reserved).toString(),
      revoked: Boolean(this.store.get('revocation', d.id)),
      expired: d.expiresAt <= this.now(),
      enforcement: 'backend-only',
    };
  }
  visible(actor: string): ProcurementPolicy[] {
    const rows = this.store.db
      .prepare(
        "SELECT payload FROM procurement_policies WHERE owner=? OR json_extract(payload, '$.payer')=?",
      )
      .all(actor, actor) as { payload: string }[];
    return rows.map((r) =>
      this.store.policy((JSON.parse(r.payload) as ProcurementPolicy).terms.policyId)!,
    );
  }
  list(actor: string) {
    const agents = (
      this.store.db.prepare("SELECT payload FROM procurement_records WHERE kind='agent'").all() as {
        payload: string;
      }[]
    )
      .map((r) => JSON.parse(r.payload) as ProcurementAgent)
      .filter((a) => a.owner === actor || a.signer === actor);
    const delegations = (
      this.store.db
        .prepare("SELECT payload FROM procurement_records WHERE kind='delegation'")
        .all() as { payload: string }[]
    )
      .map((r) => JSON.parse(r.payload) as ProcurementDelegation)
      .filter(
        (d) => d.owner === actor || agents.some((a) => a.id === d.agentId && a.signer === actor),
      );
    const rows = this.store.db
      .prepare(
        "SELECT id FROM procurement_policies WHERE owner=? OR json_extract(payload, '$.payer')=?",
      )
      .all(actor, actor) as { id: string }[];
    return {
      agents,
      delegations: delegations.map((d) => ({
        ...d,
        revoked: Boolean(this.store.get('revocation', d.id)),
      })),
      policies: rows.map((r) => this.store.policy(r.id)!),
    };
  }
}
