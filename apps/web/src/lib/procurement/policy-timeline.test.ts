import { describe, expect, it } from 'vitest';
import type { PolicyLifecycle, ProcurementPolicy } from '@arcuex/domain';
import { policyTimeline } from './policy-timeline';

const HASH = `0x${'a'.repeat(64)}`;
const policy = {
  terms: { policyId: 'p-1', quoteId: 'q-123456789', effectiveAt: 1_000, expiresAt: 2_000, quoteExpiresAt: 900 },
  bindTx: null,
} as unknown as ProcurementPolicy;

const lifecycle = (over: Partial<PolicyLifecycle>) =>
  ({ settlements: [], confirmation: null, ...over }) as PolicyLifecycle;

const byId = (events: ReturnType<typeof policyTimeline>) => Object.fromEntries(events.map((e) => [e.id, e]));

describe('policyTimeline', () => {
  it('shows a recorded bind as pending reconciliation, not coverage', () => {
    const e = byId(
      policyTimeline({
        policy: { ...policy, bindTx: HASH },
        lifecycle: lifecycle({ state: 'reconciliation_pending' }),
        phase: 'reconciling',
        approvals: [],
        nowSeconds: 1_500,
      }),
    );
    expect(e.bind?.state).toBe('done');
    expect(e.reconciled?.state).toBe('current');
    expect(e.starts?.state).toBe('upcoming');
    expect(e.starts?.title).toBe('Coverage can start');
  });

  it('marks coverage started only when confirmed and past the start', () => {
    const confirmed = lifecycle({
      state: 'confirmed',
      confirmation: { transactionHash: HASH, explorerUrl: null, blockNumber: '42', blockHash: HASH, logIndex: 0 },
    });
    const before = byId(policyTimeline({ policy, lifecycle: confirmed, phase: 'scheduled', approvals: [], nowSeconds: 950 }));
    expect(before.reconciled?.state).toBe('done');
    expect(before.starts?.state).toBe('current');
    const after = byId(policyTimeline({ policy, lifecycle: confirmed, phase: 'effective', approvals: [], nowSeconds: 1_200 }));
    expect(after.starts).toMatchObject({ state: 'done', title: 'Coverage started' });
  });

  it('flags an uncertain bind for attention', () => {
    const e = byId(policyTimeline({ policy, lifecycle: undefined, phase: 'uncertain', approvals: [], bindUncertain: true, nowSeconds: 800 }));
    expect(e.bind?.state).toBe('attention');
  });

  it('never shows a settlement as received without a receipt reference', () => {
    const e = byId(
      policyTimeline({
        policy,
        lifecycle: lifecycle({ state: 'confirmed', settlements: [{ caseId: 'c-12345678', state: 'APPROVED', receiptRef: null, explorerUrl: null }] }),
        phase: 'effective',
        approvals: [],
        nowSeconds: 1_200,
      }),
    );
    expect(e['settlement-c-12345678']).toMatchObject({ state: 'current' });
    expect(e['settlement-c-12345678']?.detail).toMatch(/No settlement receipt/);
  });
});
