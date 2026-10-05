import { issue } from '../platform/errors/domainError';

/**
 * Fail-closed stuffing guard. Rolling is implemented by LEGACY_FIRST_FIT_V1.
 * This helper must not claim that the calculation engine is unimplemented.
 */
export function refuseContainerStudyCalculation(stuffingMethod: string): void {
  if (stuffingMethod === 'Rolling') return;
  throw issue(
    'BUSINESS_RULE_REQUIRED',
    `STUFFING_METHOD_NOT_IMPLEMENTED: ${
      stuffingMethod === 'Forklifting'
        ? 'Forklifting placement engine is BLOCKED.'
        : `stuffing method ${stuffingMethod} is not supported. Only Rolling is implemented.`
    }`,
    { stuffingMethod, code: 'STUFFING_METHOD_NOT_IMPLEMENTED' }
  );
}
