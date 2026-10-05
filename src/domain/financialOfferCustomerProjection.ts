/**
 * DF-F2 customer-safe Financial Offer + Container Study visibility.
 * Pure mapping from already-persisted B4-D / B4-C facts. No FX, live rates, or costing.
 */

import {
  SHIPPING_CHARGES_NOT_AVAILABLE,
  VIP_SHIPMENT_NOT_CONFIGURED,
  type FinancialOfferWarning,
} from './financialOfferSnapshotAggregation';
import {
  CALCULATION_STATUS,
  DATA_COMPLETENESS,
  DESCRIPTIVE_NOT_SET,
  finalizeCalculatedOutcome,
  missingDescriptiveAsNotSet,
  missingNumericAsZero,
  type CalculationStatus,
  type DataCompleteness,
} from './calculationCompleteness';
import { aggregateResultContainerQuantities } from './shipmentCostSnapshotQuantities';
import { containerStudyRequiredForCosting } from './costingContainerStudyPin';

export const CUSTOMER_VIP_SHIPPING_NOTICE =
  'Shipping is not configured. Shipping total is 0. This is not free shipping.';

export const CUSTOMER_SHIPPING_CHARGES_ZERO_NOTICE =
  'Calculation completed using available data. Charge values that were not available were treated as 0.';

/** Presentation labels for customer/inquiry Container Study visibility. */
export const CS_PRESENTATION = {
  SHIPMENT_CONFIGURATION_REQUIRED: 'SHIPMENT_CONFIGURATION_REQUIRED',
  READY_TO_CALCULATE: 'READY_TO_CALCULATE',
  CALCULATED: 'CALCULATED',
  CALCULATED_WITH_WARNINGS: 'CALCULATED WITH WARNINGS',
  BLOCKED: 'BLOCKED',
} as const;

export const CS_CONTAINER_SELECTION_REQUIRED_MESSAGE =
  'Select/confirm a container configuration to calculate shipment.';

export const CS_REQUIRED_TITLE = 'Container Study Required';

export const CS_NO_SHIPMENT_REQUIRED_MESSAGE = 'No shipment calculation required.';

export const CS_READY_TO_CALCULATE_MESSAGE =
  'Container configuration is ready. Run Container Study to calculate physical shipment.';

/** Shipment requirement (not VIP/Standard alone) controls whether CS may be skipped. */
export function shipmentCalculationRequiredFromEvidence(input: {
  processCode?: string | null;
  shipmentGroupCount: number;
  containerStudyCount?: number;
}): boolean {
  return containerStudyRequiredForCosting({
    hasInquiry: true,
    processCode: input.processCode || 'STANDARD_WORKFLOW',
    logisticsScenarioActive: input.shipmentGroupCount > 0 || (input.containerStudyCount ?? 0) > 0,
  });
}

export function resolveContainerStudyOptional(shipmentCalculationRequired: boolean): boolean {
  return !shipmentCalculationRequired;
}

const SECRET_TOKENS = [
  'materialCost',
  'manufacturingCost',
  'manufacturing',
  'sellingExpense',
  'financeCost',
  'materialMargin',
  'costingRunId',
  'CostingRun',
  'CostingMetalCostComponent',
  'Decision 5',
  'decision5',
  'shippingCostRateId',
  'algorithmVersion',
  'packingProfile',
  'gAndA',
  'G&A',
] as const;

export type CustomerOfferCableLine = {
  cable: string;
  cuttingLength: string;
  drum: string;
  quantity: string;
  unitPrice: string;
  total: string;
};

export type CustomerOfferShippingLine = {
  destination: string;
  incoterm: string;
  containerType: string;
  quantity: number;
  rate: string;
  total: string;
};

