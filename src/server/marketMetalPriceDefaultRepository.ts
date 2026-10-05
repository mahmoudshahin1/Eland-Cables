import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import {
  metalHeaderPatchFromPublished,
  selectPublishedCableQuotes,
  type PublishedCableMetalQuotes,
} from '../domain/cableMetalPriceResolution';
import {
  ActiveMarketMetalDefault,
  MarketMetalPriceDefaultInput,
  ParsedMarketMetalPriceDefault,
  activePeriodIncludes,
  parseMarketMetalPriceDefaultInput,
} from '../domain/marketMetalPriceDefaults';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

function fail(message: string, code = 'VALIDATION_ERROR'): never {
  throw Object.assign(new Error(message), { code });
}

async function appendAudit(
  entityId: string,
  action: string,
  actor: { id?: string; name?: string; email?: string },
  oldValue?: unknown,
  newValue?: unknown
) {
  const prisma = requirePrisma();
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      actorName: actorLabel(actor),
      entity: 'MarketMetalPriceDefault',
      entityId,
      action,
      oldValue: oldValue != null ? (oldValue as Prisma.InputJsonValue) : undefined,
      newValue: newValue != null ? (newValue as Prisma.InputJsonValue) : undefined,
    },
  });
}

function toActive(row: {
  id: string;
  metalType: string;
  priceRate: Prisma.Decimal;
  priceUom: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}): ActiveMarketMetalDefault {
  return {
    id: row.id,
    metalType: row.metalType as ActiveMarketMetalDefault['metalType'],
    priceRate: Number(row.priceRate),
    priceUom: row.priceUom,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

export async function listMarketMetalPriceDefaults(filter?: { metalType?: string; status?: string }) {
  const prisma = requirePrisma();
  return prisma.marketMetalPriceDefault.findMany({
    where: {
      ...(filter?.metalType ? { metalType: filter.metalType as never } : {}),
      ...(filter?.status ? { status: filter.status as never } : {}),
    },
    orderBy: [{ metalType: 'asc' }, { effectiveFrom: 'desc' }],
  });
}

export async function getMarketMetalPriceDefaultById(id: string) {
  const prisma = requirePrisma();
  return prisma.marketMetalPriceDefault.findUnique({ where: { id } });
}

export async function getActiveMarketMetalPriceDefaults(asOf = new Date()): Promise<{
  copper: ActiveMarketMetalDefault | null;
  aluminium: ActiveMarketMetalDefault | null;
}> {
  const prisma = requirePrisma();
  const rows = await prisma.marketMetalPriceDefault.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { effectiveFrom: 'desc' },
  });
  const pick = (metal: 'COPPER' | 'ALUMINIUM') => {
    const match = rows.find(
      (row) => row.metalType === metal && activePeriodIncludes(row.effectiveFrom, row.effectiveTo, asOf)
    );
    return match ? toActive(match) : null;
  };
  return { copper: pick('COPPER'), aluminium: pick('ALUMINIUM') };
}

/** Current published copper and aluminium cash asks. Unapproved and other metals are excluded. */
export async function getPublishedCableMetalQuotes(): Promise<PublishedCableMetalQuotes> {
  const prisma = requirePrisma();
  const rows = await prisma.marketMetalPrice.findMany({
    where: {
      isCurrent: true,
      status: 'PUBLISHED',
      instrument: { costingUsage: { in: ['CABLE_COPPER', 'CABLE_ALUMINIUM'] } },
    },
    include: { instrument: { select: { code: true, costingUsage: true } } },
    orderBy: { publishedAt: 'desc' },
  });
  return selectPublishedCableQuotes(
    rows.map((row) => ({
      id: row.id,
      code: row.instrument.code,
      costingUsage: row.instrument.costingUsage,
      status: row.status,
      isCurrent: row.isCurrent,
      quoteDate: row.quoteDate.toISOString().slice(0, 10),
      cashAsk: row.cashAsk == null ? null : Number(row.cashAsk),
      threeMonthAsk: row.threeMonthAsk == null ? null : Number(row.threeMonthAsk),
    }))
  );
}

/**
 * Copies the current published cash ask onto an inquiry header only where that metal
 * rate is missing. Does not touch costing runs, pricing snapshots, or quotations.
 */
export async function snapshotMissingInquiryMetalPrices(inquiryId: string): Promise<Record<string, unknown>> {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({
    where: { id: inquiryId },
    select: { commercialMetadata: true },
  });
  const meta =
    inquiry?.commercialMetadata && typeof inquiry.commercialMetadata === 'object' && !Array.isArray(inquiry.commercialMetadata)
      ? { ...(inquiry.commercialMetadata as Record<string, unknown>) }
      : {};
  if (!inquiry) return meta;
  const patch = metalHeaderPatchFromPublished(meta, await getPublishedCableMetalQuotes());
  if (Object.keys(patch).length === 0) return meta;
  const next = { ...meta, ...patch };
  await prisma.commercialInquiry.update({
    where: { id: inquiryId },
    data: { commercialMetadata: next as Prisma.InputJsonValue },
  });
  return next;
}

