/**
 * V2 Advanced Cable Search — discovery against existing Cable Master.
 * Not an engineering configuration engine. Does not infer compatibility.
 */

export const V2_ADVANCED_CABLE_SEARCH_PAGE_SIZE_CUSTOMER = 50;
export const V2_ADVANCED_CABLE_SEARCH_PAGE_SIZE_INTERNAL = 100;

export type CableSearchMatchMode = 'exact' | 'contains' | 'startsWith';
export type CableSearchSortDir = 'asc' | 'desc';

export const CABLE_SEARCH_SORT_FIELDS = [
  'materialNumber',
  'itemCode',
  'family',
  'voltage',
  'standard',
  'description',
] as const;

export type CableSearchSortField = (typeof CABLE_SEARCH_SORT_FIELDS)[number];

export const CABLE_SEARCH_TEXT_FIELDS = [
  'materialNumber',
  'itemCode',
  'customerCode',
  'family',
  'voltage',
  'standard',
  'conductor',
  'conductorSize',
  'cores',
  'insulation',
  'screen',
  'armour',
  'sheath',
  'description',
] as const;

export type CableSearchTextField = (typeof CABLE_SEARCH_TEXT_FIELDS)[number];

/** Runtime Cable Master columns that are not present — do not invent them. */
export const CABLE_SEARCH_UNAVAILABLE_ON_PG = [
  'voltageClass',
  'conductorClass',
  'screenMaterial',
  'screenCsa',
  'armourMaterial',
  'armourCsa',
  'cpr',
  'cprClass',
] as const;

export interface V2AdvancedCableSearchQuery {
  q?: string;
  matchMode: CableSearchMatchMode;
  materialNumber?: string;
  itemCode?: string;
  customerCode?: string;
  family?: string;
  voltageClass?: string;
  voltage?: string;
  standard?: string;
  conductor?: string;
  conductorSize?: string;
  cores?: string;
  insulation?: string;
  screen?: string;
  armour?: string;
  sheath?: string;
  description?: string;
  diameter?: string;
  weight?: string;
  page: number;
  pageSize: number;
  sortBy: CableSearchSortField;
  sortDir: CableSearchSortDir;
}

export interface V2CableSearchHit {
  materialNumber: string;
  itemCode: string;
  customerCode: string;
  family: string | null;
  voltage: string | null;
  standard: string | null;
  conductor: string | null;
  conductorSize: string | null;
  cores: string | null;
  insulation: string | null;
  screen: string | null;
  armour: string | null;
  sheath: string | null;
  description: string;
  diameterMm: number | null;
  weightKgKm: number | null;
}

export const CABLE_SEARCH_FORBIDDEN_RESULT_KEYS = [
  'standardPriceUsdPerM',
  'priceConfigured',
  'bomDetails',
  'bomRawMaterials',
  'materialCost',
  'costingReadinessStatus',
  'unitPriceUsd',
] as const;

export function trimSearchInput(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\u00a0/g, ' ').trim();
}

export function parseMatchMode(raw: unknown): CableSearchMatchMode {
  const v = trimSearchInput(raw).toLowerCase().replace(/[\s-]/g, '');
  if (v === 'exact') return 'exact';
  if (v === 'startswith') return 'startsWith';
  return 'contains';
}

export function parseSortField(raw: unknown): CableSearchSortField {
  const v = trimSearchInput(raw);
  return (CABLE_SEARCH_SORT_FIELDS as readonly string[]).includes(v)
    ? (v as CableSearchSortField)
    : 'materialNumber';
}

export function parseSortDir(raw: unknown): CableSearchSortDir {
  return trimSearchInput(raw).toLowerCase() === 'desc' ? 'desc' : 'asc';
}

