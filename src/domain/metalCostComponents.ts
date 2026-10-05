export const METAL_COST_METALS = ['COPPER', 'ALUMINIUM'] as const;
export const METAL_COST_COMPONENT_TYPES = ['PREMIUM', 'SHIPPING', 'CLEARANCE'] as const;
export const METAL_COST_PRICE_BASES = ['KG', 'MT', 'FIXED_AMOUNT', 'PERCENTAGE'] as const;
export const METAL_COST_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;

export type MetalCostMetal = (typeof METAL_COST_METALS)[number];
export type MetalCostComponentType = (typeof METAL_COST_COMPONENT_TYPES)[number];
export type MetalCostPriceBasis = (typeof METAL_COST_PRICE_BASES)[number];
export type MetalCostComponentStatus = (typeof METAL_COST_STATUSES)[number];

export type MetalCostComponentInput = {
  metal?: string;
  componentType?: string;
  value?: unknown;
  currency?: string;
  currencyCode?: string;
  priceBasis?: string;
  effectiveFrom?: string | Date;
  effectiveTo?: string | Date | null;
  status?: string;
  reference?: string | null;
  notes?: string | null;
};

export type ParsedMetalCostComponent = {
  metal: MetalCostMetal;
  componentType: MetalCostComponentType;
  value: number;
  currencyCode: string;
  priceBasis: MetalCostPriceBasis;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: MetalCostComponentStatus;
  reference: string | null;
  notes: string | null;
};

function token(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const raw = token(value);
  const aliases: Record<string, string> = {
    ALU: 'ALUMINIUM',
    ALUMINUM: 'ALUMINIUM',
    CU: 'COPPER',
    PER_KG: 'KG',
    PER_MT: 'MT',
    PER_TON: 'MT',
    TON: 'MT',
    FIXED: 'FIXED_AMOUNT',
    FIXEDAMOUNT: 'FIXED_AMOUNT',
    PCT: 'PERCENTAGE',
    PERCENT: 'PERCENTAGE',
    '%': 'PERCENTAGE',
  };
  const mapped = (aliases[raw] || raw) as T;
  if (!allowed.includes(mapped)) {
    throw Object.assign(new Error(`${field} must be one of: ${allowed.join(', ')}.`), { code: 'VALIDATION_ERROR' });
  }
  return mapped;
}

export function parseDateOnly(value: string | Date | null | undefined, field: string, required: boolean): Date | null {
  if (value == null || value === '') {
    if (required) throw Object.assign(new Error(`${field} is required.`), { code: 'VALIDATION_ERROR' });
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw Object.assign(new Error(`${field} is not a valid date.`), { code: 'VALIDATION_ERROR' });
    }
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  let y: number;
  let m: number;
  let d: number;
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw Object.assign(new Error(`${field} is not a valid date.`), { code: 'VALIDATION_ERROR' });
    }
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw Object.assign(new Error(`${field} is not a valid date.`), { code: 'VALIDATION_ERROR' });
  }
  return date;
}

export function periodsOverlap(fromA: Date, toA: Date | null, fromB: Date, toB: Date | null): boolean {
  const endA = toA ?? new Date(Date.UTC(9999, 11, 31));
  const endB = toB ?? new Date(Date.UTC(9999, 11, 31));
  return fromA.getTime() <= endB.getTime() && fromB.getTime() <= endA.getTime();
}

export function parseMetalCostComponentInput(
  input: MetalCostComponentInput,
  options?: { defaultStatus?: MetalCostComponentStatus; forceStatus?: MetalCostComponentStatus }
): ParsedMetalCostComponent {
  const metal = parseEnum(input.metal, METAL_COST_METALS, 'Metal');
  const componentType = parseEnum(input.componentType, METAL_COST_COMPONENT_TYPES, 'Component Type');
  const priceBasis = parseEnum(input.priceBasis, METAL_COST_PRICE_BASES, 'Price Basis');
  const currencyCode = String(input.currencyCode || input.currency || '')
    .trim()
    .toUpperCase();
  if (!currencyCode) {
    throw Object.assign(new Error('Currency is required.'), { code: 'VALIDATION_ERROR' });
  }

  const numeric = typeof input.value === 'number' ? input.value : Number(String(input.value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(numeric)) {
    throw Object.assign(new Error('Value must be a number greater than or equal to 0.'), { code: 'VALIDATION_ERROR' });
  }
  if (numeric < 0) {
    throw Object.assign(new Error('Value cannot be negative.'), { code: 'VALIDATION_ERROR' });
  }

  const effectiveFrom = parseDateOnly(input.effectiveFrom, 'Effective From', true)!;
  const effectiveTo = parseDateOnly(input.effectiveTo ?? null, 'Effective To', false);
  if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
    throw Object.assign(new Error('Effective To cannot be before Effective From.'), { code: 'VALIDATION_ERROR' });
  }

  const status =
    options?.forceStatus ||
    (input.status
      ? parseEnum(input.status, METAL_COST_STATUSES, 'Status')
      : options?.defaultStatus || 'DRAFT');

  const reference = input.reference != null ? String(input.reference).trim() || null : null;
  const notes = input.notes != null ? String(input.notes).trim() || null : null;

  return {
    metal,
    componentType,
    value: numeric,
    currencyCode,
    priceBasis,
    effectiveFrom,
    effectiveTo,
    status,
    reference,
    notes,
  };
}

export function cell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const match = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
    if (match != null && row[match] !== undefined && row[match] !== '') return String(row[match]).trim();
  }
  return '';
}

export function rowToMetalCostComponentInput(row: Record<string, unknown>): MetalCostComponentInput {
  return {
    metal: cell(row, 'Metal'),
    componentType: cell(row, 'Component Type', 'Component'),
    value: cell(row, 'Value'),
    currency: cell(row, 'Currency'),
    priceBasis: cell(row, 'Price Basis', 'Basis'),
    effectiveFrom: cell(row, 'Effective From'),
    effectiveTo: cell(row, 'Effective To') || null,
    status: cell(row, 'Status') || 'DRAFT',
    reference: cell(row, 'Reference') || null,
    notes: cell(row, 'Notes') || null,
  };
}
