/**
 * Customer Cable Products catalog — read-time mapping over Cable Master.
 * There is no Product Category column. Do not rewrite master rows.
 */

import { CABLE_SEARCH_FORBIDDEN_RESULT_KEYS } from './v2AdvancedCableSearch';

export const CUSTOMER_CATALOG_CATEGORIES = [
  'POWER',
  'CONTROL',
  'INSTRUMENTATION',
  'LV',
  'MV',
  'SPECIAL',
] as const;

export type CustomerCatalogCategory = (typeof CUSTOMER_CATALOG_CATEGORIES)[number];

export const CUSTOMER_CATALOG_PAGE_SIZES = [25, 50, 100] as const;
export const CUSTOMER_CATALOG_DEFAULT_PAGE_SIZE = 50;
export const CUSTOMER_CATALOG_EXPORT_ROW_CAP = 10_000;

export const CUSTOMER_CATALOG_SORT_FIELDS = [
  'material',
  'description',
  'voltage',
  'conductor',
  'size',
  'recent',
] as const;

export type CustomerCatalogSortField = (typeof CUSTOMER_CATALOG_SORT_FIELDS)[number];
export type CustomerCatalogSortDir = 'asc' | 'desc';

export type CustomerCatalogCategoryMeta = {
  id: CustomerCatalogCategory;
  title: string;
  crumb: string;
  subtitle: string;
  tileId: string;
  imageSrc: string;
  voltageClassHint: string | null;
};

export const CUSTOMER_CATALOG_CATEGORY_META: Record<CustomerCatalogCategory, CustomerCatalogCategoryMeta> = {
  POWER: {
    id: 'POWER',
    title: 'Power Cables',
    crumb: 'Power Cables',
    subtitle: 'Power cables for electrical distribution.',
    tileId: 'power',
    imageSrc: '/customer-home/categories/power-cables.jpg',
    voltageClassHint: null,
  },
  CONTROL: {
    id: 'CONTROL',
    title: 'Control Cables',
    crumb: 'Control Cables',
    subtitle: 'Control cables for industrial signalling and control circuits.',
    tileId: 'control',
    imageSrc: '/customer-home/categories/control-cables.jpg',
    voltageClassHint: null,
  },
  INSTRUMENTATION: {
    id: 'INSTRUMENTATION',
    title: 'Instrumentation Cables',
    crumb: 'Instrumentation Cables',
    subtitle: 'Instrumentation cables for measurement and process signals.',
    tileId: 'instrumentation',
    imageSrc: '/customer-home/categories/instrumentation-cables.jpg',
    voltageClassHint: null,
  },
  LV: {
    id: 'LV',
    title: 'LV Cables',
    crumb: 'LV Cables',
    subtitle: 'Low voltage cables for power distribution.',
    tileId: 'lv',
    imageSrc: '/customer-home/categories/lv-cables.jpg',
    voltageClassHint: 'LV',
  },
  MV: {
    id: 'MV',
    title: 'MV Cables',
    crumb: 'MV Cables',
    subtitle: 'Medium voltage cables for reliable power distribution.',
    tileId: 'mv',
    imageSrc: '/customer-home/categories/mv-cables.jpg',
    voltageClassHint: 'MV',
  },
  SPECIAL: {
    id: 'SPECIAL',
    title: 'Special Cables',
    crumb: 'Special Cables',
    subtitle: 'Special-purpose cables for demanding applications.',
    tileId: 'special',
    imageSrc: '/customer-home/categories/special-cables.jpg',
    voltageClassHint: null,
  },
};

const TILE_TO_CATEGORY: Record<string, CustomerCatalogCategory> = {
  power: 'POWER',
  control: 'CONTROL',
  instrumentation: 'INSTRUMENTATION',
  lv: 'LV',
  mv: 'MV',
  special: 'SPECIAL',
};

export function parseCustomerCatalogCategory(raw: unknown): CustomerCatalogCategory | null {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+CABLES?$/i, '')
    .replace(/[\s-]+/g, '_');
  if ((CUSTOMER_CATALOG_CATEGORIES as readonly string[]).includes(value)) {
    return value as CustomerCatalogCategory;
  }
  const fromTile = TILE_TO_CATEGORY[String(raw || '').trim().toLowerCase()];
  return fromTile || null;
}

/**
 * Family/voltage keys used for a category filter.
 * POWER = LV ∪ MV because those are the only power-distribution families stored today.
 * CONTROL / INSTRUMENTATION / SPECIAL have no family values in current Cable Master.
 */
