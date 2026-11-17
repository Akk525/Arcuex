import { afterEach, describe, expect, it } from 'vitest';
import { authenticateClaimsRequest } from './claims-auth';

describe('authenticateClaimsRequest', () => {
  afterEach(() => {
    delete process.env.CLAIMS_CLAIMANT_API_TOKEN;
    delete process.env.CLAIMS_REVIEWER_API_TOKEN;
    delete process.env.CLAIMS_AUTHORITY_API_TOKEN;
    delete process.env.CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP;
  });

  it('rejects missing and forged actor-only requests', () => {
    process.env.CLAIMS_AUTHORITY_API_TOKEN = 'auth-secret';
    const bare = new Request('http://localhost/api/claims/cases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actor: 'authority:claims' }),
    });
    expect(authenticateClaimsRequest(bare, ['authority']).ok).toBe(false);
  });

  it('maps bearer token to role and ignores wrong-role tokens', () => {
    process.env.CLAIMS_REVIEWER_API_TOKEN = 'review-secret';
    process.env.CLAIMS_AUTHORITY_API_TOKEN = 'auth-secret';
    const reviewerReq = new Request('http://localhost/x', {
      headers: { authorization: 'Bearer review-secret' },
    });
    const reviewer = authenticateClaimsRequest(reviewerReq, ['authority']);
    expect(reviewer.ok).toBe(false);
    if (!reviewer.ok) expect(reviewer.status).toBe(403);

    const okReq = new Request('http://localhost/x', {
      headers: { authorization: 'Bearer auth-secret' },
    });
    const ok = authenticateClaimsRequest(okReq, ['authority']);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.principal.role).toBe('authority');
  });

  it('enables synthetic settlement prep only via env flag on authority', () => {
    process.env.CLAIMS_AUTHORITY_API_TOKEN = 'auth-secret';
    process.env.CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP = '1';
    const req = new Request('http://localhost/x', {
      headers: { authorization: 'Bearer auth-secret' },
    });
    const auth = authenticateClaimsRequest(req, ['authority']);
    expect(auth.ok).toBe(true);
    if (auth.ok) expect(auth.principal.allowSyntheticSettlementPrep).toBe(true);
  });
});
