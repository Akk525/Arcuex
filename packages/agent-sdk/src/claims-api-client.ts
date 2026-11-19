/** Agent-native claims only. External nonce signing; never stores signing keys or prepares transactions. */
export class ClaimsApiClient {
  private cookie?: string;
  private readonly base: string;
  private readonly request: typeof fetch;
  constructor(
    private readonly config: {
      baseUrl: string;
      agentId: string;
      request?: typeof fetch;
      acceptanceGate?: string;
    },
  ) {
    const origin = new URL(config.baseUrl);
    if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
      throw new Error('Claims client requires HTTPS or localhost');
    this.base = origin.origin;
    this.request = config.request ?? fetch;
  }
  private async call<T>(path: string, body?: unknown): Promise<T> {
    const r = await this.request(this.base + path, {
      credentials: 'include',
      redirect: 'error',
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        origin: this.base,
        'x-arcuex-agent-id': this.config.agentId,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.config.acceptanceGate
          ? { 'x-arcuex-acceptance-gate': this.config.acceptanceGate }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookie = r.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    const json = (await r.json()) as { error?: string };
    if (!r.ok) throw new Error(json.error ?? 'Claims request failed');
    return json as T;
  }
  async authenticate(wallet: string, signMessage: (message: string) => Promise<string>) {
    const challenge = await this.call<{ nonce: string; message: string }>(
      '/api/claims/auth/nonce',
      { wallet },
    );
    return this.call('/api/claims/auth/verify', {
      wallet,
      nonce: challenge.nonce,
      signature: await signMessage(challenge.message),
    });
  }
  submitClaim(input: {
    policyId: string;
    exposureId: string;
    idempotencyKey: string;
    observedEventRef: string;
    observedAt: string;
  }) {
    return this.call<{ case: { id: string; status: string } }>('/api/claims/cases', {
      action: 'open',
      claimantRef: 'authenticated-agent',
      ...input,
    });
  }
  investigation(caseId: string) {
    return this.call<{
      outstandingRequests: string[];
      dossierDigest: string;
      entries: Array<{ id: string; kind: string; payload: Record<string, unknown> }>;
    }>(`/api/claims/cases/${encodeURIComponent(caseId)}/investigation`);
  }
  async submitProof(
    caseId: string,
    input: {
      requestKey: string;
      requestId: string | null;
      filename: string;
      content: string;
      declaredSource: string;
    },
  ) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.content));
    const contentHash =
      'sha256:' + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    return this.call(`/api/claims/cases/${encodeURIComponent(caseId)}/investigation`, {
      action: 'submit_proof',
      ...input,
      contentHash,
    });
  }
  message(caseId: string, text: string, requestKey = crypto.randomUUID()) {
    return this.call(`/api/claims/cases/${encodeURIComponent(caseId)}/investigation`, {
      action: 'message',
      text,
      requestKey,
    });
  }
  requestExamination(caseId: string, requestKey = crypto.randomUUID()) {
    return this.call(`/api/claims/cases/${encodeURIComponent(caseId)}/investigation`, {
      action: 'request_examiner',
      requestKey,
    });
  }
}
