import { describe, expect, it } from 'vitest';
import { displayClaimStatus, settlementPresentation } from './settlement-presentation';

const hash = `0x${'ab'.repeat(32)}`;
const render = (status: string, blocked = false, confirmedReceipt?: string, canPrepare = false) =>
  settlementPresentation({ status, blocked, confirmedReceipt, canPrepare });

describe('claim financial presentation', () => {
  it('separates coverage approval from settlement preparation and payment', () => {
    expect(render('APPROVED').label).toBe('Awaiting settlement authorization');
    expect(render('APPROVED', false, undefined, true).action).toContain('can request preparation');
    expect(render('SETTLEMENT_PENDING').label).toBe('Awaiting a verified settlement receipt');
    expect(render('SETTLEMENT_FAILED').label).toBe('Settlement failed');
    expect(render('DENIED').label).toBe('No settlement');
  });

  it('blocks fixture settlement even when the claim has been approved', () => {
    expect(render('APPROVED', true)).toEqual({
      label: 'Settlement blocked',
      action:
        'Synthetic fixture restrictions apply. No settlement action is available for this case.',
    });
    expect(render('PAID', true, hash).label).toBe('Settlement blocked');
  });

  it.each([undefined, '0xabc', `0x${'0'.repeat(64)}`])(
    'withholds the PAID label without a confirmed receipt',
    (receipt) => {
      expect(render('PAID', false, receipt).label).toBe('Payment unconfirmed');
      expect(displayClaimStatus('PAID', receipt)).toBe('Payment unconfirmed');
    },
  );

  it('shows confirmed payment when the server provides a verified receipt', () => {
    expect(render('PAID', false, hash).label).toBe('Payment confirmed');
    expect(displayClaimStatus('PAID', hash)).toBe('PAID');
    expect(render('SETTLEMENT_PENDING', false, hash).label).not.toBe('Payment confirmed');
  });
});
