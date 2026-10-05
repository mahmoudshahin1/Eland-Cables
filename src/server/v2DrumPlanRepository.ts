import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { buildDrumSelectionHandoff } from '../domain/v2CuttingLengthService';
import {
  assertCanConfirmDrumPlan,
  assertDrumSelectionContext,
  buildAuthoritativePlanFromInput,
  buildDrumPlanHandoffDto,
  listV2DrumSelectionCandidates,
  mapAuthoritativePlanToPersistData,
  previewAutomaticDrumPlan,
  previewManualDrumPlan,
  type BuildDrumPlanInput,
  type DrumPlanHandoffDto,
  type DrumSelectionContext,
  type PersistDrumPlanRowInput,
} from '../domain/v2DrumPlanService';
import type { DrumMasterForOptimization } from '../domain/drumOptimizationService';
import {
  loadV2InquiryScoped,
  getV2Inquiry,
} from './v2InquiryConfigurationRepository';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function mapDrumMasterRow(row: {
  id: string;
  drumCode: string;
  drumType: string | null;
  description: string | null;
  flange: Prisma.Decimal;
  barrel: Prisma.Decimal;
  innerWidth: Prisma.Decimal;
  outerWidth: Prisma.Decimal;
  capacity: Prisma.Decimal;
  clearanceMm: Prisma.Decimal | null;
  maxWeight: Prisma.Decimal | null;
  emptyDrumNetWeightKg: Prisma.Decimal | null;
  status: string;
}): DrumMasterForOptimization {
  return {
    id: row.id,
    drumCode: row.drumCode,
    drumType: row.drumType,
    description: row.description,
    flange: Number(row.flange),
    barrel: Number(row.barrel),
    innerWidth: Number(row.innerWidth),
    outerWidth: Number(row.outerWidth),
    capacity: Number(row.capacity),
    clearanceMm: row.clearanceMm != null ? Number(row.clearanceMm) : null,
    maxWeight: row.maxWeight != null ? Number(row.maxWeight) : null,
    emptyDrumNetWeightKg:
      row.emptyDrumNetWeightKg != null ? Number(row.emptyDrumNetWeightKg) : null,
    status: row.status,
  };
}

async function loadActiveDrums(): Promise<DrumMasterForOptimization[]> {
  const prisma = requirePrisma();
  const rows = await prisma.drumMaster.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { drumCode: 'asc' },
  });
  return rows.map(mapDrumMasterRow);
}

