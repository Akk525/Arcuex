import { describe, expect, it } from 'vitest';
import {
  claimantStep,
  claimTitle,
  dossierNextAction,
  freshnessLabel,
  type DossierFacts,
} from './claim-presentation';

const ctx = (open: number, responded = 0) => ({
  product: 'Oracle adapter liquidation',
  insured: { label: 'treasury-agent', position: 'demo-position-01' },
  incident: null,
  openRequests: open,
  respondedRequests: responded,
});

describe('claimTitle', () => {
  it('uses the persisted insured label and falls back to the short id', () => {
    expect(claimTitle({ id: 'abcdef1234', context: ctx(0) })).toBe('treasury-agent');
    expect(claimTitle({ id: 'abcdef1234' })).toBe('Claim abcdef12');
  });
});

describe('claimantStep', () => {
  it('puts unanswered evidence requests first', () => {
    expect(claimantStep({ status: 'INVESTIGATING', context: ctx(1) })).toMatchObject({
      category: 'action',
      action: 'Respond',
    });
    expect(claimantStep({ status: 'INVESTIGATING', context: ctx(1, 1) }).label).toBe(
      'Response under review',
    );
  });

  it('never presents approval or an unreceipted PAID as payment', () => {
    expect(claimantStep({ status: 'APPROVED' }).label).toBe('Approved · not reimbursed');
    expect(claimantStep({ status: 'APPROVED' }).tone).not.toBe('ok');
    expect(claimantStep({ status: 'PAID' })).toMatchObject({
      label: 'Payment unconfirmed',
      tone: 'warn',
    });
    expect(
      claimantStep({ status: 'PAID', confirmedSettlementReceipt: `0x${'a'.repeat(64)}` }).label,
    ).toBe('Payment confirmed');
  });
});

const base: DossierFacts = {
  role: 'claimant',
  status: 'INVESTIGATING',
  unansweredRequests: 0,
  responsesAwaitingReview: 0,
  reviewBlocker: null,
  approvalReady: false,
  examinerPending: false,
  fixtureBlocked: true,
  receipt: null,
  canPrepare: false,
};

describe('dossierNextAction', () => {
  it('tells the claimant to respond to open requests', () => {
    expect(dossierNextAction({ ...base, unansweredRequests: 2 })).toMatchObject({
      title: 'Respond to 2 evidence requests',
      anchor: 'outstanding-requests',
    });
  });

  it('routes the reviewer to the linked response before the decision', () => {
    const next = dossierNextAction({
      ...base,
      role: 'reviewer',
      responsesAwaitingReview: 1,
      approvalReady: true,
    });
    expect(next.title).toBe('Review the claimant response');
  });

  it('explains a blocked decision with the server reason', () => {
    const next = dossierNextAction({
      ...base,
      role: 'reviewer',
      reviewBlocker: 'STALE_VERIFICATION_CONTEXT',
    });
    expect(next.title).toBe('Decision blocked');
    expect(next.detail).toMatch(/Reverify/);
  });

  it('keeps approved synthetic claims explicitly unreimbursed', () => {
    const next = dossierNextAction({ ...base, status: 'APPROVED' });
    expect(next.title).toBe('Approved · not reimbursed');
    expect(next.tone).not.toBe('ok');
  });

  it('does not treat an examiner recommendation as a decision', () => {
    const next = dossierNextAction({ ...base, examinerPending: true });
    expect(next.title).toBe('Examiner assessment running');
    expect(next.detail).toMatch(/Human review can continue/);
  });

  it('only calls a claim paid with a receipt', () => {
    expect(dossierNextAction({ ...base, status: 'PAID' }).title).toBe('Payment unconfirmed');
  });
});

describe('freshnessLabel', () => {
  it('reports remaining validity and expiry', () => {
    const v = { state: 'current' as const, at: null, validUntilMs: 10 * 60_000, records: 1 };
    expect(freshnessLabel(v, 0).label).toBe('Verified · 10 min left');
    expect(freshnessLabel(v, 11 * 60_000).label).toBe('Verification expired');
    expect(freshnessLabel(undefined, 0).label).toBe('Not verified');
    expect(freshnessLabel({ ...v, state: 'stale' }, 0).tone).toBe('warn');
  });
});