export type CustomerFinancialOfferProjection = {
  id: string;
  inquiryId: string;
  versionNo: number;
  currency: string;
  cablePricing: CustomerOfferCableLine[];
  shipping: CustomerOfferShippingLine[];
  productsTotal: string;
  shippingTotal: string;
  inquiryTotal: string;
  shippingNotConfigured: boolean;
  shippingNotice: string | null;
};

export type CustomerOfferSourceProductLine = {
  inquiryLineId: string;
  description: string;
  lengthMeters: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

export type CustomerOfferSourceTypeLine = {
  containerTypeCode: string;
  containerQuantity: number;
  rateAmount: string;
  lineTotal: string;
};

export type CustomerOfferSourceShipmentLine = {
  destinationPortCode: string;
  incotermCode: string;
  groupTotal: string;
  shipmentCostSnapshotId: string | null;
  typeLines: CustomerOfferSourceTypeLine[];
};

export type CustomerOfferSource = {
  id: string;
  inquiryId: string;
  versionNo: number;
  currencyCode: string;
  productsTotal: string;
  shipmentTotal: string;
  inquiryTotal: string;
  warnings: FinancialOfferWarning[];
  productLines: CustomerOfferSourceProductLine[];
  shipmentLines: CustomerOfferSourceShipmentLine[];
};

export type CustomerContainerStudyGroupView = {
  shipmentGroupId: string;
  governedStatus: string;
  destination: string | null;
  incoterm: string | null;
  containers: Array<{
    containerType: string;
    quantity: number;
    rate: string | null;
    total: string | null;
  }>;
  shipmentTotal: string | null;
  currency: string | null;
  hasPersistedShipmentSnapshot: boolean;
  calculationStatus: CalculationStatus;
  dataCompleteness: DataCompleteness;
  presentationLabel: string;
  information: string | null;
  liveRatesShown: boolean;
  missingChargeCount: number;
};

export type CustomerContainerStudyVisibility = {
  inquiryId: string;
  processCode: string | null;
  /** True only when the inquiry has no shipment/logistics scenario — never merely because process is VIP. */
  containerStudyOptional: boolean;
  shipmentCalculationRequired: boolean;
  groups: CustomerContainerStudyGroupView[];
};

export function projectCustomerFinancialOffer(
  source: CustomerOfferSource,
  drumsByInquiryLineId: Record<string, string> = {}
): CustomerFinancialOfferProjection {
  const shippingNotConfigured = source.warnings.some(
    (row) => row.code === VIP_SHIPMENT_NOT_CONFIGURED || row.code === SHIPPING_CHARGES_NOT_AVAILABLE
  );
  const shipping: CustomerOfferShippingLine[] = [];
  for (const line of source.shipmentLines) {
    if (line.typeLines.length === 0) {
      shipping.push({
        destination: line.destinationPortCode,
        incoterm: line.incotermCode,
        containerType: '',
        quantity: 0,
        rate: '0',
        total: line.groupTotal,
      });
      continue;
    }
    for (const typeLine of line.typeLines) {
      shipping.push({
        destination: line.destinationPortCode,
        incoterm: line.incotermCode,
        containerType: typeLine.containerTypeCode,
        quantity: typeLine.containerQuantity,
        rate: typeLine.rateAmount,
        total: typeLine.lineTotal,
      });
    }
  }
  return {
    id: source.id,
    inquiryId: source.inquiryId,
    versionNo: source.versionNo,
    currency: source.currencyCode,
    cablePricing: source.productLines.map((line) => ({
      cable: line.description,
      cuttingLength: line.lengthMeters,
      drum: drumsByInquiryLineId[line.inquiryLineId] || '',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.lineTotal,
    })),
    shipping,
    productsTotal: source.productsTotal,
    shippingTotal: source.shipmentTotal,
    inquiryTotal: source.inquiryTotal,
    shippingNotConfigured,
    shippingNotice: shippingNotConfigured
      ? source.warnings.some((row) => row.code === VIP_SHIPMENT_NOT_CONFIGURED)
        ? CUSTOMER_VIP_SHIPPING_NOTICE
        : CUSTOMER_SHIPPING_CHARGES_ZERO_NOTICE
      : null,
  };
}

export type CustomerContainerStudyGroupSource = {
  shipmentGroupId: string;
  groupStatus: string;
  studyStatus: string | null;
  destinationPortCode?: string | null;
  incotermCode?: string | null;
  /** Inquiry / offer currency used when no shipment-cost snapshot pins one. */
  currencyCode?: string | null;
  packingContainers: Array<{ typeCode?: string | null }>;
  missingPhysicalPackingInputs?: string[];
  snapshot: {
    destinationPortCode: string;
    incotermCode: string;
    totalAmount: string;
    currencyCode: string;
    lines: Array<{
      containerTypeCode: string;
      containerQuantity: number;
      rateAmount: string;
      lineTotal: string;
    }>;
  } | null;
};

/**
 * Rate/total are financial facts from a ShipmentCostSnapshot only.
 * Missing charges must not render as fabricated "0 / 0".
 */
export function formatCustomerContainerChargePair(row: {
  rate: string | null;
  total: string | null;
  currency?: string | null;
}): string | null {
  if (row.rate == null && row.total == null) return null;
  const currency = String(row.currency || '').trim();
  const suffix = currency ? ` ${currency}` : '';
  return `${row.rate ?? '—'} / ${row.total ?? '—'}${suffix}`;
}

export function formatCustomerShipmentTotalPresentation(group: {
  shipmentTotal: string | null;
  currency: string | null;
  missingChargeCount: number;
}): { amountLine: string | null; reason: string | null } {
  if (group.shipmentTotal == null) return { amountLine: null, reason: null };
  const currency = String(group.currency || '').trim();
  const suffix = currency ? ` ${currency}` : '';
  return {
    amountLine: `Shipment total ${group.shipmentTotal}${suffix}`,
    reason:
      group.missingChargeCount > 0
        ? 'Shipping rate not configured; charge treated as 0.'
        : null,
  };
}

function displayChargeOrNull(
  resolved: { value: number; warning: { treatedAs?: string } | null }
): string | null {
  // Missing/unavailable numeric → null for UI (warning already recorded). Authored 0 stays "0".
  if (resolved.warning?.treatedAs === '0') return null;
  return String(resolved.value);
}

export function describeMissingPhysicalPackingInputs(input: {
  hasConfirmedDrum: boolean;
  hasCuttingLength: boolean;
  hasQuantity: boolean;
  hasContainerType: boolean;
  hasDestination: boolean;
}): string[] {
  const missing: string[] = [];
  if (!input.hasConfirmedDrum) missing.push('confirmed drum plan');
  if (!input.hasCuttingLength) missing.push('cutting length');
  if (!input.hasQuantity) missing.push('quantity');
  if (!input.hasContainerType) missing.push('container type');
  if (!input.hasDestination) missing.push('destination');
  return missing;
}

export function packingMissingInputsMessage(missing: string[]): string {
  if (!missing.length) {
    return 'Packing has not been calculated yet.';
  }
  return `Packing cannot calculate until these physical inputs are present: ${missing.join(', ')}. Missing freight rates are 0 with a warning, not a packing blocker.`;
}

function baseGroupShell(input: CustomerContainerStudyGroupSource, dest: string, incoterm: string) {
  return {
    shipmentGroupId: input.shipmentGroupId,
    governedStatus: governedContainerStudyStatus({
      groupStatus: input.groupStatus,
      studyStatus: input.studyStatus,
      hasPersistedShipmentSnapshot: Boolean(input.snapshot),
    }),
    destination: dest,
    incoterm,
    liveRatesShown: false as const,
  };
}

export function projectCustomerContainerStudyGroup(input: CustomerContainerStudyGroupSource): CustomerContainerStudyGroupView {
  const dest = missingDescriptiveAsNotSet(input.snapshot?.destinationPortCode || input.destinationPortCode, {
    code: 'DESTINATION_NOT_SET',
    field: 'destination',
    message: 'Destination was not set.',
  });
  const incoterm = missingDescriptiveAsNotSet(input.snapshot?.incotermCode || input.incotermCode, {
    code: 'INCOTERM_NOT_SET',
    field: 'incoterm',
    message: 'Incoterm was not set.',
  });
  const warnings = [dest.warning, incoterm.warning].filter(Boolean) as NonNullable<typeof dest.warning>[];
  const missing = input.missingPhysicalPackingInputs || [];
  const missingContainer = missing.includes('container type');

  if (input.snapshot) {
    const containers = input.snapshot.lines.map((line) => {
      const rate = missingNumericAsZero(line.rateAmount, {
        code: 'SHIPPING_CHARGE_NOT_AVAILABLE',
        field: 'rate',
        message: 'Shipping charge was not available.',
      });
      const total = missingNumericAsZero(line.lineTotal, {
        code: 'SHIPPING_CHARGE_NOT_AVAILABLE',
        field: 'total',
        message: 'Shipping charge was not available.',
      });
      if (rate.warning) warnings.push(rate.warning);
      if (total.warning) warnings.push(total.warning);
      return {
        containerType: line.containerTypeCode || DESCRIPTIVE_NOT_SET,
        quantity: line.containerQuantity,
        rate: displayChargeOrNull(rate),
        total: displayChargeOrNull(total),
      };
    });
    const outcome = finalizeCalculatedOutcome(warnings);
    return {
      ...baseGroupShell(input, dest.value, incoterm.value),
      containers,
      shipmentTotal: input.snapshot.totalAmount,
      currency: input.snapshot.currencyCode || String(input.currencyCode || '').trim() || null,
      hasPersistedShipmentSnapshot: true,
      calculationStatus: outcome.calculationStatus,
      dataCompleteness: outcome.dataCompleteness,
      presentationLabel: outcome.presentationLabel,
      information: outcome.information,
      missingChargeCount: outcome.missingNumericCount,
    };
  }

  const aggregated = aggregateResultContainerQuantities(input.packingContainers);
  if (aggregated.ok) {
    const containers = aggregated.lines.map((line) => {
      const rate = missingNumericAsZero(null, {
        code: 'SHIPPING_CHARGE_NOT_AVAILABLE',
        field: 'rate',
        message: 'Shipping charge was not available.',
      });
      warnings.push(rate.warning!);
      return {
        containerType: line.containerTypeCode,
        quantity: line.containerQuantity,
        rate: null as string | null,
        total: null as string | null,
      };
    });
    const outcome = finalizeCalculatedOutcome(warnings);
    const currency = String(input.currencyCode || '').trim() || null;
    return {
      ...baseGroupShell(input, dest.value, incoterm.value),
      containers,
      shipmentTotal: '0',
      currency,
      hasPersistedShipmentSnapshot: false,
      calculationStatus: outcome.calculationStatus,
      dataCompleteness: outcome.dataCompleteness,
      presentationLabel: outcome.presentationLabel,
      information: outcome.information,
      missingChargeCount: outcome.missingNumericCount,
    };
  }

  // No physical packing result yet — never invent containers, 0/0, or success Shipment total 0.
  if (missingContainer) {
    return {
      ...baseGroupShell(input, dest.value, incoterm.value),
      containers: [],
      shipmentTotal: null,
      currency: String(input.currencyCode || '').trim() || null,
      hasPersistedShipmentSnapshot: false,
      calculationStatus: CALCULATION_STATUS.BLOCKED,
      dataCompleteness: DATA_COMPLETENESS.WARNINGS,
      presentationLabel: CS_PRESENTATION.SHIPMENT_CONFIGURATION_REQUIRED,
      information: CS_CONTAINER_SELECTION_REQUIRED_MESSAGE,
      missingChargeCount: 0,
    };
  }

  if (missing.length === 0) {
    return {
      ...baseGroupShell(input, dest.value, incoterm.value),
      containers: [],
      shipmentTotal: null,
      currency: String(input.currencyCode || '').trim() || null,
      hasPersistedShipmentSnapshot: false,
      calculationStatus: CALCULATION_STATUS.BLOCKED,
      dataCompleteness: DATA_COMPLETENESS.WARNINGS,
      presentationLabel: CS_PRESENTATION.READY_TO_CALCULATE,
      information: CS_READY_TO_CALCULATE_MESSAGE,
      missingChargeCount: 0,
    };
  }

  return {
    ...baseGroupShell(input, dest.value, incoterm.value),
    containers: [],
    shipmentTotal: null,
    currency: String(input.currencyCode || '').trim() || null,
    hasPersistedShipmentSnapshot: false,
    calculationStatus: CALCULATION_STATUS.BLOCKED,
    dataCompleteness: DATA_COMPLETENESS.WARNINGS,
    presentationLabel: CS_PRESENTATION.BLOCKED,
    information: packingMissingInputsMessage(missing),
    missingChargeCount: 0,
  };
}

/** Context-sensitive banner for customer Container Study status (section 17). */
export function customerContainerStudyContextBanner(input: {
  shipmentCalculationRequired: boolean;
  groups: CustomerContainerStudyGroupView[];
}): { title: string; message: string } | null {
  if (!input.shipmentCalculationRequired) {
    return {
      title: CS_NO_SHIPMENT_REQUIRED_MESSAGE,
      message: 'Container Study may be skipped when this inquiry has no shipment calculation path.',
    };
  }
  const needsContainer = input.groups.some(
    (group) => group.presentationLabel === CS_PRESENTATION.SHIPMENT_CONFIGURATION_REQUIRED
  );
  if (needsContainer || input.groups.length === 0) {
    return {
      title: CS_REQUIRED_TITLE,
      message: CS_CONTAINER_SELECTION_REQUIRED_MESSAGE,
    };
  }
  return null;
}

export function projectCustomerContainerStudyVisibility(input: {
  inquiryId: string;
  processCode: string | null | undefined;
  shipmentCalculationRequired?: boolean;
  shipmentGroupCount?: number;
  containerStudyCount?: number;
  groups: CustomerContainerStudyGroupView[];
}): CustomerContainerStudyVisibility {
  const shipmentCalculationRequired =
    input.shipmentCalculationRequired ??
    shipmentCalculationRequiredFromEvidence({
      processCode: input.processCode,
      shipmentGroupCount: input.shipmentGroupCount ?? input.groups.length,
      containerStudyCount: input.containerStudyCount,
    });
  return {
    inquiryId: input.inquiryId,
    processCode: input.processCode ?? null,
    containerStudyOptional: resolveContainerStudyOptional(shipmentCalculationRequired),
    shipmentCalculationRequired,
    groups: input.groups,
  };
}

export function governedContainerStudyStatus(input: {
  groupStatus: string;
  studyStatus: string | null;
  hasPersistedShipmentSnapshot: boolean;
}): string {
  if (input.groupStatus === 'SUPERSEDED') return 'SUPERSEDED';
  if (!input.studyStatus) return input.hasPersistedShipmentSnapshot ? 'SHIPMENT_SNAPSHOT' : 'NOT_STARTED';
  if (input.studyStatus === 'CONFIRMED' && input.hasPersistedShipmentSnapshot) return 'CONFIRMED';
  if (input.studyStatus === 'CONFIRMED') return 'CONFIRMED';
  if (input.studyStatus === 'SUPERSEDED' && input.hasPersistedShipmentSnapshot) return 'CONFIRMED';
  return input.studyStatus;
}

export function customerProjectionContainsInternalSecrets(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  return SECRET_TOKENS.filter((token) => text.includes(token));
}
