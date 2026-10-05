import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { issue } from '../platform/errors/domainError';
import {
  canonicalizeCode,
  canonicalizeCountryCode,
  dateOnlyToUtc,
  dateRangesOverlap,
  formatDateOnlyUtc,
  parseDateOnly,
} from '../domain/shippingCostCanonical';
import {
  rateRowFromPersistence,
  resolveShippingRateFromRows,
  type ShippingRateResolveInput,
  type ShippingRateResolveResult,
} from '../domain/shippingCostResolver';
import { uniqueDestinationPortsFromCombinations } from '../domain/customerDeliveryCombination';
function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorId(actor: RequestActor): string | null {
  return actor.id || actor.email || null;
}

function fail(issueCode: string, message: string, extra?: Record<string, unknown>): never {
  throw issue('VALIDATION_FAILED', message, { issueCode, ...extra });
}

function serializePort(row: {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  active: boolean;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return row;
}

function serializeIncoterm(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return row;
}

function serializeRate(row: {
  id: string;
  destinationPortCode: string;
  incotermCode: string;
  containerTypeCode: string;
  rateAmount: Prisma.Decimal;
  currencyCode: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const match = rateRowFromPersistence(row);
  return {
    id: row.id,
    destinationPortCode: match.destinationPortCode,
    incotermCode: match.incotermCode,
    containerTypeCode: match.containerTypeCode,
    rateAmount: match.rateAmount,
    currencyCode: match.currencyCode,
    effectiveFrom: match.effectiveFrom,
    effectiveTo: match.effectiveTo,
    active: row.active,
    notes: row.notes,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function auditPayload(rate: ReturnType<typeof serializeRate>) {
  return {
    destinationPortCode: rate.destinationPortCode,
    incotermCode: rate.incotermCode,
    containerTypeCode: rate.containerTypeCode,
    rateAmount: rate.rateAmount,
    currencyCode: rate.currencyCode,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    active: rate.active,
    notes: rate.notes,
  };
}

function requireNonEmptyName(value: unknown, label: string): string {
  const name = String(value ?? '').trim();
  if (!name) fail('INVALID_NAME', `${label} is required.`);
  return name;
}

function requireCode(value: unknown, label: string): string {
  const code = canonicalizeCode(value);
  if (!code) fail('INVALID_CODE', `${label} is required.`);
  return code;
}

function parseAmount(value: unknown): Prisma.Decimal {
  if (value === null || value === undefined || value === '') {
    fail('INVALID_RATE_AMOUNT', 'Rate amount is required and must be greater than zero.');
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    fail('INVALID_RATE_AMOUNT', 'Rate amount must be greater than zero.');
  }
  return new Prisma.Decimal(String(value));
}

function parseRequiredDate(value: unknown, label: string): string {
  const iso = parseDateOnly(value);
  if (!iso) fail('INVALID_DATE_RANGE', `${label} must be a calendar date (YYYY-MM-DD).`);
  return iso;
}

function parseOptionalDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return parseRequiredDate(value, label);
}

async function assertNoActiveOverlap(
  tx: Prisma.TransactionClient,
  grain: { destinationPortCode: string; incotermCode: string; containerTypeCode: string },
  effectiveFrom: string,
  effectiveTo: string | null,
  excludeId?: string
) {
  const others = await tx.shippingCostRate.findMany({
    where: {
      destinationPortCode: grain.destinationPortCode,
      incotermCode: grain.incotermCode,
      containerTypeCode: grain.containerTypeCode,
      active: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  const overlapping = others.filter((row) =>
    dateRangesOverlap(
      effectiveFrom,
      effectiveTo,
      formatDateOnlyUtc(row.effectiveFrom),
      row.effectiveTo ? formatDateOnlyUtc(row.effectiveTo) : null
    )
  );
  if (overlapping.length > 0) {
    fail(
      'RATE_OVERLAP',
      'An active shipping cost rate already covers part of this period for the same destination, incoterm, and container type.',
      { overlappingIds: overlapping.map((row) => row.id) }
    );
  }
}

async function assertMastersForNewRate(
  prisma: Prisma.TransactionClient | ReturnType<typeof requirePrisma>,
  codes: {
    destinationPortCode: string;
    incotermCode: string;
    containerTypeCode: string;
    currencyCode: string;
  }
) {
  const [port, incoterm, type, currency] = await Promise.all([
    prisma.destinationPort.findUnique({ where: { code: codes.destinationPortCode } }),
    prisma.incoterm.findUnique({ where: { code: codes.incotermCode } }),
    prisma.containerType.findUnique({ where: { code: codes.containerTypeCode } }),
    prisma.costingCurrency.findUnique({ where: { code: codes.currencyCode } }),
  ]);
  if (!port) fail('DESTINATION_PORT_NOT_FOUND', `Destination port ${codes.destinationPortCode} was not found.`);
  if (!port.active) fail('DESTINATION_PORT_INACTIVE', `Destination port ${codes.destinationPortCode} is inactive.`);
  if (!incoterm) fail('INCOTERM_NOT_FOUND', `Incoterm ${codes.incotermCode} was not found.`);
  if (!incoterm.active) fail('INCOTERM_INACTIVE', `Incoterm ${codes.incotermCode} is inactive.`);
  if (!type) fail('CONTAINER_TYPE_NOT_FOUND', `Container type ${codes.containerTypeCode} was not found.`);
  if (!type.active) fail('CONTAINER_TYPE_INACTIVE', `Container type ${codes.containerTypeCode} is inactive.`);
  if (!currency) fail('CURRENCY_NOT_FOUND', `Currency ${codes.currencyCode} was not found.`);
  if (currency.status !== 'ACTIVE') fail('CURRENCY_INACTIVE', `Currency ${codes.currencyCode} is inactive.`);
}

export async function listDestinationPorts(filter?: { active?: boolean }) {
  const prisma = requirePrisma();
  return prisma.destinationPort.findMany({
    where: filter?.active === undefined ? undefined : { active: filter.active },
    orderBy: { code: 'asc' },
  });
}

export async function getDestinationPort(idOrCode: string) {
  const prisma = requirePrisma();
  const code = canonicalizeCode(idOrCode);
  const row = await prisma.destinationPort.findFirst({
    where: { OR: [{ id: idOrCode }, { code }] },
  });
  if (!row) throw issue('NOT_FOUND', `Destination port ${idOrCode} was not found.`);
  return serializePort(row);
}

export async function listCustomerDeliveryCombinations(customerMasterId?: string | null) {
  const id = String(customerMasterId || '').trim();
  if (!id) return [];
  const prisma = requirePrisma();
  const rows = await prisma.customerDeliveryCombination.findMany({
    where: { customerId: id, active: true },
    include: { destinationPort: true, incoterm: true },
    orderBy: [{ countryLabel: 'asc' }, { destinationPortCode: 'asc' }, { incotermCode: 'asc' }],
  });
  return rows
    .filter((row) => row.destinationPort.active && row.incoterm.active)
    .map((row) => ({
      countryCode: row.countryCode,
      countryLabel: row.countryLabel,
      incotermCode: row.incotermCode,
      destinationPortCode: row.destinationPortCode,
      destinationPortName: row.destinationPort.name,
      isDefault: row.isDefault,
      active: row.active,
    }));
}

export async function listApprovedShipmentMasters(customerMasterId?: string | null) {
  const incoterms = await listIncoterms();
  const combinations = await listCustomerDeliveryCombinations(customerMasterId);
  return {
    destinationPorts: uniqueDestinationPortsFromCombinations(combinations),
    incoterms: incoterms.map((row) => ({ code: row.code, name: row.name, active: row.active })),
    combinations,
  };
}

export async function createDestinationPort(
  input: { code?: unknown; name?: unknown; countryCode?: unknown; notes?: unknown; active?: unknown },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const code = requireCode(input.code, 'Destination port code');
  const name = requireNonEmptyName(input.name, 'Destination port name');
  const countryCode = canonicalizeCountryCode(input.countryCode);
  if (!countryCode) fail('INVALID_COUNTRY_CODE', 'countryCode must be an ISO 3166-1 alpha-2 code.');
  const active = input.active === undefined ? true : Boolean(input.active);
  const notes = input.notes == null ? null : String(input.notes);
  try {
    const created = await prisma.destinationPort.create({
      data: {
        code,
        name,
        countryCode,
        active,
        notes,
        createdBy: actorId(actor),
        updatedBy: actorId(actor),
      },
    });
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'DestinationPort',
      entityId: created.id,
      action: 'DESTINATION_PORT_CREATED',
      newValue: serializePort(created),
      message: `Destination port ${created.code} created`,
    });
    return serializePort(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      fail('DUPLICATE_CODE', `Destination port code ${code} already exists.`);
    }
    throw err;
  }
}

export async function updateDestinationPort(
  idOrCode: string,
  input: { name?: unknown; countryCode?: unknown; notes?: unknown; active?: unknown },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const existing = await getDestinationPort(idOrCode);
  const data: Prisma.DestinationPortUpdateInput = { updatedBy: actorId(actor) };
  if (input.name !== undefined) data.name = requireNonEmptyName(input.name, 'Destination port name');
  if (input.countryCode !== undefined) {
    const countryCode = canonicalizeCountryCode(input.countryCode);
    if (!countryCode) fail('INVALID_COUNTRY_CODE', 'countryCode must be an ISO 3166-1 alpha-2 code.');
    data.countryCode = countryCode;
  }
  if (input.notes !== undefined) data.notes = input.notes == null ? null : String(input.notes);
  if (input.active !== undefined) data.active = Boolean(input.active);
  const updated = await prisma.destinationPort.update({ where: { id: existing.id }, data });
  const activeChanged = existing.active !== updated.active;
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'DestinationPort',
    entityId: updated.id,
    action: activeChanged
      ? updated.active
        ? 'DESTINATION_PORT_ACTIVATED'
        : 'DESTINATION_PORT_DEACTIVATED'
      : 'DESTINATION_PORT_UPDATED',
    oldValue: existing,
    newValue: serializePort(updated),
    message: `Destination port ${updated.code} ${activeChanged ? (updated.active ? 'activated' : 'deactivated') : 'updated'}`,
  });
  return serializePort(updated);
}

export async function listIncoterms(filter?: { active?: boolean }) {
  const prisma = requirePrisma();
  return prisma.incoterm.findMany({
    where: filter?.active === undefined ? undefined : { active: filter.active },
    orderBy: { code: 'asc' },
  });
}

export async function getIncoterm(idOrCode: string) {
  const prisma = requirePrisma();
  const code = canonicalizeCode(idOrCode);
  const row = await prisma.incoterm.findFirst({
    where: { OR: [{ id: idOrCode }, { code }] },
  });
  if (!row) throw issue('NOT_FOUND', `Incoterm ${idOrCode} was not found.`);
  return serializeIncoterm(row);
}

export async function createIncoterm(
  input: { code?: unknown; name?: unknown; description?: unknown; active?: unknown },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const code = requireCode(input.code, 'Incoterm code');
  const name = requireNonEmptyName(input.name, 'Incoterm name');
  const description = input.description == null ? null : String(input.description);
  const active = input.active === undefined ? true : Boolean(input.active);
  try {
    const created = await prisma.incoterm.create({
      data: {
        code,
        name,
        description,
        active,
        createdBy: actorId(actor),
        updatedBy: actorId(actor),
      },
    });
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'Incoterm',
      entityId: created.id,
      action: 'INCOTERM_CREATED',
      newValue: serializeIncoterm(created),
      message: `Incoterm ${created.code} created`,
    });
    return serializeIncoterm(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      fail('DUPLICATE_CODE', `Incoterm code ${code} already exists.`);
    }
    throw err;
  }
}

