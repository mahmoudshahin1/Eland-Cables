import { PriceBasis, PriceWorkflowStatus } from '@prisma/client';
import { canonicalizePriceUom, priceUomsAreCompatible, priceBasisFromPriceUom } from '../domain/priceUom';

export const PRICE_WORKFLOW_STATUSES: PriceWorkflowStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
];

export const ALLOWED_PRICE_BASIS: PriceBasis[] = [
  'PER_KG',
  'PER_TON',
  'PER_METER',
  'PER_PCS',
  'PER_M2',
];

export const ALLOWED_PRICE_CURRENCIES = ['USD', 'EUR', 'EGP', 'LE', 'SAR', 'GBP', 'AED'] as const;
export type AllowedPriceCurrency = (typeof ALLOWED_PRICE_CURRENCIES)[number];

export const ALLOWED_PRICE_UOMS = ['kg', 'KG', 'MT', 'mt', 'ton', 'm', 'PCS', 'm2', 'KM'] as const;

/** Map BOM consumption UOM to the governed price basis. Do not invent conversions. */
export function priceBasisForConsumptionUom(uom?: string | null): PriceBasis {
  return priceBasisFromPriceUom(uom);
}

function normalizePriceCurrency(currency?: string | null): string {
  const c = (currency || '').trim().toUpperCase();
  if (c === 'EGP') return 'LE';
  if (c === 'EURO') return 'EUR';
  return c;
}

export type PriceValidationResultCode =
  | 'PRICE_VALID'
  | 'PRICE_NOT_CONFIGURED'
  | 'PRICE_EXPIRED'
  | 'PRICE_PERIOD_OVERLAP'
  | 'PRICE_UOM_MISMATCH'
  | 'PRICE_UOM_REQUIRED'
  | 'PRICE_UOM_INCOMPATIBLE'
  | 'PRICE_CURRENCY_MISMATCH'
  | 'PRICE_BASIS_MISMATCH'
  | 'INVALID_PRICE'
  | 'RAW_MATERIAL_NOT_FOUND';

export interface PriceInputProposal {
  rawMaterialCode: string;
  price?: number | null;
  currency?: string | null;
  uom?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  supplier?: string | null;
  source?: string | null;
  priceBasis?: PriceBasis | string | null;
  comment?: string | null;
}

export interface StoredPriceRecord {
  id: string;
  rawMaterialCode: string;
  price: number | null;
  currency: string | null;
  uom: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  supplier: string | null;
  source: string | null;
  priceBasis: PriceBasis;
  workflowStatus: PriceWorkflowStatus;
  isCurrent: boolean;
  revision: number;
  temporalStatus?: string;
}

/**
 * Validates candidate price input fields before saving as DRAFT or submitting.
 * Checks for positive price, valid currency, valid UOM, valid date ranges.
 */
