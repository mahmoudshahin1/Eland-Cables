import { PriceBasis } from '@prisma/client';
import {
  StoredPriceRecord,
  getValidRawMaterialPrice,
  priceBasisForConsumptionUom,
} from '../services/rawMaterialPriceGovernanceService';
import { normalizeCostingCurrency } from './currencyConversion';
import { convertPriceForConsumptionUom, priceBasisFromPriceUom } from './priceUom';

export type RawMaterialPricingCategory =
  | 'MARKET_METAL_COPPER'
  | 'MARKET_METAL_ALUMINIUM'
  | 'STANDARD_RAW_MATERIAL';

export type MaterialPricingSource =
  | 'INQUIRY_HEADER'
  | 'INQUIRY_OVERRIDE'
  | 'INQUIRY_SYSTEM_DEFAULT'
  | 'RAW_MATERIAL_MASTER';

/** How the effective inquiry-header metal price was established. */
export type InquiryMetalHeaderSource = 'SYSTEM_DEFAULT' | 'INQUIRY_OVERRIDE' | null;

export interface InquiryMetalPricing {
  inquiryCurrency: string;
  copperPrice: number | null;
  copperPriceUom: string | null;
  copperPriceCurrency: string | null;
  copperPriceSource: InquiryMetalHeaderSource;
  aluminiumPrice: number | null;
  aluminiumPriceUom: string | null;
  aluminiumPriceCurrency: string | null;
  aluminiumPriceSource: InquiryMetalHeaderSource;
  copperMarketPriceId?: string | null;
  copperMarketQuoteDate?: string | null;
  aluminiumMarketPriceId?: string | null;
  aluminiumMarketQuoteDate?: string | null;
}

export interface MaterialPriceResolution {
  ok: boolean;
  pricingSource?: MaterialPricingSource;
  appliedPrice?: number;
  appliedCurrency?: string;
  appliedUom?: string;
  priceBasis?: PriceBasis;
  masterPrice?: number | null;
  masterPriceCurrency?: string | null;
  masterPriceUom?: string | null;
  masterPriceId?: string;
  masterPriceRevision?: number;
  masterEffectiveFrom?: Date | null;
  masterEffectiveTo?: Date | null;
  inquiryHeaderPrice?: number | null;
  inquiryHeaderPriceUom?: string | null;
  priceRecord?: StoredPriceRecord;
  code?: string;
  message?: string;
}

export const INQUIRY_COPPER_PRICE_REQUIRED = 'INQUIRY_COPPER_PRICE_REQUIRED';
export const INQUIRY_ALUMINIUM_PRICE_REQUIRED = 'INQUIRY_ALUMINIUM_PRICE_REQUIRED';
export const INQUIRY_METAL_UOM_INVALID = 'INQUIRY_METAL_UOM_INVALID';

export const COPPER_MARKET_PRICE_REQUIRED_MESSAGE =
  'Copper market price is required in the Inquiry Header.';
export const ALUMINIUM_MARKET_PRICE_REQUIRED_MESSAGE =
  'Aluminium market price is required in the Inquiry Header.';

export const METAL_PRICE_UOM_OPTIONS = ['MT', 'kg'] as const;
export type MetalPriceUomOption = (typeof METAL_PRICE_UOM_OPTIONS)[number];

function parsePositiveNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function normalizePricingCategory(
  value?: string | null
): RawMaterialPricingCategory {
  const v = (value || '').trim().toUpperCase();
  if (v === 'MARKET_METAL_COPPER') return 'MARKET_METAL_COPPER';
  if (v === 'MARKET_METAL_ALUMINIUM') return 'MARKET_METAL_ALUMINIUM';
  return 'STANDARD_RAW_MATERIAL';
}

export function normalizeInquiryMetalHeaderSource(value: unknown): InquiryMetalHeaderSource {
  const token = String(value || '').trim().toUpperCase();
  if (token === 'SYSTEM_DEFAULT') return 'SYSTEM_DEFAULT';
  if (token === 'INQUIRY_OVERRIDE') return 'INQUIRY_OVERRIDE';
  return null;
}

export function buildInquiryMetalPricingFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  inquiryCurrency: string
): InquiryMetalPricing {
  const meta = metadata || {};
  const inquiry = normalizeCostingCurrency(inquiryCurrency) || inquiryCurrency;
  return {
    inquiryCurrency: inquiry,
    copperPrice: parsePositiveNumber(meta.copperPriceRate),
    copperPriceUom: normalizeMetalQuantityUom(String(meta.copperPriceUom || 'MT')),
    copperPriceCurrency: normalizeCostingCurrency(String(meta.copperPriceCurrency || '')) || inquiry,
    copperPriceSource: normalizeInquiryMetalHeaderSource(meta.copperPriceSource),
    aluminiumPrice: parsePositiveNumber(meta.aluminiumPriceRate),
    aluminiumPriceUom: normalizeMetalQuantityUom(String(meta.aluminiumPriceUom || 'MT')),
    aluminiumPriceCurrency: normalizeCostingCurrency(String(meta.aluminiumPriceCurrency || '')) || inquiry,
    aluminiumPriceSource: normalizeInquiryMetalHeaderSource(meta.aluminiumPriceSource),
    copperMarketPriceId: typeof meta.copperMarketPriceId === 'string' ? meta.copperMarketPriceId : null,
    copperMarketQuoteDate: typeof meta.copperMarketQuoteDate === 'string' ? meta.copperMarketQuoteDate : null,
    aluminiumMarketPriceId: typeof meta.aluminiumMarketPriceId === 'string' ? meta.aluminiumMarketPriceId : null,
    aluminiumMarketQuoteDate: typeof meta.aluminiumMarketQuoteDate === 'string' ? meta.aluminiumMarketQuoteDate : null,
  };
}

/** Maps the inquiry-header metal source into the per-line costing trace value. */
function marketMetalPricingSource(headerSource: InquiryMetalHeaderSource): MaterialPricingSource {
  if (headerSource === 'INQUIRY_OVERRIDE') return 'INQUIRY_OVERRIDE';
  if (headerSource === 'SYSTEM_DEFAULT') return 'INQUIRY_SYSTEM_DEFAULT';
  return 'INQUIRY_HEADER';
}

export function buildMetalPricingSnapshot(pricing: InquiryMetalPricing) {
  return {
    inquiryCurrency: pricing.inquiryCurrency,
    copperPrice: pricing.copperPrice,
    copperPriceUom: pricing.copperPriceUom,
    copperPriceCurrency: pricing.copperPriceCurrency,
    copperPriceSource: pricing.copperPriceSource,
    aluminiumPrice: pricing.aluminiumPrice,
    aluminiumPriceUom: pricing.aluminiumPriceUom,
    aluminiumPriceCurrency: pricing.aluminiumPriceCurrency,
    aluminiumPriceSource: pricing.aluminiumPriceSource,
    ...(pricing.copperMarketPriceId
      ? { copperMarketPriceId: pricing.copperMarketPriceId, copperMarketQuoteDate: pricing.copperMarketQuoteDate }
      : {}),
    ...(pricing.aluminiumMarketPriceId
      ? { aluminiumMarketPriceId: pricing.aluminiumMarketPriceId, aluminiumMarketQuoteDate: pricing.aluminiumMarketQuoteDate }
      : {}),
  };
}

/** Normalize metal quantity UOM tokens (MT, ton, kg, USD/MT, EUR/kg, …). */
export function normalizeMetalQuantityUom(uom: string): string | null {
  const raw = (uom || '').trim();
  if (!raw) return null;
  const token = raw.includes('/') ? raw.split('/').pop()!.trim() : raw;
  const lower = token.toLowerCase();
  if (lower === 'mt' || lower === 'ton' || lower === 'tonne' || lower === 't') return 'MT';
  if (lower === 'kg' || lower === 'kgs') return 'kg';
  return null;
}

export function formatMetalPriceLabel(currency: string, uom: string): string {
  const qty = normalizeMetalQuantityUom(uom) || uom;
  return `${currency}/${qty}`;
}

/**
 * Converts an inquiry-header metal price into BOM-consumption units for costing.
 * Supports MT/ton ↔ kg using explicit 1000 kg per metric ton.
 */
export function convertInquiryMetalPriceForConsumption(
  headerPrice: number,
  headerPriceUom: string,
  consumptionUom: string
): { price: number; priceUom: string; priceBasis: PriceBasis; notes: string } | { error: string } {
  const converted = convertPriceForConsumptionUom(headerPrice, headerPriceUom, consumptionUom);
  if (converted.ok === false) {
    return { error: converted.message };
  }
  return {
    price: converted.price,
    priceUom: converted.uom,
    priceBasis: priceBasisFromPriceUom(converted.uom),
    notes: `Inquiry header ${converted.notes}`,
  };
}

