import { describe, expect, it } from 'vitest';
import { claimStatusLabel } from '@/lib/claims/settlement-presentation';
import {
  activityPresentation,
  claimTone,
  policyStatusPill,
  reconciliationLabel,
} from './dashboard-presentation';

describe('dashboard presentation', () => {
  it('never labels a merely bound policy as active', () => {
    expect(policyStatusPill('bound').label).toBe('Bound');
    expect(policyStatusPill('BOUND').label).toBe('Bound');
    expect(policyStatusPill('pending_funding').label).toBe('Awaiting funding');
  });

  it('keeps approval distinct from payment', () => {
    expect(claimTone('APPROVED')).not.toBe('ok');
    expect(claimTone('PAID')).toBe('ok');
    const approved = activityPresentation('claim', 'Claim APPROVED', claimStatusLabel);
    expect(approved.status?.label).toBe('Approved');
    // PAID without a confirmed receipt is never shown as payment confirmed.
    const paid = activityPresentation('claim', 'Claim PAID', (s) => claimStatusLabel(s, null));
    expect(paid.status?.label).toBe('Payment unconfirmed');
    expect(paid.status?.tone).toBe('warn');
  });

  it('describes reconciliation completeness literally', () => {
    expect(reconciliationLabel('INCOMPLETE')).toBe('Bind evidence incomplete');
    expect(reconciliationLabel('SOMETHING_NEW')).toBe('something new');
  });

  it('passes through unrecognised activity summaries', () => {
    expect(activityPresentation('other', 'Free text', claimStatusLabel)).toEqual({
      title: 'Free text',
      status: null,
    });
  });
});
