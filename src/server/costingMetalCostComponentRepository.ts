import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { normalizeCostingCurrency } from '../domain/currencyConversion';
import {
  MetalCostComponentInput,
  MetalCostComponentStatus,
  ParsedMetalCostComponent,
  parseDateOnly,
  periodsOverlap,
  parseMetalCostComponentInput,
  rowToMetalCostComponentInput,
} from '../domain/metalCostComponents';

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
      entity: 'CostingMetalCostComponent',
      entityId,
      action,
      oldValue: oldValue != null ? (oldValue as Prisma.InputJsonValue) : undefined,
      newValue: newValue != null ? (newValue as Prisma.InputJsonValue) : undefined,
    },
  });
}

export type MetalCostComponentFilter = {
  metal?: string;
  componentType?: string;
  currencyCode?: string;
  priceBasis?: string;
  status?: string;
  effectiveDate?: string;
};

export async function listMetalCostComponents(filter?: MetalCostComponentFilter) {
  const prisma = requirePrisma();
  const rows = await prisma.costingMetalCostComponent.findMany({
    where: {
      ...(filter?.metal ? { metal: filter.metal as never } : {}),
      ...(filter?.componentType ? { componentType: filter.componentType as never } : {}),
      ...(filter?.currencyCode ? { currencyCode: normalizeCostingCurrency(filter.currencyCode) } : {}),
      ...(filter?.priceBasis ? { priceBasis: filter.priceBasis as never } : {}),
      ...(filter?.status ? { status: filter.status as never } : {}),
    },
    include: { currency: true },
    orderBy: [{ metal: 'asc' }, { componentType: 'asc' }, { effectiveFrom: 'desc' }],
  });

  if (!filter?.effectiveDate) return rows;
  const day = parseDateOnly(filter.effectiveDate, 'Effective Date', true)!;
  return rows.filter((row) => periodsOverlap(row.effectiveFrom, row.effectiveTo, day, day));
}

export async function getMetalCostComponentById(id: string) {
  const prisma = requirePrisma();
  return prisma.costingMetalCostComponent.findUnique({ where: { id }, include: { currency: true } });
}

async function assertActiveCurrency(code: string) {
  const prisma = requirePrisma();
  const normalized = normalizeCostingCurrency(code);
  const currency = await prisma.costingCurrency.findUnique({ where: { code: normalized } });
  if (!currency) fail('Currency must exist on the Currency Master.');
  if (currency.status !== 'ACTIVE') fail('Currency must be an active Currency Master record.');
  return currency.code;
}

