import { it, expect, vi } from 'vitest';
import { ClaimsApiClient } from './claims-api-client';
it('uses external nonce signing, secure session, explicit agent identity and locally hashed linked proof without any transaction methods', async () => {
  const calls: Array<{ path: string; body: Record<string, unknown>; headers: Headers }> = [];
  const request = vi.fn(async (url, init) => {
    const path = new URL(String(url)).pathname,
      body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ path, body, headers: new Headers(init?.headers) });
    if (path.endsWith('/nonce'))
      return Response.json({ nonce: 'nonce', message: 'sign this nonce' });
    if (path.endsWith('/verify'))
      return Response.json(
        { ok: true },
        { headers: { 'set-cookie': 'arcuex_claims_sid=opaque; HttpOnly; Secure' } },
      );
    return Response.json({ case: { id: 'claim-id', status: 'COLLECTING_EVIDENCE' } });
  });
  const client = new ClaimsApiClient({
      baseUrl: 'https://candidate.example',
      agentId: 'insured-agent',
      request: request as typeof fetch,
    }),
    sign = vi.fn(async () => 'signed-nonce');
  await client.authenticate('0x1111111111111111111111111111111111111111', sign);
  await client.submitClaim({
    policyId: 'policy-id',
    exposureId: 'insured-agent',
    idempotencyKey: 'claim-key',
    observedEventRef: 'synthetic:incident',
    observedAt: new Date().toISOString(),
  });
  await client.submitProof('claim-id', {
    requestKey: 'proof-key',
    requestId: 'proof-request',
    filename: 'proof.txt',
    content: 'abc',
    declaredSource: 'claimant observation',
  });
  expect(sign).toHaveBeenCalledWith('sign this nonce');
  const proof = calls.at(-1)!;
  expect(proof.body.contentHash).toBe(
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  expect(proof.body.requestId).toBe('proof-request');
  expect(proof.headers.get('x-arcuex-agent-id')).toBe('insured-agent');
  expect(proof.headers.get('cookie')).toBe('arcuex_claims_sid=opaque');
  expect(calls.some((c) => /bind|settlement|transaction/.test(c.path))).toBe(false);
});
it('rejects insecure nonlocal endpoints and propagates authorization failures without retrying', async () => {
  expect(() => new ClaimsApiClient({ baseUrl: 'http://remote.example', agentId: 'id' })).toThrow(
    'HTTPS',
  );
  const request = vi.fn(async () => Response.json({ error: 'Not owned' }, { status: 403 }));
  const client = new ClaimsApiClient({ baseUrl: 'http://localhost:3000', agentId: 'id', request });
  await expect(client.investigation('foreign')).rejects.toThrow('Not owned');
  expect(request).toHaveBeenCalledTimes(1);
});
