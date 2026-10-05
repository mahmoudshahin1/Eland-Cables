import { PriceBasis } from '@prisma/client';

/** Canonical price / consumption quantity UOMs used by costing. */
export type CanonicalPriceUom = 'KG' | 'MT' | 'PCS' | 'M';

export const KG_PER_MT = 1000;

export function canonicalizePriceUom(uom?: string | null): CanonicalPriceUom | null {
  const raw = (uom || '').trim();
  if (!raw) return null;
  const token = raw.includes('/') ? raw.split('/').pop()!.trim() : raw;
  const lower = token.toLowerCase();
  if (lower === 'kg' || lower === 'kgs' || lower === 'kilogram' || lower === 'kilograms') return 'KG';
  if (lower === 'mt' || lower === 'ton' || lower === 'tonne' || lower === 'tons' || lower === 't') return 'MT';
  if (lower === 'pcs' || lower === 'pc' || lower === 'piece' || lower === 'pieces' || lower === 'ea') return 'PCS';
  if (lower === 'm' || lower === 'meter' || lower === 'metre' || lower === 'meters') return 'M';
  return null;
}

export function priceBasisFromCanonicalUom(uom: CanonicalPriceUom): PriceBasis {
  if (uom === 'MT') return 'PER_TON';
  if (uom === 'PCS') return 'PER_PCS';
  if (uom === 'M') return 'PER_METER';
  return 'PER_KG';
}

export function priceBasisFromPriceUom(uom?: string | null): PriceBasis {
  const canonical = canonicalizePriceUom(uom);
  return canonical ? priceBasisFromCanonicalUom(canonical) : 'PER_KG';
}

export function formatCanonicalUom(uom: CanonicalPriceUom): string {
  if (uom === 'KG') return 'kg';
  if (uom === 'MT') return 'MT';
  if (uom === 'PCS') return 'PCS';
  return 'm';
}

/**
 * Converts a stored unit price into the BOM consumption UOM.
 * Only governed mass conversion is MT ↔ kg (1 MT = 1000 kg).
 * PCS cannot be converted to KG.
 */
export function convertPriceForConsumptionUom(
  price: number,
  priceUom: string | null | undefined,
  consumptionUom: string | null | undefined
):
  | { ok: true; price: number; uom: string; factor: number; notes: string }
  | { ok: false; code: 'PRICE_UOM_REQUIRED' | 'PRICE_UOM_INCOMPATIBLE'; message: string } {
  const from = canonicalizePriceUom(priceUom);
  const to = canonicalizePriceUom(consumptionUom);
  if (!from) {
    return {
      ok: false,
      code: 'PRICE_UOM_REQUIRED',
      message: `Price UOM is missing or unsupported ("${priceUom || ''}").`,
    };
  }
  if (!to) {
    return {
      ok: false,
      code: 'PRICE_UOM_REQUIRED',
      message: `BOM UOM is missing or unsupported ("${consumptionUom || ''}").`,
    };
  }
  if (from === to) {
    return { ok: true, price, uom: formatCanonicalUom(to), factor: 1, notes: `${price} / ${formatCanonicalUom(from)}` };
  }
  if (from === 'MT' && to === 'KG') {
    const converted = price / KG_PER_MT;
    return {
      ok: true,
      price: converted,
      uom: 'kg',
      factor: 1 / KG_PER_MT,
      notes: `${price} / MT → ${converted} / kg (1 MT = ${KG_PER_MT} kg)`,
    };
  }
  if (from === 'KG' && to === 'MT') {
    const converted = price * KG_PER_MT;
    return {
      ok: true,
      price: converted,
      uom: 'MT',
      factor: KG_PER_MT,
      notes: `${price} / kg → ${converted} / MT (1 MT = ${KG_PER_MT} kg)`,
    };
  }
  return {
    ok: false,
    code: 'PRICE_UOM_INCOMPATIBLE',
    message: `Price UOM ${formatCanonicalUom(from)} is incompatible with BOM UOM ${formatCanonicalUom(to)}.`,
  };
}

export function equivalentPricePerKg(
  price: number | null | undefined,
  priceUom?: string | null,
  currency?: string | null
): { value: number; label: string } | null {
  if (price == null || !Number.isFinite(price)) return null;
  const converted = convertPriceForConsumptionUom(price, priceUom, 'kg');
  if (!converted.ok) return null;
  const cur = (currency || '').trim();
  const unit = cur ? `${cur}/kg` : '/kg';
  return { value: converted.price, label: `${converted.price.toFixed(4)} ${unit}`.trim() };
}

export function priceUomsAreCompatible(priceUom?: string | null, consumptionUom?: string | null): boolean {
  return convertPriceForConsumptionUom(1, priceUom, consumptionUom).ok;
}
