export function statusTone(
  status: string,
): 'neutral' | 'ok' | 'warn' | 'error' | 'pending' | 'live' {
  switch (status) {
    case 'PAID':
      return 'ok';
    case 'APPROVED':
      // Approval is a decision, not a payment: never the success tone.
      return 'live';
    case 'DENIED':
    case 'SETTLEMENT_FAILED':
      return 'error';
    case 'REVIEW':
      return 'warn';
    case 'SETTLEMENT_PENDING':
    case 'INVESTIGATING':
    case 'COLLECTING_EVIDENCE':
    case 'SUBMITTED':
      return 'pending';
    default:
      return 'neutral';
  }
}
