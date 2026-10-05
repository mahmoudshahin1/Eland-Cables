import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { resolveScrapRuleCode } from './costingDocumentSequence';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

async function appendScrapAudit(
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
      entity: 'CostingScrapRule',
      entityId,
      action,
      oldValue: oldValue != null ? (oldValue as Prisma.InputJsonValue) : undefined,
      newValue: newValue != null ? (newValue as Prisma.InputJsonValue) : undefined,
      message,
    },
  });
}

export async function listCostingScrapRules(filter?: { workflowStatus?: string; scopeType?: string }) {
  const prisma = requirePrisma();
  return prisma.costingScrapRule.findMany({
    where: {
      isCurrent: true,
      ...(filter?.workflowStatus ? { workflowStatus: filter.workflowStatus as never } : {}),
      ...(filter?.scopeType ? { scopeType: filter.scopeType as never } : {}),
    },
    orderBy: [{ priority: 'asc' }, { code: 'asc' }],
  });
}

export async function getCostingScrapRuleById(id: string) {
  const prisma = requirePrisma();
  return prisma.costingScrapRule.findUnique({ where: { id } });
}

export async function createCostingScrapRule(
  data: {
    code?: string;
    name: string;
    description?: string;
    scopeType?: string;
    scopeValue?: string;
    materialClass?: string;
    scrapRate?: number | string | null;
    priority?: number;
    effectiveFrom?: string;
    effectiveTo?: string;
    sourceReference?: string;
    changeNotes?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const requested = data.code;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await resolveScrapRuleCode(requested);
    try {
      const created = await prisma.costingScrapRule.create({
        data: {
          code,
          name: data.name,
          description: data.description,
          scopeType: (data.scopeType || 'GLOBAL') as never,
          scopeValue: data.scopeValue,
          materialClass: data.materialClass,
          scrapRate: data.scrapRate != null ? new Prisma.Decimal(String(data.scrapRate)) : null,
          priority: data.priority ?? 100,
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
          effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
          sourceReference: data.sourceReference,
          changeNotes: data.changeNotes,
          workflowStatus: 'DRAFT',
          createdBy: actorLabel(actor),
        },
      });

      await appendScrapAudit(created.id, 'COSTING_SCRAP_RULE_CREATED', actor, undefined, { code });
      return created;
    } catch (err) {
      lastError = err;
      const codeName = (err as { code?: string }).code;
      if (codeName === 'P2002' && !(requested || '').trim()) continue;
      throw err;
    }
  }
  throw lastError;
}

export async function updateCostingScrapRuleDraft(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    scopeType: string;
    scopeValue: string;
    materialClass: string;
    scrapRate: number | string | null;
    priority: number;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    sourceReference: string;
    changeNotes: string;
  }>,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingScrapRule.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Scrap rule not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!['DRAFT', 'VALIDATION', 'REJECTED'].includes(existing.workflowStatus)) {
    const err = new Error('Only DRAFT scrap rules can be edited.');
    (err as Error & { code: string }).code = 'SCRAP_RULE_NOT_EDITABLE';
    throw err;
  }

  const updated = await prisma.costingScrapRule.update({
    where: { id },
    data: {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.description != null ? { description: data.description } : {}),
      ...(data.scopeType != null ? { scopeType: data.scopeType as never } : {}),
      ...(data.scopeValue !== undefined ? { scopeValue: data.scopeValue } : {}),
      ...(data.materialClass !== undefined ? { materialClass: data.materialClass } : {}),
      ...(data.scrapRate !== undefined
        ? { scrapRate: data.scrapRate != null ? new Prisma.Decimal(String(data.scrapRate)) : null }
        : {}),
      ...(data.priority != null ? { priority: data.priority } : {}),
      ...(data.effectiveFrom !== undefined
        ? { effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null }
        : {}),
      ...(data.effectiveTo !== undefined ? { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null } : {}),
      ...(data.sourceReference !== undefined ? { sourceReference: data.sourceReference } : {}),
      ...(data.changeNotes !== undefined ? { changeNotes: data.changeNotes } : {}),
      updatedBy: actorLabel(actor),
    },
  });

  await appendScrapAudit(id, 'COSTING_SCRAP_RULE_UPDATED', actor, existing, updated);
  return updated;
}

