import type {
  ProcurementAgent,
  ProcurementDelegation,
  ProcurementQuote,
  ProcurementPolicy,
} from '@arcuex/domain';
import type { PreparedTx } from '@arcuex/onchain';
type Input = Record<string, unknown>;
export type ProcurementAuthority = {
  delegation: ProcurementDelegation;
  reservedPremiumMicros: string;
  remainingPremiumMicros: string;
  revoked: boolean;
  expired: boolean;
  enforcement: 'backend-only';
};
/** Keys never enter this client. External wallets sign messages and authorize prepared transactions. */
export class ProcurementApiClient {
  private cookie?: string;
  private readonly base: string;
  private readonly request: typeof fetch;
  constructor(config: { baseUrl: string; request?: typeof fetch }) {
    this.base = config.baseUrl.replace(/\/$/, '') + '/api/procurement';
    this.request = config.request ?? fetch;
  }
  private async call<T>(path: string, input?: unknown): Promise<T> {
    const r = await this.request(`${this.base}/${path}`, {
      credentials: 'include',
      method: input === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    const cookie = r.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    const body = (await r.json()) as { code?: string; error?: string };
    if (!r.ok) throw new Error(`${body.code}: ${body.error}`);
    return body as T;
  }
  async authenticate(address: string, signMessage: (message: string) => Promise<string>) {
    const c = await this.call<{ id: string; message: string }>('auth/challenge', { address });
    const s = await this.call<{ address: string; expiresAt: string }>('auth/verify', {
      id: c.id,
      signature: await signMessage(c.message),
    });
    return { address: s.address, expiresAt: s.expiresAt };
  }
  products() {
    return this.call<{ products: unknown[]; chainId: 5042002; pool: string }>('products');
  }
  agents() {
    return this.call<ProcurementAgent[]>('agents');
  }
  register(input: Input) {
    return this.call<ProcurementAgent>('agents', input);
  }
  delegate(input: Input) {
    return this.call<ProcurementDelegation>('delegations', input);
  }
  authority(input: { delegationId: string; agentId?: string }) {
    return this.call<ProcurementAuthority>('authority', input);
  }
  quote(input: Input) {
    return this.call<ProcurementQuote>('quotes', input);
  }
  procure(input: { quoteId: string; acceptedDigest: string; delegationId?: string }) {
    return this.call<{ policy: ProcurementPolicy; transactions: PreparedTx[]; chainId: 5042002 }>(
      'procure',
      input,
    );
  }
  approval(input: { policyId: string; hash: string }) {
    return this.call<{ hash: string; at: number }>('approvals', input);
  }
  confirm(input: { policyId: string; hash: string }) {
    return this.call<ProcurementPolicy>('confirm', input);
  }
  policy(id: string) {
    return this.call<{
      policy: ProcurementPolicy;
      reconciliation: { bound: boolean; cancelled: boolean; matches: boolean };
    }>(`policies/${encodeURIComponent(id)}`);
  }
  policies() {
    return this.call<ProcurementPolicy[]>('policies');
  }
  revoke(id: string) {
    return this.call<{ revoked: true }>('delegations/revoke', { id });
  }
}
