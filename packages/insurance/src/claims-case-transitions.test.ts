import { InvalidTransitionError } from '@arcuex/domain';
import { describe, expect, it } from 'vitest';
import {
  CLAIMS_CASE_SCHEMA_VERSION,
  assertClaimsCaseTransition,
  createDraftClaimsCase,
  transitionClaimsCase,
  type ClaimsCase,
} from './claims-case';

function baseCase(overrides: Partial<ClaimsCase> = {}): ClaimsCase {
  return {
    ...createDraftClaimsCase({
      policyId: '11111111-1111-4111-8111-111111111111',
      exposureId: '22222222-2222-4222-8222-222222222222',
      claimantRef: 'claimant:demo',
      idempotencyKey: 'case-key-001',
      syntheticDemo: true,
      actor: 'system:test',
    }),
    ...overrides,
  };
}

describe('ClaimsCase transitions v1', () => {
  it('creates DRAFT with schemaVersion 1 and empty determinations', () => {
    const draft = createDraftClaimsCase({
      policyId: '11111111-1111-4111-8111-111111111111',
      exposureId: '22222222-2222-4222-8222-222222222222',
      claimantRef: 'claimant:demo',
      idempotencyKey: 'case-key-001',
      syntheticDemo: true,
      actor: 'system:test',
    });
    expect(draft.schemaVersion).toBe(CLAIMS_CASE_SCHEMA_VERSION);
    expect(draft.status).toBe('DRAFT');
    expect(draft.evidenceAuthenticity).toBe('unverified');
    expect(draft.coverageDetermination).toBe('unknown');
    expect(draft.settlementAuthorization).toBe('none');
    expect(draft.payableMicros).toBeNull();
    expect(draft.claimId).toBeNull();
    expect(draft.incidentId).toBeNull();
  });

  it('allows the happy path through PAID', () => {
    let c = baseCase();
    c = transitionClaimsCase(c, {
      to: 'SUBMITTED',
      actor: 'claimant:demo',
      reasonCode: 'CASE_SUBMITTED',
    });
    c = transitionClaimsCase(c, {
      to: 'COLLECTING_EVIDENCE',
      actor: 'system:intake',
      reasonCode: 'EVIDENCE_COLLECTION_STARTED',
    });
    c = transitionClaimsCase(c, {
      to: 'INVESTIGATING',
      actor: 'system:evidence',
      reasonCode: 'MANIFEST_COMPLETE',
    });
    c = transitionClaimsCase(c, {
      to: 'APPROVED',
      actor: 'authority:claims',
      reasonCode: 'AUTHORITY_APPROVED',
      patch: {
        coverageDetermination: 'covered',
        evidenceAuthenticity: 'synthetic_fixture',
        verifiedLossMicros: 1_000_000n,
        recoveriesMicros: 0n,
        remainingLimitMicros: 10_000_000n,
        lossCapMicros: 10_000_000n,
        payableMicros: 1_000_000n,
      },
    });
    c = transitionClaimsCase(c, {
      to: 'SETTLEMENT_PENDING',
      actor: 'authority:claims',
      reasonCode: 'SETTLEMENT_PREPARED',
      patch: { settlementAuthorization: 'authorized' },
    });
    c = transitionClaimsCase(c, {
      to: 'PAID',
      actor: 'authority:claims',
      reasonCode: 'SETTLEMENT_RECONCILED',
    });
    expect(c.status).toBe('PAID');
  });

  it('preserves REVIEW as first-class with no payout authorization', () => {
    let c = baseCase({ status: 'INVESTIGATING' });
    c = transitionClaimsCase(c, {
      to: 'REVIEW',
      actor: 'system:adjudication',
      reasonCode: 'UNKNOWN_RECOVERIES',
      patch: {
        coverageDetermination: 'review_required',
        settlementAuthorization: 'none',
        payableMicros: null,
      },
    });
    expect(c.status).toBe('REVIEW');
    expect(c.settlementAuthorization).toBe('none');
    expect(c.payableMicros).toBeNull();
    expect(() =>
      transitionClaimsCase(c, {
        to: 'SETTLEMENT_PENDING',
        actor: 'authority:claims',
        reasonCode: 'SKIP_APPROVAL',
      }),
    ).toThrow(InvalidTransitionError);
  });

  it('allows recovery from SETTLEMENT_FAILED back to SETTLEMENT_PENDING', () => {
    let c = baseCase({
      status: 'SETTLEMENT_FAILED',
      settlementAuthorization: 'authorized',
      payableMicros: 1_000_000n,
      coverageDetermination: 'covered',
      evidenceAuthenticity: 'synthetic_fixture',
    });
    c = transitionClaimsCase(c, {
      to: 'SETTLEMENT_PENDING',
      actor: 'authority:claims',
      reasonCode: 'SETTLEMENT_RETRY',
    });
    expect(c.status).toBe('SETTLEMENT_PENDING');
  });

  it('rejects illegal transitions', () => {
    expect(() => assertClaimsCaseTransition('DRAFT', 'PAID')).toThrow(InvalidTransitionError);
    expect(() => assertClaimsCaseTransition('DENIED', 'APPROVED')).toThrow(InvalidTransitionError);
    expect(() => assertClaimsCaseTransition('PAID', 'SETTLEMENT_PENDING')).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertClaimsCaseTransition('APPROVED', 'DENIED')).toThrow(InvalidTransitionError);
  });

  it('rejects APPROVED -> SETTLEMENT_PENDING without authorized settlement flag', () => {
    const c = baseCase({
      status: 'APPROVED',
      settlementAuthorization: 'none',
    });
    expect(() =>
      transitionClaimsCase(c, {
        to: 'SETTLEMENT_PENDING',
        actor: 'authority:claims',
        reasonCode: 'SETTLEMENT_PREPARED',
      }),
    ).toThrow(/settlementAuthorization/);
  });
});
