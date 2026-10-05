/**
 * Calculation status vs data completeness vs warnings.
 * Missing numeric/cost → 0 + warning. Missing descriptive → Not Set + warning.
 * Do not invent rates or prices. Do not treat missing values as PENDING.
 */

export const DESCRIPTIVE_NOT_SET = 'Not Set';
export const DESCRIPTIVE_NOT_AVAILABLE = 'Not Available';

export const CALCULATION_STATUS = {
  CALCULATED: 'CALCULATED',
  BLOCKED: 'BLOCKED',
} as const;

export const DATA_COMPLETENESS = {
  COMPLETE: 'COMPLETE',
  WARNINGS: 'WARNINGS',
} as const;

export type CalculationStatus = (typeof CALCULATION_STATUS)[keyof typeof CALCULATION_STATUS];
export type DataCompleteness = (typeof DATA_COMPLETENESS)[keyof typeof DATA_COMPLETENESS];

export type CalculationWarning = {
  code: string;
  field?: string;
  message: string;
  treatedAs?: '0' | typeof DESCRIPTIVE_NOT_SET | typeof DESCRIPTIVE_NOT_AVAILABLE;
};

export type CalculationOutcome = {
  calculationStatus: CalculationStatus;
  dataCompleteness: DataCompleteness;
  presentationLabel: string;
  information: string | null;
  warnings: CalculationWarning[];
  missingNumericCount: number;
};

export const CUSTOMER_COSTING_READY = 'READY';
export const CUSTOMER_COSTING_CALCULATED_WITH_WARNINGS = 'CALCULATED WITH WARNINGS';
export const CUSTOMER_COSTING_NOT_AVAILABLE = 'NOT AVAILABLE';

export const CALCULATION_COMPLETED_AVAILABLE_DATA =
  'Calculation completed using available data.';

export function missingNumericAsZero(
  value: number | string | null | undefined,
  warning: Omit<CalculationWarning, 'treatedAs'>
): { value: number; warning: CalculationWarning | null } {
  if (value == null || value === '') {
    return { value: 0, warning: { ...warning, treatedAs: '0' } };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { value: 0, warning: { ...warning, treatedAs: '0' } };
  }
  return { value: n, warning: null };
}

export function missingDescriptiveAsNotSet(
  value: string | null | undefined,
  warning: Omit<CalculationWarning, 'treatedAs'>
): { value: string; warning: CalculationWarning | null } {
  const text = String(value ?? '').trim();
  if (!text) {
    return { value: DESCRIPTIVE_NOT_SET, warning: { ...warning, treatedAs: DESCRIPTIVE_NOT_SET } };
  }
  return { value: text, warning: null };
}

export function shippingChargesUnavailableInformation(missingNumericCount: number): string {
  const n = Math.max(0, missingNumericCount);
  const charges =
    n === 1 ? '1 charge value was not available and was treated as 0.' : `${n} charge values were not available and were treated as 0.`;
  return `${CALCULATION_COMPLETED_AVAILABLE_DATA} ${charges}`;
}

export function finalizeCalculatedOutcome(warnings: CalculationWarning[]): CalculationOutcome {
  const missingNumericCount = warnings.filter((row) => row.treatedAs === '0').length;
  const dataCompleteness = warnings.length ? DATA_COMPLETENESS.WARNINGS : DATA_COMPLETENESS.COMPLETE;
  return {
    calculationStatus: CALCULATION_STATUS.CALCULATED,
    dataCompleteness,
    presentationLabel:
      dataCompleteness === DATA_COMPLETENESS.COMPLETE ? 'CALCULATED' : 'CALCULATED WITH WARNINGS',
    information: missingNumericCount > 0 ? shippingChargesUnavailableInformation(missingNumericCount) : warnings.length ? CALCULATION_COMPLETED_AVAILABLE_DATA : null,
    warnings,
    missingNumericCount,
  };
}