export function catalogCategoryFamilyKeys(category: CustomerCatalogCategory): string[] {
  switch (category) {
    case 'POWER':
      return ['LV', 'MV'];
    case 'LV':
      return ['LV'];
    case 'MV':
      return ['MV'];
    case 'CONTROL':
      return ['CONTROL'];
    case 'INSTRUMENTATION':
      return ['INSTRUMENT'];
    case 'SPECIAL':
      return ['SPECIAL'];
    default:
      return [];
  }
}

export function parseCatalogPage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function parseCatalogPageSize(raw: unknown): number {
  const n = Number(raw);
  if ((CUSTOMER_CATALOG_PAGE_SIZES as readonly number[]).includes(n)) return n;
  return CUSTOMER_CATALOG_DEFAULT_PAGE_SIZE;
}

export function parseCatalogSortField(raw: unknown): CustomerCatalogSortField {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'materialnumber' || v === 'material') return 'material';
  if ((CUSTOMER_CATALOG_SORT_FIELDS as readonly string[]).includes(v)) {
    return v as CustomerCatalogSortField;
  }
  return 'material';
}

export function parseCatalogSortDir(raw: unknown, sortBy?: CustomerCatalogSortField): CustomerCatalogSortDir {
  if (String(raw || '').trim().toLowerCase() === 'desc') return 'desc';
  if (String(raw || '').trim().toLowerCase() === 'asc') return 'asc';
  return sortBy === 'recent' ? 'desc' : 'asc';
}

export function catalogPrismaSort(sortBy: CustomerCatalogSortField): {
  field: 'materialNumber' | 'description' | 'voltage' | 'conductor' | 'conductorSize' | 'createdAt';
  dir: 'asc' | 'desc';
} {
  switch (sortBy) {
    case 'description':
      return { field: 'description', dir: 'asc' };
    case 'voltage':
      return { field: 'voltage', dir: 'asc' };
    case 'conductor':
      return { field: 'conductor', dir: 'asc' };
    case 'size':
      return { field: 'conductorSize', dir: 'asc' };
    case 'recent':
      return { field: 'createdAt', dir: 'desc' };
    default:
      return { field: 'materialNumber', dir: 'asc' };
  }
}

export type CableConstructionDisplay = {
  conductor: string | null;
  conductorSize: string | null;
  cores: string | null;
  insulation: string | null;
  screen: string | null;
  armour: string | null;
  sheath: string | null;
  standard: string | null;
};

const CONDUCTOR_TOKEN: Record<string, string> = {
  cu: 'Copper',
  copper: 'Copper',
  al: 'Aluminium',
  aluminum: 'Aluminium',
  aluminium: 'Aluminium',
  aluminuim: 'Aluminium',
};

/** Aliases so a facet value still matches stored column variants and description tokens. */
export function catalogFilterAliases(field: string, value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const key = trimmed.toLowerCase();
  if (field === 'conductor') {
    if (key === 'copper' || key === 'cu') return ['Copper', 'CU', 'Cu'];
    if (key === 'aluminium' || key === 'aluminum' || key === 'aluminuim' || key === 'al') {
      return ['Aluminium', 'Aluminum', 'Aluminuim', 'Al'];
    }
  }
  return [trimmed];
}

/**
 * Presentation-only parse of Energya Cable Master description text.
 * Does not write Cable Master. Used when construction columns are blank.
 */
