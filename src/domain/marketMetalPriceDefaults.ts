import { periodsOverlap, parseDateOnly } from './metalCostComponents';

export const MARKET_METAL_PRICE_UOM = 'USD/MT';
export const MARKET_METAL_TYPES = ['COPPER', 'ALUMINIUM'] as const;
export const MARKET_METAL_DEFAULT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;

export type MarketMetalType = (typeof MARKET_METAL_TYPES)[number];
export type MarketMetalDefaultStatus = (typeof MARKET_METAL_DEFAULT_STATUSES)[number];
export type InquiryMetalPriceSource = 'SYSTEM_DEFAULT' | 'INQUIRY_OVERRIDE';

export type MarketMetalPriceDefaultInput = {
  metalType?: string;
  priceRate?: unknown;
  priceUom?: string;
  status?: string;
  effectiveFrom?: string | Date;
  effectiveTo?: string | Date | null;
  notes?: string | null;
};

export type ParsedMarketMetalPriceDefault = {
  metalType: MarketMetalType;
  priceRate: number;
  priceUom: typeof MARKET_METAL_PRICE_UOM;
  status: MarketMetalDefaultStatus;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
};

export type ActiveMarketMetalDefault = {
  id: string;
  metalType: MarketMetalType;
  priceRate: number;
  priceUom: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /** Set only when the active rate came from a published LME row. */
  publishedPriceId?: string | null;
  quoteDate?: string | null;
};

export type OriginalSystemMetalDefault = {
  id: string;
  priceRate: number;
  priceUom: string;
  effectiveFrom: string;
};

export type OriginalSystemDefaultSnapshot = {
  copper: OriginalSystemMetalDefault | null;
  aluminium: OriginalSystemMetalDefault | null;
};

function fail(message: string, code = 'VALIDATION_ERROR'): never {
  throw Object.assign(new Error(message), { code });
}

function token(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function parseMetalType(value: unknown): MarketMetalType {
  const raw = token(value);
  const mapped = raw === 'ALU' || raw === 'ALUMINUM' || raw === 'AL' ? 'ALUMINIUM' : raw === 'CU' ? 'COPPER' : raw;
  if (mapped !== 'COPPER' && mapped !== 'ALUMINIUM') {
    fail('Metal must be COPPER or ALUMINIUM.');
  }
  return mapped;
}

function parseStatus(value: unknown, fallback: MarketMetalDefaultStatus): MarketMetalDefaultStatus {
  if (value == null || value === '') return fallback;
  const raw = token(value);
  if (raw !== 'DRAFT' && raw !== 'ACTIVE' && raw !== 'INACTIVE') {
    fail('Status must be DRAFT, ACTIVE, or INACTIVE.');
  }
  return raw;
}

function parsePositiveRate(value: unknown, required: boolean): number {
  if (value == null || value === '') {
    if (required) fail('Price rate is required and must be greater than 0.');
    return 0;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) fail('Price rate must be a number greater than 0.');
  return n;
}

export function parseMarketMetalPriceDefaultInput(
  input: MarketMetalPriceDefaultInput,
  options?: { defaultStatus?: MarketMetalDefaultStatus }
): ParsedMarketMetalPriceDefault {
  const status = parseStatus(input.status, options?.defaultStatus || 'DRAFT');
  const priceRate = parsePositiveRate(input.priceRate, status === 'ACTIVE' || input.priceRate != null);
  if (status === 'ACTIVE' && priceRate <= 0) {
    fail('Active market metal defaults require a price rate greater than 0.');
  }
  const uom = String(input.priceUom || MARKET_METAL_PRICE_UOM).trim().toUpperCase().replace(/\s+/g, '');
  if (uom && uom !== 'USD/MT' && uom !== 'USDPERMT') {
    fail('Price UOM is fixed at USD/MT.');
  }
  const effectiveFrom = parseDateOnly(input.effectiveFrom, 'Effective From', true)!;
  const effectiveTo = parseDateOnly(input.effectiveTo ?? null, 'Effective To', false);
  if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
    fail('Effective To cannot be before Effective From.');
  }
  const notes = input.notes == null || String(input.notes).trim() === '' ? null : String(input.notes).trim();
  return {
    metalType: parseMetalType(input.metalType),
    priceRate,
    priceUom: MARKET_METAL_PRICE_UOM,
    status,
    effectiveFrom,
    effectiveTo,
    notes,
  };
}

export function activePeriodIncludes(from: Date, to: Date | null, asOf: Date): boolean {
  return periodsOverlap(from, to, asOf, asOf);
}

