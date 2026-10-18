import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service.js';
import { parseCableDescriptionConstruction } from '../../shared/domain/customerCableCatalog.js';

type CategoryWhere = (category: string | undefined) => Prisma.CableMasterWhereInput | undefined;

export async function listCustomerProductFacets(prisma: PrismaService, categoryWhere: CategoryWhere) {
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
      prisma.cableMaster.count({ where: { status: 'ACTIVE' } }),
      prisma.cableMaster.count({
        where: { status: 'ACTIVE', AND: [categoryWhere('LV')!] },
      }),
      prisma.cableMaster.count({
        where: { status: 'ACTIVE', AND: [categoryWhere('MV')!] },
      }),
      prisma.cableMaster.count({
        where: { status: 'ACTIVE', AND: [categoryWhere('CONTROL')!] },
      }),
      prisma.cableMaster.count({
        where: { status: 'ACTIVE', AND: [categoryWhere('INSTRUMENTATION')!] },
      }),
      prisma.cableMaster.count({
        where: { status: 'ACTIVE', AND: [categoryWhere('SPECIAL')!] },
      }),
      prisma.cableMaster.count({
        where: { status: 'ACTIVE', AND: [categoryWhere('POWER')!] },
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
