/**
 * VIP Calculate optional commercial/logistics components (Task 05I-C).
 *
 * Classification:
 *  B — missing optional financial input → value=0 + explicit warning
 *  C — not applicable → value=0, NOT_APPLICABLE, no warning
 *  D — not configured → value=0 + explicit warning
 */

import { readContainerStudyReadiness } from './containerStudyReadiness';

export type VipOptionalComponentCode =
  | 'SHIPPING'
  | 'PREMIUM'
  | 'CLEARANCE'
  | 'SURCHARGE'
  | 'CONTAINER_SHIPMENT';

export type VipOptionalComponentSource = 'CONFIGURED' | 'NOT_CONFIGURED' | 'NOT_APPLICABLE';

export interface VipOptionalComponentResult {
  code: VipOptionalComponentCode;
  label: string;
  value: number;
  currency: string;
  source: VipOptionalComponentSource;
  reasonCode: string;
  warningMessage?: string;
  hasWarning: boolean;
}

export interface VipOptionalComponentsInput {
  commercialMetadata: unknown;
  incoterms?: unknown;
  deliveryDestination?: unknown;
  currency?: string;
}

function metaRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function incotermCode(incoterms: unknown): string {
  return String(incoterms ?? '').trim().toUpperCase();
}

/** Seller-arranged ocean/air freight not in scope for EXW. */
function shippingNotApplicable(incoterm: string): boolean {
  return incoterm === 'EXW';
}

/** Destination customs clearance not in seller scope for these incoterms. */
function clearanceNotApplicable(incoterm: string): boolean {
  return incoterm === 'EXW' || incoterm === 'FOB' || incoterm === 'FCA' || incoterm === 'CFR';
}

function configuredComponent(
  code: VipOptionalComponentCode,
  label: string,
  value: number,
  currency: string
): VipOptionalComponentResult {
  return {
    code,
    label,
    value,
    currency,
    source: 'CONFIGURED',
    reasonCode: 'CONFIGURED',
    hasWarning: false,
  };
}

function notApplicableComponent(
  code: VipOptionalComponentCode,
  label: string,
  currency: string,
  reasonCode: string
): VipOptionalComponentResult {
  return {
    code,
    label,
    value: 0,
    currency,
    source: 'NOT_APPLICABLE',
    reasonCode,
    hasWarning: false,
  };
}

function notConfiguredComponent(
  code: VipOptionalComponentCode,
  label: string,
  currency: string,
  reasonCode: string,
  warningMessage: string
): VipOptionalComponentResult {
  return {
    code,
    label,
    value: 0,
    currency,
    source: 'NOT_CONFIGURED',
    reasonCode,
    warningMessage,
    hasWarning: true,
  };
}

function evaluateShipping(input: VipOptionalComponentsInput, currency: string): VipOptionalComponentResult {
  const incoterm = incotermCode(input.incoterms ?? metaRecord(input.commercialMetadata).incoterms);
  if (shippingNotApplicable(incoterm)) {
    return notApplicableComponent('SHIPPING', 'Shipping', currency, 'SHIPPING_NOT_APPLICABLE');
  }
  const amount = parseAmount(metaRecord(input.commercialMetadata).shippingCost);
  if (amount != null && amount > 0) {
    return configuredComponent('SHIPPING', 'Shipping', amount, currency);
  }
  return notConfiguredComponent(
    'SHIPPING',
    'Shipping',
    currency,
    'SHIPPING_NOT_CONFIGURED',
    'Shipping cost is not configured — treated as 0 for this VIP Calculate draft.'
  );
}

function evaluatePremium(input: VipOptionalComponentsInput, currency: string): VipOptionalComponentResult {
  const meta = metaRecord(input.commercialMetadata);
  if (meta.premiumApplicable === false) {
    return notApplicableComponent('PREMIUM', 'Metal premium', currency, 'PREMIUM_NOT_APPLICABLE');
  }
  const amount = parseAmount(meta.metalPremium ?? meta.copperPremium ?? meta.aluminiumPremium);
  if (amount != null && amount > 0) {
    return configuredComponent('PREMIUM', 'Metal premium', amount, currency);
  }
  return notConfiguredComponent(
    'PREMIUM',
    'Metal premium',
    currency,
    'PREMIUM_NOT_CONFIGURED',
    'Metal premium is not configured — treated as 0 for this VIP Calculate draft.'
  );
}

