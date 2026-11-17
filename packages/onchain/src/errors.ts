export class OnchainError extends Error {
  readonly code:
    | 'TX_REVERTED'
    | 'TX_TIMEOUT'
    | 'TX_REJECTED'
    | 'NOT_DEPLOYED'
    | 'RECONCILE_MISMATCH'
    | 'VALIDATION';

  constructor(
    code:
      | 'TX_REVERTED'
      | 'TX_TIMEOUT'
      | 'TX_REJECTED'
      | 'NOT_DEPLOYED'
      | 'RECONCILE_MISMATCH'
      | 'VALIDATION',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'OnchainError';
    this.code = code;
  }
}
