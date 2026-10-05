/** Controlled domain outcomes. Never use silent numeric fallbacks (e.g. price 0). */

export type DomainIssueCode =
  | 'DATA_REQUIRED'
  | 'BUSINESS_RULE_REQUIRED'
  | 'CONFIGURATION_REQUIRED'
  | 'PRICE_NOT_CONFIGURED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'EXISTING_CABLE'
  | 'TECHNICALLY_VALID_NOT_MASTER'
  | 'INVALID_CONFIGURATION';

export class DomainError extends Error {
  readonly code: DomainIssueCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainIssueCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function issue(code: DomainIssueCode, message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError(code, message, details);
}
