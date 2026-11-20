import { describe, expect, it } from 'vitest';
import {
  CLAIMS_SIGN_IN_REQUIRED,
  parseClaimsCaseListPayload,
  parseLegacyClaimsLedgerPayload,
  readClaimsClientResponse,
} from './claims-client-response';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readClaimsClientResponse', () => {
  it('maps 401 to sign-in-required without inventing an empty list', async () => {
    const result = await readClaimsClientResponse(
      jsonResponse({ error: 'Missing claims session cookie or Authorization Bearer token' }, 401),
      parseClaimsCaseListPayload,
    );
    expect(result).toEqual({
      ok: false,
      kind: 'unauthorized',
      status: 401,
      message: CLAIMS_SIGN_IN_REQUIRED,
    });
  });

  it('maps 403 to sign-in-required / forbidden without inventing an empty list', async () => {
    const result = await readClaimsClientResponse(
      jsonResponse(
        { error: 'Authenticated as claimant but action requires reviewer|authority|system' },
        403,
      ),
      parseClaimsCaseListPayload,
    );
    expect(result).toEqual({
      ok: false,
      kind: 'forbidden',
      status: 403,
      message: CLAIMS_SIGN_IN_REQUIRED,
    });
  });

  it('rejects malformed JSON bodies', async () => {
    const result = await readClaimsClientResponse(
      new Response('{not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      parseClaimsCaseListPayload,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('malformed');
    expect(result.message).toMatch(/malformed/i);
  });

  it('accepts an authenticated empty claims list', async () => {
    const result = await readClaimsClientResponse(
      jsonResponse(
        {
          dataClass: 'claims_case',
          notice: 'ok',
          cases: [],
        },
        200,
      ),
      parseClaimsCaseListPayload,
    );
    expect(result).toEqual({ ok: true, data: [] });
  });

  it('accepts a normal authenticated claims list', async () => {
    const row = {
      id: 'case-1',
      status: 'REVIEW',
      policyId: 'pol-1',
      syntheticDemo: true,
      payable: { usdc: null },
      reviewReasonCode: 'needs_review',
      updatedAt: '2026-11-17T00:00:00.000Z',
      labels: { synthetic: 'fixture' },
    };
    const result = await readClaimsClientResponse(
      jsonResponse({ dataClass: 'claims_case', notice: 'ok', cases: [row] }, 200),
      parseClaimsCaseListPayload,
    );
    expect(result).toEqual({ ok: true, data: [row] });
  });
});

describe('parseLegacyClaimsLedgerPayload', () => {
  it('rejects unauthenticated error bodies that previously crashed on .length', () => {
    expect(parseLegacyClaimsLedgerPayload({ error: 'Missing claims session cookie' })).toBeNull();
  });

  it('accepts empty authenticated ledger arrays', () => {
    expect(
      parseLegacyClaimsLedgerPayload({
        notice: 'Read-only',
        incidents: [],
        claims: [],
        settlements: [],
      }),
    ).toEqual({
      notice: 'Read-only',
      incidents: [],
      claims: [],
      settlements: [],
    });
  });

  it('accepts a normal authenticated ledger payload', () => {
    const payload = {
      notice: 'Read-only',
      mutationsEnabled: false,
      incidents: [{ id: 'i1', status: 'OPEN', observedEventRef: 'evt' }],
      claims: [
        {
          id: 'c1',
          status: 'FILED',
          requestedUsdc: '1.000000',
          authorizedUsdc: null,
        },
      ],
      settlements: [{ id: 's1', status: 'PREPARED', amountUsdc: '1.000000' }],
    };
    expect(parseLegacyClaimsLedgerPayload(payload)).toEqual(payload);
  });
});

describe('parseClaimsCaseListPayload context', () => {
  const base = {
    id: 'case-1',
    status: 'COLLECTING_EVIDENCE',
    policyId: 'pol-1',
    syntheticDemo: true,
    payable: { usdc: null },
    reviewReasonCode: null,
    updatedAt: '2026-11-17T00:00:00.000Z',
    createdAt: '2026-11-16T00:00:00.000Z',
    labels: { synthetic: 'fixture' },
  };

  it('keeps valid display context and verifier freshness', () => {
    const context = {
      product: 'Oracle adapter liquidation',
      insured: { label: 'treasury-agent', position: 'demo-position-01' },
      incident: { ref: 'synthetic:event-001', observedAt: '2026-11-16T00:00:00.000Z' },
      openRequests: 1,
      respondedRequests: 0,
    };
    const verification = { state: 'stale', at: null, validUntilMs: 5, records: 2 };
    const [row] = parseClaimsCaseListPayload({ cases: [{ ...base, context, verification }] })!;
    expect(row?.context).toEqual(context);
    expect(row?.verification).toEqual(verification);
    expect(row?.createdAt).toBe(base.createdAt);
  });

  it('drops malformed context instead of inventing values', () => {
    const [row] = parseClaimsCaseListPayload({
      cases: [
        {
          ...base,
          context: { product: 1, insured: {}, openRequests: -1 },
          verification: { state: 'fresh' },
        },
      ],
    })!;
    expect(row?.context).toBeUndefined();
    expect(row?.verification).toBeUndefined();
  });
});