async function loadSelectionContext(
  inquiryId: string,
  lineId: string,
  actor: RequestActor,
  opts?: { cuttingLengthPlanId?: string; cuttingLengthRequirementId?: string }
): Promise<{
  inquiry: Awaited<ReturnType<typeof loadV2InquiryScoped>>;
  line: NonNullable<Awaited<ReturnType<typeof loadV2InquiryScoped>>['lines'][number]>;
  context: DrumSelectionContext;
  snapshot: { downstreamGates: unknown; cableMaterialNumber: string | null };
  requirementId: string | null;
}> {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found on inquiry ${inquiry.inquiryNumber}.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const prisma = requirePrisma();
  let requirement = null as Awaited<ReturnType<typeof prisma.v2CuttingLengthRequirement.findFirst>>;
  if (opts?.cuttingLengthRequirementId) {
    requirement = await prisma.v2CuttingLengthRequirement.findFirst({
      where: {
        inquiryLineId: line.id,
        OR: [{ id: opts.cuttingLengthRequirementId }, { requirementId: opts.cuttingLengthRequirementId }],
      },
    });
    if (!requirement) {
      const err = new Error(`Cutting-length requirement ${opts.cuttingLengthRequirementId} was not found.`);
      (err as Error & { code: string }).code = 'NOT_FOUND';
      throw err;
    }
  }

  const planId =
    opts?.cuttingLengthPlanId || requirement?.currentCuttingPlanId || line.v2CurrentCuttingPlanId;
  if (!planId) {
    const err = new Error('Cutting plan is required before drum selection.');
    (err as Error & { code: string }).code = 'CUTTING_PLAN_REQUIRED';
    throw err;
  }

  const cuttingPlan = await prisma.v2CuttingLengthPlan.findFirst({
    where: {
      inquiryLineId: line.id,
      OR: [{ id: planId }, { planId }],
    },
    include: { configurationSnapshot: true },
  });
  if (!cuttingPlan) {
    const err = new Error(`Cutting plan ${planId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  if (!requirement && cuttingPlan.cuttingLengthRequirementId) {
    requirement = await prisma.v2CuttingLengthRequirement.findUnique({
      where: { id: cuttingPlan.cuttingLengthRequirementId },
    });
  }

  const handoff = buildDrumSelectionHandoff({
    plan: {
      planId: cuttingPlan.planId,
      versionNo: cuttingPlan.versionNo,
      configurationSnapshotId: cuttingPlan.configurationSnapshotId,
      configurationSnapshotIdString: cuttingPlan.configurationSnapshotIdString,
      configurationSnapshotVersionNo: cuttingPlan.configurationSnapshotVersionNo,
      nominalLengthM: Number(cuttingPlan.nominalLengthM),
      tolerancePercent: Number(cuttingPlan.tolerancePercent),
      toleranceMode: cuttingPlan.toleranceMode,
      positiveTolerancePercent: Number(cuttingPlan.positiveTolerancePercent),
      negativeTolerancePercent: Number(cuttingPlan.negativeTolerancePercent),
      requestedDrumCount: cuttingPlan.requestedDrumCount,
      cuttingLengthRequirementId: cuttingPlan.cuttingLengthRequirementId,
      minLengthM: Number(cuttingPlan.minLengthM),
      maxLengthM: Number(cuttingPlan.maxLengthM),
      validationStatus: cuttingPlan.validationStatus,
      validationMessages: cuttingPlan.validationMessages,
      notes: cuttingPlan.notes,
      capturedAt: cuttingPlan.capturedAt,
    },
    snapshot: {
      cableMaterialNumber: cuttingPlan.configurationSnapshot.cableMaterialNumber,
      itemCode: cuttingPlan.configurationSnapshot.itemCode,
      customerCode: cuttingPlan.configurationSnapshot.customerCode,
      estimatedDiameterMm: cuttingPlan.configurationSnapshot.estimatedDiameterMm
        ? Number(cuttingPlan.configurationSnapshot.estimatedDiameterMm)
        : null,
      estimatedWeightKgKm: cuttingPlan.configurationSnapshot.estimatedWeightKgKm
        ? Number(cuttingPlan.configurationSnapshot.estimatedWeightKgKm)
        : null,
    },
    lineCurrentSnapshotId: line.v2CurrentSnapshotId,
  });

  const context = assertDrumSelectionContext({
    handoff,
    lineCurrentCuttingPlanId: line.v2CurrentCuttingPlanId,
    lineCurrentSnapshotId: line.v2CurrentSnapshotId,
    cuttingLengthPlanId: cuttingPlan.id,
    cuttingPlanConfigurationSnapshotId: cuttingPlan.configurationSnapshotId,
    downstreamGates: cuttingPlan.configurationSnapshot.downstreamGates,
    requirementCurrentCuttingPlanId: requirement?.currentCuttingPlanId ?? cuttingPlan.id,
    cuttingLengthRequirementId: requirement?.id ?? cuttingPlan.cuttingLengthRequirementId,
  });

  return {
    inquiry,
    line,
    context,
    snapshot: {
      downstreamGates: cuttingPlan.configurationSnapshot.downstreamGates,
      cableMaterialNumber: cuttingPlan.configurationSnapshot.cableMaterialNumber,
    },
    requirementId: requirement?.id ?? cuttingPlan.cuttingLengthRequirementId,
  };
}

function assertInquiryEditable(inquiry: { inquiryNumber: string; status: string }) {
  const lockedStatuses = ['READY_FOR_COMMERCIAL', 'QUOTED', 'CLOSED', 'CANCELLED'] as const;
  if (lockedStatuses.includes(inquiry.status as (typeof lockedStatuses)[number])) {
    const err = new Error(
      `Inquiry ${inquiry.inquiryNumber} is locked at ${inquiry.status} — drum plans cannot be amended.`
    );
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
}

function mapPlanRow(
  row: {
    id: string;
    planId: string;
    versionNo: number;
    inquiryLineId: string;
    cuttingLengthRequirementId?: string | null;
    cuttingLengthPlanId: string;
    cuttingLengthPlanVersionNo: number;
    cuttingLengthPlanIdString: string;
    configurationSnapshotId: string;
    configurationSnapshotIdString: string;
    lifecycleStatus: string;
    validationStatus: string;
    selectionMethod: string;
    cableTolerancePercent: Prisma.Decimal;
    totalPlannedLengthM: Prisma.Decimal;
    drumCount: number;
    remainderLengthM: Prisma.Decimal;
    quantityReconciliationStatus: string | null;
    quantityReconciliationMessages: unknown;
    notes: string | null;
    actorId: string | null;
    actorEmail: string | null;
    actorRole: string | null;
    capturedAt: Date;
    updatedAt: Date;
  },
  lines: Array<{
    id: string;
    lineNo: number;
    drumCode: string;
    drumMasterId: string | null;
    numberOfDrums: number;
    cuttingLengthM: Prisma.Decimal;
    isRemainderDrum: boolean;
    clearanceMm: Prisma.Decimal | null;
    capacityM: Prisma.Decimal | null;
    maxLoadKg: Prisma.Decimal | null;
    plannedCableLengthM: Prisma.Decimal;
    cableWeightKg: Prisma.Decimal | null;
    emptyDrumNetWeightKg: Prisma.Decimal | null;
    grossLoadedDrumWeightKg: Prisma.Decimal | null;
    lengthUtilizationPercent: Prisma.Decimal | null;
    loadUtilizationPercent: Prisma.Decimal | null;
    validationStatus: string | null;
    validationReasons: unknown;
    engineering: unknown;
  }>
) {
  return {
    id: row.id,
    planId: row.planId,
    versionNo: row.versionNo,
    inquiryLineId: row.inquiryLineId,
    cuttingLengthRequirementId: row.cuttingLengthRequirementId ?? null,
    cuttingLengthPlanId: row.cuttingLengthPlanId,
    cuttingLengthPlanVersionNo: row.cuttingLengthPlanVersionNo,
    cuttingLengthPlanIdString: row.cuttingLengthPlanIdString,
    configurationSnapshotId: row.configurationSnapshotId,
    configurationSnapshotIdString: row.configurationSnapshotIdString,
    lifecycleStatus: row.lifecycleStatus,
    validationStatus: row.validationStatus,
    selectionMethod: row.selectionMethod,
    cableTolerancePercent: Number(row.cableTolerancePercent),
    totalPlannedLengthM: Number(row.totalPlannedLengthM),
    drumCount: row.drumCount,
    remainderLengthM: Number(row.remainderLengthM),
    quantityReconciliationStatus: row.quantityReconciliationStatus,
    quantityReconciliationMessages: row.quantityReconciliationMessages,
    notes: row.notes,
    actorContext: {
      userId: row.actorId,
      email: row.actorEmail,
      role: row.actorRole,
    },
    capturedAt: row.capturedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      drumCode: l.drumCode,
      drumMasterId: l.drumMasterId,
      numberOfDrums: l.numberOfDrums,
      cuttingLengthM: Number(l.cuttingLengthM),
      cuttingLengthRequirementId:
        (l as { cuttingLengthRequirementId?: string | null }).cuttingLengthRequirementId ??
        row.cuttingLengthRequirementId ??
        null,
      isRemainderDrum: l.isRemainderDrum,
      clearanceMm: l.clearanceMm != null ? Number(l.clearanceMm) : null,
      capacityM: l.capacityM != null ? Number(l.capacityM) : null,
      maxLoadKg: l.maxLoadKg != null ? Number(l.maxLoadKg) : null,
      plannedCableLengthM: Number(l.plannedCableLengthM),
      cableWeightKg: l.cableWeightKg != null ? Number(l.cableWeightKg) : null,
      emptyDrumNetWeightKg: l.emptyDrumNetWeightKg != null ? Number(l.emptyDrumNetWeightKg) : null,
      grossLoadedDrumWeightKg:
        l.grossLoadedDrumWeightKg != null ? Number(l.grossLoadedDrumWeightKg) : null,
      lengthUtilizationPercent:
        l.lengthUtilizationPercent != null ? Number(l.lengthUtilizationPercent) : null,
      loadUtilizationPercent:
        l.loadUtilizationPercent != null ? Number(l.loadUtilizationPercent) : null,
      validationStatus: l.validationStatus,
      validationReasons: l.validationReasons,
      engineering: l.engineering,
    })),
  };
}

export async function getV2DrumSelectionContext(
  inquiryId: string,
  lineId: string,
  actor: RequestActor,
  opts?: { cuttingLengthRequirementId?: string; cuttingLengthPlanId?: string }
) {
  const { inquiry, line, context } = await loadSelectionContext(inquiryId, lineId, actor, opts);
  return {
    inquiry: await getV2Inquiry(inquiry.id, actor),
    line: (await getV2Inquiry(inquiry.id, actor)).lines.find((l) => l.id === lineId)!,
    handoff: context.handoff,
    totalOrderLengthM: context.totalOrderLengthM,
    cuttingLengthRequirementId: context.cuttingLengthRequirementId,
  };
}

export async function listV2DrumSelectionCandidatesForLine(
  inquiryId: string,
  lineId: string,
  actor: RequestActor,
  opts?: { cuttingLengthRequirementId?: string; cuttingLengthPlanId?: string }
) {
  const { context } = await loadSelectionContext(inquiryId, lineId, actor, opts);
  const drums = await loadActiveDrums();
  const candidates = listV2DrumSelectionCandidates(context, drums);
  return { handoff: context.handoff, candidates };
}

export async function previewV2DrumPlan(
  inquiryId: string,
  lineId: string,
  input: {
    selectionMethod: 'AUTOMATIC' | 'MANUAL';
    totalOrderLengthM?: number;
    rows?: PersistDrumPlanRowInput[];
    cuttingLengthRequirementId?: string;
    cuttingLengthPlanId?: string;
  },
  actor: RequestActor
) {
  const { context } = await loadSelectionContext(inquiryId, lineId, actor, {
    cuttingLengthRequirementId: input.cuttingLengthRequirementId,
    cuttingLengthPlanId: input.cuttingLengthPlanId,
  });
  const drums = await loadActiveDrums();
  const plan =
    input.selectionMethod === 'AUTOMATIC'
      ? previewAutomaticDrumPlan(context, drums, input.totalOrderLengthM)
      : previewManualDrumPlan(context, drums, input.rows || []);
  const mapped = mapAuthoritativePlanToPersistData(context, plan, drums);
  return { handoff: context.handoff, plan, mapped };
}

export async function createDraftV2DrumPlan(
  inquiryId: string,
  lineId: string,
  input: BuildDrumPlanInput & {
    cuttingLengthPlanId?: string;
    cuttingLengthRequirementId?: string;
    notes?: string;
  },
  actor: RequestActor
) {
  const { inquiry, line, context } = await loadSelectionContext(inquiryId, lineId, actor, {
    cuttingLengthPlanId: input.cuttingLengthPlanId,
    cuttingLengthRequirementId: input.cuttingLengthRequirementId,
  });
  assertInquiryEditable(inquiry);

  const drums = await loadActiveDrums();
  const authoritative = buildAuthoritativePlanFromInput(context, drums, input);
  const mapped = mapAuthoritativePlanToPersistData(context, authoritative, drums);

  const prisma = requirePrisma();
  const cuttingPlan = await prisma.v2CuttingLengthPlan.findUnique({
    where: { id: context.cuttingLengthPlanId },
  });
  if (!cuttingPlan) {
    const err = new Error('Cutting plan not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const latestVersion =
    (
      await prisma.v2DrumPlan.findFirst({
        where: { inquiryLineId: line.id },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      })
    )?.versionNo ?? 0;

  const planId = `v2drum-${inquiry.inquiryNumber}-L${line.lineNumber}-v${latestVersion + 1}`;

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.v2DrumPlan.create({
      data: {
        planId,
        versionNo: latestVersion + 1,
        inquiryLineId: line.id,
        cuttingLengthRequirementId: context.cuttingLengthRequirementId,
        cuttingLengthPlanId: cuttingPlan.id,
        cuttingLengthPlanVersionNo: cuttingPlan.versionNo,
        cuttingLengthPlanIdString: cuttingPlan.planId,
        configurationSnapshotId: cuttingPlan.configurationSnapshotId,
        configurationSnapshotIdString: cuttingPlan.configurationSnapshotIdString,
        lifecycleStatus: 'DRAFT',
        validationStatus: mapped.validationStatus,
        selectionMethod: mapped.selectionMethod,
        cableTolerancePercent: mapped.cableTolerancePercent,
        totalPlannedLengthM: mapped.totalPlannedLengthM,
        drumCount: mapped.drumCount,
        remainderLengthM: mapped.remainderLengthM,
        quantityReconciliationStatus: mapped.quantityReconciliation.status,
        quantityReconciliationMessages:
          mapped.quantityReconciliation.messages as unknown as Prisma.InputJsonValue,
        engineeringSnapshot: mapped.engineeringSnapshot as unknown as Prisma.InputJsonValue,
        notes: input.notes?.trim() || null,
        actorId: actor.id || null,
        actorEmail: actor.email || null,
        actorRole: actor.userType || null,
        lines: {
          create: mapped.lines.map((l) => ({
            lineNo: l.lineNo,
            drumCode: l.drumCode,
            drumMasterId: l.drumMasterId,
            numberOfDrums: l.numberOfDrums,
            cuttingLengthM: l.cuttingLengthM,
            cuttingLengthRequirementId: context.cuttingLengthRequirementId,
            isRemainderDrum: l.isRemainderDrum,
            clearanceMm: l.clearanceMm,
            capacityM: l.capacityM,
            maxLoadKg: l.maxLoadKg,
            plannedCableLengthM: l.plannedCableLengthM,
            cableWeightKg: l.cableWeightKg,
            emptyDrumNetWeightKg: l.emptyDrumNetWeightKg,
            grossLoadedDrumWeightKg: l.grossLoadedDrumWeightKg,
            lengthUtilizationPercent: l.lengthUtilizationPercent,
            loadUtilizationPercent: l.loadUtilizationPercent,
            validationStatus: l.validationStatus,
            validationReasons: l.validationReasons as unknown as Prisma.InputJsonValue,
            engineering: l.engineering as unknown as Prisma.InputJsonValue,
          })),
        },
      },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });

    await tx.commercialInquiryLine.update({
      where: { id: line.id },
      data: { v2CurrentDrumPlanId: row.id },
    });
    if (context.cuttingLengthRequirementId) {
      await tx.v2CuttingLengthRequirement.update({
        where: { id: context.cuttingLengthRequirementId },
        data: { currentDrumPlanId: row.id },
      });
    }

    return row;
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'V2DrumPlan',
    entityId: result.planId,
    action: 'PERSIST',
    newValue: {
      inquiryNumber: inquiry.inquiryNumber,
      lineNumber: line.lineNumber,
      versionNo: result.versionNo,
      lifecycleStatus: 'DRAFT',
      selectionMethod: mapped.selectionMethod,
      validationStatus: mapped.validationStatus,
      drumCount: mapped.drumCount,
      totalPlannedLengthM: mapped.totalPlannedLengthM,
    },
    message: `Persisted V2 drum plan draft ${result.planId}`,
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: line.id,
    action: 'V2_DRUM_PLAN_LINK',
    newValue: { planId: result.planId, versionNo: result.versionNo, lifecycleStatus: 'DRAFT' },
    message: `Linked drum plan ${result.planId} to line ${line.lineNumber}`,
  });

  const refreshed = await getV2Inquiry(inquiry.id, actor);
  const refreshedLine = refreshed.lines.find((l) => l.id === lineId)!;
  const drumPlan = mapPlanRow(result, result.lines);

  return { inquiry: refreshed, line: refreshedLine, drumPlan };
}

export async function validateV2DrumPlan(
  inquiryId: string,
  lineId: string,
  planId: string,
  actor: RequestActor
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertInquiryEditable(inquiry);

  const prisma = requirePrisma();
  const existing = await prisma.v2DrumPlan.findFirst({
    where: {
      inquiryLineId: line.id,
      OR: [{ planId }, { id: planId }],
    },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  if (!existing) {
    const err = new Error(`Drum plan ${planId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (existing.lifecycleStatus === 'CONFIRMED' || existing.lifecycleStatus === 'SUPERSEDED') {
    const err = new Error(`Drum plan ${planId} is immutable at ${existing.lifecycleStatus}.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const { context } = await loadSelectionContext(inquiryId, lineId, actor, {
    cuttingLengthPlanId: existing.cuttingLengthPlanId,
    cuttingLengthRequirementId: existing.cuttingLengthRequirementId ?? undefined,
  });
  const drums = await loadActiveDrums();
  const rows: PersistDrumPlanRowInput[] = existing.lines.map((l) => ({
    drumCode: l.drumCode,
    numberOfDrums: l.numberOfDrums,
    cuttingLengthM: Number(l.cuttingLengthM),
    drumTolerancePercent: 0,
  }));
  const authoritative =
    existing.selectionMethod === 'AUTOMATIC'
      ? previewAutomaticDrumPlan(context, drums)
      : previewManualDrumPlan(context, drums, rows);
  const mapped = mapAuthoritativePlanToPersistData(context, authoritative, drums);

  const updated = await prisma.v2DrumPlan.update({
    where: { id: existing.id },
    data: {
      lifecycleStatus: 'VALIDATED',
      validationStatus: mapped.validationStatus,
      totalPlannedLengthM: mapped.totalPlannedLengthM,
      drumCount: mapped.drumCount,
      remainderLengthM: mapped.remainderLengthM,
      quantityReconciliationStatus: mapped.quantityReconciliation.status,
      quantityReconciliationMessages:
        mapped.quantityReconciliation.messages as unknown as Prisma.InputJsonValue,
      engineeringSnapshot: mapped.engineeringSnapshot as unknown as Prisma.InputJsonValue,
    },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'V2DrumPlan',
    entityId: updated.planId,
    action: 'VALIDATE',
    newValue: {
      validationStatus: mapped.validationStatus,
      lifecycleStatus: 'VALIDATED',
    },
    message: `Validated V2 drum plan ${updated.planId}`,
  });

  const refreshed = await getV2Inquiry(inquiry.id, actor);
  return {
    inquiry: refreshed,
    line: refreshed.lines.find((l) => l.id === lineId)!,
    drumPlan: mapPlanRow(updated, updated.lines),
  };
}

export async function confirmV2DrumPlan(
  inquiryId: string,
  lineId: string,
  planId: string,
  actor: RequestActor
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertInquiryEditable(inquiry);

  const prisma = requirePrisma();
  const existing = await prisma.v2DrumPlan.findFirst({
    where: {
      inquiryLineId: line.id,
      OR: [{ planId }, { id: planId }],
    },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  if (!existing) {
    const err = new Error(`Drum plan ${planId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanConfirmDrumPlan(existing);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.v2DrumPlan.updateMany({
      where: {
        inquiryLineId: line.id,
        lifecycleStatus: 'CONFIRMED',
        id: { not: existing.id },
        ...(existing.cuttingLengthRequirementId
          ? { cuttingLengthRequirementId: existing.cuttingLengthRequirementId }
          : {}),
      },
      data: { lifecycleStatus: 'SUPERSEDED' },
    });

    const confirmed = await tx.v2DrumPlan.update({
      where: { id: existing.id },
      data: { lifecycleStatus: 'CONFIRMED' },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });

    await tx.commercialInquiryLine.update({
      where: { id: line.id },
      data: { v2CurrentDrumPlanId: confirmed.id },
    });
    if (existing.cuttingLengthRequirementId) {
      await tx.v2CuttingLengthRequirement.update({
        where: { id: existing.cuttingLengthRequirementId },
        data: { currentDrumPlanId: confirmed.id },
      });
    }

    return confirmed;
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'V2DrumPlan',
    entityId: updated.planId,
    action: 'CONFIRM',
    newValue: {
      versionNo: updated.versionNo,
      lifecycleStatus: 'CONFIRMED',
    },
    message: `Confirmed V2 drum plan ${updated.planId}`,
  });

  const refreshed = await getV2Inquiry(inquiry.id, actor);
  return {
    inquiry: refreshed,
    line: refreshed.lines.find((l) => l.id === lineId)!,
    drumPlan: mapPlanRow(updated, updated.lines),
  };
}

export async function listV2LineDrumPlans(inquiryId: string, lineId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const prisma = requirePrisma();
  const rows = await prisma.v2DrumPlan.findMany({
    where: { inquiryLineId: line.id },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
    orderBy: { versionNo: 'desc' },
  });
  return rows.map((r) => mapPlanRow(r, r.lines));
}

export async function getV2CurrentDrumPlan(inquiryId: string, lineId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!line.v2CurrentDrumPlanId) return null;

  const prisma = requirePrisma();
  const row = await prisma.v2DrumPlan.findUnique({
    where: { id: line.v2CurrentDrumPlanId },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  return row ? mapPlanRow(row, row.lines) : null;
}

export async function getV2DrumPlanById(
  inquiryId: string,
  lineId: string,
  planId: string,
  actor: RequestActor
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const prisma = requirePrisma();
  const row = await prisma.v2DrumPlan.findFirst({
    where: {
      inquiryLineId: line.id,
      OR: [{ planId }, { id: planId }],
    },
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  });
  if (!row) {
    const err = new Error(`Drum plan ${planId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  return mapPlanRow(row, row.lines);
}

export async function getV2DrumPlanHandoff(
  inquiryId: string,
  lineId: string,
  planId: string,
  actor: RequestActor
): Promise<DrumPlanHandoffDto> {
  const plan = await getV2DrumPlanById(inquiryId, lineId, planId, actor);
  if (plan.lifecycleStatus !== 'CONFIRMED') {
    const err = new Error('Drum plan handoff is available only for CONFIRMED plans.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const { context } = await loadSelectionContext(inquiryId, lineId, actor, {
    cuttingLengthPlanId: plan.cuttingLengthPlanId,
    cuttingLengthRequirementId: plan.cuttingLengthRequirementId ?? undefined,
  });

  return buildDrumPlanHandoffDto({
    inquiryLineId: lineId,
    plan: {
      id: plan.id,
      planId: plan.planId,
      versionNo: plan.versionNo,
      lifecycleStatus: plan.lifecycleStatus,
      validationStatus: plan.validationStatus,
      selectionMethod: plan.selectionMethod,
      cableTolerancePercent: plan.cableTolerancePercent,
      totalPlannedLengthM: plan.totalPlannedLengthM,
      drumCount: plan.drumCount,
      remainderLengthM: plan.remainderLengthM,
      quantityReconciliationStatus: plan.quantityReconciliationStatus,
      quantityReconciliationMessages: plan.quantityReconciliationMessages,
      cuttingLengthPlanId: plan.cuttingLengthPlanId,
      cuttingLengthPlanIdString: plan.cuttingLengthPlanIdString,
      configurationSnapshotId: plan.configurationSnapshotId,
      configurationSnapshotIdString: plan.configurationSnapshotIdString,
      capturedAt: plan.capturedAt,
    },
    lines: plan.lines,
    cableMaterialNumber: context.handoff.cableMaterialNumber,
  });
}