async function transitionScrapRule(
  id: string,
  from: string[],
  to: string,
  actor: { id?: string; name?: string; email?: string },
  extra?: Partial<{
    validatedBy: string;
    validatedAt: Date;
    submittedBy: string;
    submittedAt: Date;
    approvedBy: string;
    approvedAt: Date;
    activatedAt: Date;
  }>
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingScrapRule.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Scrap rule not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!from.includes(existing.workflowStatus)) {
    const err = new Error(`Cannot transition from ${existing.workflowStatus} to ${to}.`);
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }

  const updated = await prisma.costingScrapRule.update({
    where: { id },
    data: { workflowStatus: to as never, updatedBy: actorLabel(actor), ...extra },
  });

  await appendScrapAudit(id, `COSTING_SCRAP_RULE_${to}`, actor, { workflowStatus: existing.workflowStatus }, { workflowStatus: to });
  return updated;
}

export function submitCostingScrapRule(id: string, actor: { id?: string; name?: string; email?: string }) {
  return transitionScrapRule(id, ['DRAFT', 'VALIDATION'], 'SUBMITTED', actor, {
    submittedBy: actorLabel(actor),
    submittedAt: new Date(),
  });
}

export function validateCostingScrapRule(id: string, actor: { id?: string; name?: string; email?: string }) {
  return transitionScrapRule(id, ['DRAFT'], 'VALIDATION', actor, {
    validatedBy: actorLabel(actor),
    validatedAt: new Date(),
  });
}

export function approveCostingScrapRule(id: string, actor: { id?: string; name?: string; email?: string }) {
  return transitionScrapRule(id, ['SUBMITTED'], 'APPROVED', actor, {
    approvedBy: actorLabel(actor),
    approvedAt: new Date(),
  });
}

export async function processBulkScrapRuleApprove(
  ids: string[],
  actor: { id?: string; name?: string; email?: string }
) {
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  const approved: string[] = [];
  const skipped: Array<{ id: string; reason: string; workflowStatus?: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const prisma = requirePrisma();

  for (const id of unique) {
    const current = await prisma.costingScrapRule.findUnique({ where: { id } });
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
      await approveCostingScrapRule(id, actor);
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

export async function activateCostingScrapRule(id: string, actor: { id?: string; name?: string; email?: string }) {
  const prisma = requirePrisma();
  const existing = await prisma.costingScrapRule.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Scrap rule not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (existing.workflowStatus !== 'APPROVED' && existing.workflowStatus !== 'DRAFT') {
    const err = new Error('Scrap rule must be APPROVED before activation.');
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }

  const updated = await prisma.costingScrapRule.update({
    where: { id },
    data: {
      workflowStatus: 'ACTIVE',
      activatedAt: new Date(),
      approvedBy: existing.approvedBy || actorLabel(actor),
      approvedAt: existing.approvedAt || new Date(),
      updatedBy: actorLabel(actor),
    },
  });

  await appendScrapAudit(id, 'COSTING_SCRAP_RULE_ACTIVATED', actor);
  return updated;
}

export async function listCostingAuditEvents(filter?: { entity?: string; limit?: number }) {
  const prisma = requirePrisma();
  const entities = filter?.entity
    ? [filter.entity]
    : [
        'CostingConfiguration',
        'CostingConfigurationVersion',
        'CostingFormula',
        'CostingFormulaVersion',
        'CostingVariable',
        'CostingComponent',
        'CostingScrapRule',
        'CostingExchangeRate',
        'RawMaterialPrice',
        'CostingCurrency',
        'CostingMetalCostComponent',
      ];

  return prisma.auditEvent.findMany({
    where: { entity: { in: entities } },
    orderBy: { at: 'desc' },
    take: filter?.limit ?? 100,
  });
}

export async function listApprovalQueue() {
  const prisma = requirePrisma();
  const [configVersions, scrapRules, exchangeRates, priceRows, formulas] = await Promise.all([
    prisma.costingConfigurationVersion.findMany({
      where: { workflowStatus: 'SUBMITTED' },
      include: { configuration: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.costingScrapRule.findMany({
      where: { workflowStatus: 'SUBMITTED', isCurrent: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.costingExchangeRate.findMany({
      where: { workflowStatus: 'SUBMITTED', isCurrent: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.rawMaterialPrice.findMany({
      where: { workflowStatus: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      include: { rawMaterial: { select: { description: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    }),
    prisma.costingFormula.findMany({
      where: { status: 'SUBMITTED' as never },
      include: { configurationVersion: { include: { configuration: true } } },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => []),
  ]);

  const rawMaterialPrices = priceRows.filter((p) => !p.rawMaterialCode.toUpperCase().startsWith('I4-RM-')).slice(0, 50);
  return { configVersions, formulas, scrapRules, exchangeRates, rawMaterialPrices };
}
