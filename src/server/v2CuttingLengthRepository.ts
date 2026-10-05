import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import {
  buildDrumSelectionHandoff,
  validateV2CuttingLength,
  type DrumSelectionHandoffDto,
} from '../domain/v2CuttingLengthService';
import { resolveCuttingLengthTolerance } from '../domain/cuttingLengthTolerance';
import {
  loadV2InquiryScoped,
  getV2Inquiry,
} from './v2InquiryConfigurationRepository';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export interface PersistV2CuttingLengthPlanInput {
  configurationSnapshotId?: string;
  nominalLengthM: number;
  tolerancePercent?: number;
  toleranceMode?: unknown;
  positiveTolerancePercent?: unknown;
  negativeTolerancePercent?: unknown;
  requestedDrumCount?: number;
  addRequirement?: boolean;
  cuttingLengthRequirementId?: string;
  notes?: string;
}

function mapPlanRow(row: {
  id: string;
  planId: string;
  versionNo: number;
  inquiryLineId: string;
  cuttingLengthRequirementId?: string | null;
  configurationSnapshotId: string;
  configurationSnapshotVersionNo: number;
  configurationSnapshotIdString: string;
  nominalLengthM: Prisma.Decimal;
  tolerancePercent: Prisma.Decimal;
  toleranceMode?: string;
  positiveTolerancePercent?: Prisma.Decimal;
  negativeTolerancePercent?: Prisma.Decimal;
  requestedDrumCount?: number;
  minLengthM: Prisma.Decimal;
  maxLengthM: Prisma.Decimal;
  validationStatus: string;
  validationMessages: unknown;
  notes: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  capturedAt: Date;
}) {
  return {
    id: row.id,
    planId: row.planId,
    versionNo: row.versionNo,
    inquiryLineId: row.inquiryLineId,
    cuttingLengthRequirementId: row.cuttingLengthRequirementId ?? null,
    configurationSnapshotId: row.configurationSnapshotId,
    configurationSnapshotVersionNo: row.configurationSnapshotVersionNo,
    configurationSnapshotIdString: row.configurationSnapshotIdString,
    nominalLengthM: Number(row.nominalLengthM),
    tolerancePercent: Number(row.tolerancePercent),
    toleranceMode: (row.toleranceMode ?? 'SYMMETRIC') as
      | 'NONE'
      | 'POSITIVE'
      | 'NEGATIVE'
      | 'SYMMETRIC',
    positiveTolerancePercent: row.positiveTolerancePercent != null ? Number(row.positiveTolerancePercent) : Number(row.tolerancePercent),
    negativeTolerancePercent: row.negativeTolerancePercent != null ? Number(row.negativeTolerancePercent) : Number(row.tolerancePercent),
    requestedDrumCount: row.requestedDrumCount ?? 1,
    minLengthM: Number(row.minLengthM),
    maxLengthM: Number(row.maxLengthM),
    validationStatus: row.validationStatus,
    validationMessages: row.validationMessages,
    notes: row.notes,
    actorContext: {
      userId: row.actorId,
      email: row.actorEmail,
      role: row.actorRole,
    },
    capturedAt: row.capturedAt.toISOString(),
  };
}

