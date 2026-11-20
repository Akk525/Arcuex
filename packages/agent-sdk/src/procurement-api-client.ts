import type {
  ProcurementAgent,
  ProcurementDelegation,
  ProcurementQuote,
  ProcurementPolicy,
  ProcurementCatalog,
  ProcurementCapacity,
  PolicyLifecycle,
  UnderwritingAction,
  UnderwritingApplicationInput,
  UnderwritingView,
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
    this.base = config.baseUrl.replace(/\/$/, '');
    this.request = config.request ?? fetch;
  }
  private async call<T>(path: string, input?: unknown, agentId?: string): Promise<T> {
    const route = path.startsWith('/') ? path : `/api/procurement/${path}`;
    const r = await this.request(this.base + route, {
      credentials: 'include',
      method: input === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agentId ? { 'x-arcuex-agent-id': agentId } : {}),
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
    return this.call<ProcurementCatalog>('products');
  }
  capacity() {
    return this.call<ProcurementCapacity>('capacity');
  }
  accept(input: { quoteId: string; acceptedDigest: string; delegationId?: string }) {
    return this.call<{ policy: ProcurementPolicy; state: 'accepted_offchain' }>('accept', input);
  }
  payment(input: { policyId: string; acceptedDigest: string; stage: 'approve' | 'bind' }) {
    return this.call<{
      policy: ProcurementPolicy;
      transaction: PreparedTx | null;
      chainId: 5042002;
    }>('payment', input);
  }
  lifecycle(id: string, agentId?: string) {
    return this.call<PolicyLifecycle>(
      `/api/policies/${encodeURIComponent(id)}/lifecycle`,
      undefined,
      agentId,
    );
  }
  agents() {
    return this.call<ProcurementAgent[]>('agents');
  }
  delegations() {
    return this.call<Array<ProcurementDelegation & { revoked: boolean }>>('delegations');
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
  underwritingApplications(agentId?: string) {
    return this.call<{ applications: UnderwritingView[]; paymentEnabled: boolean }>(
      '/api/underwriting',
      undefined,
      agentId,
    );
  }
  underwritingApplication(id: string, agentId?: string) {
    return this.call<{ application: UnderwritingView; paymentEnabled: boolean }>(
      `/api/underwriting/${encodeURIComponent(id)}`,
      undefined,
      agentId,
    );
  }
  applyForUnderwriting(input: UnderwritingApplicationInput, signerAgentId?: string) {
    return this.call<{ application: UnderwritingView; paymentEnabled: boolean }>(
      '/api/underwriting',
      input,
      signerAgentId,
    );
  }
  updateUnderwriting(id: string, input: UnderwritingAction, agentId?: string) {
    return this.call<{ application: UnderwritingView; paymentEnabled: boolean }>(
      `/api/underwriting/${encodeURIComponent(id)}`,
      input,
      agentId,
    );
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
