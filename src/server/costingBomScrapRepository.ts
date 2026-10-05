import { Prisma } from '@prisma/client';
import { getPrisma } from './db';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

function toDisplayPercent(scrap: Prisma.Decimal | number | null | undefined): number | null {
  if (scrap == null) return null;
  const n = Number(scrap);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 100;
}

function fromDisplayPercent(percent: number): number {
  return Math.round((percent / 100) * 1000000) / 1000000;
}

async function appendBomScrapAudit(
  entityId: string,
  action: string,
  actor: { id?: string; name?: string; email?: string },
  oldValue?: unknown,
  newValue?: unknown,
  message?: string
) {
  const prisma = requirePrisma();
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      actorName: actorLabel(actor),
      entity: 'GovernedBomLine',
      entityId,
      action,
      oldValue: oldValue != null ? (oldValue as Prisma.InputJsonValue) : undefined,
      newValue: newValue != null ? (newValue as Prisma.InputJsonValue) : undefined,
      message,
    },
  });
}

export async function listCablesForBomScrap(search?: string) {
  const prisma = requirePrisma();
  const governed = await prisma.governedBomLine.findMany({
    where: { status: 'APPROVED' },
    select: { cableMaterialNumber: true },
    distinct: ['cableMaterialNumber'],
  });
  const source = await prisma.cableBomLine.findMany({
    where: { status: 'ACTIVE' },
    select: { cableMaterialNumber: true },
    distinct: ['cableMaterialNumber'],
  });
  const numbers = Array.from(
    new Set([...governed.map((g) => g.cableMaterialNumber), ...source.map((s) => s.cableMaterialNumber)])
  ).sort();

  const cables = await prisma.cableMaster.findMany({
    where: {
      materialNumber: { in: numbers },
      ...(search
        ? {
            OR: [
              { materialNumber: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { materialNumber: true, description: true },
    orderBy: { materialNumber: 'asc' },
    take: search ? 200 : undefined,
  });

  const cableSet = new Set(cables.map((c) => c.materialNumber));
  const extras = numbers.filter((n) => !cableSet.has(n) && (!search || n.toLowerCase().includes(search.toLowerCase())));

  return [
    ...cables.map((c) => ({ materialNumber: c.materialNumber, description: c.description || c.materialNumber })),
    ...extras.map((n) => ({ materialNumber: n, description: n })),
  ];
}

export type BomScrapLineDto = {
  id: string;
  source: 'GOVERNED' | 'SOURCE';
  rawMaterialCode: string;
  rawMaterialDescription: string;
  consumptionPerKm: number;
  uom: string;
  scrapPercent: number | null;
  bomVersion: number;
  status: string;
};

export async function getBomScrapLines(cableMaterialNumber: string): Promise<{
  cableMaterialNumber: string;
  cableDescription: string | null;
  lines: BomScrapLineDto[];
}> {
  const prisma = requirePrisma();
  const matNo = cableMaterialNumber.trim();

  const cable = await prisma.cableMaster.findUnique({
    where: { materialNumber: matNo },
    select: { description: true },
  });

  const governed = await prisma.governedBomLine.findMany({
    where: { cableMaterialNumber: matNo, status: 'APPROVED' },
    include: { rawMaterial: { select: { description: true } } },
    orderBy: { rawMaterialCode: 'asc' },
  });

  if (governed.length > 0) {
    return {
      cableMaterialNumber: matNo,
      cableDescription: cable?.description ?? null,
      lines: governed.map((g) => ({
        id: g.id,
        source: 'GOVERNED' as const,
        rawMaterialCode: g.rawMaterialCode,
        rawMaterialDescription: g.rawMaterial.description,
        consumptionPerKm: Number(g.consumption),
        uom: g.uom,
        scrapPercent: toDisplayPercent(g.scrapPercentage),
        bomVersion: g.bomVersion,
        status: g.status,
      })),
    };
  }

  const source = await prisma.cableBomLine.findMany({
    where: { cableMaterialNumber: matNo, status: 'ACTIVE' },
    include: { rawMaterial: { select: { description: true } } },
    orderBy: { rawMaterialCode: 'asc' },
  });

  return {
    cableMaterialNumber: matNo,
    cableDescription: cable?.description ?? null,
    lines: source.map((s) => ({
      id: s.id,
      source: 'SOURCE' as const,
      rawMaterialCode: s.rawMaterialCode,
      rawMaterialDescription: s.rawMaterial?.description || s.rawMaterialCode,
      consumptionPerKm: Number(s.consumption),
      uom: s.uom,
      scrapPercent: toDisplayPercent(s.scrap),
      bomVersion: s.bomVersion,
      status: s.status,
    })),
  };
}

export type BomScrapUpdateInput = {
  id: string;
  source: 'GOVERNED' | 'SOURCE';
  scrapPercent: number | null;
};

function validateScrapPercent(percent: number | null): string | null {
  if (percent == null) return null;
  if (!Number.isFinite(percent)) return 'Scrap must be a number.';
  if (percent < 0) return 'Scrap cannot be negative.';
  if (percent >= 100) return 'Scrap must be less than 100%.';
  return null;
}

export async function bulkUpdateBomScrap(
  cableMaterialNumber: string,
  updates: BomScrapUpdateInput[],
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const matNo = cableMaterialNumber.trim();
  const results: BomScrapLineDto[] = [];

  for (const row of updates) {
    const err = validateScrapPercent(row.scrapPercent);
    if (err) {
      throw Object.assign(new Error(err), { code: 'INVALID_SCRAP_RATE' });
    }
    const scrapDecimal = row.scrapPercent != null ? fromDisplayPercent(row.scrapPercent) : null;

    if (row.source === 'GOVERNED') {
      const existing = await prisma.governedBomLine.findUnique({ where: { id: row.id } });
      if (!existing || existing.cableMaterialNumber !== matNo) {
        throw Object.assign(new Error(`Governed BOM line not found: ${row.id}`), { code: 'NOT_FOUND' });
      }
      const updated = await prisma.governedBomLine.update({
        where: { id: row.id },
        data: {
          scrapPercentage: scrapDecimal,
          reviewer: actorLabel(actor),
        },
        include: { rawMaterial: { select: { description: true } } },
      });
      await appendBomScrapAudit(
        updated.id,
        'BOM_SCRAP_UPDATED',
        actor,
        { scrapPercent: toDisplayPercent(existing.scrapPercentage) },
        { scrapPercent: row.scrapPercent },
        `Cable ${matNo} / RM ${updated.rawMaterialCode}`
      );
      results.push({
        id: updated.id,
        source: 'GOVERNED',
        rawMaterialCode: updated.rawMaterialCode,
        rawMaterialDescription: updated.rawMaterial.description,
        consumptionPerKm: Number(updated.consumption),
        uom: updated.uom,
        scrapPercent: toDisplayPercent(updated.scrapPercentage),
        bomVersion: updated.bomVersion,
        status: updated.status,
      });
      continue;
    }

    const source = await prisma.cableBomLine.findUnique({ where: { id: row.id } });
    if (!source || source.cableMaterialNumber !== matNo) {
      throw Object.assign(new Error(`Source BOM line not found: ${row.id}`), { code: 'NOT_FOUND' });
    }

    const upserted = await prisma.governedBomLine.upsert({
      where: {
        cableMaterialNumber_rawMaterialCode_bomVersion: {
          cableMaterialNumber: matNo,
          rawMaterialCode: source.rawMaterialCode,
          bomVersion: source.bomVersion,
        },
      },
      create: {
        cableMaterialNumber: matNo,
        rawMaterialCode: source.rawMaterialCode,
        consumption: source.consumption,
        uom: source.uom,
        scrapPercentage: scrapDecimal,
        bomVersion: source.bomVersion,
        status: 'APPROVED',
        approvedBy: actorLabel(actor),
        reviewer: actorLabel(actor),
      },
      update: {
        scrapPercentage: scrapDecimal,
        reviewer: actorLabel(actor),
      },
      include: { rawMaterial: { select: { description: true } } },
    });

    await appendBomScrapAudit(
      upserted.id,
      'BOM_SCRAP_GOVERNED_FROM_SOURCE',
      actor,
      undefined,
      { scrapPercent: row.scrapPercent, sourceLineId: row.id },
      `Cable ${matNo} / RM ${upserted.rawMaterialCode}`
    );

    results.push({
      id: upserted.id,
      source: 'GOVERNED',
      rawMaterialCode: upserted.rawMaterialCode,
      rawMaterialDescription: upserted.rawMaterial.description,
      consumptionPerKm: Number(upserted.consumption),
      uom: upserted.uom,
      scrapPercent: toDisplayPercent(upserted.scrapPercentage),
      bomVersion: upserted.bomVersion,
      status: upserted.status,
    });
  }

  return { cableMaterialNumber: matNo, lines: results };
}
