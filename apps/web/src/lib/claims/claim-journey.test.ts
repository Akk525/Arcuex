import { describe, expect, it } from 'vitest';
import { claimJourney, type JourneyFacts } from './claim-journey';

const receipt = '0x' + 'ab'.repeat(32);
const base: JourneyFacts = {
  status: 'COLLECTING_EVIDENCE',
  unansweredRequests: 0,
  examinerPending: false,
  examinerReported: false,
  settlementBlocked: false,
};
const step = (f: Partial<JourneyFacts>, id: string) =>
  claimJourney({ ...base, ...f }).find((s) => s.id === id)!;

describe('claim journey', () => {
  it('never shows approval as reimbursement', () => {
    expect(step({ status: 'APPROVED' }, 'review').state).toBe('complete');
    expect(step({ status: 'APPROVED' }, 'settlement').state).toBe('current');
    expect(step({ status: 'APPROVED' }, 'settlement').caption).toBe('Not paid yet');
  });

  it('requires a reconciled receipt for a completed settlement', () => {
    expect(step({ status: 'PAID' }, 'settlement').state).not.toBe('complete');
    expect(step({ status: 'PAID', confirmedReceipt: '0x' + '0'.repeat(64) }, 'settlement').state).not.toBe('complete');
    expect(
      step({ status: 'PAID', confirmedReceipt: receipt, paymentFinality: 'unverified' }, 'settlement').state,
    ).not.toBe('complete');
    expect(
      step({ status: 'PAID', confirmedReceipt: receipt, paymentFinality: 'confirmed' }, 'settlement').state,
    ).toBe('complete');
  });

  it('blocks synthetic fixture settlement even with a receipt', () => {
    const s = step({ status: 'PAID', confirmedReceipt: receipt, settlementBlocked: true }, 'settlement');
    expect(s.state).toBe('blocked');
  });

  it('surfaces open evidence requests and pending examiner work', () => {
    expect(step({ status: 'INVESTIGATING', unansweredRequests: 2 }, 'evidence').caption).toBe('2 open requests');
    expect(step({ status: 'INVESTIGATING', examinerPending: true }, 'examiner').state).toBe('current');
    expect(step({ status: 'DENIED' }, 'settlement').state).toBe('skipped');
  });
});
