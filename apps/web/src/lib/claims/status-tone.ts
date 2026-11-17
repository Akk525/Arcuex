export function statusTone(
  status: string,
): 'neutral' | 'ok' | 'warn' | 'error' | 'pending' {
  switch (status) {
    case 'PAID':
    case 'APPROVED':
      return 'ok';
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