export async function updateIncoterm(
  idOrCode: string,
  input: { name?: unknown; description?: unknown; active?: unknown },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const existing = await getIncoterm(idOrCode);
  const data: Prisma.IncotermUpdateInput = { updatedBy: actorId(actor) };
  if (input.name !== undefined) data.name = requireNonEmptyName(input.name, 'Incoterm name');
  if (input.description !== undefined) data.description = input.description == null ? null : String(input.description);
  if (input.active !== undefined) data.active = Boolean(input.active);
  const updated = await prisma.incoterm.update({ where: { id: existing.id }, data });
  const activeChanged = existing.active !== updated.active;
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'Incoterm',
    entityId: updated.id,
    action: activeChanged
      ? updated.active
        ? 'INCOTERM_ACTIVATED'
        : 'INCOTERM_DEACTIVATED'
      : 'INCOTERM_UPDATED',
    oldValue: existing,
    newValue: serializeIncoterm(updated),
    message: `Incoterm ${updated.code} ${activeChanged ? (updated.active ? 'activated' : 'deactivated') : 'updated'}`,
  });
  return serializeIncoterm(updated);
}

export async function listShippingCostRates(filter?: {
  destinationPortCode?: string;
  incotermCode?: string;
  containerTypeCode?: string;
  active?: boolean;
}) {
  const prisma = requirePrisma();
  const rows = await prisma.shippingCostRate.findMany({
    where: {
      ...(filter?.destinationPortCode
        ? { destinationPortCode: canonicalizeCode(filter.destinationPortCode) }
        : {}),
      ...(filter?.incotermCode ? { incotermCode: canonicalizeCode(filter.incotermCode) } : {}),
      ...(filter?.containerTypeCode
        ? { containerTypeCode: canonicalizeCode(filter.containerTypeCode) }
        : {}),
      ...(filter?.active === undefined ? {} : { active: filter.active }),
    },
    orderBy: [{ destinationPortCode: 'asc' }, { incotermCode: 'asc' }, { containerTypeCode: 'asc' }, { effectiveFrom: 'asc' }],
  });
  return rows.map(serializeRate);
}