async function deactivateOtherActive(
  metalType: ParsedMarketMetalPriceDefault['metalType'],
  keepId: string | undefined,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const others = await prisma.marketMetalPriceDefault.findMany({
    where: {
      metalType,
      status: 'ACTIVE',
      ...(keepId ? { id: { not: keepId } } : {}),
    },
  });
  for (const row of others) {
    const updated = await prisma.marketMetalPriceDefault.update({
      where: { id: row.id },
      data: { status: 'INACTIVE', updatedBy: actorLabel(actor) },
    });
    await appendAudit(row.id, 'DEACTIVATED', actor, row, updated);
  }
}

async function persistParsed(
  parsed: ParsedMarketMetalPriceDefault,
  actor: { id?: string; name?: string; email?: string },
  existingId?: string,
  action?: 'CREATED' | 'UPDATED' | 'ACTIVATED' | 'DEACTIVATED'
) {
  const prisma = requirePrisma();
  if (parsed.status === 'ACTIVE') {
    await deactivateOtherActive(parsed.metalType, existingId, actor);
  }

  const data = {
    metalType: parsed.metalType,
    priceRate: new Prisma.Decimal(parsed.priceRate),
    priceUom: parsed.priceUom,
    status: parsed.status,
    effectiveFrom: parsed.effectiveFrom,
    effectiveTo: parsed.effectiveTo,
    notes: parsed.notes,
    updatedBy: actorLabel(actor),
  };

  if (existingId) {
    const existing = await prisma.marketMetalPriceDefault.findUnique({ where: { id: existingId } });
    if (!existing) fail('Market metal price default not found.', 'NOT_FOUND');
    const updated = await prisma.marketMetalPriceDefault.update({
      where: { id: existingId },
      data,
    });
    const resolvedAction =
      action ||
      (parsed.status === 'ACTIVE' && existing.status !== 'ACTIVE'
        ? 'ACTIVATED'
        : parsed.status === 'INACTIVE' && existing.status !== 'INACTIVE'
          ? 'DEACTIVATED'
          : 'UPDATED');
    await appendAudit(updated.id, resolvedAction, actor, existing, updated);
    return updated;
  }

  const created = await prisma.marketMetalPriceDefault.create({
    data: { ...data, createdBy: actorLabel(actor) },
  });
  const createdAction = action || (parsed.status === 'ACTIVE' ? 'ACTIVATED' : 'CREATED');
  await appendAudit(created.id, createdAction, actor, undefined, created);
  return created;
}

export async function createMarketMetalPriceDefault(
  input: MarketMetalPriceDefaultInput,
  actor: { id?: string; name?: string; email?: string }
) {
  const parsed = parseMarketMetalPriceDefaultInput(input, { defaultStatus: 'DRAFT' });
  return persistParsed(parsed, actor);
}

export async function updateMarketMetalPriceDefault(
  id: string,
  input: MarketMetalPriceDefaultInput,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.marketMetalPriceDefault.findUnique({ where: { id } });
  if (!existing) fail('Market metal price default not found.', 'NOT_FOUND');
  const parsed = parseMarketMetalPriceDefaultInput({
    metalType: input.metalType ?? existing.metalType,
    priceRate: input.priceRate ?? Number(existing.priceRate),
    priceUom: input.priceUom ?? existing.priceUom,
    status: input.status ?? existing.status,
    effectiveFrom: input.effectiveFrom ?? existing.effectiveFrom,
    effectiveTo: input.effectiveTo === undefined ? existing.effectiveTo : input.effectiveTo,
    notes: input.notes === undefined ? existing.notes : input.notes,
  });
  return persistParsed(parsed, actor, id);
}

export async function setMarketMetalPriceDefaultStatus(
  id: string,
  status: ParsedMarketMetalPriceDefault['status'],
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.marketMetalPriceDefault.findUnique({ where: { id } });
  if (!existing) fail('Market metal price default not found.', 'NOT_FOUND');
  const parsed = parseMarketMetalPriceDefaultInput({
    metalType: existing.metalType,
    priceRate: Number(existing.priceRate),
    priceUom: existing.priceUom,
    status,
    effectiveFrom: existing.effectiveFrom,
    effectiveTo: existing.effectiveTo,
    notes: existing.notes,
  });
  const action = status === 'ACTIVE' ? 'ACTIVATED' : status === 'INACTIVE' ? 'DEACTIVATED' : 'UPDATED';
  return persistParsed(parsed, actor, id, action);
}

export async function listMarketMetalPriceDefaultAudit(entityId: string) {
  const prisma = requirePrisma();
  return prisma.auditEvent.findMany({
    where: { entity: 'MarketMetalPriceDefault', entityId },
    orderBy: { at: 'desc' },
    take: 100,
  });
}
