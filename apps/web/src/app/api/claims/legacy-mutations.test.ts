import { describe, expect, it } from 'vitest';
import { POST as claimsPost } from './route';
import { POST as demoPost } from './demo/route';

describe('legacy claims mutation containment', () => {
  it('rejects unauthenticated POST mutations on /api/claims', async () => {
    const res = await claimsPost(
      new Request('http://localhost/api/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'decide',
          claimId: '00000000-0000-4000-8000-000000000001',
          decision: 'authorize',
          authority: 'authority:forged',
          rationale: 'should fail',
          authorizedUsdc: '1.000000',
        }),
      }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string; mutationsEnabled?: boolean };
    expect(json.mutationsEnabled).toBe(false);
    expect(json.error).toMatch(/disabled|forbidden|legacy/i);
  });

  it('rejects unauthenticated demo settlement preparation', async () => {
    const res = await demoPost();
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string; mutationsEnabled?: boolean };
    expect(json.mutationsEnabled).toBe(false);
  });
});