export async function getShippingCostRate(id: string) {
  const prisma = requirePrisma();
  const row = await prisma.shippingCostRate.findUnique({ where: { id } });
  if (!row) throw issue('NOT_FOUND', `Shipping cost rate ${id} was not found.`);
  return serializeRate(row);
}

export async function createShippingCostRate(
  input: {
    destinationPortCode?: unknown;
    incotermCode?: unknown;
    containerTypeCode?: unknown;
    rateAmount?: unknown;
    currencyCode?: unknown;
    effectiveFrom?: unknown;
    effectiveTo?: unknown;
    notes?: unknown;
    active?: unknown;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const destinationPortCode = requireCode(input.destinationPortCode, 'Destination port code');
  const incotermCode = requireCode(input.incotermCode, 'Incoterm code');
  const containerTypeCode = requireCode(input.containerTypeCode, 'Container type code');
  const currencyCode = requireCode(input.currencyCode, 'Currency code');
  const rateAmount = parseAmount(input.rateAmount);
  const effectiveFrom = parseRequiredDate(input.effectiveFrom, 'effectiveFrom');
  const effectiveTo = parseOptionalDate(input.effectiveTo, 'effectiveTo');
  if (effectiveTo && effectiveTo < effectiveFrom) {
    fail('INVALID_DATE_RANGE', 'effectiveTo must be on or after effectiveFrom.');
  }
  const active = input.active === undefined ? true : Boolean(input.active);
  const notes = input.notes == null ? null : String(input.notes);

  const created = await prisma.$transaction(async (tx) => {
    await assertMastersForNewRate(tx, {
      destinationPortCode,
      incotermCode,
      containerTypeCode,
      currencyCode,
    });
    if (active) {
      await assertNoActiveOverlap(
        tx,
        { destinationPortCode, incotermCode, containerTypeCode },
        effectiveFrom,
        effectiveTo
      );
    }
    return tx.shippingCostRate.create({
      data: {
        destinationPortCode,
        incotermCode,
        containerTypeCode,
        currencyCode,
        rateAmount,
        effectiveFrom: dateOnlyToUtc(effectiveFrom),
        effectiveTo: effectiveTo ? dateOnlyToUtc(effectiveTo) : null,
        active,
        notes,
        createdBy: actorId(actor),
        updatedBy: actorId(actor),
      },
    });
  });
  const serialized = serializeRate(created);
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ShippingCostRate',
    entityId: created.id,
    action: 'SHIPPING_COST_RATE_CREATED',
    newValue: auditPayload(serialized),
    message: `Shipping cost rate ${destinationPortCode}/${incotermCode}/${containerTypeCode} created`,
  });
  return serialized;
}