export function parseSearchPage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function parseSearchPageSize(raw: unknown, actorKind: 'customer' | 'internal'): number {
  const cap =
    actorKind === 'customer'
      ? V2_ADVANCED_CABLE_SEARCH_PAGE_SIZE_CUSTOMER
      : V2_ADVANCED_CABLE_SEARCH_PAGE_SIZE_INTERNAL;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return Math.min(25, cap);
  return Math.min(cap, Math.floor(n));
}

export type PrismaInsensitiveStringFilter =
  | { equals: string; mode: 'insensitive' }
  | { contains: string; mode: 'insensitive' }
  | { startsWith: string; mode: 'insensitive' };

export function prismaStringFilter(
  value: unknown,
  mode: CableSearchMatchMode
): PrismaInsensitiveStringFilter | undefined {
  const trimmed = trimSearchInput(value);
  if (!trimmed) return undefined;
  if (mode === 'exact') return { equals: trimmed, mode: 'insensitive' };
  if (mode === 'startsWith') return { startsWith: trimmed, mode: 'insensitive' };
  return { contains: trimmed, mode: 'insensitive' };
}

export function parseAdvancedCableSearchQuery(
  params: Record<string, unknown>,
  actorKind: 'customer' | 'internal'
): V2AdvancedCableSearchQuery {
  const matchMode = parseMatchMode(params.matchMode);
  const pick = (key: string) => {
    const v = trimSearchInput(params[key]);
    return v || undefined;
  };
  return {
    q: pick('q'),
    matchMode,
    materialNumber: pick('materialNumber'),
    itemCode: pick('itemCode'),
    customerCode: pick('customerCode'),
    family: pick('family'),
    voltageClass: pick('voltageClass'),
    voltage: pick('voltage'),
    standard: pick('standard'),
    conductor: pick('conductor'),
    conductorSize: pick('conductorSize'),
    cores: pick('cores'),
    insulation: pick('insulation'),
    screen: pick('screen'),
    armour: pick('armour'),
    sheath: pick('sheath'),
    description: pick('description'),
    diameter: pick('diameter'),
    weight: pick('weight'),
    page: parseSearchPage(params.page),
    pageSize: parseSearchPageSize(params.pageSize, actorKind),
    sortBy: parseSortField(params.sortBy),
    sortDir: parseSortDir(params.sortDir),
  };
}

export function hasAnyAdvancedFilter(query: V2AdvancedCableSearchQuery): boolean {
  return Boolean(
    query.q ||
      query.materialNumber ||
      query.itemCode ||
      query.customerCode ||
      query.family ||
      query.voltageClass ||
      query.voltage ||
      query.standard ||
      query.conductor ||
      query.conductorSize ||
      query.cores ||
      query.insulation ||
      query.screen ||
      query.armour ||
      query.sheath ||
      query.description ||
      query.diameter ||
      query.weight
  );
}

export function toCableSearchHit(row: {
  materialNumber: string;
  itemCode: string;
  customerCode: string;
  family?: string | null;
  voltage?: string | null;
  standard?: string | null;
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  description: string;
  diameter?: unknown;
  weight?: unknown;
}): V2CableSearchHit {
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    materialNumber: row.materialNumber,
    itemCode: row.itemCode,
    customerCode: row.customerCode,
    family: row.family ?? null,
    voltage: row.voltage ?? null,
    standard: row.standard ?? null,
    conductor: row.conductor ?? null,
    conductorSize: row.conductorSize ?? null,
    cores: row.cores ?? null,
    insulation: row.insulation ?? null,
    screen: row.screen ?? null,
    armour: row.armour ?? null,
    sheath: row.sheath ?? null,
    description: row.description,
    diameterMm: num(row.diameter),
    weightKgKm: num(row.weight),
  };
}

export function cableSearchHitHasCostingLeak(hit: object): boolean {
  const keys = Object.keys(hit);
  return CABLE_SEARCH_FORBIDDEN_RESULT_KEYS.some((k) => keys.includes(k));
}

export function publicCableSearchHit(hit: V2CableSearchHit): V2CableSearchHit {
  return toCableSearchHit(hit);
}
