import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { resolveExchangeRateCode } from './costingDocumentSequence';
import { normalizeCostingCurrency } from '../domain/currencyConversion';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

async function appendFxAudit(
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
      entity: 'CostingExchangeRate',
      entityId,
      action,
      oldValue: oldValue != null ? (oldValue as Prisma.InputJsonValue) : undefined,
      newValue: newValue != null ? (newValue as Prisma.InputJsonValue) : undefined,
      message,
    },
  });
}

export async function listCostingExchangeRates(filter?: { workflowStatus?: string }) {
  const prisma = requirePrisma();
  return prisma.costingExchangeRate.findMany({
    where: {
      isCurrent: true,
      ...(filter?.workflowStatus ? { workflowStatus: filter.workflowStatus as never } : {}),
    },
    orderBy: [{ fromCurrency: 'asc' }, { toCurrency: 'asc' }, { code: 'asc' }],
  });
}

export async function getCostingExchangeRateById(id: string) {
  const prisma = requirePrisma();
  return prisma.costingExchangeRate.findUnique({ where: { id } });
}

export async function createCostingExchangeRate(
  data: {
    code?: string;
    name?: string;
    description?: string;
    fromCurrency: string;
    toCurrency: string;
    rate: number | string;
    effectiveFrom?: string;
    effectiveTo?: string;
    sourceReference?: string;
    changeNotes?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const fromCurrency = normalizeCostingCurrency(data.fromCurrency);
  const toCurrency = normalizeCostingCurrency(data.toCurrency);
  if (!fromCurrency || !toCurrency) {
    const err = new Error('fromCurrency and toCurrency are required.');
    (err as Error & { code: string }).code = 'VALIDATION_ERROR';
    throw err;
  }
  if (fromCurrency === toCurrency) {
    const err = new Error('fromCurrency and toCurrency must be different.');
    (err as Error & { code: string }).code = 'VALIDATION_ERROR';
    throw err;
  }
  const rateNum = Number(data.rate);
  if (!Number.isFinite(rateNum) || rateNum <= 0) {
    const err = new Error('rate must be a positive number entered by Costing Team.');
    (err as Error & { code: string }).code = 'VALIDATION_ERROR';
    throw err;
  }
  const name = (data.name || '').trim() || `${fromCurrency} → ${toCurrency}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await resolveExchangeRateCode(data.code);
    try {
      const created = await prisma.costingExchangeRate.create({
        data: {
          code,
          name,
          description: data.description,
          fromCurrency,
          toCurrency,
          rate: new Prisma.Decimal(String(rateNum)),
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
          effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
          sourceReference: data.sourceReference,
          changeNotes: data.changeNotes,
          workflowStatus: 'DRAFT',
          createdBy: actorLabel(actor),
        },
      });

      await appendFxAudit(created.id, 'COSTING_EXCHANGE_RATE_CREATED', actor, undefined, { code });
      return created;
    } catch (err) {
      lastError = err;
      const codeName = (err as { code?: string }).code;
      if (codeName === 'P2002' && !(data.code || '').trim()) continue;
      throw err;
    }
  }
  throw lastError;
}

export async function updateCostingExchangeRateDraft(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    fromCurrency: string;
    toCurrency: string;
    rate: number | string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    sourceReference: string;
    changeNotes: string;
  }>,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingExchangeRate.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Exchange rate not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!['DRAFT', 'REJECTED'].includes(existing.workflowStatus)) {
    const err = new Error('Only DRAFT or REJECTED exchange rates can be edited.');
    (err as Error & { code: string }).code = 'EXCHANGE_RATE_NOT_EDITABLE';
    throw err;
  }

  const updated = await prisma.costingExchangeRate.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.fromCurrency !== undefined ? { fromCurrency: normalizeCostingCurrency(data.fromCurrency) } : {}),
      ...(data.toCurrency !== undefined ? { toCurrency: normalizeCostingCurrency(data.toCurrency) } : {}),
      ...(data.rate !== undefined ? { rate: new Prisma.Decimal(String(data.rate)) } : {}),
      ...(data.effectiveFrom !== undefined
        ? { effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null }
        : {}),
      ...(data.effectiveTo !== undefined
        ? { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }
        : {}),
      ...(data.sourceReference !== undefined ? { sourceReference: data.sourceReference } : {}),
      ...(data.changeNotes !== undefined ? { changeNotes: data.changeNotes } : {}),
      updatedBy: actorLabel(actor),
    },
  });

  await appendFxAudit(id, 'COSTING_EXCHANGE_RATE_UPDATED', actor, existing, updated);
  return updated;
}

async function transitionExchangeRate(
  id: string,
  from: string[],
  to: 'SUBMITTED' | 'VALIDATED' | 'APPROVED' | 'ACTIVE' | 'DRAFT',
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingExchangeRate.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Exchange rate not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!from.includes(existing.workflowStatus)) {
    const err = new Error(`Cannot transition exchange rate from ${existing.workflowStatus} to ${to}.`);
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }

  const workflowStatus =
    to === 'VALIDATED' ? 'VALIDATION' : to;

  const stamp: Prisma.CostingExchangeRateUpdateInput = {
    workflowStatus,
    updatedBy: actorLabel(actor),
  };
  if (to === 'SUBMITTED') {
    stamp.submittedBy = actorLabel(actor);
    stamp.submittedAt = new Date();
  }
  if (to === 'VALIDATED') {
    stamp.validatedBy = actorLabel(actor);
    stamp.validatedAt = new Date();
  }
  if (to === 'APPROVED') {
    stamp.approvedBy = actorLabel(actor);
    stamp.approvedAt = new Date();
  }
  if (to === 'ACTIVE') {
    stamp.activatedAt = new Date();
  }

  const updated = await prisma.costingExchangeRate.update({ where: { id }, data: stamp });
  await appendFxAudit(id, `COSTING_EXCHANGE_RATE_${to}`, actor, { workflowStatus: existing.workflowStatus }, { workflowStatus: to });
  return updated;
}

export const submitCostingExchangeRate = (id: string, actor: { id?: string; name?: string; email?: string }) =>
  transitionExchangeRate(id, ['DRAFT', 'VALIDATION'], 'SUBMITTED', actor);
export const validateCostingExchangeRate = (id: string, actor: { id?: string; name?: string; email?: string }) =>
  transitionExchangeRate(id, ['DRAFT'], 'VALIDATED', actor);
export const approveCostingExchangeRate = (id: string, actor: { id?: string; name?: string; email?: string }) =>
  transitionExchangeRate(id, ['SUBMITTED'], 'APPROVED', actor);

export async function processBulkExchangeRateApprove(
  ids: string[],
  actor: { id?: string; name?: string; email?: string }
) {
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  const approved: string[] = [];
  const skipped: Array<{ id: string; reason: string; workflowStatus?: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const prisma = requirePrisma();

  for (const id of unique) {
    const current = await prisma.costingExchangeRate.findUnique({ where: { id } });
    if (!current) {
      skipped.push({ id, reason: 'NOT_FOUND' });
      continue;
    }
    if (current.workflowStatus !== 'SUBMITTED') {
      skipped.push({
        id,
        reason: current.workflowStatus === 'APPROVED' || current.workflowStatus === 'ACTIVE' ? 'ALREADY_APPROVED' : 'NOT_PENDING',
        workflowStatus: current.workflowStatus,
      });
      continue;
    }
    try {
      await approveCostingExchangeRate(id, actor);
      approved.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    requested: unique.length,
    approvedCount: approved.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    approved,
    skipped,
    failed,
  };
}

export async function activateCostingExchangeRate(id: string, actor: { id?: string; name?: string; email?: string }) {
  const prisma = requirePrisma();
  const existing = await prisma.costingExchangeRate.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Exchange rate not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (existing.workflowStatus !== 'APPROVED' && existing.workflowStatus !== 'ACTIVE') {
    const err = new Error('Exchange rate must be APPROVED before activation.');
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }

  const updated = await prisma.costingExchangeRate.update({
    where: { id },
    data: {
      workflowStatus: 'ACTIVE',
      activatedAt: new Date(),
      approvedBy: existing.approvedBy || actorLabel(actor),
      approvedAt: existing.approvedAt || new Date(),
      updatedBy: actorLabel(actor),
    },
  });

  await appendFxAudit(id, 'COSTING_EXCHANGE_RATE_ACTIVATED', actor);
  return updated;
}
