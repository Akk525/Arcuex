import { hasArcReceiptHash, type PaymentFinality } from './payment-finality';

export { hasArcReceiptHash };

export function displayClaimStatus(
  status: string,
  confirmedReceipt?: string | null,
  paymentFinality?: PaymentFinality,
) {
  if (paymentFinality === 'reorged') return 'Payment reorged';
  if (paymentFinality === 'unverified') return 'Payment unconfirmed';
  return status === 'PAID' &&
    (!hasArcReceiptHash(confirmedReceipt) || paymentFinality === 'not_paid')
    ? 'Payment unconfirmed'
    : status;
}

export function settlementPresentation({
  status,
  blocked,
  confirmedReceipt,
  paymentFinality,
  canPrepare,
}: {
  status: string;
  blocked: boolean;
  confirmedReceipt?: string | null;
  paymentFinality?: PaymentFinality;
  canPrepare: boolean;
}) {
  if (status === 'DENIED')
    return {
      label: 'No settlement',
      action: 'Review the decision and its recorded reason.',
    };
  if (blocked)
    return {
      label: 'Settlement blocked',
      action:
        'Synthetic fixture restrictions apply. No settlement action is available for this case.',
    };
  if (paymentFinality === 'reorged' || paymentFinality === 'unverified')
    return {
      label: paymentFinality === 'reorged' ? 'Payment reorged' : 'Payment unconfirmed',
      action: 'Await canonical reconciliation before displaying a payment receipt.',
    };
  switch (status) {
    case 'PAID':
      return hasArcReceiptHash(confirmedReceipt) && paymentFinality !== 'not_paid'
        ? {
            label: 'Payment confirmed',
            action: 'View the reconciled Arc Testnet settlement receipt.',
          }
        : {
            label: 'Payment unconfirmed',
            action: 'Ask the settlement authority to verify the receipt.',
          };
    case 'APPROVED':
      return {
        label: 'Awaiting settlement preparation',
        action: canPrepare
          ? 'A settlement authority can request preparation. Payment requires separate execution and receipt confirmation.'
          : 'The settlement authority must review preparation eligibility. No payment is confirmed.',
      };
    case 'SETTLEMENT_PENDING':
      return {
        label: 'Intent prepared',
        action:
          'Preparation is recorded. Payment requires separate submission and reconciliation of a matching Arc Testnet receipt.',
      };
    case 'SETTLEMENT_FAILED':
      return {
        label: 'Settlement failed',
        action: canPrepare
          ? 'Review the failure before requesting preparation again.'
          : 'The settlement authority must investigate before another attempt.',
      };
    default:
      return {
        label: 'Settlement unavailable',
        action: 'Complete evidence verification and human review.',
      };
  }
}

const claimStatusLabels: Record<string, string> = {
  SUBMITTED: 'Submitted',
  COLLECTING_EVIDENCE: 'Collecting evidence',
  INVESTIGATING: 'Investigating',
  REVIEW: 'Human review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  SETTLEMENT_PENDING: 'Intent prepared',
  SETTLEMENT_FAILED: 'Settlement failed',
  PAID: 'Payment confirmed',
};

export function claimStatusLabel(
  status: string,
  confirmedReceipt?: string | null,
  paymentFinality?: PaymentFinality,
) {
  const verifiedStatus = displayClaimStatus(status, confirmedReceipt, paymentFinality);
  return Object.hasOwn(claimStatusLabels, verifiedStatus)
    ? (claimStatusLabels[verifiedStatus] ?? verifiedStatus)
    : verifiedStatus;
}