async function loadLineSnapshotForCutting(
  inquiryId: string,
  lineId: string,
  input: PersistV2CuttingLengthPlanInput,
  actor: RequestActor
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found on inquiry ${inquiry.inquiryNumber}.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const snapshotId = input.configurationSnapshotId || line.v2CurrentSnapshotId;
  if (!snapshotId) {
    const err = new Error('Configuration snapshot is required before saving a cutting plan.');
    (err as Error & { code: string }).code = 'SNAPSHOT_REQUIRED';
    throw err;
  }
  const prisma = requirePrisma();
  const snapshot = await prisma.v2ConfigurationSnapshot.findFirst({
    where: { id: snapshotId, inquiryLineId: line.id },
  });
  if (!snapshot) {
    const err = new Error(`Configuration snapshot ${snapshotId} not found for this line.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (snapshot.id !== line.v2CurrentSnapshotId) {
    const err = new Error('Cutting plan must reference the current configuration snapshot for this line.');
    (err as Error & { code: string }).code = 'STALE_CONFIGURATION_SNAPSHOT';
    throw err;
  }
  return { inquiry, line, snapshot };
}

function runCuttingValidation(input: PersistV2CuttingLengthPlanInput, snapshot: {
  id: string;
  snapshotId: string;
  versionNo: number;
  flowState: string;
  catalogAuthoritative: boolean;
  cableMaterialNumber: string | null;
  estimatedDiameterMm: unknown;
  estimatedWeightKgKm: unknown;
  downstreamGates: unknown;
  selections: unknown;
}, lineCurrentSnapshotId: string | null) {
  const resolvedTolerance = resolveCuttingLengthTolerance({
    toleranceMode: input.toleranceMode,
    tolerancePercent: input.tolerancePercent ?? 1,
    positiveTolerancePercent: input.positiveTolerancePercent,
    negativeTolerancePercent: input.negativeTolerancePercent,
  });
  return {
    resolvedTolerance,
    validation: validateV2CuttingLength({
      nominalLengthM: input.nominalLengthM,
      tolerancePercent: Math.max(resolvedTolerance.positivePercent, resolvedTolerance.negativePercent),
      toleranceMode: resolvedTolerance.mode,
      positiveTolerancePercent: resolvedTolerance.positivePercent,
      negativeTolerancePercent: resolvedTolerance.negativePercent,
      snapshot: {
        id: snapshot.id,
        snapshotId: snapshot.snapshotId,
        versionNo: snapshot.versionNo,
        flowState: snapshot.flowState,
        catalogAuthoritative: snapshot.catalogAuthoritative,
        cableMaterialNumber: snapshot.cableMaterialNumber,
        estimatedDiameterMm: snapshot.estimatedDiameterMm ? Number(snapshot.estimatedDiameterMm) : null,
        estimatedWeightKgKm: snapshot.estimatedWeightKgKm ? Number(snapshot.estimatedWeightKgKm) : null,
        downstreamGates: snapshot.downstreamGates,
        selections: snapshot.selections,
      },
      lineCurrentSnapshotId,
    }),
  };
}

/** Server-authoritative preview — does not persist. */
export async function previewV2CuttingLengthPlan(
  inquiryId: string,
  lineId: string,
  input: PersistV2CuttingLengthPlanInput,
  actor: RequestActor
) {
  const { line, snapshot } = await loadLineSnapshotForCutting(inquiryId, lineId, input, actor);
  const { validation } = runCuttingValidation(input, snapshot, line.v2CurrentSnapshotId);
  return { preview: true, persisted: false, validation };
}

function mapRequirementRow(row: {
  id: string;
  requirementId: string;
  sequenceNo: number;
  inquiryLineId: string;
  configurationSnapshotId: string;
  unit: string;
  nominalLengthM: Prisma.Decimal;
  toleranceMode: string;
  positiveTolerancePercent: Prisma.Decimal;
  negativeTolerancePercent: Prisma.Decimal;
  minLengthM: Prisma.Decimal;
  maxLengthM: Prisma.Decimal;
  requestedDrumCount: number;
  status: string;
  versionNo: number;
  currentCuttingPlanId: string | null;
  currentDrumPlanId: string | null;
}) {
  return {
    id: row.id,
    requirementId: row.requirementId,
    sequenceNo: row.sequenceNo,
    inquiryLineId: row.inquiryLineId,
    configurationSnapshotId: row.configurationSnapshotId,
    unit: row.unit,
    nominalLengthM: Number(row.nominalLengthM),
    toleranceMode: row.toleranceMode,
    positiveTolerancePercent: Number(row.positiveTolerancePercent),
    negativeTolerancePercent: Number(row.negativeTolerancePercent),
    minLengthM: Number(row.minLengthM),
    maxLengthM: Number(row.maxLengthM),
    requestedDrumCount: row.requestedDrumCount,
    status: row.status,
    versionNo: row.versionNo,
    currentCuttingPlanId: row.currentCuttingPlanId,
    currentDrumPlanId: row.currentDrumPlanId,
  };
}

export async function persistV2CuttingLengthPlan(
  inquiryId: string,
  lineId: string,
  input: PersistV2CuttingLengthPlanInput,
  actor: RequestActor
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found on inquiry ${inquiry.inquiryNumber}.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const lockedStatuses = ['READY_FOR_COMMERCIAL', 'QUOTED', 'CLOSED', 'CANCELLED'] as const;
  if (lockedStatuses.includes(inquiry.status as (typeof lockedStatuses)[number])) {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} is locked at ${inquiry.status} — cutting plans cannot be amended.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const snapshotId = input.configurationSnapshotId || line.v2CurrentSnapshotId;
  if (!snapshotId) {
    const err = new Error('Configuration snapshot is required before saving a cutting plan.');
    (err as Error & { code: string }).code = 'SNAPSHOT_REQUIRED';
    throw err;
  }

  const prisma = requirePrisma();
  const snapshot = await prisma.v2ConfigurationSnapshot.findFirst({
    where: { id: snapshotId, inquiryLineId: line.id },
  });
  if (!snapshot) {
    const err = new Error(`Configuration snapshot ${snapshotId} not found for this line.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  if (snapshot.id !== line.v2CurrentSnapshotId) {
    const err = new Error('Cutting plan must reference the current configuration snapshot for this line.');
    (err as Error & { code: string }).code = 'STALE_CONFIGURATION_SNAPSHOT';
    throw err;
  }

  const requestedDrumCount = Math.floor(Number(input.requestedDrumCount ?? 1));
  if (!Number.isFinite(requestedDrumCount) || requestedDrumCount < 1) {
    const err = new Error('requestedDrumCount must be an integer of at least 1.');
    (err as Error & { code: string }).code = 'VALIDATION_FAILED';
    throw err;
  }

  const resolvedTolerance = resolveCuttingLengthTolerance({
    toleranceMode: input.toleranceMode,
    tolerancePercent: input.tolerancePercent ?? 1,
    positiveTolerancePercent: input.positiveTolerancePercent,
    negativeTolerancePercent: input.negativeTolerancePercent,
  });

  const validation = validateV2CuttingLength({
    nominalLengthM: input.nominalLengthM,
    tolerancePercent: Math.max(resolvedTolerance.positivePercent, resolvedTolerance.negativePercent),
    toleranceMode: resolvedTolerance.mode,
    positiveTolerancePercent: resolvedTolerance.positivePercent,
    negativeTolerancePercent: resolvedTolerance.negativePercent,
    snapshot: {
      id: snapshot.id,
      snapshotId: snapshot.snapshotId,
      versionNo: snapshot.versionNo,
      flowState: snapshot.flowState,
      catalogAuthoritative: snapshot.catalogAuthoritative,
      cableMaterialNumber: snapshot.cableMaterialNumber,
      estimatedDiameterMm: snapshot.estimatedDiameterMm ? Number(snapshot.estimatedDiameterMm) : null,
      estimatedWeightKgKm: snapshot.estimatedWeightKgKm ? Number(snapshot.estimatedWeightKgKm) : null,
      downstreamGates: snapshot.downstreamGates,
      selections: snapshot.selections,
    },
    lineCurrentSnapshotId: line.v2CurrentSnapshotId,
  });

  if (validation.validationStatus === 'ERROR') {
    const err = new Error(
      validation.validationMessages.find((m) => m.severity === 'error')?.message ||
        'Cutting length validation failed.'
    );
    (err as Error & { code: string }).code = 'VALIDATION_FAILED';
    (err as Error & { details: unknown }).details = validation;
    throw err;
  }

  const existingRequirements = await prisma.v2CuttingLengthRequirement.findMany({
    where: { inquiryLineId: line.id },
    orderBy: { sequenceNo: 'asc' },
  });

  let targetRequirement = input.cuttingLengthRequirementId
    ? existingRequirements.find(
        (r) => r.id === input.cuttingLengthRequirementId || r.requirementId === input.cuttingLengthRequirementId
      )
    : undefined;
  if (input.cuttingLengthRequirementId && !targetRequirement) {
    const err = new Error(`Cutting-length requirement ${input.cuttingLengthRequirementId} was not found on this line.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const createNewRequirement =
    existingRequirements.length === 0 || (Boolean(input.addRequirement) && !targetRequirement);

  if (!targetRequirement && !input.addRequirement && existingRequirements.length > 0) {
    targetRequirement =
      existingRequirements.find((r) => r.currentCuttingPlanId && r.currentCuttingPlanId === line.v2CurrentCuttingPlanId) ||
      existingRequirements[existingRequirements.length - 1];
  }

  const latestLineVersion =
    (
      await prisma.v2CuttingLengthPlan.findFirst({
        where: { inquiryLineId: line.id },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      })
    )?.versionNo ?? 0;

  const nextSequenceNo = createNewRequirement
    ? (existingRequirements[existingRequirements.length - 1]?.sequenceNo ?? 0) + 1
    : targetRequirement!.sequenceNo;
  const nextRequirementVersion = createNewRequirement ? 1 : targetRequirement!.versionNo + 1;
  const planId = `v2cut-${inquiry.inquiryNumber}-L${line.lineNumber}-v${latestLineVersion + 1}`;

  const result = await prisma.$transaction(async (tx) => {
    const requirement = createNewRequirement
      ? await tx.v2CuttingLengthRequirement.create({
          data: {
            requirementId: `v2clr-${inquiry.inquiryNumber}-L${line.lineNumber}-R${nextSequenceNo}`,
            sequenceNo: nextSequenceNo,
            inquiryLineId: line.id,
            configurationSnapshotId: snapshot.id,
            unit: 'M',
            nominalLengthM: validation.nominalLengthM,
            toleranceMode: validation.toleranceMode,
            positiveTolerancePercent: validation.positiveTolerancePercent,
            negativeTolerancePercent: validation.negativeTolerancePercent,
            minLengthM: validation.minLengthM,
            maxLengthM: validation.maxLengthM,
            requestedDrumCount,
            status: 'ACTIVE',
            versionNo: nextRequirementVersion,
            actorId: actor.id || null,
            actorEmail: actor.email || null,
            actorRole: actor.userType || null,
          },
        })
      : await tx.v2CuttingLengthRequirement.update({
          where: { id: targetRequirement!.id },
          data: {
            configurationSnapshotId: snapshot.id,
            nominalLengthM: validation.nominalLengthM,
            toleranceMode: validation.toleranceMode,
            positiveTolerancePercent: validation.positiveTolerancePercent,
            negativeTolerancePercent: validation.negativeTolerancePercent,
            minLengthM: validation.minLengthM,
            maxLengthM: validation.maxLengthM,
            requestedDrumCount,
            versionNo: nextRequirementVersion,
            actorId: actor.id || null,
            actorEmail: actor.email || null,
            actorRole: actor.userType || null,
          },
        });

    const row = await tx.v2CuttingLengthPlan.create({
      data: {
        planId,
        versionNo: latestLineVersion + 1,
        inquiryLineId: line.id,
        cuttingLengthRequirementId: requirement.id,
        configurationSnapshotId: snapshot.id,
        configurationSnapshotVersionNo: snapshot.versionNo,
        configurationSnapshotIdString: snapshot.snapshotId,
        nominalLengthM: validation.nominalLengthM,
        tolerancePercent: validation.tolerancePercent,
        toleranceMode: validation.toleranceMode,
        positiveTolerancePercent: validation.positiveTolerancePercent,
        negativeTolerancePercent: validation.negativeTolerancePercent,
        requestedDrumCount,
        minLengthM: validation.minLengthM,
        maxLengthM: validation.maxLengthM,
        validationStatus: validation.validationStatus,
        validationMessages: validation.validationMessages as unknown as Prisma.InputJsonValue,
        notes: input.notes?.trim() || null,
        actorId: actor.id || null,
        actorEmail: actor.email || null,
        actorRole: actor.userType || null,
      },
    });

    await tx.v2CuttingLengthRequirement.update({
      where: { id: requirement.id },
      data: { currentCuttingPlanId: row.id },
    });

    await tx.commercialInquiryLine.update({
      where: { id: line.id },
      data: { v2CurrentCuttingPlanId: row.id },
    });

    return { row, requirement };
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'V2CuttingLengthPlan',
    entityId: result.row.planId,
    action: 'PERSIST',
    newValue: {
      inquiryNumber: inquiry.inquiryNumber,
      lineNumber: line.lineNumber,
      versionNo: result.row.versionNo,
      cuttingLengthRequirementId: result.requirement.id,
      sequenceNo: result.requirement.sequenceNo,
      configurationSnapshotIdString: snapshot.snapshotId,
      nominalLengthM: validation.nominalLengthM,
      tolerancePercent: validation.tolerancePercent,
      toleranceMode: validation.toleranceMode,
      requestedDrumCount,
      validationStatus: validation.validationStatus,
    },
    message: `Persisted V2 cutting length plan ${result.row.planId}`,
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: line.id,
    action: 'V2_CUTTING_PLAN_LINK',
    newValue: {
      planId: result.row.planId,
      versionNo: result.row.versionNo,
      cuttingLengthRequirementId: result.requirement.id,
    },
    message: `Linked cutting plan ${result.row.planId} to line ${line.lineNumber} requirement ${result.requirement.sequenceNo}`,
  });

  const refreshed = await getV2Inquiry(inquiry.id, actor);
  const refreshedLine = refreshed.lines.find((l) => l.id === lineId)!;
  const plan = mapPlanRow(result.row);
  const handoff = buildDrumSelectionHandoff({
    plan: {
      ...plan,
      capturedAt: result.row.capturedAt,
    },
    snapshot: {
      cableMaterialNumber: snapshot.cableMaterialNumber,
      itemCode: snapshot.itemCode,
      customerCode: snapshot.customerCode,
      estimatedDiameterMm: snapshot.estimatedDiameterMm ? Number(snapshot.estimatedDiameterMm) : null,
      estimatedWeightKgKm: snapshot.estimatedWeightKgKm ? Number(snapshot.estimatedWeightKgKm) : null,
    },
    lineCurrentSnapshotId: line.v2CurrentSnapshotId,
  });

  return {
    inquiry: refreshed,
    line: refreshedLine,
    plan,
    requirement: mapRequirementRow(result.requirement),
    handoff,
  };
}

export async function listV2LineCuttingPlans(inquiryId: string, lineId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const prisma = requirePrisma();
  const rows = await prisma.v2CuttingLengthPlan.findMany({
    where: { inquiryLineId: line.id },
    orderBy: { versionNo: 'desc' },
  });
  return rows.map(mapPlanRow);
}

export async function getV2CurrentCuttingPlan(inquiryId: string, lineId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!line.v2CurrentCuttingPlanId) {
    return null;
  }

  const prisma = requirePrisma();
  const row = await prisma.v2CuttingLengthPlan.findUnique({
    where: { id: line.v2CurrentCuttingPlanId },
  });
  return row ? mapPlanRow(row) : null;
}

export async function getV2CuttingPlanHandoff(
  inquiryId: string,
  lineId: string,
  planId: string,
  actor: RequestActor
): Promise<DrumSelectionHandoffDto> {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const prisma = requirePrisma();
  const row = await prisma.v2CuttingLengthPlan.findFirst({
    where: {
      inquiryLineId: line.id,
      OR: [{ planId }, { id: planId }],
    },
    include: { configurationSnapshot: true },
  });
  if (!row) {
    const err = new Error(`Cutting plan ${planId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  return buildDrumSelectionHandoff({
    plan: {
      planId: row.planId,
      versionNo: row.versionNo,
      configurationSnapshotId: row.configurationSnapshotId,
      configurationSnapshotIdString: row.configurationSnapshotIdString,
      configurationSnapshotVersionNo: row.configurationSnapshotVersionNo,
      nominalLengthM: Number(row.nominalLengthM),
      tolerancePercent: Number(row.tolerancePercent),
      toleranceMode: row.toleranceMode,
      positiveTolerancePercent: Number(row.positiveTolerancePercent),
      negativeTolerancePercent: Number(row.negativeTolerancePercent),
      requestedDrumCount: row.requestedDrumCount,
      cuttingLengthRequirementId: row.cuttingLengthRequirementId,
      minLengthM: Number(row.minLengthM),
      maxLengthM: Number(row.maxLengthM),
      validationStatus: row.validationStatus,
      validationMessages: row.validationMessages,
      notes: row.notes,
      capturedAt: row.capturedAt,
    },
    snapshot: {
      cableMaterialNumber: row.configurationSnapshot.cableMaterialNumber,
      itemCode: row.configurationSnapshot.itemCode,
      customerCode: row.configurationSnapshot.customerCode,
      estimatedDiameterMm: row.configurationSnapshot.estimatedDiameterMm
        ? Number(row.configurationSnapshot.estimatedDiameterMm)
        : null,
      estimatedWeightKgKm: row.configurationSnapshot.estimatedWeightKgKm
        ? Number(row.configurationSnapshot.estimatedWeightKgKm)
        : null,
    },
    lineCurrentSnapshotId: line.v2CurrentSnapshotId,
  });
}

export async function listV2LineCuttingRequirements(inquiryId: string, lineId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const prisma = requirePrisma();
  const rows = await prisma.v2CuttingLengthRequirement.findMany({
    where: { inquiryLineId: line.id },
    orderBy: { sequenceNo: 'asc' },
  });
  return rows.map(mapRequirementRow);
}
