import { Prisma } from '@prisma/client';
import { appendAudit } from '../platform/audit/auditLogService';
import {
  CableBomRawMaterial,
  DrumMasterRecord,
  ImportBatchRecord,
  MasterCableCatalogItem,
  RawMaterialMasterRecord,
} from '../types';
import {
  catalogCategoryFamilyKeys,
  catalogFilterAliases,
  catalogPrismaSort,
  catalogProductHasCostingLeak,
  CUSTOMER_CATALOG_EXPORT_ROW_CAP,
  parseCableDescriptionConstruction,
  parseCatalogPage,
  parseCatalogPageSize,
  parseCatalogSortDir,
  parseCatalogSortField,
  parseCustomerCatalogCategory,
  toCustomerCatalogProduct,
} from '../domain/customerCableCatalog';
import { getPrisma } from './db';
import { bomFromRow, cableFromRow, drumFromRow, rmFromRow } from './masterDataDto';
import { isOfficialEnergyaCableMasterSource } from '../domain/importedCableCalculationAuthority';

export class PersistenceUnavailableError extends Error {
  constructor() {
    super('PostgreSQL is not configured or not reachable.');
    this.name = 'PersistenceUnavailableError';
  }
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new PersistenceUnavailableError();
  return prisma;
}

/** Inquiry / catalog family chips (LV, MV, HV, Control) vs stored family/voltage/description. */
export function cableFamilyFilterWhere(family: string): Prisma.CableMasterWhereInput {
  const value = family.trim();
  const key = value.toUpperCase();
  const contains = (text: string): Prisma.StringFilter => ({ contains: text, mode: 'insensitive' });
  const or: Prisma.CableMasterWhereInput[] = [{ family: contains(value) }, { voltage: contains(value) }];
  if (key === 'LV') {
    or.push(
      { family: contains('L.V') },
      { family: contains('LOW VOLTAGE') },
      { description: contains('0.6/1') },
      { description: contains('600/1000') }
    );
  } else if (key === 'MV') {
    or.push(
      { family: contains('M.V') },
      { family: contains('MEDIUM VOLTAGE') },
      { description: contains('6/10') },
      { description: contains('8.7/15') },
      { description: contains('11 KV') },
      { description: contains('12/20') },
      { description: contains('18/30') },
      { description: contains('33 KV') }
    );
  } else if (key === 'HV') {
    or.push(
      { family: contains('H.V') },
      { family: contains('HIGH VOLTAGE') },
      { description: contains('66 KV') },
      { description: contains('132 KV') },
      { description: contains('220 KV') }
    );
  } else if (key === 'CONTROL') {
    or.push(
      { family: contains('INSTRUMENT') },
      { description: contains('CONTROL') },
      { description: contains('INSTRUMENT') }
    );
  }
  return { OR: or };
}

