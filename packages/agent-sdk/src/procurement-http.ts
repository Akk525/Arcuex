import type {
  ProcurementAgent,
  ProcurementDelegation,
  ProcurementPolicy,
  ProcurementQuote,
} from '@arcuex/domain';
import type { PreparedTx } from '@arcuex/onchain';

/** Remote agent workflow. The caller supplies a signing callback; keys never enter this client. */
export class ProcurementHttpClient {
  private cookie?: string;
  constructor(
    readonly endpoint: string,
    readonly request: typeof fetch = fetch,
  ) {}
  async products() {
    const response = await this.request(this.endpoint);
    if (!response.ok) throw new Error(`Discovery failed: HTTP ${response.status}`);
    return response.json();
  }
  async call<T>(action: string, input: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request(this.endpoint, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify({ ...input, action }),
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
      result: T;
    };
    if (!response.ok)
      throw new Error(
        `${body.error?.code ?? response.status}: ${body.error?.message ?? 'Request failed'}`,
      );
    return body.result as T;
  }
  async signIn(address: string, signMessage: (message: string) => Promise<string>) {
    const challenge = await this.call<{ id: string; message: string }>('challenge', { address });
    const session = await this.call<{ address: string; expiresAt: string }>('authenticate', {
      id: challenge.id,
      signature: await signMessage(challenge.message),
    });
    return { address: session.address, expiresAt: session.expiresAt };
  }
  register(input: {
    idempotencyKey: string;
    signer: string;
    label: string;
    position: string;
    exposureMicros: string;
    ownerAttestsControl: true;
  }) {
    return this.call<ProcurementAgent>('register', input);
  }
  delegate(input: {
    idempotencyKey: string;
    agentId: string;
    premiumCapMicros: string;
    limitCapMicros: string;
    expiresAt: number;
  }) {
    return this.call<ProcurementDelegation>('delegate', input);
  }
  authority(delegationId: string) {
    return this.call<{
      delegation: ProcurementDelegation;
      remainingPremiumMicros: string;
      reservedPremiumMicros: string;
      revoked: boolean;
      expired: boolean;
      enforcement: string;
    }>('authority', { delegationId });
  }
  quote(input: {
    idempotencyKey: string;
    agentId: string;
    delegationId?: string;
    limitMicros: string;
    durationDays: number;
    eligibility: {
      positionHealthy: true;
      noKnownIncident: true;
      syntheticOnly: true;
      ownerAttestsControl: true;
    };
  }) {
    return this.call<ProcurementQuote>('quote', input);
  }
  procure(quoteId: string, acceptedDigest: string, delegationId?: string) {
    return this.call<{ policy: ProcurementPolicy; transactions: PreparedTx[] }>('prepare', {
      quoteId,
      acceptedDigest,
      delegationId,
    });
  }
  confirm(policyId: string, txHash: string) {
    return this.call<ProcurementPolicy>('confirm', { policyId, txHash });
  }
  status(policyId: string) {
    return this.call<ProcurementPolicy>('status', { policyId });
  }
  revoke(delegationId: string) {
    return this.call('revoke', { delegationId });
  }
}
