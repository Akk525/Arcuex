export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(entity: string, from: string, to: string) {
    super(
      'INVALID_TRANSITION',
      `Invalid ${entity} transition: ${from} -> ${to}`,
    );
    this.name = 'InvalidTransitionError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION', message);
    this.name = 'ValidationError';
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message: string) {
    super('IDEMPOTENCY_CONFLICT', message);
    this.name = 'IdempotencyConflictError';
  }
}

export class FundingConditionError extends DomainError {
  constructor(message: string) {
    super('FUNDING_CONDITION', message);
    this.name = 'FundingConditionError';
  }
}

export class QuoteExpiredError extends DomainError {
  constructor(quoteId: string) {
    super('QUOTE_EXPIRED', `Quote ${quoteId} has expired`);
    this.name = 'QuoteExpiredError';
  }
}