export async function searchCables(query: {
  q?: string;
  customerCode?: string;
  itemCode?: string;
  materialNumber?: string;
  family?: string;
  voltage?: string;
  conductor?: string;
  cores?: string;
  diameter?: string;
  page?: number;
  pageSize?: number;
}) {
  const prisma = requirePrisma();
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize || 25));
  const contains = (value?: string) =>
    value && value.trim() ? { contains: value.trim(), mode: 'insensitive' as const } : undefined;

  const and: Prisma.CableMasterWhereInput[] = [{ status: 'ACTIVE' }];
  if (query.customerCode) and.push({ customerCode: contains(query.customerCode)! });
  if (query.itemCode) and.push({ itemCode: contains(query.itemCode)! });
  if (query.materialNumber) and.push({ materialNumber: contains(query.materialNumber)! });
  if (query.family) and.push(cableFamilyFilterWhere(query.family));
  if (query.voltage) and.push({ voltage: contains(query.voltage)! });
  if (query.conductor) and.push({ conductor: contains(query.conductor)! });
  if (query.cores) and.push({ cores: contains(query.cores)! });
  if (query.diameter && Number.isFinite(Number(query.diameter))) {
    and.push({ diameter: Number(query.diameter) });
  }
  if (query.q && query.q.trim()) {
    const q = query.q.trim();
    and.push({
      OR: [
        { customerCode: { contains: q, mode: 'insensitive' } },
        { itemCode: { contains: q, mode: 'insensitive' } },
        { materialNumber: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { family: { contains: q, mode: 'insensitive' } },
        { voltage: { contains: q, mode: 'insensitive' } },
        { conductor: { contains: q, mode: 'insensitive' } },
        { cores: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.CableMasterWhereInput = { AND: and };
  const [total, rows] = await prisma.$transaction([
    prisma.cableMaster.count({ where }),
    prisma.cableMaster.findMany({
      where,
      orderBy: { materialNumber: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, cables: rows.map(cableFromRow) };
}

export async function advancedSearchCables(
  query: import('../domain/v2AdvancedCableSearch').V2AdvancedCableSearchQuery
) {
  const prisma = requirePrisma();
  const {
    prismaStringFilter,
    toCableSearchHit,
  } = await import('../domain/v2AdvancedCableSearch');
  const mode = query.matchMode;
  const and: Prisma.CableMasterWhereInput[] = [{ status: 'ACTIVE' }];
  const pushText = (field: keyof Prisma.CableMasterWhereInput, value?: string) => {
    const filter = prismaStringFilter(value, mode);
    if (filter) and.push({ [field]: filter } as Prisma.CableMasterWhereInput);
  };
  pushText('materialNumber', query.materialNumber);
  pushText('itemCode', query.itemCode);
  pushText('customerCode', query.customerCode);
  pushText('family', query.family);
  pushText('voltage', query.voltage);
  pushText('standard', query.standard);
  pushText('conductor', query.conductor);
  pushText('conductorSize', query.conductorSize);
  pushText('cores', query.cores);
  pushText('insulation', query.insulation);
  pushText('screen', query.screen);
  pushText('armour', query.armour);
  pushText('sheath', query.sheath);
  pushText('description', query.description);
  if (query.voltageClass) and.push(cableFamilyFilterWhere(query.voltageClass));
  if (query.diameter && Number.isFinite(Number(query.diameter))) {
    and.push({ diameter: Number(query.diameter) });
  }
  if (query.weight && Number.isFinite(Number(query.weight))) {
    and.push({ weight: Number(query.weight) });
  }
  if (query.q) {
    const filter = prismaStringFilter(query.q, mode);
    if (filter) {
      and.push({
        OR: [
          { materialNumber: filter },
          { itemCode: filter },
          { customerCode: filter },
          { description: filter },
          { family: filter },
          { voltage: filter },
          { standard: filter },
          { conductor: filter },
          { cores: filter },
        ],
      });
    }
  }
  const where: Prisma.CableMasterWhereInput = { AND: and };
  const [total, rows] = await prisma.$transaction([
    prisma.cableMaster.count({ where }),
    prisma.cableMaster.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        materialNumber: true,
        itemCode: true,
        customerCode: true,
        family: true,
        voltage: true,
        standard: true,
        conductor: true,
        conductorSize: true,
        cores: true,
        insulation: true,
        screen: true,
        armour: true,
        sheath: true,
        description: true,
        diameter: true,
        weight: true,
      },
    }),
  ]);
  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    matchMode: query.matchMode,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    cables: rows.map(toCableSearchHit),
    searchKind: 'CABLE_MASTER_DISCOVERY' as const,
    compatibilityInferred: false,
  };
}

export async function listCableSearchFacets() {
  const prisma = requirePrisma();
  const distinct = async (field: 'family' | 'voltage' | 'standard' | 'conductor' | 'cores' | 'insulation' | 'screen' | 'armour' | 'sheath') => {
    const rows = await prisma.cableMaster.findMany({
      where: { status: 'ACTIVE', [field]: { not: null } },
      distinct: [field],
      select: { [field]: true },
      take: 200,
      orderBy: { [field]: 'asc' },
    });
    return rows
      .map((r) => (r as unknown as Record<string, string | null>)[field])
      .filter((v): v is string => Boolean(v && String(v).trim()));
  };
  const [family, voltage, standard, conductor, cores, insulation, screen, armour, sheath] = await Promise.all([
    distinct('family'),
    distinct('voltage'),
    distinct('standard'),
    distinct('conductor'),
    distinct('cores'),
    distinct('insulation'),
    distinct('screen'),
    distinct('armour'),
    distinct('sheath'),
  ]);
  return {
    family,
    voltage,
    standard,
    conductor,
    cores,
    insulation,
    screen,
    armour,
    sheath,
    note: 'Distinct values from existing Cable Master rows. Not a compatibility matrix.',
  };
}

export type CustomerCableProductQuery = {
  category?: string;
  q?: string;
  voltageClass?: string;
  voltage?: string;
  conductor?: string;
  conductorSize?: string;
  cores?: string;
  insulation?: string;
  screen?: string;
  armour?: string;
  sheath?: string;
  standard?: string;
  sheathColour?: string;
  coreColour?: string;
  diameter?: string;
  weight?: string;
  specialAdditives?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: string;
};

function catalogTextContains(value?: string): Prisma.StringFilter | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return { contains: trimmed, mode: 'insensitive' };
}

function pushCatalogFieldFilter(
  and: Prisma.CableMasterWhereInput[],
  field: 'voltage' | 'conductor' | 'conductorSize' | 'cores' | 'insulation' | 'screen' | 'armour' | 'sheath' | 'standard' | 'sheathColour' | 'coreColour' | 'specialAdditives',
  value?: string
) {
  const aliases = catalogFilterAliases(field, value || '');
  if (!aliases.length) return;
  const or: Prisma.CableMasterWhereInput[] = [];
  for (const alias of aliases) {
    or.push({ [field]: { contains: alias, mode: 'insensitive' } } as Prisma.CableMasterWhereInput);
    or.push({ description: { contains: alias, mode: 'insensitive' } });
  }
  and.push({ OR: or });
}

function customerCatalogCategoryWhere(category: string | undefined): Prisma.CableMasterWhereInput | undefined {
  const parsed = parseCustomerCatalogCategory(category);
  if (!parsed) return undefined;
  const keys = catalogCategoryFamilyKeys(parsed);
  const or: Prisma.CableMasterWhereInput[] = [];
  for (const key of keys) {
    const clause = cableFamilyFilterWhere(key);
    if (clause.OR) or.push(...clause.OR);
    else or.push(clause);
  }
  return or.length ? { OR: or } : undefined;
}

function customerCatalogWhere(query: CustomerCableProductQuery): Prisma.CableMasterWhereInput {
  const and: Prisma.CableMasterWhereInput[] = [{ status: 'ACTIVE' }];
  const categoryWhere = customerCatalogCategoryWhere(query.category);
  if (categoryWhere) and.push(categoryWhere);
  if (query.voltageClass) and.push(cableFamilyFilterWhere(query.voltageClass));
  pushCatalogFieldFilter(and, 'voltage', query.voltage);
  pushCatalogFieldFilter(and, 'conductor', query.conductor);
  pushCatalogFieldFilter(and, 'conductorSize', query.conductorSize);
  pushCatalogFieldFilter(and, 'cores', query.cores);
  pushCatalogFieldFilter(and, 'insulation', query.insulation);
  pushCatalogFieldFilter(and, 'screen', query.screen);
  pushCatalogFieldFilter(and, 'armour', query.armour);
  pushCatalogFieldFilter(and, 'sheath', query.sheath);
  pushCatalogFieldFilter(and, 'standard', query.standard);
  pushCatalogFieldFilter(and, 'sheathColour', query.sheathColour);
  pushCatalogFieldFilter(and, 'coreColour', query.coreColour);
  pushCatalogFieldFilter(and, 'specialAdditives', query.specialAdditives);
  if (query.diameter && Number.isFinite(Number(query.diameter))) {
    and.push({ diameter: Number(query.diameter) });
  }
  if (query.weight && Number.isFinite(Number(query.weight))) {
    and.push({ weight: Number(query.weight) });
  }
  const q = query.q?.trim();
  if (q) {
    and.push({
      OR: [
        { materialNumber: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { itemCode: { contains: q, mode: 'insensitive' } },
        { customerCode: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  return { AND: and };
}

const CUSTOMER_CATALOG_SELECT = {
  materialNumber: true,
  itemCode: true,
  customerCode: true,
  description: true,
  family: true,
  voltage: true,
  conductor: true,
  conductorSize: true,
  cores: true,
  insulation: true,
  screen: true,
  armour: true,
  sheath: true,
  standard: true,
  diameter: true,
  weight: true,
} as const;

export async function listCustomerCableProducts(query: CustomerCableProductQuery) {
  const prisma = requirePrisma();
  const page = parseCatalogPage(query.page);
  const pageSize = parseCatalogPageSize(query.pageSize);
  const sortBy = parseCatalogSortField(query.sortBy);
  const sortDir = parseCatalogSortDir(query.sortDir, sortBy);
  const prismaSort = catalogPrismaSort(sortBy);
  const where = customerCatalogWhere(query);
  const [total, rows] = await prisma.$transaction([
    prisma.cableMaster.count({ where }),
    prisma.cableMaster.findMany({
      where,
      orderBy: { [prismaSort.field]: query.sortDir ? sortDir : prismaSort.dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: CUSTOMER_CATALOG_SELECT,
    }),
  ]);
  const cables = rows.map(toCustomerCatalogProduct);
  if (cables.some((c) => catalogProductHasCostingLeak(c))) {
    throw new Error('Catalog result contained forbidden costing fields.');
  }
  return {
    total,
    page,
    pageSize,
    sortBy,
    sortDir: query.sortDir ? sortDir : prismaSort.dir,
    category: parseCustomerCatalogCategory(query.category),
    cables,
    searchKind: 'CABLE_MASTER_CATALOG' as const,
  };
}

export async function listCustomerCableProductFacets() {
  const prisma = requirePrisma();
  const distinct = async (
    field:
      | 'family'
      | 'voltage'
      | 'standard'
      | 'conductor'
      | 'conductorSize'
      | 'cores'
      | 'insulation'
      | 'screen'
      | 'armour'
      | 'sheath'
      | 'sheathColour'
      | 'coreColour'
      | 'specialAdditives'
  ) => {
    const rows = await prisma.cableMaster.findMany({
      where: { status: 'ACTIVE', [field]: { not: null } },
      distinct: [field],
      select: { [field]: true },
      take: 200,
      orderBy: { [field]: 'asc' },
    });
    return rows
      .map((r) => (r as unknown as Record<string, string | null>)[field])
      .filter((v): v is string => Boolean(v && String(v).trim()));
  };

  const [
    family,
    voltage,
    standard,
    conductor,
    conductorSize,
    cores,
    insulation,
    screen,
    armour,
    sheath,
    sheathColour,
    coreColour,
    specialAdditives,
  ] = await Promise.all([
    distinct('family'),
    distinct('voltage'),
    distinct('standard'),
    distinct('conductor'),
    distinct('conductorSize'),
    distinct('cores'),
    distinct('insulation'),
    distinct('screen'),
    distinct('armour'),
    distinct('sheath'),
    distinct('sheathColour'),
    distinct('coreColour'),
    distinct('specialAdditives'),
  ]);

  const sparseDescriptions = await prisma.cableMaster.findMany({
    where: { status: 'ACTIVE', OR: [{ conductor: null }, { conductorSize: null }, { cores: null }, { standard: null }] },
    select: { description: true, conductor: true, conductorSize: true, cores: true, insulation: true, screen: true, armour: true, sheath: true, standard: true },
    take: 10_000,
  });
  const extra = {
    conductor: new Set(conductor),
    conductorSize: new Set(conductorSize),
    cores: new Set(cores),
    insulation: new Set(insulation),
    screen: new Set(screen),
    armour: new Set(armour),
    sheath: new Set(sheath),
    standard: new Set(standard),
  };
  for (const row of sparseDescriptions) {
    const parsed = parseCableDescriptionConstruction(row.description);
    if (parsed.conductor) extra.conductor.add(parsed.conductor);
    if (parsed.conductorSize) extra.conductorSize.add(parsed.conductorSize);
    if (parsed.cores) extra.cores.add(parsed.cores);
    if (parsed.insulation) extra.insulation.add(parsed.insulation);
    if (parsed.screen) extra.screen.add(parsed.screen);
    if (parsed.armour) extra.armour.add(parsed.armour);
    if (parsed.sheath) extra.sheath.add(parsed.sheath);
    if (parsed.standard) extra.standard.add(parsed.standard);
  }

  const sortValues = (values: Iterable<string>) =>
    [...values].filter((v) => v && v.trim()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const [totalActive, mappedLv, mappedMv, mappedControl, mappedInstrument, mappedSpecial, mappedPower] =
    await Promise.all([
      prisma.cableMaster.count({ where: { status: 'ACTIVE' } }),
      prisma.cableMaster.count({ where: { status: 'ACTIVE', AND: [customerCatalogCategoryWhere('LV')!] } }),
      prisma.cableMaster.count({ where: { status: 'ACTIVE', AND: [customerCatalogCategoryWhere('MV')!] } }),
      prisma.cableMaster.count({ where: { status: 'ACTIVE', AND: [customerCatalogCategoryWhere('CONTROL')!] } }),
      prisma.cableMaster.count({
        where: { status: 'ACTIVE', AND: [customerCatalogCategoryWhere('INSTRUMENTATION')!] },
      }),
      prisma.cableMaster.count({ where: { status: 'ACTIVE', AND: [customerCatalogCategoryWhere('SPECIAL')!] } }),
      prisma.cableMaster.count({ where: { status: 'ACTIVE', AND: [customerCatalogCategoryWhere('POWER')!] } }),
    ]);

  const unmappedCount = Math.max(0, totalActive - mappedPower);

  return {
    productCategory: ['POWER', 'CONTROL', 'INSTRUMENTATION', 'LV', 'MV', 'SPECIAL'],
    voltageClass: family,
    voltage,
    conductor: sortValues(extra.conductor),
    conductorSize: sortValues(extra.conductorSize),
    cores: sortValues(extra.cores),
    insulation: sortValues(extra.insulation),
    screen: sortValues(extra.screen),
    armour: sortValues(extra.armour),
    sheath: sortValues(extra.sheath),
    standard: sortValues(extra.standard),
    sheathColour,
    coreColour,
    specialAdditives,
    mapping: {
      productCategoryField: false,
      mappedBy: 'family_voltage',
      familiesPresent: family,
      categoryCounts: {
        POWER: mappedPower,
        CONTROL: mappedControl,
        INSTRUMENTATION: mappedInstrument,
        LV: mappedLv,
        MV: mappedMv,
        SPECIAL: mappedSpecial,
      },
      unmappedCount,
      note:
        'No Product Category column on Cable Master. Categories are a non-destructive family/voltage query mapping. CONTROL/INSTRUMENTATION/SPECIAL match family contains those tokens only.',
    },
    note: 'Distinct values from existing Cable Master rows (columns + description tokens). Not a compatibility matrix.',
  };
}

export async function exportCustomerCableProducts(query: CustomerCableProductQuery) {
  const prisma = requirePrisma();
  const where = customerCatalogWhere(query);
  const rows = await prisma.cableMaster.findMany({
    where,
    orderBy: { materialNumber: 'asc' },
    take: CUSTOMER_CATALOG_EXPORT_ROW_CAP,
    select: CUSTOMER_CATALOG_SELECT,
  });
  const cables = rows.map(toCustomerCatalogProduct);
  const category = parseCustomerCatalogCategory(query.category);
  return { cables, category, truncated: rows.length === CUSTOMER_CATALOG_EXPORT_ROW_CAP };
}

export async function listCables() {
  const prisma = requirePrisma();
  const rows = await prisma.cableMaster.findMany({ orderBy: { materialNumber: 'asc' } });
  return rows.map(cableFromRow);
}

export async function listCompatibility() {
  const prisma = requirePrisma();
  return prisma.parameterCompatibility.findMany();
}

export async function evaluatePersistedCable(config: import('../domain/cableAuthority').CableConfigInput) {
  const prisma = requirePrisma();
  const [cables, parameters, compatibility, approvedMappings] = await Promise.all([
    prisma.cableMaster.findMany({ where: { status: 'ACTIVE' } }),
    prisma.cableParameter.findMany({ where: { status: 'ACTIVE' } }),
    prisma.parameterCompatibility.findMany(),
    prisma.cableEngineeringMapping.findMany({ where: { status: 'APPROVED', isCurrent: true } }),
  ]);
  const approvedMap = new Map(approvedMappings.map((m) => [m.materialNumber.toLowerCase(), m]));
  const { evaluateCableAuthority } = await import('../domain/cableAuthority');
  return evaluateCableAuthority(config, {
    cables: cables.map((row) => {
      const approved = approvedMap.get(row.materialNumber.toLowerCase());
      return {
        id: row.id,
        materialNumber: row.materialNumber,
        itemCode: row.itemCode,
        customerCode: row.customerCode,
        description: row.description,
        family: approved ? approved.family : row.family,
        voltage: approved ? approved.voltage : row.voltage,
        conductor: approved ? approved.conductor : row.conductor,
        conductorSize: approved ? approved.conductorSize : row.conductorSize,
        cores: approved ? approved.cores : row.cores,
        insulation: approved ? approved.insulation : row.insulation,
        screen: approved ? approved.screen : row.screen,
        armour: approved ? approved.armour : row.armour,
        sheath: approved ? approved.sheath : row.sheath,
        sheathColour: approved ? approved.sheathColour : row.sheathColour,
        coreColour: approved ? approved.coreColour : row.coreColour,
        diameter: row.diameter != null ? Number(row.diameter) : null,
        status: row.status,
        approvalStatus: approved ? 'APPROVED_MAPPING' : row.approvalStatus,
      };
    }),
    parameters,
    compatibility,
  });
}

export async function createTechnicalOfficeRequest(input: {
  requestNumber: string;
  canonicalStatus: string;
  displayStatus: string;
  configuration: unknown;
  customer?: string;
  quantity?: string;
  cuttingLength?: string;
  requestedDate?: string;
  requesterId?: string;
  requesterName?: string;
  requesterEmail?: string;
  reason: string;
}) {
  const prisma = requirePrisma();
  return prisma.technicalOfficeRequest.create({
    data: {
      requestNumber: input.requestNumber,
      canonicalStatus: input.canonicalStatus,
      displayStatus: input.displayStatus,
      configuration: input.configuration as Prisma.InputJsonValue,
      customer: input.customer,
      quantity: input.quantity,
      cuttingLength: input.cuttingLength,
      requestedDate: input.requestedDate,
      requesterId: input.requesterId,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      reason: input.reason,
    },
  });
}

export async function listTechnicalOfficeRequests() {
  const prisma = requirePrisma();
  return prisma.technicalOfficeRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function getCable(materialNumber: string) {
  const prisma = requirePrisma();
  const row = await prisma.cableMaster.findUnique({ where: { materialNumber } });
  return row ? cableFromRow(row) : null;
}

export async function listBoms() {
  const prisma = requirePrisma();
  const [rows, governed] = await Promise.all([
    prisma.cableBomLine.findMany({ orderBy: [{ cableMaterialNumber: 'asc' }, { rawMaterialCode: 'asc' }] }),
    prisma.governedBomLine.findMany({
      where: { status: 'APPROVED' },
      select: { cableMaterialNumber: true, rawMaterialCode: true, bomVersion: true, scrapPercentage: true },
    }),
  ]);

  const scrapByLine = new Map<string, number | null>();
  for (const g of governed) {
    if (g.scrapPercentage == null) continue;
    const key = `${g.cableMaterialNumber}|${g.rawMaterialCode}|${g.bomVersion}`;
    scrapByLine.set(key, Math.round(Number(g.scrapPercentage) * 10000) / 100);
  }

  return rows.map((row) => {
    const key = `${row.cableMaterialNumber}|${row.rawMaterialCode}|${row.bomVersion}`;
    return bomFromRow({
      ...row,
      scrapPercent: scrapByLine.get(key) ?? null,
    });
  });
}

export async function persistCableBomExcelCommit(args: {
  lines: CableBomRawMaterial[];
  replaceCableMaterialNumbers: string[];
  duplicateObservations?: Array<{
    cableMaterialNumber: string;
    rawMaterialCode: string;
    weightA: number;
    weightB: number;
    occurrenceCount: number;
    sourceWorksheet?: string;
    sourceFile?: string;
    sourceRowNumbers: number[];
    classification: string;
  }>;
  sourceFile?: string;
  actor: { id?: string; name?: string };
}): Promise<{ upserted: number; skippedDuplicates: number; batchRef: string }> {
  const prisma = requirePrisma();
  if (!args.lines.length) {
    const err = new Error('At least one BOM line is required.');
    (err as Error & { code: string }).code = 'VALIDATION_ERROR';
    throw err;
  }

  const cableNumbers = [...new Set(args.lines.map((l) => l.cableMaterialNumber.trim()))];
  const rmCodes = [...new Set(args.lines.map((l) => l.rawMaterial.trim().toUpperCase()))];

  const [cables, rms] = await Promise.all([
    prisma.cableMaster.findMany({
      where: { materialNumber: { in: cableNumbers } },
      select: { materialNumber: true },
    }),
    prisma.rawMaterial.findMany({
      where: { code: { in: rmCodes } },
      select: { code: true },
    }),
  ]);
  const cableSet = new Set(cables.map((c) => c.materialNumber.toLowerCase()));
  const rmSet = new Set(rms.map((r) => r.code.toUpperCase()));

  const invalid: string[] = [];
  for (const line of args.lines) {
    if (!cableSet.has(line.cableMaterialNumber.trim().toLowerCase())) {
      invalid.push(`Cable ${line.cableMaterialNumber} not in Cable Master`);
    }
    if (!rmSet.has(line.rawMaterial.trim().toUpperCase())) {
      invalid.push(`Raw Material ${line.rawMaterial} not in Raw Material Master`);
    }
    if (line.weight <= 0) {
      invalid.push(`Invalid weight for ${line.cableMaterialNumber}/${line.rawMaterial}`);
    }
  }
  if (invalid.length) {
    const err = new Error(invalid.slice(0, 5).join('; '));
    (err as Error & { code: string }).code = 'VALIDATION_ERROR';
    throw err;
  }

  const batchRef = `EXCEL-BOM-${Date.now()}`;
  const replaceSet = [
    ...new Set(args.replaceCableMaterialNumbers.map((c) => c.trim()).filter(Boolean)),
  ];

  await prisma.$transaction(
    async (tx) => {
      if (replaceSet.length) {
        await tx.cableBomLine.deleteMany({
          where: {
            bomVersion: 1,
            cableMaterialNumber: { in: replaceSet },
          },
        });
      }

      for (const line of args.lines) {
        await tx.cableBomLine.upsert({
          where: {
            cableMaterialNumber_rawMaterialCode_bomVersion: {
              cableMaterialNumber: line.cableMaterialNumber,
              rawMaterialCode: line.rawMaterial,
              bomVersion: 1,
            },
          },
          create: {
            cableMaterialNumber: line.cableMaterialNumber,
            rawMaterialCode: line.rawMaterial,
            itemCode: line.itemCode || null,
            customerCode: line.customerCode || null,
            consumption: line.weight,
            uom: line.unitKm || 'kg',
            bomVersion: 1,
            status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: line.sourceBatch || batchRef,
          },
          update: {
            itemCode: line.itemCode || null,
            customerCode: line.customerCode || null,
            consumption: line.weight,
            uom: line.unitKm || 'kg',
            status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: line.sourceBatch || batchRef,
          },
        });
      }

      if (args.duplicateObservations?.length) {
        for (const obs of args.duplicateObservations) {
          const existing = await tx.bomDuplicateObservation.findMany({
            where: {
              cableMaterialNumber: obs.cableMaterialNumber,
              rawMaterialCode: obs.rawMaterialCode,
            },
            orderBy: { createdAt: 'asc' },
          });
          const payload = {
            weightA: obs.weightA,
            weightB: obs.weightB,
            occurrenceCount: obs.occurrenceCount,
            sourceWorksheet: obs.sourceWorksheet || null,
            sourceFile: obs.sourceFile || args.sourceFile || null,
            sourceRows: obs.sourceRowNumbers as Prisma.InputJsonValue,
            classification: obs.classification,
            sourceBatch: batchRef,
          };
          if (existing.length === 0) {
            await tx.bomDuplicateObservation.create({
              data: {
                cableMaterialNumber: obs.cableMaterialNumber,
                rawMaterialCode: obs.rawMaterialCode,
                ...payload,
              },
            });
            continue;
          }
          const keep = existing.find((row) => row.conflictId) || existing[0];
          await tx.bomDuplicateObservation.update({
            where: { id: keep.id },
            data: payload,
          });
          const extraIds = existing.filter((row) => row.id !== keep.id).map((row) => row.id);
          if (extraIds.length) {
            await tx.bomDuplicateObservation.deleteMany({ where: { id: { in: extraIds } } });
          }
        }
      }
    },
    { timeout: 900_000 }
  );

  await writeAudit({
    actorId: args.actor.id,
    actorName: args.actor.name,
    entity: 'CableBom',
    entityId: batchRef,
    action: 'BOM_CHANGE',
    newValue: {
      source: 'excel-method-b',
      upserted: args.lines.length,
      replaceCableCount: replaceSet.length,
      duplicateObservations: args.duplicateObservations?.length ?? 0,
      sourceFile: args.sourceFile,
    },
    message: `Excel Method-B BOM commit ${batchRef} (${args.lines.length} line(s))`,
  });

  if (isOfficialEnergyaCableMasterSource(args.sourceFile)) {
    const { stampOfficialImportedMasterValidation } = await import('./governanceRepository');
    await stampOfficialImportedMasterValidation({
      materialNumbers: [...new Set(args.lines.map((l) => l.cableMaterialNumber))],
      actor: args.actor,
      sourceFile: args.sourceFile,
      batchNumber: batchRef,
    });
  }

  return {
    upserted: args.lines.length,
    skippedDuplicates: args.duplicateObservations?.length ?? 0,
    batchRef,
  };
}

export async function listRawMaterials() {
  const prisma = requirePrisma();
  const rows = await prisma.rawMaterial.findMany({
    include: { prices: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { code: 'asc' },
  });
  return rows.map(rmFromRow);
}

export async function listRawMaterialPrices() {
  const prisma = requirePrisma();
  return prisma.rawMaterialPrice.findMany({ orderBy: [{ rawMaterialCode: 'asc' }, { createdAt: 'desc' }] });
}

export async function listDrums() {
  const prisma = requirePrisma();
  const rows = await prisma.drumMaster.findMany({ orderBy: { drumCode: 'asc' } });
  return rows.map(drumFromRow);
}

export async function listReference() {
  const prisma = requirePrisma();
  return prisma.cableParameter.findMany({ orderBy: [{ kind: 'asc' }, { code: 'asc' }] });
}

export async function listImportHistory() {
  const prisma = requirePrisma();
  return prisma.importBatch.findMany({
    orderBy: { importedDate: 'desc' },
    take: 100,
    include: { rows: true },
  });
}

export async function createCable(input: MasterCableCatalogItem, actor: { id?: string; name?: string }) {
  const prisma = requirePrisma();
  const existing = await prisma.cableMaster.findUnique({ where: { materialNumber: input.cableCode } });
  if (existing) {
    const err = new Error('Cable material number already exists.');
    (err as Error & { code: string }).code = 'DUPLICATE_MATERIAL_NUMBER';
    throw err;
  }
  const created = await prisma.cableMaster.create({
    data: cableWriteData(input),
  });
  await writeAudit({
    actorId: actor.id,
    actorName: actor.name,
    entity: 'CableMaster',
    entityId: created.materialNumber,
    action: 'CREATE',
    newValue: created,
  });
  return cableFromRow(created);
}

export async function updateCable(
  materialNumber: string,
  input: Partial<MasterCableCatalogItem> & { status?: 'ACTIVE' | 'INACTIVE' },
  actor: { id?: string; name?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.cableMaster.findUnique({ where: { materialNumber } });
  if (!existing) return null;
  const merged: MasterCableCatalogItem = {
    ...cableFromRow(existing),
    ...input,
    cableCode: materialNumber,
  };
  const updated = await prisma.cableMaster.update({
    where: { materialNumber },
    data: {
      ...cableWriteData(merged),
      status: input.status === 'INACTIVE' ? 'INACTIVE' : input.status === 'ACTIVE' ? 'ACTIVE' : existing.status,
    },
  });
  const action =
    existing.status !== updated.status
      ? updated.status === 'INACTIVE'
        ? 'DEACTIVATE'
        : 'ACTIVATE'
      : 'UPDATE';
  await writeAudit({
    actorId: actor.id,
    actorName: actor.name,
    entity: 'CableMaster',
    entityId: materialNumber,
    action,
    oldValue: existing,
    newValue: updated,
  });
  return cableFromRow(updated);
}

function cableWriteData(input: MasterCableCatalogItem) {
  const authority = input.authorityFields;
  return {
    materialNumber: input.cableCode,
    itemCode: input.itemCode,
    customerCode: input.customerCode,
    elandItemNumber: input.elandItemNumber || null,
    description: input.description,
    family: authority ? authority.family ?? null : input.family ?? null,
    voltage: authority ? authority.voltage ?? null : input.voltageClass || null,
    conductor: authority ? authority.conductor ?? null : input.conductor || null,
    cores: authority ? authority.cores ?? null : input.cores || null,
    conductorSize: authority
      ? authority.conductorSize ?? null
      : input.crossSectionMm2 != null
        ? String(input.crossSectionMm2)
        : null,
    insulation: authority ? authority.insulation ?? null : input.insulation ?? null,
    screen: authority ? authority.screen ?? null : input.screen ?? null,
    armour: authority ? authority.armour ?? null : input.armour ?? null,
    sheath: authority ? authority.sheath ?? null : input.sheath ?? null,
    sheathColour: authority ? authority.sheathColour ?? null : input.sheathColour ?? null,
    coreColour: authority ? authority.coreColour ?? null : input.coreColour ?? null,
    standard: authority ? authority.standard ?? null : input.standard ?? null,
    diameter: input.outerDiameterMm,
    weight: input.approxWeightKgKm,
    uom: (authority?.uom || input.uom || 'CONFIGURATION_REQUIRED') as string,
    status: input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    sourceBatch: input.sourceBatch || null,
    updatedBy: undefined as string | undefined,
  } satisfies Prisma.CableMasterUncheckedCreateInput;
}

export async function persistImportTransaction(args: {
  kind: 'cables' | 'boms' | 'drums' | 'raw_materials';
  batch: ImportBatchRecord;
  cables?: MasterCableCatalogItem[];
  boms?: CableBomRawMaterial[];
  drums?: DrumMasterRecord[];
  rawMaterials?: RawMaterialMasterRecord[];
  duplicateObservations?: Array<{
    cableMaterialNumber: string;
    rawMaterialCode: string;
    weightA: number;
    weightB: number;
    occurrenceCount: number;
    sourceWorksheet?: string;
    sourceFile?: string;
    sourceRowNumbers: number[];
    classification: string;
  }>;
  actor: { id?: string; name?: string };
}): Promise<void> {
  const prisma = requirePrisma();
  if (args.batch.errorCount > 0 || args.batch.status === 'REJECTED') {
    await persistImportBatchOnly(args.batch, 'REJECTED');
    return;
  }

  // Remote Postgres (Render) needs long interactive tx windows; BOM upserts ~4.8k rows.
  const txTimeoutMs = args.kind === 'boms' ? 900_000 : 180_000;
  await prisma.$transaction(async (tx) => {
    if (args.kind === 'cables' && args.cables) {
      for (const cable of args.cables) {
        const write = cableWriteData(cable);
        const existing = await tx.cableMaster.findUnique({ where: { materialNumber: cable.cableCode } });
        if (!existing) {
          await tx.cableMaster.create({ data: write });
          continue;
        }
        await tx.cableMaster.update({
          where: { materialNumber: cable.cableCode },
          data: {
            ...write,
            family: write.family ?? existing.family,
            voltage: write.voltage ?? existing.voltage,
            conductor: write.conductor ?? existing.conductor,
            conductorSize: write.conductorSize ?? existing.conductorSize,
            cores: write.cores ?? existing.cores,
            insulation: write.insulation ?? existing.insulation,
            screen: write.screen ?? existing.screen,
            armour: write.armour ?? existing.armour,
            sheath: write.sheath ?? existing.sheath,
            sheathColour: write.sheathColour ?? existing.sheathColour,
            coreColour: write.coreColour ?? existing.coreColour,
            standard: write.standard ?? existing.standard,
          },
        });
      }
    }
    if (args.kind === 'raw_materials' && args.rawMaterials) {
      for (const rm of args.rawMaterials) {
        const sourcePriceDraft = rm.priceStatus === 'CONFIGURED' && rm.price != null;
        const hasApprovedPrice =
          (await tx.rawMaterialPrice.count({
            where: {
              rawMaterialCode: rm.rawMaterialCode,
              workflowStatus: 'APPROVED',
              status: 'ACTIVE',
              isCurrent: true,
            },
          })) > 0;
        await tx.rawMaterial.upsert({
          where: { code: rm.rawMaterialCode },
          create: {
            code: rm.rawMaterialCode,
            description: rm.description,
            shortDescription: rm.shortDescription || null,
            uom: rm.uom,
            category: rm.category || rm.materialType || null,
            pricingCategory: rm.pricingCategory || 'STANDARD_RAW_MATERIAL',
            metalType: rm.metalType || 'NONE',
            notes: rm.notes || null,
            supplier: rm.supplier || null,
            currency: rm.currency || null,
            priceStatus: hasApprovedPrice ? 'CONFIGURED' : 'PRICE_NOT_CONFIGURED',
            status: rm.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: rm.sourceBatch || null,
          },
          update: {
            description: rm.description,
            shortDescription: rm.shortDescription || null,
            uom: rm.uom,
            category: rm.category || rm.materialType || null,
            ...(rm.pricingCategory
              ? {
                  pricingCategory: rm.pricingCategory,
                  metalType: rm.metalType || 'NONE',
                }
              : {}),
            notes: rm.notes || null,
            supplier: rm.supplier || null,
            currency: rm.currency || null,
            priceStatus: hasApprovedPrice ? 'CONFIGURED' : 'PRICE_NOT_CONFIGURED',
            status: rm.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: rm.sourceBatch || null,
          },
        });
        if (sourcePriceDraft) {
          const fromSource = rm.priceEffectiveFrom ? new Date(rm.priceEffectiveFrom) : null;
          const toSource = rm.priceEffectiveTo ? new Date(rm.priceEffectiveTo) : null;
          const datesValid = fromSource && !Number.isNaN(fromSource.getTime());
          const existingPrice = await tx.rawMaterialPrice.findFirst({
            where: { rawMaterialCode: rm.rawMaterialCode, isCurrent: true },
          });
          if (existingPrice) {
            if (existingPrice.workflowStatus !== 'APPROVED') {
              await tx.rawMaterialPrice.update({
                where: { id: existingPrice.id },
                data: {
                  price: rm.price,
                  currency: rm.currency || existingPrice.currency,
                  effectiveFrom: datesValid ? fromSource : existingPrice.effectiveFrom,
                  effectiveTo: toSource && !Number.isNaN(toSource.getTime()) ? toSource : existingPrice.effectiveTo,
                  temporalStatus: datesValid ? 'EFFECTIVE' : existingPrice.temporalStatus,
                  status: 'ACTIVE',
                  sourceBatch: rm.sourceBatch || existingPrice.sourceBatch,
                },
              });
            }
          } else {
            await tx.rawMaterialPrice.create({
              data: {
                rawMaterialCode: rm.rawMaterialCode,
                price: rm.price,
                currency: rm.currency || null,
                effectiveFrom: datesValid ? fromSource : null,
                effectiveTo: toSource && !Number.isNaN(toSource.getTime()) ? toSource : null,
                temporalStatus: datesValid ? 'EFFECTIVE' : 'DATA_REQUIRED',
                status: 'ACTIVE',
                sourceBatch: rm.sourceBatch || null,
              },
            });
          }
        }
      }
    }
    if (args.kind === 'boms' && args.boms) {
      for (const line of args.boms) {
        await tx.cableBomLine.upsert({
          where: {
            cableMaterialNumber_rawMaterialCode_bomVersion: {
              cableMaterialNumber: line.cableMaterialNumber,
              rawMaterialCode: line.rawMaterial,
              bomVersion: 1,
            },
          },
          create: {
            cableMaterialNumber: line.cableMaterialNumber,
            rawMaterialCode: line.rawMaterial,
            itemCode: line.itemCode || null,
            customerCode: line.customerCode || null,
            consumption: line.weight,
            uom: line.unitKm,
            bomVersion: 1,
            status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: line.sourceBatch || null,
          },
          update: {
            itemCode: line.itemCode || null,
            customerCode: line.customerCode || null,
            consumption: line.weight,
            uom: line.unitKm,
            status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: line.sourceBatch || null,
          },
        });
      }
    }
    if (args.kind === 'boms' && args.duplicateObservations) {
      for (const obs of args.duplicateObservations) {
        const existing = await tx.bomDuplicateObservation.findMany({
          where: {
            cableMaterialNumber: obs.cableMaterialNumber,
            rawMaterialCode: obs.rawMaterialCode,
          },
          orderBy: { createdAt: 'asc' },
        });
        const payload = {
          weightA: obs.weightA,
          weightB: obs.weightB,
          occurrenceCount: obs.occurrenceCount,
          sourceWorksheet: obs.sourceWorksheet || null,
          sourceFile: obs.sourceFile || args.batch.sourceFile,
          sourceRows: obs.sourceRowNumbers as Prisma.InputJsonValue,
          classification: obs.classification,
          sourceBatch: args.batch.batchNumber,
        };
        if (existing.length === 0) {
          await tx.bomDuplicateObservation.create({
            data: {
              cableMaterialNumber: obs.cableMaterialNumber,
              rawMaterialCode: obs.rawMaterialCode,
              ...payload,
            },
          });
          continue;
        }
        const keep = existing.find((row) => row.conflictId) || existing[0];
        await tx.bomDuplicateObservation.update({
          where: { id: keep.id },
          data: payload,
        });
        const extraIds = existing.filter((row) => row.id !== keep.id).map((row) => row.id);
        if (extraIds.length) {
          await tx.bomDuplicateObservation.deleteMany({ where: { id: { in: extraIds } } });
        }
      }
    }
    if (args.kind === 'drums' && args.drums) {
      for (const drum of args.drums) {
        await tx.drumMaster.upsert({
          where: { drumCode: drum.drumCode },
          create: {
            drumCode: drum.drumCode,
            drumType: drum.drumType || null,
            description: drum.description || null,
            flange: drum.flange,
            barrel: drum.barrel,
            barrelWidth: drum.barrelWidth ?? null,
            innerWidth: drum.innerWidth,
            outerWidth: drum.outerWidth,
            usableWidth: drum.usableWidth ?? null,
            capacity: drum.capacity,
            // MaxLoad = permitted cable payload kg. Import maps Capacity → MaxLoad when TO rule applies.
            maxWeight: drum.maxWeight ?? null,
            clearanceMm: drum.clearanceMm ?? null,
            emptyDrumNetWeightKg: drum.emptyDrumNetWeightKg ?? null,
            capacityUom: 'CONFIGURATION_REQUIRED',
            dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
            status: drum.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: drum.sourceBatch || null,
          },
          update: {
            ...(drum.drumType ? { drumType: drum.drumType } : {}),
            ...(drum.description ? { description: drum.description } : {}),
            flange: drum.flange,
            barrel: drum.barrel,
            ...(drum.barrelWidth != null ? { barrelWidth: drum.barrelWidth } : {}),
            innerWidth: drum.innerWidth,
            outerWidth: drum.outerWidth,
            ...(drum.usableWidth != null ? { usableWidth: drum.usableWidth } : {}),
            capacity: drum.capacity,
            ...(drum.maxWeight != null ? { maxWeight: drum.maxWeight } : {}),
            ...(drum.clearanceMm != null ? { clearanceMm: drum.clearanceMm } : {}),
            ...(drum.emptyDrumNetWeightKg != null ? { emptyDrumNetWeightKg: drum.emptyDrumNetWeightKg } : {}),
            status: drum.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            sourceBatch: drum.sourceBatch || null,
          },
        });
      }
    }

    await tx.importBatch.create({
      data: importBatchData(args.batch, 'COMMITTED'),
    });
  }, { timeout: txTimeoutMs });

  if (
    (args.kind === 'cables' || args.kind === 'boms') &&
    isOfficialEnergyaCableMasterSource(args.batch.sourceFile)
  ) {
    const { stampOfficialImportedMasterValidation } = await import('./governanceRepository');
    const materialNumbers =
      args.kind === 'cables'
        ? (args.cables || []).map((c) => c.cableCode)
        : [...new Set((args.boms || []).map((b) => b.cableMaterialNumber))];
    await stampOfficialImportedMasterValidation({
      materialNumbers,
      actor: args.actor,
      sourceFile: args.batch.sourceFile,
      batchNumber: args.batch.batchNumber,
    });
  }

  const entity =
    args.kind === 'cables'
      ? 'CableMaster'
      : args.kind === 'boms'
        ? 'CableBom'
        : args.kind === 'drums'
          ? 'DrumMaster'
          : 'RawMaterial';
  const action =
    args.kind === 'boms' ? 'BOM_CHANGE' : args.kind === 'drums' ? 'DRUM_CHANGE' : args.kind === 'raw_materials' ? 'PRICE_CHANGE' : 'IMPORT';
  await writeAudit({
    actorId: args.actor.id,
    actorName: args.actor.name,
    entity,
    entityId: args.batch.batchNumber,
    action: args.kind === 'cables' ? 'IMPORT' : action,
    newValue: { kind: args.kind, successCount: args.batch.successCount },
    message: `Import ${args.batch.batchNumber} committed`,
  });
}

export async function persistImportBatchOnly(batch: ImportBatchRecord, status: 'PREVIEWED' | 'COMMITTED' | 'REJECTED') {
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.importBatch.create({ data: importBatchData(batch, status) });
}

function importBatchData(batch: ImportBatchRecord, status: 'PREVIEWED' | 'COMMITTED' | 'REJECTED') {
  return {
    batchNumber: batch.batchNumber,
    sourceFile: batch.sourceFile,
    importedBy: batch.importedBy,
    importedDate: new Date(batch.importedDate),
    dataType: batch.dataType,
    rowCount: batch.rowCount,
    successCount: batch.successCount,
    errorCount: batch.errorCount,
    warningCount: batch.warningCount,
    skippedCount: batch.skippedCount || 0,
    status,
    errorsJson: jsonSafe(batch.errors) ?? [],
    warningsJson: jsonSafe([...(batch.warnings || []), ...(batch.information || [])]) ?? [],
    rows: {
      create: [
        ...batch.errors.map((e) => ({
          rowNumber: e.rowNumber,
          severity: 'ERROR',
          field: e.field,
          code: e.code,
          message: e.message,
        })),
        ...batch.warnings.map((e) => ({
          rowNumber: e.rowNumber,
          severity: 'WARNING',
          field: e.field,
          code: e.code,
          message: e.message,
        })),
        ...(batch.information || []).map((e) => ({
          rowNumber: e.rowNumber,
          severity: 'INFORMATION',
          field: e.field,
          code: e.code,
          message: e.message,
        })),
        ...(batch.skipped || []).map((e) => ({
          rowNumber: e.rowNumber,
          severity: 'SKIPPED',
          field: e.field,
          code: e.code,
          message: e.message,
        })),
      ].slice(0, 500),
    },
  } satisfies Prisma.ImportBatchCreateInput;
}

async function writeAudit(entry: {
  actorId?: string;
  actorName?: string;
  entity: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE' | 'IMPORT' | 'PRICE_CHANGE' | 'BOM_CHANGE' | 'DRUM_CHANGE';
  oldValue?: unknown;
  newValue?: unknown;
  message?: string;
}) {
  appendAudit(entry);
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.auditEvent.create({
    data: {
      actorId: entry.actorId,
      actorName: entry.actorName,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      oldValue: jsonSafe(entry.oldValue),
      newValue: jsonSafe(entry.newValue),
      message: entry.message,
    },
  });
}

function jsonSafe(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function createRawMaterial(
  input: {
    code: string;
    description: string;
    shortDescription?: string;
    uom: string;
    category?: string;
    pricingCategory?: string;
    metalType?: string;
    notes?: string;
    supplier?: string;
    currency?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  },
  actor: { id?: string; name?: string }
) {
  const prisma = requirePrisma();
  const { validateRawMaterialClassification, normalizePricingCategoryInput, normalizeMetalType } = await import(
    '../domain/rawMaterialClassification'
  );
  const pricingCategory = normalizePricingCategoryInput(input.pricingCategory);
  const metalType = normalizeMetalType(input.metalType);
  const classification = validateRawMaterialClassification({ pricingCategory, metalType });
  if (classification.ok === false) {
    const err = new Error(classification.message);
    (err as Error & { code: string }).code = classification.code;
    throw err;
  }
  const existing = await prisma.rawMaterial.findUnique({ where: { code: input.code } });
  if (existing) {
    const err = new Error('Raw Material code already exists.');
    (err as Error & { code: string }).code = 'DUPLICATE_RAW_MATERIAL';
    throw err;
  }
  const created = await prisma.rawMaterial.create({
    data: {
      code: input.code,
      description: input.description,
      shortDescription: input.shortDescription?.trim() || null,
      uom: input.uom,
      category: input.category || null,
      pricingCategory,
      metalType,
      notes: input.notes?.trim() || null,
      supplier: input.supplier || null,
      currency: input.currency || null,
      priceStatus: 'PRICE_NOT_CONFIGURED',
      status: input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    },
    include: { prices: true },
  });
  await writeAudit({
    actorId: actor.id,
    actorName: actor.name,
    entity: 'RawMaterial',
    entityId: created.code,
    action: 'CREATE',
    newValue: created,
  });
  return rmFromRow(created);
}

export async function updateRawMaterial(
  code: string,
  input: Partial<{
    description: string;
    shortDescription: string;
    uom: string;
    category: string;
    pricingCategory: string;
    metalType: string;
    notes: string;
    supplier: string;
    currency: string;
    status: 'ACTIVE' | 'INACTIVE';
  }>,
  actor: { id?: string; name?: string }
) {
  const prisma = requirePrisma();
  const { validateRawMaterialClassification, normalizePricingCategoryInput, normalizeMetalType } = await import(
    '../domain/rawMaterialClassification'
  );
  const existing = await prisma.rawMaterial.findUnique({ where: { code }, include: { prices: { take: 1 } } });
  if (!existing) return null;
  const pricingCategory = normalizePricingCategoryInput(input.pricingCategory ?? existing.pricingCategory);
  const metalType = normalizeMetalType(input.metalType ?? existing.metalType);
  const classification = validateRawMaterialClassification({ pricingCategory, metalType });
  if (classification.ok === false) {
    const err = new Error(classification.message);
    (err as Error & { code: string }).code = classification.code;
    throw err;
  }
  const updated = await prisma.rawMaterial.update({
    where: { code },
    data: {
      description: input.description ?? existing.description,
      shortDescription:
        input.shortDescription !== undefined ? input.shortDescription.trim() || null : existing.shortDescription,
      uom: input.uom ?? existing.uom,
      category: input.category !== undefined ? input.category : existing.category,
      pricingCategory,
      metalType,
      notes: input.notes !== undefined ? input.notes.trim() || null : existing.notes,
      supplier: input.supplier !== undefined ? input.supplier : existing.supplier,
      currency: input.currency !== undefined ? input.currency : existing.currency,
      status: input.status === 'INACTIVE' ? 'INACTIVE' : input.status === 'ACTIVE' ? 'ACTIVE' : existing.status,
    },
    include: { prices: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  await writeAudit({
    actorId: actor.id,
    actorName: actor.name,
    entity: 'RawMaterial',
    entityId: code,
    action: 'UPDATE',
    oldValue: existing,
    newValue: updated,
  });
  return rmFromRow(updated);
}

/** Classify copper/aluminium RMs in place. Never creates codes, cables, BOM lines, or prices. */
export async function classifySuggestedRawMaterials(
  actor: { id?: string; name?: string },
  options?: { onlyUnclassified?: boolean }
) {
  const prisma = requirePrisma();
  const { suggestedClassificationFromCode, normalizePricingCategoryInput } = await import(
    '../domain/rawMaterialClassification'
  );
  const materials = await prisma.rawMaterial.findMany({
    select: { code: true, description: true, uom: true, pricingCategory: true, metalType: true },
  });
  const onlyUnclassified = options?.onlyUnclassified !== false;
  let copper = 0;
  let aluminium = 0;
  let skippedStandard = 0;
  let unchanged = 0;
  let reverted = 0;
  const updatedCodes: string[] = [];
  for (const rm of materials) {
    const suggested = suggestedClassificationFromCode(rm.code, rm.description, rm.uom);
    const current = normalizePricingCategoryInput(rm.pricingCategory);
    if (
      current !== 'STANDARD_RAW_MATERIAL' &&
      suggested.pricingCategory === 'STANDARD_RAW_MATERIAL'
    ) {
      await updateRawMaterial(
        rm.code,
        { pricingCategory: 'STANDARD_RAW_MATERIAL', metalType: 'NONE' },
        actor
      );
      reverted += 1;
      updatedCodes.push(rm.code);
      continue;
    }
    if (suggested.pricingCategory === 'STANDARD_RAW_MATERIAL') {
      skippedStandard += 1;
      continue;
    }
    if (onlyUnclassified && current !== 'STANDARD_RAW_MATERIAL') {
      unchanged += 1;
      continue;
    }
    if (rm.pricingCategory === suggested.pricingCategory && rm.metalType === suggested.metalType) {
      unchanged += 1;
      continue;
    }
    await updateRawMaterial(
      rm.code,
      { pricingCategory: suggested.pricingCategory, metalType: suggested.metalType },
      actor
    );
    updatedCodes.push(rm.code);
    if (suggested.pricingCategory === 'MARKET_METAL_COPPER') copper += 1;
    else aluminium += 1;
  }
  return {
    scanned: materials.length,
    copper,
    aluminium,
    skippedStandard,
    unchanged,
    reverted,
    updatedCodes,
  };
}

export async function appendRawMaterialPrice(
  code: string,
  input: { price: number | null; currency?: string; effectiveFrom?: string | null; effectiveTo?: string | null },
  actor: { id?: string; name?: string }
) {
  const prisma = requirePrisma();
  const rm = await prisma.rawMaterial.findUnique({ where: { code } });
  if (!rm) return null;
  if (input.price == null) {
    await prisma.rawMaterial.update({ where: { code }, data: { priceStatus: 'PRICE_NOT_CONFIGURED' } });
    return { priceStatus: 'PRICE_NOT_CONFIGURED' as const, created: false };
  }
  const fromSource = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  const datesValid = Boolean(fromSource && !Number.isNaN(fromSource.getTime()));
  const created = await prisma.rawMaterialPrice.create({
    data: {
      rawMaterialCode: code,
      price: input.price,
      currency: input.currency || rm.currency,
      effectiveFrom: datesValid ? fromSource : null,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      temporalStatus: datesValid ? 'EFFECTIVE' : 'DATA_REQUIRED',
      status: 'ACTIVE',
    },
  });
  await prisma.rawMaterial.update({ where: { code }, data: { priceStatus: 'PRICE_NOT_CONFIGURED' } });
  await writeAudit({
    actorId: actor.id,
    actorName: actor.name,
    entity: 'RawMaterial',
    entityId: code,
    action: 'PRICE_CHANGE',
    newValue: created,
    message: datesValid ? 'Price history row with source dates' : 'Price history row without invented dates (DATA_REQUIRED)',
  });
  return created;
}

export async function cableUniquenessReport() {
  const prisma = requirePrisma();
  const cables = await prisma.cableMaster.findMany({
    select: { materialNumber: true, itemCode: true, customerCode: true, status: true },
  });
  const countBy = (key: (c: (typeof cables)[number]) => string) => {
    const map = new Map<string, number>();
    cables.forEach((c) => {
      const k = key(c).toLowerCase();
      map.set(k, (map.get(k) || 0) + 1);
    });
    const duplicates = [...map.entries()].filter(([, n]) => n > 1);
    return { distinct: map.size, duplicateKeys: duplicates.length, duplicateExamples: duplicates.slice(0, 20) };
  };
  return {
    total: cables.length,
    active: cables.filter((c) => c.status === 'ACTIVE').length,
    materialNumber: { rule: 'unique (natural key)', ...countBy((c) => c.materialNumber) },
    itemCode: { rule: 'NOT globally unique in ENERGYA source', ...countBy((c) => c.itemCode) },
    customerCode: { rule: 'NOT globally unique in ENERGYA source', ...countBy((c) => c.customerCode) },
  };
}

export async function listBomDuplicateObservations() {
  const prisma = requirePrisma();
  return prisma.bomDuplicateObservation.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
}

export async function masterDataReadiness() {
  const prisma = getPrisma();
  const { inspectOfficialSourceAvailability } = await import('../services/officialSourceInspector');
  const official = inspectOfficialSourceAvailability();
  if (!prisma) {
    return {
      official,
      postgresql: false,
      cables: 0,
      activeCables: 0,
      bomLines: 0,
      rawMaterials: 0,
      pricesConfigured: 0,
      pricesNotConfigured: 0,
      priceRowsWithDataRequiredDates: 0,
      bomDuplicateObservations: 0,
    };
  }
  const [cables, activeCables, bomLines, rawMaterials, pricesNotConfigured, priceRowsWithDataRequiredDates, bomDuplicateObservations] =
    await Promise.all([
      prisma.cableMaster.count(),
      prisma.cableMaster.count({ where: { status: 'ACTIVE' } }),
      prisma.cableBomLine.count(),
      prisma.rawMaterial.count(),
      prisma.rawMaterial.count({ where: { priceStatus: 'PRICE_NOT_CONFIGURED' } }),
      prisma.rawMaterialPrice.count({ where: { temporalStatus: 'DATA_REQUIRED' } }),
      prisma.bomDuplicateObservation.count(),
    ]);
  return {
    official,
    postgresql: true,
    cables,
    activeCables,
    bomLines,
    rawMaterials,
    pricesConfigured: rawMaterials - pricesNotConfigured,
    pricesNotConfigured,
    priceRowsWithDataRequiredDates,
    bomDuplicateObservations,
    costing: 'NOT_IMPLEMENTED',
    drumOptimization: 'CONFIGURATION_REQUIRED',
  };
}

export async function increment5Readiness() {
  const base = await masterDataReadiness();
  const { engineeringMappingCounts, bomConflictCounts } = await import('./governanceRepository');
  let engineering: any = { total: 0, complete: 0, partial: 0, missing: 0, businessDecisionRequired: 0 };
  let bom: any = { totalLines: base.bomLines, validLines: base.bomLines, conflictGroups: 0, resolved: 0, unresolved: 0 };
  try {
    engineering = await engineeringMappingCounts();
    bom = await bomConflictCounts();
  } catch {
    /* mappings not populated yet */
  }
  return {
    ...base,
    cableMaster: { total: engineering.total || base.cables, active: base.activeCables },
    engineeringMapping: engineering,
    bom: {
      totalLines: bom.importedBomLines || base.bomLines,
      validLines: bom.importedBomLines || base.bomLines,
      conflictGroups: bom.conflictGroups || 0,
      resolved: bom.resolved || 0,
      unresolved: bom.unresolvedConflicts || bom.unresolved || 0,
      ...bom,
    },
    rawMaterials: {
      total: base.rawMaterials,
      priceConfigured: base.pricesConfigured,
      priceNotConfigured: base.pricesNotConfigured,
    },
    costing: 'NOT_IMPLEMENTED',
    drumOptimization: 'CONFIGURATION_REQUIRED',
  };
}
