import { CostingRunStatus } from '@prisma/client';
import { getPrisma } from './db';
import { appendAudit } from '../platform/audit/auditLogService';
import { CostingRequest } from '../domain/costingEngine';
import { executeCostingForInquiryLine } from './costingOrchestrationService';
import { buildCostingRequestFromPreviewPayload } from '../services/costingRequestService';

function normalizeCostingDate(value?: string | Date): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

/**
 * Increment 13 adapter — delegates cable-level costing to the authoritative orchestrator.
 * Preserves the Inc 10 API contract for Technical Office and /api/costing/* routes.
 */
export async function executeCostingRun(
  req: CostingRequest,
  actor: { id?: string; name?: string; email?: string }
) {
  const built = buildCostingRequestFromPreviewPayload({
    materialNumber: req.materialNumber,
    costingDate: normalizeCostingDate(req.costingDate),
    quantity: req.quantity,
    lengthMeters: req.lengthMeters,
    currency: req.currency,
  });

  if ('error' in built) {
    const err = new Error(built.error);
    (err as Error & { code: string }).code = 'INVALID_REQUEST';
    throw err;
  }

  const result = await executeCostingForInquiryLine({ ...built, previewOnly: false }, actor, {
    persist: true,
  });

  if (result.status === 'NOT_READY') {
    const err = new Error(result.blockingReasons.join('; ') || 'Costing is not ready.');
    (err as Error & { code: string; blockingReasons: string[] }).code =
      result.errorCode || 'COSTING_NOT_READY';
    (err as Error & { code: string; blockingReasons: string[] }).blockingReasons = result.blockingReasons;
    throw err;
  }

  if (!result.costingRunId) {
    const err = new Error('Costing run was not created.');
    (err as Error & { code: string }).code = 'COSTING_RUN_MISSING';
    throw err;
  }

  const run = await getCostingRunById(result.costingRunId);
  if (!run) {
    const err = new Error('Costing run not found after calculation.');
    (err as Error & { code: string }).code = 'COSTING_RUN_MISSING';
    throw err;
  }

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CostingRun',
    entityId: run.costingRunNumber,
    action: 'CREATE',
    newValue: {
      costingRunNumber: run.costingRunNumber,
      materialNumber: req.materialNumber,
      materialCost: run.materialCost,
      calculationId: result.calculationId,
      engine: 'INCREMENT_13_ORCHESTRATOR',
    },
    message: `Cable costing calculated via Inc 13 orchestrator: ${run.materialCost} ${run.currency} for ${req.materialNumber}`,
  });

  return { ...run, calculationId: result.calculationId };
}

export async function listCostingRuns(filters?: {
  materialNumber?: string;
  status?: CostingRunStatus;
  isCurrent?: boolean;
}) {
  const prisma = requirePrisma();
  const runs = await prisma.costingRun.findMany({
    where: {
      ...(filters?.materialNumber ? { materialNumber: filters.materialNumber } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.isCurrent !== undefined ? { isCurrent: filters.isCurrent } : {}),
    },
    include: { costingLines: true, cable: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return runs.map(formatCostingRunDetail);
}

export async function getCostingRunById(id: string) {
  const prisma = requirePrisma();
  const run = await prisma.costingRun.findFirst({
    where: {
      OR: [{ id }, { costingRunNumber: id }, { materialNumber: id }],
    },
    include: { costingLines: true, cable: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!run) return null;
  return formatCostingRunDetail(run);
}

export async function recalculateCostingRun(
  costingId: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const previous = await prisma.costingRun.findFirst({
    where: { OR: [{ id: costingId }, { costingRunNumber: costingId }] },
  });
  if (!previous) {
    const err = new Error(`Costing run ${costingId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const newRun = await executeCostingRun(
    {
      materialNumber: previous.materialNumber,
      costingDate: new Date().toISOString().slice(0, 10),
      quantity: Number(previous.quantity),
      lengthMeters: Number(previous.lengthMeters),
      currency: previous.currency,
    },
    actor
  );

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CostingRun',
    entityId: newRun.costingRunNumber,
    action: 'UPDATE',
    oldValue: { previousCostingRunNumber: previous.costingRunNumber },
    newValue: { newCostingRunNumber: newRun.costingRunNumber, calculationId: (newRun as { calculationId?: string }).calculationId },
    message: `Recalculated via Inc 13 orchestrator: ${previous.costingRunNumber} → ${newRun.costingRunNumber}`,
  });

  return newRun;
}

function formatCostingRunDetail(run: {
  id: string;
  costingRunNumber: string;
  materialNumber: string;
  cable?: { description?: string } | null;
  costingDate: Date;
  currency: string;
  quantity: unknown;
  lengthMeters: unknown;
  lengthKm: unknown;
  engineeringRevision: number;
  bomVersion: number;
  status: string;
  materialCost: unknown;
  processCostStatus: string;
  overheadCostStatus: string;
  scrapCostStatus: string;
  manufacturingCost: unknown;
  configurationVersionId?: string | null;
  containerStudyResultId?: string | null;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: Date;
  costingLines?: Array<Record<string, unknown>>;
}) {
  return {
    id: run.id,
    costingRunNumber: run.costingRunNumber,
    materialNumber: run.materialNumber,
    cableDescription: run.cable?.description || '',
    costingDate: run.costingDate,
    currency: run.currency,
    quantity: Number(run.quantity),
    lengthMeters: Number(run.lengthMeters),
    lengthKm: Number(run.lengthKm),
    engineeringRevision: run.engineeringRevision,
    bomVersion: run.bomVersion,
    configurationVersionId: run.configurationVersionId || null,
    containerStudyResultId: run.containerStudyResultId || null,
    costingStatus: run.status,
    materialCost: Number(run.materialCost),
    processCostStatus: run.processCostStatus,
    overheadCostStatus: run.overheadCostStatus,
    scrapCostStatus: run.scrapCostStatus,
    manufacturingCost: run.manufacturingCost != null ? Number(run.manufacturingCost) : null,
    isCurrent: run.isCurrent,
    createdBy: run.createdBy,
    createdAt: run.createdAt,
    costingLines: (run.costingLines || []).map((l) => ({
      id: l.id,
      componentType: l.componentType,
      rawMaterialCode: l.rawMaterialCode,
      rawMaterialDesc: l.rawMaterialDesc,
      consumptionPerKm: l.consumptionPerKm != null ? Number(l.consumptionPerKm) : null,
      totalConsumption: l.totalConsumption != null ? Number(l.totalConsumption) : null,
      consumptionUom: l.consumptionUom,
      price: l.price != null ? Number(l.price) : null,
      priceCurrency: l.priceCurrency,
      priceUom: l.priceUom,
      priceBasis: l.priceBasis,
      priceRevision: l.priceRevision,
      priceId: l.priceId,
      effectiveFrom: l.effectiveFrom,
      effectiveTo: l.effectiveTo,
      lineCost: l.lineCost != null ? Number(l.lineCost) : null,
      calculationNotes: l.calculationNotes,
    })),
  };
}