async function assertNoActiveOverlap(parsed: ParsedMetalCostComponent, excludeId?: string) {
  if (parsed.status !== 'ACTIVE') return;
  const prisma = requirePrisma();
  const existing = await prisma.costingMetalCostComponent.findMany({
    where: {
      metal: parsed.metal,
      componentType: parsed.componentType,
      status: 'ACTIVE',
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  const clash = existing.find((row) =>
    periodsOverlap(parsed.effectiveFrom, parsed.effectiveTo, row.effectiveFrom, row.effectiveTo)
  );
  if (clash) {
    fail(
      `An active ${parsed.metal} ${parsed.componentType} component already exists for an overlapping effective period.`,
      'OVERLAPPING_ACTIVE_PERIOD'
    );
  }
}

async function persistParsed(
  parsed: ParsedMetalCostComponent,
  actor: { id?: string; name?: string; email?: string },
  existingId?: string,
  action?: 'CREATED' | 'UPDATED' | 'ACTIVATED' | 'DEACTIVATED'
) {
  const prisma = requirePrisma();
  const currencyCode = await assertActiveCurrency(parsed.currencyCode);
  const withCurrency = { ...parsed, currencyCode };
  await assertNoActiveOverlap(withCurrency, existingId);
  const data = {
    metal: withCurrency.metal,
    componentType: withCurrency.componentType,
    value: new Prisma.Decimal(withCurrency.value),
    currencyCode,
    priceBasis: withCurrency.priceBasis,
    effectiveFrom: withCurrency.effectiveFrom,
    effectiveTo: withCurrency.effectiveTo,
    status: withCurrency.status,
    reference: withCurrency.reference,
    notes: withCurrency.notes,
    updatedBy: actorLabel(actor),
  };

  if (existingId) {
    const existing = await prisma.costingMetalCostComponent.findUnique({ where: { id: existingId } });
    if (!existing) fail('Metal cost component not found.', 'NOT_FOUND');
    const updated = await prisma.costingMetalCostComponent.update({
      where: { id: existingId },
      data,
      include: { currency: true },
    });
    await appendAudit(updated.id, action || 'UPDATED', actor, existing, updated);
    return updated;
  }

  const created = await prisma.costingMetalCostComponent.create({
    data: { ...data, createdBy: actorLabel(actor) },
    include: { currency: true },
  });
  await appendAudit(created.id, action || 'CREATED', actor, undefined, created);
  return created;
}

export async function createMetalCostComponent(
  input: MetalCostComponentInput,
  actor: { id?: string; name?: string; email?: string }
) {
  const parsed = parseMetalCostComponentInput(input, { defaultStatus: 'DRAFT' });
  return persistParsed(parsed, actor);
}

export async function updateMetalCostComponent(
  id: string,
  input: MetalCostComponentInput,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingMetalCostComponent.findUnique({ where: { id } });
  if (!existing) fail('Metal cost component not found.', 'NOT_FOUND');
  const parsed = parseMetalCostComponentInput({
    metal: input.metal ?? existing.metal,
    componentType: input.componentType ?? existing.componentType,
    value: input.value ?? Number(existing.value),
    currency: input.currencyCode || input.currency || existing.currencyCode,
    priceBasis: input.priceBasis ?? existing.priceBasis,
    effectiveFrom: input.effectiveFrom ?? existing.effectiveFrom,
    effectiveTo: input.effectiveTo === undefined ? existing.effectiveTo : input.effectiveTo,
    status: input.status ?? existing.status,
    reference: input.reference === undefined ? existing.reference : input.reference,
    notes: input.notes === undefined ? existing.notes : input.notes,
  });
  return persistParsed(parsed, actor, id);
}

export async function setMetalCostComponentStatus(
  id: string,
  status: MetalCostComponentStatus,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingMetalCostComponent.findUnique({ where: { id } });
  if (!existing) fail('Metal cost component not found.', 'NOT_FOUND');
  const parsed = parseMetalCostComponentInput({
    metal: existing.metal,
    componentType: existing.componentType,
    value: Number(existing.value),
    currency: existing.currencyCode,
    priceBasis: existing.priceBasis,
    effectiveFrom: existing.effectiveFrom,
    effectiveTo: existing.effectiveTo,
    status,
    reference: existing.reference,
    notes: existing.notes,
  });
  const action = status === 'ACTIVE' ? 'ACTIVATED' : status === 'INACTIVE' ? 'DEACTIVATED' : 'UPDATED';
  return persistParsed(parsed, actor, id, action);
}

export function previewMetalCostComponentBulk(rows: Record<string, unknown>[], sourceFile: string) {
  const previewRows: Array<Record<string, unknown>> = [];
  const errors: Array<{ rowNumber: number; code: string; message: string }> = [];
  const warnings: Array<{ rowNumber: number; code: string; message: string }> = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    try {
      parseMetalCostComponentInput(rowToMetalCostComponentInput(row), { forceStatus: 'DRAFT' });
      if (cellStatus(row) && tokenUpper(cellStatus(row)) !== 'DRAFT') {
        warnings.push({
          rowNumber,
          code: 'FORCE_DRAFT',
          message: 'Uploads enter Draft. Status in the file is ignored and will not auto-approve.',
        });
      }
      previewRows.push({ ...row, action: 'INSERT', status: 'DRAFT' });
    } catch (err) {
      const e = err as Error & { code?: string };
      errors.push({ rowNumber, code: e.code || 'VALIDATION_ERROR', message: e.message });
      previewRows.push({ ...row, action: 'ERROR' });
    }
  });
  if (rows.length === 0) {
    errors.push({ rowNumber: 1, code: 'EMPTY', message: 'No data rows in upload.' });
  }
  return {
    batch: {
      batchNumber: 'PREVIEW',
      sourceFile,
      importedDate: new Date().toISOString(),
      dataType: 'metal_cost_components',
      rowCount: rows.length,
      successCount: previewRows.filter((r) => r.action === 'INSERT').length,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors,
      warnings,
      information: [
        {
          rowNumber: 0,
          code: 'OPTION_B',
          message:
            'Master data only. Premium / Shipping / Clearance are not included in Direct Raw Material Cost (Option B — LME/Base Only).',
        },
      ],
      skipped: [],
      insertCount: previewRows.filter((r) => r.action === 'INSERT').length,
      updateCount: 0,
      unchangedCount: 0,
    },
    rows: previewRows,
    previewRows,
  };
}

function cellStatus(row: Record<string, unknown>) {
  const match = Object.keys(row).find((k) => k.trim().toLowerCase() === 'status');
  return match ? String(row[match] || '') : '';
}

function tokenUpper(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export async function commitMetalCostComponentBulk(
  rows: Record<string, unknown>[],
  sourceFile: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const preview = previewMetalCostComponentBulk(rows, sourceFile);
  if (preview.batch.errorCount > 0) {
    fail('Import rejected. Fix validation errors before Apply. No rows were written.');
  }
  const created = [];
  for (const row of rows) {
    const parsed = parseMetalCostComponentInput(rowToMetalCostComponentInput(row), { forceStatus: 'DRAFT' });
    created.push(await persistParsed(parsed, actor));
  }
  return { preview, created, committed: true, forcedStatus: 'DRAFT' as const };
}

export async function listMetalCostComponentAudit(entityId: string) {
  const prisma = requirePrisma();
  return prisma.auditEvent.findMany({
    where: { entity: 'CostingMetalCostComponent', entityId },
    orderBy: { at: 'desc' },
    take: 100,
  });
}