export function parseCableDescriptionConstruction(description: string | null | undefined): CableConstructionDisplay {
  const empty: CableConstructionDisplay = {
    conductor: null,
    conductorSize: null,
    cores: null,
    insulation: null,
    screen: null,
    armour: null,
    sheath: null,
    standard: null,
  };
  const text = String(description || '').trim();
  if (!text) return empty;

  const parts = text.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  const first = (parts[0] || '').split(/\s+/)[0] || '';
  const conductor = CONDUCTOR_TOKEN[first.toLowerCase()] || null;

  let insulation: string | null = null;
  let armour: string | null = null;
  let sheath: string | null = null;
  let screen: string | null = null;
  for (const part of parts.slice(1)) {
    const token = part.split(/\s+/)[0] || '';
    const upper = token.toUpperCase();
    if (!insulation && /^(XLPE|PVC|EPR|PE)$/i.test(token)) insulation = token.toUpperCase() === 'XLPE' ? 'XLPE' : token;
    else if (/^(SWA|AWA|STA)$/i.test(token)) armour = upper;
    else if (/^(MDPE|HDPE|LSHF|LSZH|LSHF|PVC|PE)$/i.test(token)) sheath = upper === 'LSHF' || upper === 'LSZH' ? token.toUpperCase() : token;
    else if (/^(CWS|CTS)$/i.test(token) || /^cws$/i.test(token)) screen = upper === 'CWS' ? 'CWS' : token;
  }
  if (/\bcws\b/i.test(text) && !screen) screen = 'CWS';

  const coresMatch = text.match(/(\d+)\s*[Xx]\s*\d+/);
  const sizeMatch = text.match(/(\d+)\s*(?:\/\d+)?\s*mm2/i);
  const standardMatch = text.match(/IEC\s*[\d. -]+/i);

  return {
    conductor,
    conductorSize: sizeMatch ? sizeMatch[1] : null,
    cores: coresMatch ? coresMatch[1] : null,
    insulation,
    screen,
    armour,
    sheath,
    standard: standardMatch ? standardMatch[0].replace(/\s+/g, ' ').trim() : null,
  };
}

export function mergeCableConstructionDisplay(row: {
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  standard?: string | null;
  description?: string | null;
}): CableConstructionDisplay {
  const parsed = parseCableDescriptionConstruction(row.description);
  const pick = (stored: string | null | undefined, fallback: string | null) => {
    const v = String(stored || '').trim();
    return v || fallback;
  };
  return {
    conductor: pick(row.conductor, parsed.conductor),
    conductorSize: pick(row.conductorSize, parsed.conductorSize),
    cores: pick(row.cores, parsed.cores),
    insulation: pick(row.insulation, parsed.insulation),
    screen: pick(row.screen, parsed.screen),
    armour: pick(row.armour, parsed.armour),
    sheath: pick(row.sheath, parsed.sheath),
    standard: pick(row.standard, parsed.standard),
  };
}

export function formatCatalogSize(size: string | null | undefined): string {
  const v = String(size || '').trim();
  if (!v) return '—';
  if (/mm/i.test(v)) return v.replace(/mm2/i, 'mm²');
  return `${v} mm²`;
}

export function formatCatalogCores(cores: string | null | undefined): string {
  const v = String(cores || '').trim();
  if (!v) return '—';
  return v.replace(/c$/i, '');
}

export function catalogProductHasCostingLeak(product: object): boolean {
  const keys = Object.keys(product);
  return CABLE_SEARCH_FORBIDDEN_RESULT_KEYS.some((k) => keys.includes(k));
}

export function catalogShowingLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0) return 'Showing 0 of 0';
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `Showing ${start.toLocaleString()} – ${end.toLocaleString()} of ${total.toLocaleString()} products`;
}

export function catalogPageWindow(page: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) {
    return Array.from({ length: Math.max(pageCount, 0) }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1, 2, 3, 4, 5]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: Array<number | 'ellipsis'> = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === 'number' && p - prev > 1) out.push('ellipsis');
    out.push(p);
  }
  return out;
}

export type CustomerCatalogProduct = {
  materialNumber: string;
  itemCode: string;
  customerCode: string;
  description: string;
  family: string | null;
  voltage: string | null;
  conductor: string | null;
  conductorSize: string | null;
  cores: string | null;
  insulation: string | null;
  screen: string | null;
  armour: string | null;
  sheath: string | null;
  standard: string | null;
  diameterMm: number | null;
  weightKgKm: number | null;
  display: CableConstructionDisplay;
};

export function toCustomerCatalogProduct(row: {
  materialNumber: string;
  itemCode: string;
  customerCode: string;
  description: string;
  family?: string | null;
  voltage?: string | null;
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  standard?: string | null;
  diameter?: unknown;
  weight?: unknown;
}): CustomerCatalogProduct {
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const display = mergeCableConstructionDisplay(row);
  return {
    materialNumber: row.materialNumber,
    itemCode: row.itemCode,
    customerCode: row.customerCode,
    description: row.description,
    family: row.family ?? null,
    voltage: row.voltage ?? null,
    conductor: row.conductor ?? null,
    conductorSize: row.conductorSize ?? null,
    cores: row.cores ?? null,
    insulation: row.insulation ?? null,
    screen: row.screen ?? null,
    armour: row.armour ?? null,
    sheath: row.sheath ?? null,
    standard: row.standard ?? null,
    diameterMm: num(row.diameter),
    weightKgKm: num(row.weight),
    display,
  };
}
