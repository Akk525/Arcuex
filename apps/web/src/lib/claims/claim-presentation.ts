/**
 * Presentation-only claim states. These name what the server already decided;
 * nothing here enables an action, approves a claim or implies payment.
 */
import { currentPaymentReceipt, type PaymentFinality } from './payment-finality';
import { reviewBlockerMessage } from './investigation-presentation';
import type { ClaimListContext, ClaimVerificationFreshness } from './claims-client-response';

export type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'live' | 'synthetic';
export type ClaimCategory = 'action' | 'in_progress' | 'decided' | 'closed';

const OPEN = ['SUBMITTED', 'COLLECTING_EVIDENCE', 'INVESTIGATING', 'REVIEW'];

export function claimTitle(row: { id: string; context?: ClaimListContext }) {
  return row.context?.insured.label?.trim() || `Claim ${row.id.slice(0, 8)}`;
}

/** Where a claim stands for the person filing it, and what (if anything) they should do. */
export function claimantStep(row: {
  status: string;
  context?: ClaimListContext;
  confirmedSettlementReceipt?: string;
  paymentFinality?: PaymentFinality;
}): { label: string; tone: Tone; category: ClaimCategory; action: string | null } {
  const open = row.context?.openRequests ?? 0;
  const responded = row.context?.respondedRequests ?? 0;
  if (OPEN.includes(row.status) && open > responded)
    return {
      label:
        open - responded === 1 ? 'Evidence requested' : `${open - responded} evidence requests`,
      tone: 'warn',
      category: 'action',
      action: 'Respond',
    };
  if (row.paymentFinality === 'reorged' || row.paymentFinality === 'unverified')
    return {
      label: row.paymentFinality === 'reorged' ? 'Payment reorged' : 'Payment unconfirmed',
      tone: 'warn',
      category: 'decided',
      action: null,
    };
  switch (row.status) {
    case 'SUBMITTED':
    case 'COLLECTING_EVIDENCE':
      return {
        label: 'Collecting evidence',
        tone: 'pending',
        category: 'in_progress',
        action: null,
      };
    case 'INVESTIGATING':
      return {
        label: responded ? 'Response under review' : 'Under investigation',
        tone: 'pending',
        category: 'in_progress',
        action: null,
      };
    case 'REVIEW':
      return { label: 'Human review', tone: 'pending', category: 'in_progress', action: null };
    case 'APPROVED':
      return {
        label: 'Approved · not reimbursed',
        tone: 'live',
        category: 'decided',
        action: null,
      };
    case 'SETTLEMENT_PENDING':
      return {
        label: 'Intent prepared',
        tone: 'pending',
        category: 'decided',
        action: null,
      };
    case 'SETTLEMENT_FAILED':
      return { label: 'Settlement failed', tone: 'error', category: 'decided', action: null };
    case 'PAID':
      return currentPaymentReceipt(row.status, row.paymentFinality, row.confirmedSettlementReceipt)
        ? { label: 'Payment confirmed', tone: 'ok', category: 'closed', action: null }
        : { label: 'Payment unconfirmed', tone: 'warn', category: 'decided', action: null };
    case 'DENIED':
      return { label: 'Denied', tone: 'error', category: 'closed', action: null };
    default:
      return { label: row.status, tone: 'neutral', category: 'in_progress', action: null };
  }
}

export type DossierFacts = {
  role: string | undefined;
  status: string;
  unansweredRequests: number;
  responsesAwaitingReview: number;
  reviewBlocker: string | null | undefined;
  approvalReady: boolean;
  examinerPending: boolean;
  fixtureBlocked: boolean;
  receipt: string | null | undefined;
  paymentFinality?: PaymentFinality;
  canPrepare: boolean;
};

export type NextAction = { title: string; detail: string; tone: Tone; anchor?: string };