function parsePositiveMetaRate(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function ratesEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function snapshotFromActive(row: ActiveMarketMetalDefault | null): OriginalSystemMetalDefault | null {
  if (!row) return null;
  return {
    id: row.id,
    priceRate: row.priceRate,
    priceUom: row.priceUom || MARKET_METAL_PRICE_UOM,
    effectiveFrom: row.effectiveFrom.toISOString(),
  };
}

function applyOneMetalOnCreate(
  meta: Record<string, unknown>,
  rateKey: 'copperPriceRate' | 'aluminiumPriceRate',
  uomKey: 'copperPriceUom' | 'aluminiumPriceUom',
  sourceKey: 'copperPriceSource' | 'aluminiumPriceSource',
  currencyKey: 'copperPriceCurrency' | 'aluminiumPriceCurrency',
  active: ActiveMarketMetalDefault | null
) {
  const userRate = parsePositiveMetaRate(meta[rateKey]);
  if (userRate != null) {
    meta[rateKey] = userRate;
    if (!meta[uomKey]) meta[uomKey] = MARKET_METAL_PRICE_UOM;
    meta[sourceKey] = 'INQUIRY_OVERRIDE';
    if (!meta[currencyKey]) meta[currencyKey] = 'USD';
    return;
  }
  if (active) {
    meta[rateKey] = active.priceRate;
    meta[uomKey] = MARKET_METAL_PRICE_UOM;
    meta[sourceKey] = 'SYSTEM_DEFAULT';
    meta[currencyKey] = 'USD';
    if (active.publishedPriceId) {
      meta[rateKey === 'copperPriceRate' ? 'copperMarketPriceId' : 'aluminiumMarketPriceId'] = active.publishedPriceId;
      if (active.quoteDate) {
        meta[rateKey === 'copperPriceRate' ? 'copperMarketQuoteDate' : 'aluminiumMarketQuoteDate'] = active.quoteDate;
      }
    }
    return;
  }
  // Leave missing — costing readiness still reports INQUIRY_*_PRICE_REQUIRED
}

/** Copy active system defaults onto a new inquiry header. Never invents rates when no ACTIVE default exists. */
export function applySystemMarketMetalDefaultsOnCreate(
  metadata: Record<string, unknown> | null | undefined,
  active: { copper: ActiveMarketMetalDefault | null; aluminium: ActiveMarketMetalDefault | null }
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(metadata || {}) };
  applyOneMetalOnCreate(meta, 'copperPriceRate', 'copperPriceUom', 'copperPriceSource', 'copperPriceCurrency', active.copper);
  applyOneMetalOnCreate(
    meta,
    'aluminiumPriceRate',
    'aluminiumPriceUom',
    'aluminiumPriceSource',
    'aluminiumPriceCurrency',
    active.aluminium
  );
  meta.originalSystemDefault = {
    copper: snapshotFromActive(active.copper),
    aluminium: snapshotFromActive(active.aluminium),
  } satisfies OriginalSystemDefaultSnapshot;
  return meta;
}

function readOriginalSnapshot(value: unknown): OriginalSystemDefaultSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { copper: null, aluminium: null };
  }
  const rec = value as Record<string, unknown>;
  const one = (side: unknown): OriginalSystemMetalDefault | null => {
    if (!side || typeof side !== 'object' || Array.isArray(side)) return null;
    const s = side as Record<string, unknown>;
    const rate = parsePositiveMetaRate(s.priceRate);
    if (rate == null || !s.id) return null;
    return {
      id: String(s.id),
      priceRate: rate,
      priceUom: String(s.priceUom || MARKET_METAL_PRICE_UOM),
      effectiveFrom: String(s.effectiveFrom || ''),
    };
  };
  return { copper: one(rec.copper), aluminium: one(rec.aluminium) };
}

function sourceForRate(rate: number | null, original: OriginalSystemMetalDefault | null): InquiryMetalPriceSource | undefined {
  if (rate == null) return undefined;
  if (original && ratesEqual(rate, original.priceRate)) return 'SYSTEM_DEFAULT';
  return 'INQUIRY_OVERRIDE';
}

/**
 * On inquiry PATCH: preserve the create-time system snapshot and mark INQUIRY_OVERRIDE
 * when the header rate differs from that snapshot. Does not re-read current system defaults.
 */
export function applyMarketMetalSourceOnUpdate(
  existingMeta: Record<string, unknown>,
  incomingMeta: Record<string, unknown>
): Record<string, unknown> {
  const originalSystemDefault = readOriginalSnapshot(
    existingMeta.originalSystemDefault ?? incomingMeta.originalSystemDefault
  );
  const merged: Record<string, unknown> = { ...existingMeta, ...incomingMeta, originalSystemDefault };
  const copperRate = parsePositiveMetaRate(merged.copperPriceRate);
  const aluminiumRate = parsePositiveMetaRate(merged.aluminiumPriceRate);
  const copperSource = sourceForRate(copperRate, originalSystemDefault.copper);
  const aluminiumSource = sourceForRate(aluminiumRate, originalSystemDefault.aluminium);
  if (copperSource) merged.copperPriceSource = copperSource;
  if (aluminiumSource) merged.aluminiumPriceSource = aluminiumSource;
  if (copperRate != null && !merged.copperPriceUom) merged.copperPriceUom = MARKET_METAL_PRICE_UOM;
  if (aluminiumRate != null && !merged.aluminiumPriceUom) merged.aluminiumPriceUom = MARKET_METAL_PRICE_UOM;
  return merged;
}

export { periodsOverlap };