export function blockedOutcome(warnings: CalculationWarning[]): CalculationOutcome {
  return {
    calculationStatus: CALCULATION_STATUS.BLOCKED,
    dataCompleteness: DATA_COMPLETENESS.WARNINGS,
    presentationLabel: 'BLOCKED',
    information: warnings[0]?.message ?? 'Calculation cannot proceed because a required structural input is missing.',
    warnings,
    missingNumericCount: 0,
  };
}

export function presentCustomerCostingStatus(input: {
  calculated: boolean;
  hasWarnings?: boolean;
  structurallyBlocked?: boolean;
}): string {
  if (input.calculated) {
    return input.hasWarnings ? CUSTOMER_COSTING_CALCULATED_WITH_WARNINGS : CUSTOMER_COSTING_READY;
  }
  void input.structurallyBlocked;
  return CUSTOMER_COSTING_NOT_AVAILABLE;
}

export function presentCustomerCostingFromLine(input: {
  costingCalculationId?: unknown;
  costingCalculated?: unknown;
  costingReadinessStatus?: unknown;
  importedEngineeringReady?: boolean;
  v2CurrentSnapshotId?: unknown;
}): { calculated: boolean; status: string } {
  void input.v2CurrentSnapshotId;
  const readiness = String(input.costingReadinessStatus || '');
  const structuralIssue = readiness === 'DATA_ISSUE';
  const calculated = Boolean(
    input.costingCalculationId ||
      input.costingCalculated ||
      readiness === 'READY_FOR_COSTING' ||
      readiness === 'CALCULATED_WITH_WARNINGS' ||
      readiness === 'COSTING_READY' ||
      (input.importedEngineeringReady === true && readiness !== 'DATA_ISSUE')
  );
  return {
    calculated,
    status: presentCustomerCostingStatus({
      calculated,
      hasWarnings: readiness === 'CALCULATED_WITH_WARNINGS',
      structurallyBlocked: readiness === 'NOT_READY' || structuralIssue || readiness === 'UNDER_REVIEW',
    }),
  };
}

/** Named freight/handling charges: missing numeric → 0 + warning; available amounts still add. */
export function presentNamedShippingCharges(input: {
  ocean?: number | string | null;
  handling?: number | string | null;
  otherAvailable?: number | string | null;
}): CalculationOutcome & {
  ocean: number;
  handling: number;
  availableCharges: number;
  total: number;
} {
  const ocean = missingNumericAsZero(input.ocean, {
    code: 'OCEAN_FREIGHT_NOT_AVAILABLE',
    field: 'ocean',
    message: 'Ocean freight was not available.',
  });
  const handling = missingNumericAsZero(input.handling, {
    code: 'HANDLING_NOT_AVAILABLE',
    field: 'handling',
    message: 'Handling was not available.',
  });
  const otherProvided = input.otherAvailable != null && input.otherAvailable !== '';
  const other = otherProvided
    ? missingNumericAsZero(input.otherAvailable, {
        code: 'SHIPPING_CHARGE_NOT_AVAILABLE',
        field: 'otherAvailable',
        message: 'A shipping charge was not available.',
      })
    : { value: 0, warning: null };
  const warnings = [ocean.warning, handling.warning, other.warning].filter(Boolean) as CalculationWarning[];
  const availableCharges = other.value;
  const total = ocean.value + handling.value + availableCharges;
  return {
    ...finalizeCalculatedOutcome(warnings),
    ocean: ocean.value,
    handling: handling.value,
    availableCharges,
    total,
  };
}

export function optionalCostComponentAsZero(
  configuredAmount: number | string | null | undefined,
  warning: Omit<CalculationWarning, 'treatedAs'>
): { value: number; warning: CalculationWarning | null } {
  return missingNumericAsZero(configuredAmount, warning);
}

export function customerCostingStatusIsInternalLeak(label: string): boolean {
  const text = label.toUpperCase();
  return (
    text.includes('MATERIAL') ||
    text.includes('BOM') ||
    text.includes('GATE') ||
    text.includes('PRICE_NOT') ||
    text.includes('COSTINGRUN') ||
    text.includes('PENDING') ||
    text.includes('DECISION 5') ||
    text.includes('MARKUP') ||
    text.includes('MARGIN')
  );
}
