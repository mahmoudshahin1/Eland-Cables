import { getPrisma } from './db';
import { isSyntheticRawMaterialCode } from '../domain/costingSyntheticCodes';
import { COSTING_PRICE_CURRENCY_CODES } from '../domain/currencyConversion';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export type CostingLookupCable = {
  materialNumber: string;
  description: string;
  family: string | null;
};

export async function listCostingConfigurationLookups(filter?: { family?: string; q?: string }) {
  const prisma = requirePrisma();
  const family = (filter?.family || '').trim();
  const q = (filter?.q || '').trim();

  const [cables, mappings, familyRows, mappingFamilies, rawMaterials, logistics, packing, drums, rmCurrencies, priceCurrencies, incotermRows] = await Promise.all([
    prisma.cableMaster.findMany({
      where: {
        status: 'ACTIVE',
        ...(q
          ? {
              OR: [
                { materialNumber: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { materialNumber: true, description: true, family: true },
      orderBy: { materialNumber: 'asc' },
      take: q ? 120 : 400,
    }),
    prisma.cableEngineeringMapping.findMany({
      where: { isCurrent: true, family: { not: null } },
      select: { materialNumber: true, family: true },
    }),
    prisma.cableMaster.findMany({
      where: { status: 'ACTIVE', family: { not: null } },
      distinct: ['family'],
      select: { family: true },
    }),
    prisma.cableEngineeringMapping.findMany({
      where: { isCurrent: true, family: { not: null } },
      distinct: ['family'],
      select: { family: true },
    }),
    prisma.rawMaterial.findMany({
      where: { status: 'ACTIVE' },
      select: { code: true, description: true, category: true, uom: true },
      orderBy: { code: 'asc' },
    }),
    prisma.costingLogisticsRule.findMany({
      where: { isCurrent: true, status: 'ACTIVE' },
      select: { incoterm: true, destination: true },
    }),
    prisma.costingPackingRule.findMany({
      where: { isCurrent: true, status: 'ACTIVE' },
      select: { drumCode: true },
    }),
    prisma.drumMaster.findMany({
      where: { status: { not: 'INACTIVE' } },
      select: { drumCode: true, drumType: true },
      orderBy: { drumCode: 'asc' },
    }),
    prisma.rawMaterial.findMany({
      where: { currency: { not: null } },
      distinct: ['currency'],
      select: { currency: true },
    }),
    prisma.rawMaterialPrice.findMany({
      where: { currency: { not: null } },
      distinct: ['currency'],
      select: { currency: true },
    }),
    prisma.incoterm.findMany({
      where: { active: true },
      select: { code: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  const mappingFamily = new Map(
    mappings.filter((m) => m.family).map((m) => [m.materialNumber, m.family as string])
  );

  const cablesOut: CostingLookupCable[] = cables
    .map((c) => ({
      materialNumber: c.materialNumber,
      description: c.description,
      family: mappingFamily.get(c.materialNumber) || c.family,
    }))
    .filter((c) => !family || family === 'GLOBAL' || (c.family || '').toUpperCase() === family.toUpperCase());

  const families = [
    ...new Set(
      [...familyRows.map((r) => r.family), ...mappingFamilies.map((m) => m.family)].filter(Boolean) as string[]
    ),
  ].sort((a, b) => a.localeCompare(b));

  const currencies = [
    ...new Set(
      [
        ...COSTING_PRICE_CURRENCY_CODES,
        ...rmCurrencies.map((r) => (r.currency || '').trim().toUpperCase()),
        ...priceCurrencies.map((r) => (r.currency || '').trim().toUpperCase()),
      ].filter(Boolean)
    ),
  ];

  return {
    families,
    cables: cablesOut,
    rawMaterials: rawMaterials
      .filter((r) => !isSyntheticRawMaterialCode(r.code))
      .map((r) => ({ code: r.code, description: r.description, category: r.category, uom: r.uom })),
    incoterms: incotermRows.map((row) => row.code),
    destinations: [...new Set(logistics.map((l) => (l.destination || '').trim()).filter(Boolean))].sort(),
    currencies,
    drums: [
      ...drums.map((d) => ({ drumCode: d.drumCode, drumType: d.drumType || null })),
      ...packing
        .map((p) => p.drumCode)
        .filter((code): code is string => Boolean(code) && !drums.some((d) => d.drumCode === code))
        .map((drumCode) => ({ drumCode, drumType: null as string | null })),
    ],
  };
}