function resolveMasterPriceTrace(
  rawMaterialCode: string,
  costingDate: Date,
  consumptionUom: string,
  currency: string,
  approvedPrices: StoredPriceRecord[]
) {
  const masterVal = getValidRawMaterialPrice(
    rawMaterialCode,
    costingDate,
    consumptionUom,
    currency,
    priceBasisForConsumptionUom(consumptionUom),
    approvedPrices,
    false
  );
  if (masterVal.code !== 'PRICE_VALID' || !masterVal.priceRecord) {
    return {
      masterPrice: masterVal.price ?? null,
      masterPriceCurrency: masterVal.currency ?? null,
      masterPriceUom: masterVal.priceRecord?.uom ?? null,
      priceRecord: masterVal.priceRecord,
    };
  }
  return {
    masterPrice: masterVal.price ?? null,
    masterPriceCurrency: masterVal.currency ?? null,
    masterPriceUom: masterVal.priceRecord.uom ?? null,
    masterPriceId: masterVal.priceRecord.id,
    masterPriceRevision: masterVal.priceRecord.revision,
    masterEffectiveFrom: masterVal.priceRecord.effectiveFrom,
    masterEffectiveTo: masterVal.priceRecord.effectiveTo,
    priceRecord: masterVal.priceRecord,
  };
}