export async function updateShippingCostRate(
  id: string,
  input: { effectiveTo?: unknown; active?: unknown; notes?: unknown },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const existingRow = await prisma.shippingCostRate.findUnique({ where: { id } });
  if (!existingRow) throw issue('NOT_FOUND', `Shipping cost rate ${id} was not found.`);
  const existing = serializeRate(existingRow);

  const nextEffectiveTo =
    input.effectiveTo !== undefined ? parseOptionalDate(input.effectiveTo, 'effectiveTo') : existing.effectiveTo;
  const nextActive = input.active !== undefined ? Boolean(input.active) : existing.active;
  const nextNotes = input.notes !== undefined ? (input.notes == null ? null : String(input.notes)) : existing.notes;

  if (nextEffectiveTo && nextEffectiveTo < existing.effectiveFrom) {
    fail('INVALID_DATE_RANGE', 'effectiveTo must be on or after effectiveFrom.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (nextActive) {
      await assertNoActiveOverlap(
        tx,
        {
          destinationPortCode: existing.destinationPortCode,
          incotermCode: existing.incotermCode,
          containerTypeCode: existing.containerTypeCode,
        },
        existing.effectiveFrom,
        nextEffectiveTo,
        id
      );
    }
    return tx.shippingCostRate.update({
      where: { id },
      data: {
        effectiveTo: nextEffectiveTo ? dateOnlyToUtc(nextEffectiveTo) : null,
        active: nextActive,
        notes: nextNotes,
        updatedBy: actorId(actor),
      },
    });
  });
  const serialized = serializeRate(updated);
  const datesChanged = existing.effectiveTo !== serialized.effectiveTo;
  const activeChanged = existing.active !== serialized.active;
  const action = datesChanged
    ? 'SHIPPING_COST_RATE_DATES_CHANGED'
    : activeChanged
      ? serialized.active
        ? 'SHIPPING_COST_RATE_ACTIVATED'
        : 'SHIPPING_COST_RATE_DEACTIVATED'
      : 'SHIPPING_COST_RATE_UPDATED';
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ShippingCostRate',
    entityId: id,
    action,
    oldValue: auditPayload(existing),
    newValue: auditPayload(serialized),
    message: `Shipping cost rate ${id} ${action.toLowerCase()}`,
  });
  return serialized;
}

