import { hasArcReceiptHash, type PaymentFinality } from './payment-finality';

export type JourneyState = 'complete' | 'current' | 'upcoming' | 'blocked' | 'skipped' | 'error';
export type JourneyStep = {
  id: 'claim' | 'evidence' | 'examiner' | 'review' | 'settlement';
  label: string;
  caption: string;
  state: JourneyState;
  anchor?: string;
};

export type JourneyFacts = {
  status: string;
  unansweredRequests: number;
  examinerPending: boolean;
  examinerReported: boolean;
  /** Synthetic fixture or otherwise settlement-blocked case. */
  settlementBlocked: boolean;
  confirmedReceipt?: string | null;
  paymentFinality?: PaymentFinality;
};

const DECIDED = ['APPROVED', 'DENIED', 'SETTLEMENT_PENDING', 'SETTLEMENT_FAILED', 'PAID'];
const APPROVED = ['APPROVED', 'SETTLEMENT_PENDING', 'SETTLEMENT_FAILED', 'PAID'];

/**
 * Claim lifecycle for display. Human approval and reimbursement are separate steps:
 * the settlement step is complete only with a reconciled, non-fixture Arc receipt.
 * Presentation only; never an authorization signal.
 */
export function claimJourney(f: JourneyFacts): JourneyStep[] {
  const decided = DECIDED.includes(f.status);
  const intake = f.status === 'SUBMITTED' || f.status === 'COLLECTING_EVIDENCE';

  const evidence: JourneyStep =
    f.unansweredRequests > 0
      ? {
          id: 'evidence',
          label: 'Evidence',
          caption: `${f.unansweredRequests} open request${f.unansweredRequests === 1 ? '' : 's'}`,
          state: 'current',
          anchor: 'outstanding-requests',
        }
      : intake
        ? { id: 'evidence', label: 'Evidence', caption: 'Collecting proof', state: 'current' }
        : { id: 'evidence', label: 'Evidence', caption: 'Proof on file', state: 'complete' };

  const examiner: JourneyStep = f.examinerPending
    ? { id: 'examiner', label: 'AI examiner', caption: 'Reading the dossier', state: 'current' }
    : f.examinerReported
      ? { id: 'examiner', label: 'AI examiner', caption: 'Advisory report filed', state: 'complete' }
      : decided
        ? { id: 'examiner', label: 'AI examiner', caption: 'Not run', state: 'skipped' }
        : { id: 'examiner', label: 'AI examiner', caption: 'Advisory only', state: 'upcoming' };

  const review: JourneyStep =
    f.status === 'DENIED'
      ? { id: 'review', label: 'Human review', caption: 'Denied by reviewer', state: 'complete' }
      : APPROVED.includes(f.status)
        ? { id: 'review', label: 'Human review', caption: 'Approved by reviewer', state: 'complete' }
        : f.status === 'INVESTIGATING' || f.status === 'REVIEW'
          ? { id: 'review', label: 'Human review', caption: 'Awaiting decision', state: 'current' }
          : { id: 'review', label: 'Human review', caption: 'Decides coverage', state: 'upcoming' };

  const paid =
    f.status === 'PAID' &&
    !f.settlementBlocked &&
    hasArcReceiptHash(f.confirmedReceipt) &&
    (f.paymentFinality === undefined || f.paymentFinality === 'confirmed');

  const settlement: JourneyStep = paid
    ? { id: 'settlement', label: 'Reimbursement', caption: 'Receipt reconciled', state: 'complete' }
    : f.status === 'DENIED'
      ? { id: 'settlement', label: 'Reimbursement', caption: 'No settlement', state: 'skipped' }
      : f.settlementBlocked
        ? {
            id: 'settlement',
            label: 'Reimbursement',
            caption: APPROVED.includes(f.status) ? 'Blocked · synthetic, not paid' : 'Blocked · synthetic',
            state: 'blocked',
          }
        : f.paymentFinality === 'reorged' || f.status === 'SETTLEMENT_FAILED'
          ? {
              id: 'settlement',
              label: 'Reimbursement',
              caption: f.paymentFinality === 'reorged' ? 'Payment reorged' : 'Settlement failed',
              state: 'error',
            }
          : APPROVED.includes(f.status)
            ? {
                id: 'settlement',
                label: 'Reimbursement',
                caption: f.status === 'APPROVED' ? 'Not paid yet' : 'Payment unconfirmed',
                state: 'current',
              }
            : { id: 'settlement', label: 'Reimbursement', caption: 'Needs a verified receipt', state: 'upcoming' };

  return [
    { id: 'claim', label: 'Claim filed', caption: 'Record opened', state: 'complete' },
    evidence,
    examiner,
    review,
    settlement,
  ];
}
