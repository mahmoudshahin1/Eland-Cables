import { CableBomRawMaterial, DrumMasterRecord, MasterCableCatalogItem, RawMaterialMasterRecord } from '../types';

export function dec(value: unknown): number {
  if (value == null) return 0;
  return Number(value);
}

export function decOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function cableFromRow(row: {
  id: string;
  materialNumber: string;
  itemCode: string;
  customerCode: string;
  elandItemNumber: string | null;
  description: string;
  family?: string | null;
  voltage: string | null;
  conductor: string | null;
  cores: string | null;
  conductorSize: string | null;
  diameter: unknown;
  weight: unknown;
  status: string;
  sourceBatch: string | null;
}): MasterCableCatalogItem {
  const cross = row.conductorSize ? Number(row.conductorSize) : 0;
  return {
    id: row.id,
    itemCode: row.itemCode,
    cableCode: row.materialNumber,
    customerCode: row.customerCode,
    code: `${row.customerCode} ${row.materialNumber}`,
    description: row.description,
    family: row.family ?? null,
    voltageClass: (row.voltage as MasterCableCatalogItem['voltageClass']) || 'LV',
    conductor: row.conductor === 'Aluminum' ? 'Aluminum' : 'Copper',
    cores: row.cores || '1C',
    crossSectionMm2: Number.isFinite(cross) ? cross : 0,
    outerDiameterMm: dec(row.diameter),
    approxWeightKgKm: dec(row.weight),
    standardPriceUsdPerM: 0,
    priceConfigured: false,
    elandItemNumber: row.elandItemNumber || undefined,
    sourceBatch: row.sourceBatch || undefined,
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
}

export function drumFromRow(row: {
  id: string;
  drumCode: string;
  drumType: string | null;
  description?: string | null;
  flange: unknown;
  barrel: unknown;
  barrelWidth?: unknown;
  innerWidth: unknown;
  outerWidth: unknown;
  usableWidth?: unknown;
  capacity: unknown;
  maxWeight?: unknown;
  clearanceMm?: unknown;
  emptyDrumNetWeightKg?: unknown;
  status: string;
  sourceBatch: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DrumMasterRecord {
  return {
    id: row.id,
    drumCode: row.drumCode,
    drumType: row.drumType || undefined,
    description: row.description || undefined,
    flange: dec(row.flange),
    barrel: dec(row.barrel),
    barrelWidth: decOrNull(row.barrelWidth),
    innerWidth: dec(row.innerWidth),
    outerWidth: dec(row.outerWidth),
    usableWidth: decOrNull(row.usableWidth),
    capacity: dec(row.capacity),
    maxWeight: decOrNull(row.maxWeight),
    clearanceMm: decOrNull(row.clearanceMm),
    emptyDrumNetWeightKg: decOrNull(row.emptyDrumNetWeightKg),
    dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
    capacityUom: 'CONFIGURATION_REQUIRED',
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    sourceBatch: row.sourceBatch || undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rmFromRow(row: {
  code: string;
  description: string;
  shortDescription?: string | null;
  category: string | null;
  pricingCategory?: string | null;
  metalType?: string | null;
  notes?: string | null;
  uom: string;
  currency: string | null;
  priceStatus: string;
  status: string;
  sourceBatch: string | null;
  createdAt: Date;
  updatedAt: Date;
  prices?: Array<{ price: unknown }>;
  supplier?: string | null;
}): RawMaterialMasterRecord {
  const latest = row.prices?.[0];
  const price = latest ? decOrNull(latest.price) : null;
  const configured = row.priceStatus === 'CONFIGURED' && price != null;
  const pricingCategory =
    (row.pricingCategory as RawMaterialMasterRecord['pricingCategory']) || 'STANDARD_RAW_MATERIAL';
  const metalType = (row.metalType as RawMaterialMasterRecord['metalType']) || 'NONE';
  return {
    id: `rm-${row.code}`,
    rawMaterialCode: row.code,
    description: row.description,
    shortDescription: row.shortDescription || undefined,
    uom: row.uom,
    materialType: row.category || undefined,
    category: row.category || undefined,
    pricingCategory,
    metalType,
    notes: row.notes || undefined,
    price: configured ? price : null,
    currency: row.currency || undefined,
    priceStatus: configured ? 'CONFIGURED' : 'PRICE_NOT_CONFIGURED',
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    sourceBatch: row.sourceBatch || undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function bomFromRow(row: {
  id: string;
  cableMaterialNumber: string;
  rawMaterialCode: string;
  itemCode: string | null;
  customerCode: string | null;
  consumption: unknown;
  uom: string;
  sourceBatch: string | null;
  status: string;
  scrapPercent?: number | null;
}): CableBomRawMaterial {
  return {
    id: row.id,
    customerCode: row.customerCode || '',
    itemCode: row.itemCode || undefined,
    cableMaterialNumber: row.cableMaterialNumber,
    rawMaterial: row.rawMaterialCode,
    rawMaterialName: row.rawMaterialCode,
    weight: dec(row.consumption),
    unitKm: row.uom,
    scrapPercent: row.scrapPercent ?? null,
    sourceBatch: row.sourceBatch || undefined,
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
}
