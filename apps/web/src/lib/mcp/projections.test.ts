import { describe, expect, it } from 'vitest';
import type { PolicyLifecycle, ProcurementPolicy } from '@arcuex/domain';
import { settlementStage } from './tools/settlement';
import type { CaseDetail } from './tools/claims';
import { canonicality, coverageStatus } from './tools/procurement';

const detail = (
  over: Partial<CaseDetail['case']>,
  finality: CaseDetail['paymentFinality'],
  receipt: string | null = null,
) =>
  ({
    case: {
      status: 'PAID',
      syntheticDemo: false,
      evidenceAuthenticity: 'verified_independent',
      settlementAuthorization: 'authorized',
      ...over,
    },
    paymentFinality: finality,
    confirmedSettlementReceipt: receipt,
  }) as unknown as CaseDetail;

describe('settlement stage projection', () => {
  const hash = `0x${'ab'.repeat(32)}`;
  it('reports REIMBURSED only with backend-confirmed canonical receipt', () => {
    expect(settlementStage(detail({}, 'confirmed', hash), 0)).toBe('REIMBURSED');
    // A recorded PAID status without confirmed finality is never reimbursement.
    expect(settlementStage(detail({}, 'unverified'), 0)).toBe('PENDING_CANONICAL_CONFIRMATION');
    expect(settlementStage(detail({}, 'confirmed', null), 0)).not.toBe('REIMBURSED');
    expect(settlementStage(detail({ status: 'SETTLEMENT_PENDING' }, 'unverified'), 0)).toBe(
      'PENDING_CANONICAL_CONFIRMATION',
    );
  });
  it('surfaces receipt reorganization and failure', () => {
    expect(settlementStage(detail({ status: 'SETTLEMENT_PENDING' }, 'reorged'), 0)).toBe('REORGED');
    expect(settlementStage(detail({ status: 'SETTLEMENT_FAILED' }, 'not_paid'), 0)).toBe('FAILED');
  });
  it('maps pre-payment states', () => {
    expect(settlementStage(detail({ status: 'SUBMITTED' }, 'not_paid'), 0)).toBe('CLAIM_FILED');
    expect(settlementStage(detail({ status: 'COLLECTING_EVIDENCE' }, 'not_paid'), 0)).toBe(
      'EVIDENCE_INCOMPLETE',
    );
    expect(settlementStage(detail({ status: 'REVIEW' }, 'not_paid'), 1)).toBe(
      'EVIDENCE_INCOMPLETE',
    );
    expect(settlementStage(detail({ status: 'REVIEW' }, 'not_paid'), 0)).toBe(
      'INVESTIGATION_PENDING',
    );
    expect(
      settlementStage(
        detail({ status: 'APPROVED', settlementAuthorization: 'pending_authority' }, 'not_paid'),
        0,
      ),
    ).toBe('AWAITING_FINANCIAL_AUTHORITY');
    expect(settlementStage(detail({ status: 'SETTLEMENT_PENDING' }, 'not_paid'), 0)).toBe(
      'SETTLEMENT_INTENT_PREPARED',
    );
    expect(settlementStage(detail({ status: 'DENIED' }, 'not_paid'), 0)).toBe('DENIED');
  });
});

describe('policy canonicality projection', () => {
  const now = Math.floor(Date.now() / 1000);
  const policy = {
    state: 'confirmed',
    terms: { effectiveAt: now - 10, expiresAt: now + 100 },
  } as unknown as ProcurementPolicy;
  const life = (over: Partial<PolicyLifecycle>) =>
    ({ state: 'confirmed', completeness: 'VERIFIED_LINKED', ...over }) as PolicyLifecycle;
  it('never treats a receipt alone as effective coverage', () => {
    expect(canonicality(life({ state: 'reconciliation_pending', completeness: null }))).toBe(
      'receipt_recorded_awaiting_canonical_link',
    );
    expect(
      coverageStatus(policy, life({ state: 'reconciliation_pending', completeness: null })),
    ).toBe('pending_canonical_confirmation');
    expect(coverageStatus(policy, life({}))).toBe('active');
  });
  it('reports reorged/orphaned binds and fixture rehearsal', () => {
    expect(
      coverageStatus(policy, life({ state: 'reconciliation_pending', completeness: 'ORPHANED' })),
    ).toBe('reorged');
    expect(canonicality(life({ state: 'reconciliation_pending', completeness: 'ORPHANED' }))).toBe(
      'reorged_orphaned',
    );
    expect(coverageStatus(policy, life({ state: 'fixture_ready' }))).toBe('synthetic_fixture');
    expect(
      coverageStatus(
        { ...policy, terms: { ...policy.terms, effectiveAt: now + 50 } } as ProcurementPolicy,
        life({}),
      ),
    ).toBe('scheduled');
  });
});
