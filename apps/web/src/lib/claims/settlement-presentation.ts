export function hasArcReceiptHash(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/.test(value);
}

export function displayClaimStatus(status: string, confirmedReceipt?: string | null) {
  return status === 'PAID' && !hasArcReceiptHash(confirmedReceipt) ? 'Payment unconfirmed' : status;
}

export function settlementPresentation({
  status,
  blocked,
  confirmedReceipt,
  canPrepare,
}: {
  status: string;
  blocked: boolean;
  confirmedReceipt?: string | null;
  canPrepare: boolean;
}) {
  if (status === 'DENIED')
    return { label: 'No settlement', action: 'Review the decision and its recorded reason.' };
  if (blocked)
    return {
      label: 'Settlement blocked',
      action:
        'Synthetic fixture restrictions apply. No settlement action is available for this case.',
    };
  switch (status) {
    case 'PAID':
      return hasArcReceiptHash(confirmedReceipt)
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
        label: 'Awaiting settlement authorization',
        action: canPrepare
          ? 'A settlement authority can request preparation. Payment requires separate execution and receipt confirmation.'
          : 'The settlement authority must review preparation eligibility. No payment is confirmed.',
      };
    case 'SETTLEMENT_PENDING':
      return {
        label: 'Awaiting a verified settlement receipt',
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
  SETTLEMENT_PENDING: 'Settlement prepared',
  SETTLEMENT_FAILED: 'Settlement failed',
  PAID: 'Payment confirmed',
};

export function claimStatusLabel(status: string, confirmedReceipt?: string | null) {
  const verifiedStatus = displayClaimStatus(status, confirmedReceipt);
  return Object.hasOwn(claimStatusLabels, verifiedStatus)
    ? (claimStatusLabels[verifiedStatus] ?? verifiedStatus)
    : verifiedStatus;
}
