import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service.js';
import { cableFromRow, MasterCableDto } from '../common/master-data-dto.js';
import {
  catalogCategoryFamilyKeys,
  catalogFilterAliases,
  catalogPrismaSort,
  catalogProductHasCostingLeak,
  parseCableDescriptionConstruction,
  parseCatalogPage,
  parseCatalogPageSize,
  parseCatalogSortDir,
  parseCatalogSortField,
  parseCustomerCatalogCategory,
  toCustomerCatalogProduct,
} from '../../shared/domain/customerCableCatalog.js';

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
      { description: contains('600/1000') },
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
      { description: contains('33 KV') },
    );
  } else if (key === 'HV') {
    or.push(
      { family: contains('H.V') },
      { family: contains('HIGH VOLTAGE') },
      { description: contains('66 KV') },
      { description: contains('132 KV') },
      { description: contains('220 KV') },
    );
  } else if (key === 'CONTROL') {
    or.push(
      { family: contains('INSTRUMENT') },
      { description: contains('CONTROL') },
      { description: contains('INSTRUMENT') },
    );
  }
  return { OR: or };
}

@Injectable()
export class CablesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAll(): Promise<MasterCableDto[]> {
    const rows = await this.prisma.cableMaster.findMany({
      orderBy: { materialNumber: 'asc' },
    });
    return rows.map(cableFromRow);
  }

  async getByMaterialNumber(materialNumber: string): Promise<MasterCableDto | null> {
    const row = await this.prisma.cableMaster.findUnique({
      where: { materialNumber },
    });
    return row ? cableFromRow(row) : null;
  }

  async search(query: {
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
  }): Promise<{ total: number; page: number; pageSize: number; cables: MasterCableDto[] }> {
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
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cableMaster.count({ where }),
      this.prisma.cableMaster.findMany({
        where,
        orderBy: { materialNumber: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, cables: rows.map(cableFromRow) };
  }

  async listCustomerProducts(query: any) {
    const page = parseCatalogPage(query.page);
    const pageSize = parseCatalogPageSize(query.pageSize);
    const sortBy = parseCatalogSortField(query.sortBy || query.sort);
    const sortDir = parseCatalogSortDir(query.sortDir, sortBy);
    const prismaSort = catalogPrismaSort(sortBy);
    const where = this.buildCustomerCatalogWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cableMaster.count({ where }),
      this.prisma.cableMaster.findMany({
        where,
        orderBy: { [prismaSort.field]: query.sortDir ? sortDir : prismaSort.dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
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
        },
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

  async listCustomerProductFacets() {
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
        | 'specialAdditives',
    ) => {
      const rows = await this.prisma.cableMaster.findMany({
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

    const sparseDescriptions = await this.prisma.cableMaster.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ conductor: null }, { conductorSize: null }, { cores: null }, { standard: null }],
      },
      select: {
        description: true,
        conductor: true,
        conductorSize: true,
        cores: true,
        insulation: true,
        screen: true,
        armour: true,
        sheath: true,
        standard: true,
      },
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
      [...values]
        .filter((v) => v && v.trim())
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const [totalActive, mappedLv, mappedMv, mappedControl, mappedInstrument, mappedSpecial, mappedPower] =
      await Promise.all([
        this.prisma.cableMaster.count({ where: { status: 'ACTIVE' } }),
        this.prisma.cableMaster.count({
          where: { status: 'ACTIVE', AND: [this.customerCatalogCategoryWhere('LV')!] },
        }),
        this.prisma.cableMaster.count({
          where: { status: 'ACTIVE', AND: [this.customerCatalogCategoryWhere('MV')!] },
        }),
        this.prisma.cableMaster.count({
          where: { status: 'ACTIVE', AND: [this.customerCatalogCategoryWhere('CONTROL')!] },
        }),
        this.prisma.cableMaster.count({
          where: { status: 'ACTIVE', AND: [this.customerCatalogCategoryWhere('INSTRUMENTATION')!] },
        }),
        this.prisma.cableMaster.count({
          where: { status: 'ACTIVE', AND: [this.customerCatalogCategoryWhere('SPECIAL')!] },
        }),
        this.prisma.cableMaster.count({
          where: { status: 'ACTIVE', AND: [this.customerCatalogCategoryWhere('POWER')!] },
        }),
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
        note: 'No Product Category column on Cable Master. Categories are a non-destructive family/voltage query mapping. CONTROL/INSTRUMENTATION/SPECIAL match family contains those tokens only.',
      },
      note: 'Distinct values from existing Cable Master rows (columns + description tokens). Not a compatibility matrix.',
    };
  }

  private customerCatalogCategoryWhere(category: string | undefined): Prisma.CableMasterWhereInput | undefined {
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

  private buildCustomerCatalogWhere(query: any): Prisma.CableMasterWhereInput {
    const and: Prisma.CableMasterWhereInput[] = [{ status: 'ACTIVE' }];
    const categoryWhere = this.customerCatalogCategoryWhere(query.category);
    if (categoryWhere) and.push(categoryWhere);
    if (query.voltageClass) and.push(cableFamilyFilterWhere(query.voltageClass));

    const pushFilter = (field: string, value?: string) => {
      const aliases = catalogFilterAliases(field as any, value || '');
      if (!aliases.length) return;
      const or: Prisma.CableMasterWhereInput[] = [];
      for (const alias of aliases) {
        or.push({ [field]: { contains: alias, mode: 'insensitive' } } as Prisma.CableMasterWhereInput);
        or.push({ description: { contains: alias, mode: 'insensitive' } });
      }
      and.push({ OR: or });
    };

    pushFilter('voltage', query.voltage);
    pushFilter('conductor', query.conductor);
    pushFilter('conductorSize', query.conductorSize || query.size);
    pushFilter('cores', query.cores);
    pushFilter('insulation', query.insulation);
    pushFilter('screen', query.screen);
    pushFilter('armour', query.armour);
    pushFilter('sheath', query.sheath);
    pushFilter('standard', query.standard);
    pushFilter('sheathColour', query.sheathColour);
    pushFilter('coreColour', query.coreColour);
    pushFilter('specialAdditives', query.specialAdditives);

    if (query.diameter && Number.isFinite(Number(query.diameter))) {
      and.push({ diameter: Number(query.diameter) });
    }
    if (query.weight && Number.isFinite(Number(query.weight))) {
      and.push({ weight: Number(query.weight) });
    }

    const q = query.q?.trim() || query.search?.trim();
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
}