type ShippingRateDb = {
  shippingCostRate: {
    findMany: (args: {
      where: {
        destinationPortCode: string;
        incotermCode: string;
        containerTypeCode: string;
        active: boolean;
      };
    }) => Promise<
      Array<{
        id: string;
        destinationPortCode: string;
        incotermCode: string;
        containerTypeCode: string;
        rateAmount: Prisma.Decimal;
        currencyCode: string;
        effectiveFrom: Date;
        effectiveTo: Date | null;
        active: boolean;
      }>
    >;
  };
};

/** B4-B resolver against an explicit client (including a transaction). Does not default asOfDate. */
export async function resolveShippingCostRateOn(
  db: ShippingRateDb,
  input: ShippingRateResolveInput
): Promise<ShippingRateResolveResult> {
  const destinationPortCode = canonicalizeCode(input.destinationPortCode);
  const incotermCode = canonicalizeCode(input.incotermCode);
  const containerTypeCode = canonicalizeCode(input.containerTypeCode);
  const asOfDate = parseDateOnly(input.asOfDate);
  if (!destinationPortCode || !incotermCode || !containerTypeCode) {
    fail('INVALID_CODE', 'destinationPortCode, incotermCode, and containerTypeCode are required.');
  }
  if (!asOfDate) {
    fail('INVALID_AS_OF_DATE', 'asOfDate is required as a calendar date (YYYY-MM-DD). The resolver does not default the date.');
  }
  const rows = await db.shippingCostRate.findMany({
    where: { destinationPortCode, incotermCode, containerTypeCode, active: true },
  });
  return resolveShippingRateFromRows(rows.map(rateRowFromPersistence), {
    destinationPortCode,
    incotermCode,
    containerTypeCode,
    asOfDate,
  });
}

export async function resolveShippingCostRate(
  input: ShippingRateResolveInput
): Promise<ShippingRateResolveResult> {
  return resolveShippingCostRateOn(requirePrisma(), input);
}