export function resolveMaterialUnitPrice(params: {
  rawMaterialCode: string;
  pricingCategory: RawMaterialPricingCategory;
  consumptionUom: string;
  costingCurrency: string;
  costingDate: Date;
  inquiryMetalPricing?: InquiryMetalPricing | null;
  approvedPrices: StoredPriceRecord[];
}): MaterialPriceResolution {
  const {
    rawMaterialCode,
    pricingCategory,
    consumptionUom,
    costingCurrency,
    costingDate,
    inquiryMetalPricing,
    approvedPrices,
  } = params;

  const masterTrace = resolveMasterPriceTrace(
    rawMaterialCode,
    costingDate,
    consumptionUom,
    costingCurrency,
    approvedPrices
  );

  if (pricingCategory === 'MARKET_METAL_COPPER') {
    const headerPrice = inquiryMetalPricing?.copperPrice ?? null;
    const headerUom = inquiryMetalPricing?.copperPriceUom;
    if (headerPrice == null) {
      return {
        ok: false,
        code: INQUIRY_COPPER_PRICE_REQUIRED,
        message: COPPER_MARKET_PRICE_REQUIRED_MESSAGE,
        masterPrice: masterTrace.masterPrice,
        masterPriceCurrency: masterTrace.masterPriceCurrency,
        masterPriceUom: masterTrace.masterPriceUom,
        inquiryHeaderPrice: null,
        inquiryHeaderPriceUom: headerUom,
      };
    }
    if (!headerUom) {
      return {
        ok: false,
        code: INQUIRY_METAL_UOM_INVALID,
        message: 'Copper price UOM is required in the Inquiry Header.',
        masterPrice: masterTrace.masterPrice,
        masterPriceCurrency: masterTrace.masterPriceCurrency,
        masterPriceUom: masterTrace.masterPriceUom,
        inquiryHeaderPrice: headerPrice,
        inquiryHeaderPriceUom: null,
      };
    }

    const converted = convertInquiryMetalPriceForConsumption(headerPrice, headerUom, consumptionUom);
    if ('error' in converted) {
      return {
        ok: false,
        code: INQUIRY_METAL_UOM_INVALID,
        message: converted.error,
        masterPrice: masterTrace.masterPrice,
        masterPriceCurrency: masterTrace.masterPriceCurrency,
        masterPriceUom: masterTrace.masterPriceUom,
        inquiryHeaderPrice: headerPrice,
        inquiryHeaderPriceUom: headerUom,
      };
    }

    return {
      ok: true,
      pricingSource: marketMetalPricingSource(inquiryMetalPricing?.copperPriceSource ?? null),
      appliedPrice: converted.price,
      appliedCurrency:
        inquiryMetalPricing?.copperPriceCurrency ||
        inquiryMetalPricing?.inquiryCurrency ||
        costingCurrency,
      appliedUom: converted.priceUom,
      priceBasis: converted.priceBasis,
      masterPrice: masterTrace.masterPrice,
      masterPriceCurrency: masterTrace.masterPriceCurrency,
      masterPriceUom: masterTrace.masterPriceUom,
      masterPriceId: masterTrace.masterPriceId,
      masterPriceRevision: masterTrace.masterPriceRevision,
      masterEffectiveFrom: masterTrace.masterEffectiveFrom,
      masterEffectiveTo: masterTrace.masterEffectiveTo,
      inquiryHeaderPrice: headerPrice,
      inquiryHeaderPriceUom: headerUom,
      priceRecord: masterTrace.priceRecord,
    };
  }

  if (pricingCategory === 'MARKET_METAL_ALUMINIUM') {
    const headerPrice = inquiryMetalPricing?.aluminiumPrice ?? null;
    const headerUom = inquiryMetalPricing?.aluminiumPriceUom;
    if (headerPrice == null) {
      return {
        ok: false,
        code: INQUIRY_ALUMINIUM_PRICE_REQUIRED,
        message: ALUMINIUM_MARKET_PRICE_REQUIRED_MESSAGE,
        masterPrice: masterTrace.masterPrice,
        masterPriceCurrency: masterTrace.masterPriceCurrency,
        masterPriceUom: masterTrace.masterPriceUom,
        inquiryHeaderPrice: null,
        inquiryHeaderPriceUom: headerUom,
      };
    }
    if (!headerUom) {
      return {
        ok: false,
        code: INQUIRY_METAL_UOM_INVALID,
        message: 'Aluminium price UOM is required in the Inquiry Header.',
        masterPrice: masterTrace.masterPrice,
        masterPriceCurrency: masterTrace.masterPriceCurrency,
        masterPriceUom: masterTrace.masterPriceUom,
        inquiryHeaderPrice: headerPrice,
        inquiryHeaderPriceUom: null,
      };
    }

    const converted = convertInquiryMetalPriceForConsumption(headerPrice, headerUom, consumptionUom);
    if ('error' in converted) {
      return {
        ok: false,
        code: INQUIRY_METAL_UOM_INVALID,
        message: converted.error,
        masterPrice: masterTrace.masterPrice,
        masterPriceCurrency: masterTrace.masterPriceCurrency,
        masterPriceUom: masterTrace.masterPriceUom,
        inquiryHeaderPrice: headerPrice,
        inquiryHeaderPriceUom: headerUom,
      };
    }

    return {
      ok: true,
      pricingSource: marketMetalPricingSource(inquiryMetalPricing?.aluminiumPriceSource ?? null),
      appliedPrice: converted.price,
      appliedCurrency:
        inquiryMetalPricing?.aluminiumPriceCurrency ||
        inquiryMetalPricing?.inquiryCurrency ||
        costingCurrency,
      appliedUom: converted.priceUom,
      priceBasis: converted.priceBasis,
      masterPrice: masterTrace.masterPrice,
      masterPriceCurrency: masterTrace.masterPriceCurrency,
      masterPriceUom: masterTrace.masterPriceUom,
      masterPriceId: masterTrace.masterPriceId,
      masterPriceRevision: masterTrace.masterPriceRevision,
      masterEffectiveFrom: masterTrace.masterEffectiveFrom,
      masterEffectiveTo: masterTrace.masterEffectiveTo,
      inquiryHeaderPrice: headerPrice,
      inquiryHeaderPriceUom: headerUom,
      priceRecord: masterTrace.priceRecord,
    };
  }

  const masterVal = getValidRawMaterialPrice(
    rawMaterialCode,
    costingDate,
    consumptionUom,
    costingCurrency,
    priceBasisForConsumptionUom(consumptionUom),
    approvedPrices,
    true
  );

  if (masterVal.code !== 'PRICE_VALID' || masterVal.price == null || !masterVal.priceRecord) {
    return {
      ok: false,
      code: masterVal.code,
      message: masterVal.message,
      masterPrice: masterVal.price ?? null,
      masterPriceCurrency: masterVal.currency ?? null,
      masterPriceUom: masterVal.priceRecord?.uom ?? null,
      priceRecord: masterVal.priceRecord,
    };
  }

  return {
    ok: true,
    pricingSource: 'RAW_MATERIAL_MASTER',
    appliedPrice: masterVal.price,
    appliedCurrency: masterVal.currency || costingCurrency,
    appliedUom: masterVal.priceRecord.uom || consumptionUom,
    priceBasis: masterVal.priceRecord.priceBasis || priceBasisForConsumptionUom(consumptionUom),
    masterPrice: masterVal.price,
    masterPriceCurrency: masterVal.currency ?? null,
    masterPriceUom: masterVal.priceRecord.uom ?? null,
    masterPriceId: masterVal.priceRecord.id,
    masterPriceRevision: masterVal.priceRecord.revision,
    masterEffectiveFrom: masterVal.priceRecord.effectiveFrom,
    masterEffectiveTo: masterVal.priceRecord.effectiveTo,
    priceRecord: masterVal.priceRecord,
  };
}

export function isMarketMetalCategory(category: RawMaterialPricingCategory): boolean {
  return category === 'MARKET_METAL_COPPER' || category === 'MARKET_METAL_ALUMINIUM';
}