function evaluateClearance(input: VipOptionalComponentsInput, currency: string): VipOptionalComponentResult {
  const incoterm = incotermCode(input.incoterms ?? metaRecord(input.commercialMetadata).incoterms);
  if (clearanceNotApplicable(incoterm)) {
    return notApplicableComponent('CLEARANCE', 'Clearance', currency, 'CLEARANCE_NOT_APPLICABLE');
  }
  const amount = parseAmount(metaRecord(input.commercialMetadata).clearanceCost);
  if (amount != null && amount > 0) {
    return configuredComponent('CLEARANCE', 'Clearance', amount, currency);
  }
  return notConfiguredComponent(
    'CLEARANCE',
    'Clearance',
    currency,
    'CLEARANCE_NOT_CONFIGURED',
    'Clearance cost is not configured — treated as 0 for this VIP Calculate draft.'
  );
}

function evaluateSurcharge(input: VipOptionalComponentsInput, currency: string): VipOptionalComponentResult {
  const meta = metaRecord(input.commercialMetadata);
  if (meta.surchargesApplicable === false) {
    return notApplicableComponent('SURCHARGE', 'Surcharges', currency, 'SURCHARGE_NOT_APPLICABLE');
  }
  const raw = meta.commercialSurcharges ?? meta.surcharges;
  let total = 0;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const n = parseAmount(
        typeof item === 'object' && item != null ? (item as Record<string, unknown>).amount : item
      );
      if (n != null) total += n;
    }
  } else {
    const single = parseAmount(meta.commercialSurcharge ?? meta.surchargeAmount);
    if (single != null) total = single;
  }
  if (total > 0) {
    return configuredComponent('SURCHARGE', 'Surcharges', total, currency);
  }
  return notConfiguredComponent(
    'SURCHARGE',
    'Surcharges',
    currency,
    'SURCHARGE_NOT_CONFIGURED',
    'Commercial surcharges are not configured — treated as 0 for this VIP Calculate draft.'
  );
}

function evaluateContainerShipment(input: VipOptionalComponentsInput, currency: string): VipOptionalComponentResult {
  const meta = metaRecord(input.commercialMetadata);
  const readiness = readContainerStudyReadiness(input.commercialMetadata);
  const amount = parseAmount(meta.containerShipmentCost ?? meta.containerStudyCost);

  if (readiness === 'CONTAINER_STUDY_READY' && amount != null && amount > 0) {
    return configuredComponent('CONTAINER_SHIPMENT', 'Container shipment', amount, currency);
  }

  if (readiness === 'CONTAINER_STUDY_READY' && amount == null) {
    return notConfiguredComponent(
      'CONTAINER_SHIPMENT',
      'Container shipment',
      currency,
      'CONTAINER_SHIPMENT_NOT_CONFIGURED',
      'Container study is ready but shipment cost is not configured — treated as 0.'
    );
  }

  return notConfiguredComponent(
    'CONTAINER_SHIPMENT',
    'Container shipment',
    currency,
    'CONTAINER_DATA_NOT_CONFIGURED',
    'Container study data is not configured — container shipment cost treated as 0 for this VIP Calculate draft.'
  );
}

export function evaluateVipOptionalComponents(input: VipOptionalComponentsInput): VipOptionalComponentResult[] {
  const currency = String(input.currency || metaRecord(input.commercialMetadata).currency || 'USD');
  return [
    evaluateShipping(input, currency),
    evaluatePremium(input, currency),
    evaluateClearance(input, currency),
    evaluateSurcharge(input, currency),
    evaluateContainerShipment(input, currency),
  ];
}

export function collectVipOptionalWarnings(components: VipOptionalComponentResult[]): string[] {
  return components.filter((c) => c.hasWarning).map((c) => c.warningMessage || c.reasonCode);
}

export interface VipCalculateSnapshot {
  calculatedAt: string;
  optionalComponents: VipOptionalComponentResult[];
  warnings: string[];
}

export function buildVipCalculateSnapshot(
  components: VipOptionalComponentResult[],
  calculatedAt = new Date()
): VipCalculateSnapshot {
  return {
    calculatedAt: calculatedAt.toISOString(),
    optionalComponents: components,
    warnings: collectVipOptionalWarnings(components),
  };
}