export function validatePriceInput(
  input: PriceInputProposal,
  context: { existingRawMaterialCodes: Set<string> }
): { valid: boolean; errors: Array<{ field: string; message: string; code: string }> } {
  const errors: Array<{ field: string; message: string; code: string }> = [];

  if (!input.rawMaterialCode || !input.rawMaterialCode.trim()) {
    errors.push({ field: 'rawMaterialCode', message: 'Raw Material Code is mandatory.', code: 'REQUIRED' });
  } else if (!context.existingRawMaterialCodes.has(input.rawMaterialCode.trim().toUpperCase())) {
    errors.push({
      field: 'rawMaterialCode',
      message: `Raw Material Code "${input.rawMaterialCode}" does not exist in master data.`,
      code: 'RAW_MATERIAL_NOT_FOUND',
    });
  }

  if (input.price === null || input.price === undefined || (typeof input.price === 'string' && input.price === '')) {
    errors.push({
      field: 'price',
      message: 'Price is mandatory. Blank is PRICE_NOT_CONFIGURED.',
      code: 'PRICE_NOT_CONFIGURED',
    });
  } else if (typeof input.price === 'number') {
    if (Number.isNaN(input.price)) {
      errors.push({ field: 'price', message: 'Price must be a valid number.', code: 'INVALID_PRICE' });
    } else if (input.price === 0) {
      errors.push({ field: 'price', message: 'Price cannot be zero. Free material is not allowed.', code: 'INVALID_PRICE' });
    } else if (input.price < 0) {
      errors.push({ field: 'price', message: 'Price cannot be negative.', code: 'INVALID_PRICE' });
    }
  }

  if (input.currency) {
    const cur = input.currency.trim().toUpperCase();
    if (!ALLOWED_PRICE_CURRENCIES.includes(cur as any)) {
      errors.push({
        field: 'currency',
        message: `Currency "${input.currency}" is invalid. Allowed: ${ALLOWED_PRICE_CURRENCIES.join(', ')}.`,
        code: 'INVALID_CURRENCY',
      });
    }
  } else {
    errors.push({ field: 'currency', message: 'Currency is required.', code: 'REQUIRED' });
  }

  if (!input.uom || !String(input.uom).trim()) {
    errors.push({ field: 'uom', message: 'Price UOM / basis is required.', code: 'PRICE_UOM_REQUIRED' });
  } else if (!canonicalizePriceUom(input.uom) && !ALLOWED_PRICE_UOMS.includes(input.uom.trim() as never) && !ALLOWED_PRICE_UOMS.includes(input.uom.trim().toLowerCase() as never)) {
    errors.push({
      field: 'uom',
      message: `UOM "${input.uom}" is invalid. Allowed: KG, MT, PCS, M.`,
      code: 'INVALID_UOM',
    });
  }

  if (input.priceBasis) {
    if (!ALLOWED_PRICE_BASIS.includes(input.priceBasis as any)) {
      errors.push({
        field: 'priceBasis',
        message: `Price Basis "${input.priceBasis}" is invalid. Allowed: ${ALLOWED_PRICE_BASIS.join(', ')}.`,
        code: 'INVALID_PRICE_BASIS',
      });
    }
  }

  if (input.effectiveFrom && input.effectiveTo) {
    const from = new Date(input.effectiveFrom);
    const to = new Date(input.effectiveTo);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      if (from > to) {
        errors.push({
          field: 'effectiveFrom',
          message: 'Effective From date cannot be after Effective To date.',
          code: 'INVALID_DATE_RANGE',
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks whether an effective date period overlaps with existing APPROVED price records
 * for the same Raw Material, Currency, UOM, and Price Basis.
 */
export function detectPricePeriodOverlap(
  candidate: {
    id?: string;
    rawMaterialCode: string;
    currency: string;
    uom?: string | null;
    priceBasis?: PriceBasis;
    effectiveFrom?: Date | null;
    effectiveTo?: Date | null;
  },
  existingApprovedPrices: StoredPriceRecord[]
): { overlap: boolean; conflictingPrice?: StoredPriceRecord } {
  const code = candidate.rawMaterialCode.toUpperCase();
  const cur = candidate.currency.toUpperCase();
  const uom = (candidate.uom || 'kg').toLowerCase();
  const basis = candidate.priceBasis || 'PER_KG';

  const from = candidate.effectiveFrom ? candidate.effectiveFrom.getTime() : -Infinity;
  const to = candidate.effectiveTo ? candidate.effectiveTo.getTime() : Infinity;

  const relevant = existingApprovedPrices.filter(
    (p) =>
      p.id !== candidate.id &&
      p.workflowStatus === 'APPROVED' &&
      p.rawMaterialCode.toUpperCase() === code &&
      (p.currency || '').toUpperCase() === cur &&
      (p.uom || 'kg').toLowerCase() === uom &&
      (p.priceBasis || 'PER_KG') === basis
  );

  for (const p of relevant) {
    const pFrom = p.effectiveFrom ? p.effectiveFrom.getTime() : -Infinity;
    const pTo = p.effectiveTo ? p.effectiveTo.getTime() : Infinity;

    // Standard interval overlap check [from, to] overlaps [pFrom, pTo]
    if (from <= pTo && to >= pFrom) {
      return { overlap: true, conflictingPrice: p };
    }
  }

  return { overlap: false };
}

/**
 * Core Domain Service: Identifies the valid price for a Raw Material at a specific costing date,
 * UOM, Currency, and Price Basis.
 * NEVER calculates cost. ONLY selects and validates the price entity.
 */
export function getValidRawMaterialPrice(
  rawMaterialCode: string,
  costingDate: Date = new Date(),
  requiredUom: string = 'kg',
  preferredCurrency?: string,
  priceBasis: PriceBasis = 'PER_KG',
  approvedPrices: StoredPriceRecord[] = [],
  allowCrossCurrency = false
): {
  code: PriceValidationResultCode;
  priceRecord?: StoredPriceRecord;
  price?: number;
  currency?: string;
  message: string;
} {
  void priceBasis;
  const code = rawMaterialCode.toUpperCase();
  const matchingPrices = approvedPrices.filter(
    (p) => p.workflowStatus === 'APPROVED' && p.rawMaterialCode.toUpperCase() === code
  );

  if (!matchingPrices.length) {
    const pending = approvedPrices.filter((p) => p.rawMaterialCode.toUpperCase() === code);
    if (pending.length) {
      const draft = pending[0];
      const amount =
        draft.price != null
          ? `${draft.price.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${draft.currency || ''}`.trim()
          : 'blank';
      return {
        code: 'PRICE_NOT_CONFIGURED',
        message: `No approved price configured for Raw Material ${rawMaterialCode}. A ${draft.workflowStatus} price exists (${amount} / ${draft.uom || 'kg'}, ${draft.priceBasis}) — submit and approve it in Costing Configuration → Raw Material Prices (Costing Team, not Technical Office) before costing.`,
      };
    }
    return {
      code: 'PRICE_NOT_CONFIGURED',
      message: `No approved price configured for Raw Material ${rawMaterialCode}.`,
    };
  }

  // Filter matching currency if requested; fall back to any currency when cross-currency costing is enabled
  let currencyMatched = preferredCurrency
    ? matchingPrices.filter(
        (p) =>
          normalizePriceCurrency(p.currency) === normalizePriceCurrency(preferredCurrency)
      )
    : matchingPrices;

  if (preferredCurrency && !currencyMatched.length && allowCrossCurrency) {
    currencyMatched = matchingPrices;
  }

  if (preferredCurrency && !currencyMatched.length) {
    return {
      code: 'PRICE_CURRENCY_MISMATCH',
      message: `No approved price in requested currency ${preferredCurrency} for ${rawMaterialCode}.`,
    };
  }

  const withUom = currencyMatched.filter((p) => canonicalizePriceUom(p.uom));
  if (!withUom.length) {
    return {
      code: 'PRICE_UOM_REQUIRED',
      message: `Price UOM is missing on approved price records for ${rawMaterialCode}.`,
    };
  }

  const uomMatched = withUom.filter((p) => priceUomsAreCompatible(p.uom, requiredUom));
  if (!uomMatched.length) {
    return {
      code: 'PRICE_UOM_INCOMPATIBLE',
      message: `No approved price with a compatible UOM for BOM "${requiredUom}" on ${rawMaterialCode} (PRICE_UOM_INCOMPATIBLE).`,
    };
  }

  const exactUom = uomMatched.filter(
    (p) => canonicalizePriceUom(p.uom) === canonicalizePriceUom(requiredUom)
  );
  const candidates = exactUom.length ? exactUom : uomMatched;

  // Filter by Costing Date
  const targetTime = costingDate.getTime();
  const temporallyValid = candidates.filter((p) => {
    const from = p.effectiveFrom ? p.effectiveFrom.getTime() : -Infinity;
    const to = p.effectiveTo ? p.effectiveTo.getTime() : Infinity;
    return targetTime >= from && targetTime <= to;
  });

  if (!temporallyValid.length) {
    // Check if expired
    const expired = candidates.filter((p) => p.effectiveTo && p.effectiveTo.getTime() < targetTime);
    if (expired.length) {
      return {
        code: 'PRICE_EXPIRED',
        message: `Approved price for ${rawMaterialCode} has expired before ${costingDate.toISOString().slice(0, 10)}.`,
      };
    }
    return {
      code: 'PRICE_NOT_CONFIGURED',
      message: `No approved price effective on ${costingDate.toISOString().slice(0, 10)} for ${rawMaterialCode}.`,
    };
  }

  if (temporallyValid.length > 1) {
    return {
      code: 'PRICE_PERIOD_OVERLAP',
      message: `Multiple overlapping approved prices found for ${rawMaterialCode} on ${costingDate.toISOString().slice(0, 10)}.`,
    };
  }

  const selected = temporallyValid[0];
  if (!selected.currency) {
    return {
      code: 'PRICE_CURRENCY_MISMATCH',
      message: `Price currency is missing on the approved price for ${rawMaterialCode}.`,
    };
  }
  if (selected.price == null || selected.price <= 0) {
    return {
      code: 'INVALID_PRICE',
      message: `Configured price for ${rawMaterialCode} is invalid or non-positive.`,
    };
  }

  return {
    code: 'PRICE_VALID',
    priceRecord: selected,
    price: selected.price,
    currency: selected.currency || undefined,
    message: `Valid approved price ${selected.price} ${selected.currency}/${selected.uom} found.`,
  };
}

export function validatePriceWorkflowTransition(
  currentStatus: PriceWorkflowStatus,
  targetStatus: PriceWorkflowStatus
): { valid: boolean; error?: string } {
  if (currentStatus === targetStatus) return { valid: true };

  const allowed: Record<PriceWorkflowStatus, PriceWorkflowStatus[]> = {
    DRAFT: ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'],
    SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'DRAFT'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED'],
    APPROVED: ['EXPIRED', 'CANCELLED', 'DRAFT'], // Changes to approved create new draft revision
    REJECTED: ['DRAFT', 'CANCELLED'],
    EXPIRED: ['DRAFT', 'CANCELLED'],
    CANCELLED: ['DRAFT'],
  };

  const targets = allowed[currentStatus] || [];
  if (!targets.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid Price workflow state transition from ${currentStatus} to ${targetStatus}.`,
    };
  }
  return { valid: true };
}