/** The single most important next step for the current session on this claim. */
export function dossierNextAction(f: DossierFacts): NextAction {
  const reviewer = f.role === 'reviewer' || f.role === 'authority';
  const open = OPEN.includes(f.status);

  if (!f.fixtureBlocked && (f.paymentFinality === 'reorged' || f.paymentFinality === 'unverified'))
    return {
      title: f.paymentFinality === 'reorged' ? 'Payment reorged' : 'Payment unconfirmed',
      detail: 'Await canonical reconciliation before treating this claim as paid.',
      tone: 'warn',
    };
  if (f.status === 'PAID')
    return currentPaymentReceipt(f.status, f.paymentFinality, f.receipt, f.fixtureBlocked)
      ? {
          title: 'Payment confirmed',
          detail: 'A matching Arc Testnet settlement receipt is reconciled.',
          tone: 'ok',
        }
      : {
          title: 'Payment unconfirmed',
          detail: 'No verified settlement receipt is recorded. Do not treat this claim as paid.',
          tone: 'warn',
        };
  if (f.status === 'DENIED')
    return {
      title: 'Coverage denied',
      detail: 'A human reviewer recorded a not-covered determination.',
      tone: 'error',
    };
  if (f.status === 'SETTLEMENT_PENDING')
    return {
      title: 'Intent prepared',
      detail: 'Payment needs separate execution and a reconciled receipt.',
      tone: 'pending',
    };
  if (f.status === 'SETTLEMENT_FAILED')
    return {
      title: 'Settlement failed',
      detail: 'The settlement authority must investigate before another attempt. Nothing was paid.',
      tone: 'error',
    };
  if (f.status === 'APPROVED')
    return f.fixtureBlocked
      ? {
          title: 'Approved · not reimbursed',
          detail:
            'A human approved coverage. This is a synthetic fixture, so settlement is blocked and no funds will move.',
          tone: 'live',
        }
      : f.role === 'authority' && f.canPrepare
        ? {
            title: 'Ready for settlement preparation',
            detail:
              'Preparation does not pay. Execution and a reconciled receipt are separate steps.',
            tone: 'live',
            anchor: 'claim-review-actions',
          }
        : {
            title: 'Approved · awaiting settlement authority',
            detail: 'Approval is not payment. No settlement receipt is recorded.',
            tone: 'live',
          };

  if (!open)
    return {
      title: 'Claim closed to changes',
      detail: 'The record remains available for review.',
      tone: 'neutral',
    };

  if (reviewer) {
    if (f.responsesAwaitingReview > 0)
      return {
        title: 'Review the claimant response',
        detail:
          'A response is linked to an open evidence request. Read it, then resolve the request with a rationale.',
        tone: 'warn',
        anchor: 'outstanding-requests',
      };
    if (f.unansweredRequests > 0)
      return {
        title: 'Waiting for claimant evidence',
        detail: `${f.unansweredRequests} evidence ${f.unansweredRequests === 1 ? 'request is' : 'requests are'} open with no linked response yet.`,
        tone: 'pending',
        anchor: 'outstanding-requests',
      };
    if (f.approvalReady)
      return {
        title: 'Ready for your decision',
        detail:
          'Current verification supports review. Confirm applicability and exclusions, then record a determination.',
        tone: 'live',
        anchor: 'claim-review-actions',
      };
    if (f.reviewBlocker)
      return {
        title: 'Decision blocked',
        detail: reviewBlockerMessage(f.reviewBlocker),
        tone: 'warn',
        anchor: 'claim-review-actions',
      };
    return {
      title: 'Investigation in progress',
      detail: 'Request proof, run verification or ask for an examiner assessment.',
      tone: 'pending',
    };
  }

  if (f.unansweredRequests > 0)
    return {
      title:
        f.unansweredRequests === 1
          ? 'Respond to an evidence request'
          : `Respond to ${f.unansweredRequests} evidence requests`,
      detail:
        'A reviewer needs more proof. Attach it to the request so it is linked in the record.',
      tone: 'warn',
      anchor: 'outstanding-requests',
    };
  if (f.examinerPending)
    return {
      title: 'Examiner assessment running',
      detail: 'Advisory findings will appear in the timeline. Human review can continue.',
      tone: 'pending',
    };
  if (f.responsesAwaitingReview > 0)
    return {
      title: 'Your response is with a reviewer',
      detail: 'No action is needed from you right now.',
      tone: 'pending',
    };
  return {
    title: 'Under review',
    detail: 'No action is needed from you. You can add more proof at any time.',
    tone: 'pending',
  };
}

export function freshnessLabel(v: ClaimVerificationFreshness | undefined, nowMs: number) {
  if (!v || v.state === 'none') return { label: 'Not verified', tone: 'neutral' as Tone };
  if (v.state === 'failed') return { label: 'Verification failed', tone: 'error' as Tone };
  if (v.state === 'stale') return { label: 'Verification stale', tone: 'warn' as Tone };
  if (v.validUntilMs !== null) {
    const left = v.validUntilMs - nowMs;
    if (left <= 0) return { label: 'Verification expired', tone: 'warn' as Tone };
    const minutes = Math.ceil(left / 60_000);
    return {
      label:
        minutes < 120
          ? `Verified · ${minutes} min left`
          : `Verified · ${Math.round(minutes / 60)} h left`,
      tone: 'ok' as Tone,
    };
  }
  return { label: 'Verified · current', tone: 'ok' as Tone };
}
