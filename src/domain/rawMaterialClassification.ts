import { RawMaterialPricingCategory } from './inquiryMetalPricing';

export const PRICING_CATEGORIES = [
  'MARKET_METAL_COPPER',
  'MARKET_METAL_ALUMINIUM',
  'STANDARD_RAW_MATERIAL',
] as const;

export const METAL_TYPES = ['COPPER', 'ALUMINIUM', 'NONE'] as const;

export type MetalType = (typeof METAL_TYPES)[number];

export function normalizeMetalType(value?: string | null): MetalType {
  const token = (value || '').trim().toUpperCase();
  if (token === 'COPPER' || token === 'CU') return 'COPPER';
  if (token === 'ALUMINIUM' || token === 'ALUMINUM' || token === 'AL') return 'ALUMINIUM';
  return 'NONE';
}

export function normalizePricingCategoryInput(value?: string | null): RawMaterialPricingCategory {
  const token = (value || '').trim().toUpperCase();
  if (token === 'MARKET_METAL_COPPER' || token === 'COPPER') return 'MARKET_METAL_COPPER';
  if (token === 'MARKET_METAL_ALUMINIUM' || token === 'ALUMINIUM' || token === 'ALUMINUM') {
    return 'MARKET_METAL_ALUMINIUM';
  }
  return 'STANDARD_RAW_MATERIAL';
}

export function validateRawMaterialClassification(input: {
  pricingCategory?: string | null;
  metalType?: string | null;
}): { ok: true } | { ok: false; message: string; code: string } {
  const pricingCategory = normalizePricingCategoryInput(input.pricingCategory);
  const metalType = normalizeMetalType(input.metalType);

  if (pricingCategory === 'MARKET_METAL_COPPER' && metalType !== 'COPPER') {
    return {
      ok: false,
      code: 'METAL_TYPE_MISMATCH',
      message: 'MARKET_METAL_COPPER requires Metal Type = COPPER.',
    };
  }
  if (pricingCategory === 'MARKET_METAL_ALUMINIUM' && metalType !== 'ALUMINIUM') {
    return {
      ok: false,
      code: 'METAL_TYPE_MISMATCH',
      message: 'MARKET_METAL_ALUMINIUM requires Metal Type = ALUMINIUM.',
    };
  }
  if (pricingCategory === 'STANDARD_RAW_MATERIAL' && metalType !== 'NONE') {
    return {
      ok: false,
      code: 'METAL_TYPE_MISMATCH',
      message: 'STANDARD_RAW_MATERIAL requires Metal Type = NONE.',
    };
  }
  return { ok: true };
}

export function isMassPricingUom(uom?: string | null): boolean {
  const u = (uom || '').trim().toLowerCase();
  return /\bkg\b/.test(u) || u === 'kg' || u === 'mt' || u.includes('ton');
}

export function isOperationalRawMaterialCode(code?: string | null): boolean {
  const c = (code || '').trim().toUpperCase();
  return !/^I\d+-RM-/.test(c) && !c.startsWith('TEST-') && !c.startsWith('I8-RM-');
}

export function suggestedClassificationFromCode(
  code?: string | null,
  description?: string | null,
  uom?: string | null
): { pricingCategory: RawMaterialPricingCategory; metalType: MetalType } {
  const c = (code || '').trim().toUpperCase();
  const d = (description || '').trim().toUpperCase();
  if (!isOperationalRawMaterialCode(c)) {
    return { pricingCategory: 'STANDARD_RAW_MATERIAL', metalType: 'NONE' };
  }
  if (uom != null && uom.trim() !== '' && !isMassPricingUom(uom)) {
    return { pricingCategory: 'STANDARD_RAW_MATERIAL', metalType: 'NONE' };
  }
  if (/END CAP|\bTAPE\b/.test(d) || /^A-EC/.test(c)) {
    return { pricingCategory: 'STANDARD_RAW_MATERIAL', metalType: 'NONE' };
  }
  const copperHint = /^(CR|CU)\d/.test(c) || d.includes('COPPER ROD');
  const aluminiumHint = /^AR\d/.test(c) || /^AL\d/.test(c) || d.includes('ALUMINUM ROD') || d.includes('ALUMINIUM ROD');
  if (copperHint && !aluminiumHint) {
    return { pricingCategory: 'MARKET_METAL_COPPER', metalType: 'COPPER' };
  }
  if (aluminiumHint && !copperHint) {
    return { pricingCategory: 'MARKET_METAL_ALUMINIUM', metalType: 'ALUMINIUM' };
  }
  return { pricingCategory: 'STANDARD_RAW_MATERIAL', metalType: 'NONE' };
}

/** End caps and similar packing accessories are not part of Direct Raw Material Cost. */
export function isExcludedFromDirectRawMaterialCost(
  code?: string | null,
  description?: string | null,
  uom?: string | null
): boolean {
  const c = (code || '').trim().toUpperCase();
  const d = (description || '').trim().toUpperCase();
  if (/END CAP/.test(d) || /^A-EC/.test(c)) return true;
  void uom;
  return false;
}

export function suggestedClassificationForPair(
  pricingCategory: RawMaterialPricingCategory,
  metalType: MetalType
): { pricingCategory: RawMaterialPricingCategory; metalType: MetalType } {
  if (pricingCategory === 'MARKET_METAL_COPPER') return { pricingCategory, metalType: 'COPPER' };
  if (pricingCategory === 'MARKET_METAL_ALUMINIUM') return { pricingCategory, metalType: 'ALUMINIUM' };
  return { pricingCategory: 'STANDARD_RAW_MATERIAL', metalType: 'NONE' };
}
