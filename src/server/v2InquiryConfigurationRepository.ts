import { InquiryStatus, Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { allocateNextNumber } from './numberSequenceService';
import {
  assertCustomerBusinessScope,
  lookupCustomerMasterId,
  resolveCustomerScope,
} from './customerScope';
import { assertCanAccessInquiryOwnership, assertCanManageInquiry } from './rbac';
import { assertStandardSubmitAllowed } from '../domain/inquiryProcessCommands';
import { startStandardInquiryWorkflow } from './workflowRuntimeRepository';
import {
  assertV2StatusTransition,
  derivePostSubmitStatus,
  isV2InquiryMetadata,
} from '../domain/v2InquiryWorkflow';
import { assertReadyForCommercialCuttingPlans } from '../domain/v2CuttingLengthService';
import {
  buildConfigurationSnapshot,
  type V2CableConfigurationSnapshot,
} from '../components/cable-configurator/v2/services/v2CableConfigurationService';
import {
  evaluateCableConfigurationV2,
  selectionsToConfig,
  estimateCablePhysicals,
  generateTechnicalDescriptionV2,
} from '../components/cable-configurator/v2/services/technicalValidationEngineV2';
import type {
  SelectionStateV2,
  TechnicalValidationResultV2,
} from '../components/cable-configurator/v2/types';
import { evaluatePersistedCable, createTechnicalOfficeRequest } from './masterDataRepository';
import {
  applyInquiryProcessToMetadata,
  commercialMetadataRecord,
  resolveInquiryProcess,
} from '../domain/inquiryProcessResolver';
import { applySystemMarketMetalDefaultsOnCreate } from '../domain/marketMetalPriceDefaults';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

const lineInclude = {
  v2Snapshots: { orderBy: { versionNo: 'desc' as const } },
  v2CuttingRequirements: { orderBy: { sequenceNo: 'asc' as const } },
  v2CuttingPlans: { orderBy: { versionNo: 'desc' as const } },
  v2DrumPlans: { orderBy: { versionNo: 'desc' as const } },
  attachments: {
    orderBy: { kind: 'asc' as const },
    select: {
      id: true,
      kind: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      source: true,
      uploadedBy: true,
      createdAt: true,
    },
  },
};

const inquiryInclude = {
  lines: { orderBy: { lineNumber: 'asc' as const }, include: lineInclude },
  quotations: { orderBy: [{ quotationNumber: 'asc' as const }, { versionNo: 'desc' as const }] },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      uploadedBy: true,
      createdAt: true,
    },
  },
};

export interface CreateV2InquiryInput {
  projectName?: string;
  customerReference?: string;
  contactPerson?: string;
  requestedDeliveryDate?: string;
  notes?: string;
}

export interface AddV2InquiryLineInput {
  cableDescription?: string;
  requestedQuantity?: number;
  quantityUom?: string;
  requestedLengthMeters?: number;
  notes?: string;
}

export interface PersistV2SnapshotInput {
  selections: SelectionStateV2;
  catalogSource: 'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK';
  catalogAuthoritative: boolean;
  requestedQuantity?: number;
  quantityUom?: string;
  requestedLengthMeters?: number;
  cableDescription?: string;
}

function mapSnapshotRow(row: {
  snapshotId: string;
  versionNo: number;
  inquiryLineId: string;
  cableMaterialNumber: string | null;
  itemCode: string | null;
  customerCode: string | null;
  selections: unknown;
  configInput: unknown;
  validationStatus: string;
  flowState: string;
  engineeringStatus: string;
  summaryDescription: string | null;
  estimatedDiameterMm: Prisma.Decimal | null;
  estimatedWeightKgKm: Prisma.Decimal | null;
  catalogSource: string;
  catalogAuthoritative: boolean;
  bomGovernanceBlocked: boolean;
  unresolvedBomConflictCount: number;
  downstreamGates: unknown;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  capturedAt: Date;
}) {
  return {
    snapshotId: row.snapshotId,
    versionNo: row.versionNo,
    inquiryLineId: row.inquiryLineId,
    cableMaterialNumber: row.cableMaterialNumber,
    itemCode: row.itemCode,
    customerCode: row.customerCode,
    selections: row.selections,
    configInput: row.configInput,
    validationStatus: row.validationStatus,
    flowState: row.flowState,
    engineeringStatus: row.engineeringStatus,
    summaryDescription: row.summaryDescription,
    estimatedDiameterMm: row.estimatedDiameterMm ? Number(row.estimatedDiameterMm) : null,
    estimatedWeightKgKm: row.estimatedWeightKgKm ? Number(row.estimatedWeightKgKm) : null,
    catalogSource: row.catalogSource,
    catalogAuthoritative: row.catalogAuthoritative,
    bomGovernanceBlocked: row.bomGovernanceBlocked,
    unresolvedBomConflictCount: row.unresolvedBomConflictCount,
    downstreamGates: row.downstreamGates,
    actorContext: {
      userId: row.actorId,
      email: row.actorEmail,
      role: row.actorRole,
    },
    capturedAt: row.capturedAt.toISOString(),
  };
}

export function projectV2Inquiry(inquiry: {
  id: string;
  inquiryNumber: string;
  customerId: string;
  customerMasterId: string | null;
  customerName: string;
  contactPerson: string | null;
  customerReference: string | null;
  inquiryDate: Date;
  requestedDeliveryDate: Date | null;
  currency: string;
  status: InquiryStatus;
  projectName: string | null;
  notes: string | null;
  commercialMetadata: unknown;
  createdBy: string | null;
  modifiedBy: string | null;
  versionNo: number;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
  lines?: Array<{
    id: string;
    lineNumber: number;
    materialNumber: string | null;
    customerCode: string | null;
    itemCode: string | null;
    cableDescription: string;
    requestedQuantity: Prisma.Decimal;
    quantityUom: string;
    requestedLengthMeters: Prisma.Decimal;
    cableAuthorityStatus: string;
    technicalOfficeRequestId: string | null;
    status: string;
    notes: string | null;
    v2CurrentSnapshotId: string | null;
    v2CurrentCuttingPlanId: string | null;
    v2CurrentDrumPlanId: string | null;
    v2CuttingRequirements?: Array<{
      id: string;
      requirementId: string;
      sequenceNo: number;
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
      configurationSnapshotId: string;
    }>;
    v2Snapshots?: Array<{
      snapshotId: string;
      versionNo: number;
      inquiryLineId: string;
      cableMaterialNumber: string | null;
      itemCode: string | null;
      customerCode: string | null;
      selections: unknown;
      configInput: unknown;
      validationStatus: string;
      flowState: string;
      engineeringStatus: string;
      summaryDescription: string | null;
      estimatedDiameterMm: Prisma.Decimal | null;
      estimatedWeightKgKm: Prisma.Decimal | null;
      catalogSource: string;
      catalogAuthoritative: boolean;
      bomGovernanceBlocked: boolean;
      unresolvedBomConflictCount: number;
      downstreamGates: unknown;
      actorId: string | null;
      actorEmail: string | null;
      actorRole: string | null;
      capturedAt: Date;
    }>;
    v2CuttingPlans?: Array<{
      id: string;
      planId: string;
      versionNo: number;
      nominalLengthM: Prisma.Decimal;
      tolerancePercent: Prisma.Decimal;
      validationStatus: string;
    }>;
    v2DrumPlans?: Array<{
      id: string;
      planId: string;
      versionNo: number;
      lifecycleStatus: string;
      validationStatus: string;
      drumCount: number;
      totalPlannedLengthM: Prisma.Decimal;
    }>;
  }>;
}) {
  const meta = commercialMetadataRecord(inquiry.commercialMetadata);
  return {
    id: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    customerId: inquiry.customerId,
    customerMasterId: inquiry.customerMasterId,
    customerName: inquiry.customerName,
    contactPerson: inquiry.contactPerson,
    customerReference: inquiry.customerReference,
    inquiryDate: inquiry.inquiryDate.toISOString(),
    requestedDeliveryDate: inquiry.requestedDeliveryDate?.toISOString() ?? null,
    currency: inquiry.currency,
    status: inquiry.status,
    projectName: inquiry.projectName,
    notes: inquiry.notes,
    workflowChannel: meta.workflowChannel ?? null,
    inquiryProcessCode: meta.inquiryProcessCode ?? null,
    inquiryProcessSource: meta.inquiryProcessSource ?? null,
    v2EngineeringSummary: meta.v2EngineeringSummary ?? null,
    createdBy: inquiry.createdBy,
    modifiedBy: inquiry.modifiedBy,
    versionNo: inquiry.versionNo,
    isCurrent: inquiry.isCurrent,
    createdAt: inquiry.createdAt.toISOString(),
    updatedAt: inquiry.updatedAt.toISOString(),
    lines: (inquiry.lines || []).map((line) => {
      const currentPlan = line.v2CurrentCuttingPlanId
        ? (line.v2CuttingPlans || []).find((p) => p.id === line.v2CurrentCuttingPlanId)
        : null;
      const currentDrumPlan = line.v2CurrentDrumPlanId
        ? (line.v2DrumPlans || []).find((p) => p.id === line.v2CurrentDrumPlanId)
        : null;
      return {
      id: line.id,
      lineNumber: line.lineNumber,
      materialNumber: line.materialNumber,
      customerCode: line.customerCode,
      itemCode: line.itemCode,
      cableDescription: line.cableDescription,
      requestedQuantity: Number(line.requestedQuantity),
      quantityUom: line.quantityUom,
      requestedLengthMeters: Number(line.requestedLengthMeters),
      cableAuthorityStatus: line.cableAuthorityStatus,
      technicalOfficeRequestId: line.technicalOfficeRequestId,
      status: line.status,
      notes: line.notes,
      v2CurrentSnapshotId: line.v2CurrentSnapshotId,
      v2CurrentCuttingPlanId: line.v2CurrentCuttingPlanId,
      v2CurrentDrumPlanId: line.v2CurrentDrumPlanId,
      cuttingRequirements: (line.v2CuttingRequirements || []).map((r) => ({
        id: r.id,
        requirementId: r.requirementId,
        sequenceNo: r.sequenceNo,
        nominalLengthM: Number(r.nominalLengthM),
        unit: r.unit,
        toleranceMode: r.toleranceMode,
        positiveTolerancePercent: Number(r.positiveTolerancePercent),
        negativeTolerancePercent: Number(r.negativeTolerancePercent),
        minLengthM: Number(r.minLengthM),
        maxLengthM: Number(r.maxLengthM),
        requestedDrumCount: r.requestedDrumCount,
        status: r.status,
        versionNo: r.versionNo,
        currentCuttingPlanId: r.currentCuttingPlanId,
        currentDrumPlanId: r.currentDrumPlanId,
      })),
      snapshots: (line.v2Snapshots || []).map(mapSnapshotRow),
      currentCuttingPlan: currentPlan
        ? {
            planId: currentPlan.planId,
            versionNo: currentPlan.versionNo,
            validationStatus: currentPlan.validationStatus,
            nominalLengthM: Number(currentPlan.nominalLengthM),
            tolerancePercent: Number(currentPlan.tolerancePercent),
          }
        : null,
      currentDrumPlan: currentDrumPlan
        ? {
            planId: currentDrumPlan.planId,
            versionNo: currentDrumPlan.versionNo,
            lifecycleStatus: currentDrumPlan.lifecycleStatus,
            validationStatus: currentDrumPlan.validationStatus,
            drumCount: currentDrumPlan.drumCount,
            totalPlannedLengthM: Number(currentDrumPlan.totalPlannedLengthM),
          }
        : null,
    };
    }),
  };
}

async function resolveV2Customer(actor: RequestActor) {
  assertCustomerBusinessScope(actor);
  const scope = await resolveCustomerScope(actor);
  let customerId: string;
  let customerMasterId: string | null = null;
  let customerName = 'Customer';

  if (actor.userType === 'customer') {
    customerMasterId = scope.primaryMasterId || actor.customerMasterIds?.[0] || null;
    customerId = scope.primaryCode || actor.customerCode || actor.id || actor.email || 'customer';
    if (customerMasterId) {
      const prisma = requirePrisma();
      const master = await prisma.customer.findUnique({ where: { id: customerMasterId } });
      customerName = master?.name || customerName;
    }
  } else {
    customerId = actor.id || actor.email || 'internal';
    customerMasterId = (await lookupCustomerMasterId(customerId)) || null;
    customerName = 'Energya Client';
  }

  return { customerId, customerMasterId, customerName, scope };
}

export async function loadV2InquiryScoped(id: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id }, { inquiryNumber: id }] },
    include: inquiryInclude,
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${id} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (!isV2InquiryMetadata(inquiry.commercialMetadata)) {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} is not a V2 configuration workflow record.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  return inquiry;
}

export async function createV2Inquiry(input: CreateV2InquiryInput, actor: RequestActor) {
  assertCanManageInquiry(actor);
  const prisma = requirePrisma();
  const { customerId, customerMasterId, customerName } = await resolveV2Customer(actor);
  const resolvedProcess = await resolveInquiryProcess(customerMasterId);

  const allocateInquiryNumber = async () => {
    try {
      return (await allocateNextNumber('INQ_COMMERCIAL', actor)).value;
    } catch {
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      return `INQ-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }
  };

  const baseMetadata = applySystemMarketMetalDefaultsOnCreate(
    {
      workflowChannel: 'V2_CONFIGURATION',
      v2EngineeringSummary: { lineCount: 0, snapshotCount: 0 },
    },
    { copper: null, aluminium: null }
  );

  let inquiry: Awaited<ReturnType<typeof prisma.commercialInquiry.create>> | undefined;
  let inquiryNumber = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    inquiryNumber = await allocateInquiryNumber();
    try {
      inquiry = await prisma.commercialInquiry.create({
        data: {
          inquiryNumber,
          customerId,
          customerMasterId,
          customerName,
          contactPerson: input.contactPerson || actor.name || null,
          customerReference: input.customerReference || null,
          requestedDeliveryDate: input.requestedDeliveryDate ? new Date(input.requestedDeliveryDate) : null,
          projectName: input.projectName || null,
          notes: input.notes || null,
          status: 'DRAFT',
          commercialMetadata: applyInquiryProcessToMetadata(baseMetadata, resolvedProcess) as Prisma.InputJsonValue,
          inquiryGroupKey: input.customerReference || inquiryNumber,
          createdBy: actor.name || actor.email || actor.id || null,
          modifiedBy: actor.name || actor.email || actor.id || null,
        },
        include: inquiryInclude,
      });
      break;
    } catch (err) {
      const unique = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!unique || attempt === 7) throw err;
    }
  }
  if (!inquiry) throw new Error('Failed to allocate a unique V2 inquiry number.');

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'V2_CREATE',
    newValue: {
      inquiryNumber,
      workflowChannel: 'V2_CONFIGURATION',
      customerMasterId,
      inquiryProcessCode: resolvedProcess.processCode,
      inquiryProcessSource: resolvedProcess.source,
    },
    message: `Created V2 inquiry ${inquiryNumber}`,
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'INQUIRY_PROCESS_ASSIGNED',
    newValue: {
      customerMasterId,
      inquiryProcessCode: resolvedProcess.processCode,
      inquiryProcessSource: resolvedProcess.source,
    },
    message: `Assigned inquiry process ${resolvedProcess.processCode} (${resolvedProcess.source}) on create`,
  });

  return projectV2Inquiry(inquiry);
}

export async function listV2Inquiries(
  actor: RequestActor,
  query: { page?: number; pageSize?: number; status?: string } = {}
) {
  assertCanManageInquiry(actor);
  const prisma = requirePrisma();
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 25));
  const where: Prisma.CommercialInquiryWhereInput = {
    commercialMetadata: { path: ['workflowChannel'], equals: 'V2_CONFIGURATION' },
  };
  if (query.status) where.status = query.status as InquiryStatus;

  if (actor.userType === 'customer') {
    const scope = await resolveCustomerScope(actor);
    where.OR = [
      { customerMasterId: { in: scope.masterIds } },
      { customerId: { in: scope.matchKeys } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.commercialInquiry.count({ where }),
    prisma.commercialInquiry.findMany({
      where,
      include: inquiryInclude,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    inquiries: rows.map(projectV2Inquiry),
  };
}

export async function getV2Inquiry(id: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(id, actor);
  return projectV2Inquiry(inquiry);
}

export async function addV2InquiryLine(
  inquiryId: string,
  input: AddV2InquiryLineInput,
  actor: RequestActor
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  if (inquiry.status !== 'DRAFT') {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} must be DRAFT to add lines.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const prisma = requirePrisma();
  const nextLineNumber =
    inquiry.lines.length > 0 ? Math.max(...inquiry.lines.map((l) => l.lineNumber)) + 1 : 1;

  const line = await prisma.commercialInquiryLine.create({
    data: {
      inquiryId: inquiry.id,
      lineNumber: nextLineNumber,
      cableDescription: input.cableDescription || `V2 Configuration Line ${nextLineNumber}`,
      requestedQuantity: input.requestedQuantity ?? 1,
      quantityUom: input.quantityUom || 'KM',
      requestedLengthMeters: input.requestedLengthMeters ?? 1000,
      cableAuthorityStatus: 'CONFIGURATION_REQUIRED',
      status: 'CONFIGURATION_REQUIRED',
      notes: input.notes || null,
    },
    include: lineInclude,
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: line.id,
    action: 'V2_LINE_CREATE',
    newValue: { inquiryNumber: inquiry.inquiryNumber, lineNumber: nextLineNumber },
    message: `Added V2 line #${nextLineNumber} to ${inquiry.inquiryNumber}`,
  });

  const refreshed = await getV2Inquiry(inquiry.id, actor);
  return { inquiry: refreshed, line: refreshed.lines.find((l) => l.id === line.id)! };
}

function buildServerSnapshot(
  input: PersistV2SnapshotInput,
  actor: RequestActor,
  snapshotId: string,
  validation: TechnicalValidationResultV2,
  unresolvedBomConflictCount: number
): V2CableConfigurationSnapshot {
  const physicals = estimateCablePhysicals(input.selections);
  const summaryDesc = input.cableDescription || generateTechnicalDescriptionV2(input.selections);

  return buildConfigurationSnapshot({
    selections: input.selections,
    validation: {
      ...validation,
      summaryDescription: validation.summaryDescription || summaryDesc,
      estimatedDiameterMm: validation.estimatedDiameterMm ?? physicals.diameterMm,
      estimatedWeightKgKm: validation.estimatedWeightKgKm ?? physicals.weightKgKm,
    },
    catalogSource: input.catalogSource,
    catalogAuthoritative: input.catalogAuthoritative,
    actorContext: {
      userId: actor.id,
      email: actor.email,
      role: actor.userType,
      customerCode: actor.customerCode,
    },
    snapshotId,
    unresolvedBomConflictCount,
  });
}

async function countUnresolvedBomConflicts(materialNumber: string | null | undefined): Promise<number> {
  if (!materialNumber) return 0;
  const prisma = requirePrisma();
  return prisma.bomDuplicateObservation.count({
    where: {
      cableMaterialNumber: materialNumber,
      investigationStatus: { not: 'APPROVED' },
    },
  });
}

async function buildPersistedValidation(
  selections: SelectionStateV2,
  physicals: { diameterMm: number; weightKgKm: number },
  summaryDesc: string
): Promise<TechnicalValidationResultV2> {
  const decision = await evaluatePersistedCable(selectionsToConfig(selections));
  const base = evaluateCableConfigurationV2(selections);

  if (decision.code === 'CONFIGURATION_REQUIRED') {
    return {
      status: 'CONFIGURATION_REQUIRED',
      isValid: false,
      errors: decision.failedRules.map((r) => ({ field: r.field, message: r.message, severity: 'error' })),
      warnings: base.warnings,
      matchingCable: null,
      similarCables: [],
      summaryDescription: summaryDesc,
      estimatedDiameterMm: physicals.diameterMm,
      estimatedWeightKgKm: physicals.weightKgKm,
    };
  }
  if (decision.code === 'INVALID_CONFIGURATION') {
    return {
      status: 'INVALID_CONFIGURATION',
      isValid: false,
      errors: decision.failedRules.map((r) => ({ field: r.field, message: r.message, severity: 'error' })),
      warnings: base.warnings,
      matchingCable: null,
      similarCables: [],
      summaryDescription: summaryDesc,
      estimatedDiameterMm: physicals.diameterMm,
      estimatedWeightKgKm: physicals.weightKgKm,
    };
  }
  if (decision.code === 'EXISTING_CABLE' && decision.cable) {
    return {
      status: 'EXISTING_APPROVED',
      isValid: true,
      errors: [],
      warnings: base.warnings,
      matchingCable: {
        id: decision.cable.id,
        materialNumber: decision.cable.materialNumber,
        itemCode: decision.cable.itemCode,
        customerCode: decision.cable.customerCode,
        description: decision.cable.description,
        family: decision.cable.family,
        voltageClass: 'MV',
        voltage: decision.cable.voltage,
        standard: '',
        conductorMaterial: decision.cable.conductor,
        conductorClass: '',
        conductorSize: decision.cable.conductorSize,
        conductorSizeNum: 0,
        conductorWaterTight: 'No',
        cores: decision.cable.cores,
        coresCount: Number.parseInt(decision.cable.cores, 10) || 1,
        coreColors: [],
        coreIdentification: '',
        insulation: decision.cable.insulation,
        outerSemiConductor: '',
        screenType: decision.cable.screen,
        screenCSA: '',
        armour: decision.cable.armour,
        armourCSA: '',
        sheathing: decision.cable.sheath,
        sheathingColor: '',
        specialAdditives: [],
        cpr: 'No',
        approvedStatus: (decision.cable.approvalStatus as 'Released') || 'Released',
        outerDiameterMm: decision.cable.diameter || physicals.diameterMm,
        approxWeightKgKm: physicals.weightKgKm,
      } as import('../components/cable-configurator/v2/types').CableRecordV2,
      similarCables: [],
      summaryDescription: decision.cable.description || summaryDesc,
      estimatedDiameterMm: decision.cable.diameter || physicals.diameterMm,
      estimatedWeightKgKm: physicals.weightKgKm,
    };
  }
  if (decision.code === 'TECHNICALLY_VALID_NOT_MASTER') {
    return {
      status: 'TECHNICALLY_VALID_NOT_MASTER',
      isValid: true,
      errors: [],
      warnings: base.warnings,
      matchingCable: null,
      similarCables: [],
      summaryDescription: summaryDesc,
      estimatedDiameterMm: physicals.diameterMm,
      estimatedWeightKgKm: physicals.weightKgKm,
    };
  }
  return {
    status: 'VALID_NEW_CABLE',
    isValid: true,
    errors: [],
    warnings: base.warnings,
    matchingCable: null,
    similarCables: [],
    summaryDescription: summaryDesc,
    estimatedDiameterMm: physicals.diameterMm,
    estimatedWeightKgKm: physicals.weightKgKm,
  };
}

export async function persistV2ConfigurationSnapshot(
  inquiryId: string,
  lineId: string,
  input: PersistV2SnapshotInput,
  actor: RequestActor
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found on inquiry ${inquiry.inquiryNumber}.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (inquiry.status !== 'DRAFT') {
    const err = new Error('Submitted inquiries are immutable — create a new inquiry revision for configuration changes.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const prisma = requirePrisma();
  const latestVersion = line.v2Snapshots?.[0]?.versionNo ?? 0;
  const snapshotId = `v2cfg-${inquiry.inquiryNumber}-L${line.lineNumber}-v${latestVersion + 1}`;
  const validation = await buildPersistedValidation(
    input.selections,
    estimateCablePhysicals(input.selections),
    input.cableDescription || generateTechnicalDescriptionV2(input.selections)
  );
  const matchedMaterial =
    validation.matchingCable?.materialNumber || input.selections.materialNumber || line.materialNumber || null;
  const unresolvedBomConflictCount = await countUnresolvedBomConflicts(matchedMaterial);
  const snapshot = buildServerSnapshot(input, actor, snapshotId, validation, unresolvedBomConflictCount);

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: snapshot.snapshotId,
        versionNo: latestVersion + 1,
        inquiryLineId: line.id,
        cableMaterialNumber: snapshot.cableMaterialNumber,
        itemCode: snapshot.itemCode,
        customerCode: snapshot.customerCode,
        selections: snapshot.selections as unknown as Prisma.InputJsonValue,
        configInput: snapshot.configInput as unknown as Prisma.InputJsonValue,
        validationStatus: snapshot.validationStatus,
        flowState: snapshot.flowState,
        engineeringStatus: snapshot.engineeringStatus,
        summaryDescription: snapshot.summaryDescription,
        estimatedDiameterMm: snapshot.estimatedDiameterMm,
        estimatedWeightKgKm: snapshot.estimatedWeightKgKm,
        catalogSource: snapshot.catalogSource,
        catalogAuthoritative: snapshot.catalogAuthoritative,
        bomGovernanceBlocked: snapshot.bomGovernanceBlocked,
        unresolvedBomConflictCount: snapshot.unresolvedBomConflictCount,
        downstreamGates: snapshot.downstreamGates as Prisma.InputJsonValue,
        actorId: actor.id || null,
        actorEmail: actor.email || null,
        actorRole: actor.userType || null,
        capturedAt: new Date(snapshot.capturedAt),
      },
    });

    let technicalOfficeRequestId = line.technicalOfficeRequestId;
    if (
      snapshot.validationStatus === 'TECHNICALLY_VALID_NOT_MASTER' &&
      !technicalOfficeRequestId
    ) {
      const reqNum = `TCR-${inquiry.inquiryNumber}-L${line.lineNumber}`;
      const toReq = await createTechnicalOfficeRequest({
        requestNumber: reqNum,
        canonicalStatus: 'SUBMITTED',
        displayStatus: 'Submitted',
        configuration: snapshot.configInput as Record<string, unknown>,
        customer: inquiry.customerName,
        quantity: String(input.requestedQuantity ?? line.requestedQuantity),
        requesterId: actor.id,
        requesterName: actor.name,
        requesterEmail: actor.email,
        reason: `V2 configuration snapshot ${snapshot.snapshotId} — Cable Master record not found.`,
      });
      technicalOfficeRequestId = toReq.requestNumber;
    }

    await tx.commercialInquiryLine.update({
      where: { id: line.id },
      data: {
        v2CurrentSnapshotId: row.id,
        materialNumber: snapshot.cableMaterialNumber,
        itemCode: snapshot.itemCode,
        customerCode: snapshot.customerCode,
        cableDescription: snapshot.summaryDescription || line.cableDescription,
        configurationPayload: snapshot.configInput as Prisma.InputJsonValue,
        cableAuthorityStatus: snapshot.validationStatus,
        technicalOfficeRequestId,
        requestedQuantity: input.requestedQuantity ?? line.requestedQuantity,
        quantityUom: input.quantityUom || line.quantityUom,
        requestedLengthMeters: input.requestedLengthMeters ?? line.requestedLengthMeters,
        status:
          snapshot.flowState === 'VALID'
            ? 'CABLE_VALIDATED'
            : snapshot.flowState === 'BLOCKED_ENGINEERING_APPROVAL'
              ? 'TECHNICAL_OFFICE_REQUIRED'
              : 'CONFIGURATION_REQUIRED',
      },
    });

    const meta = commercialMetadataRecord(inquiry.commercialMetadata);
    const snapshotCount =
      inquiry.lines.reduce((acc, l) => acc + (l.v2Snapshots?.length || 0), 0) + 1;
    await tx.commercialInquiry.update({
      where: { id: inquiry.id },
      data: {
        modifiedBy: actor.name || actor.email || inquiry.modifiedBy,
        commercialMetadata: {
          ...meta,
          workflowChannel: 'V2_CONFIGURATION',
          v2EngineeringSummary: {
            lineCount: inquiry.lines.length,
            snapshotCount,
            lastSnapshotId: snapshot.snapshotId,
            lastFlowState: snapshot.flowState,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return row;
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'V2ConfigurationSnapshot',
    entityId: result.snapshotId,
    action: 'PERSIST',
    newValue: {
      inquiryNumber: inquiry.inquiryNumber,
      lineNumber: line.lineNumber,
      flowState: snapshot.flowState,
      engineeringStatus: snapshot.engineeringStatus,
    },
    message: `Persisted V2 configuration snapshot ${result.snapshotId}`,
  });

  const refreshed = await getV2Inquiry(inquiry.id, actor);
  const refreshedLine = refreshed.lines.find((l) => l.id === lineId)!;
  const persisted = refreshedLine.snapshots.find((s) => s.snapshotId === result.snapshotId)!;
  return { inquiry: refreshed, line: refreshedLine, snapshot: persisted };
}

export async function submitV2Inquiry(inquiryId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  assertStandardSubmitAllowed(inquiry);
  if (inquiry.status !== 'DRAFT') {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} cannot be submitted from ${inquiry.status}.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  if (inquiry.lines.length === 0) {
    const err = new Error('Cannot submit an inquiry with zero lines.');
    (err as Error & { code: string }).code = 'EMPTY_INQUIRY';
    throw err;
  }
  const { loadImportedCableCalculationEvidence } = await import('./importedCableCalculationEvidence');
  const { importedCableSatisfiesCalculationEngineering } = await import(
    '../domain/importedCableCalculationAuthority'
  );
  const importedOkByLineId = new Map<string, boolean>();
  for (const line of inquiry.lines) {
    const evidence = await loadImportedCableCalculationEvidence(line.materialNumber);
    importedOkByLineId.set(line.id, importedCableSatisfiesCalculationEngineering(evidence));
  }

  const missingSnapshot = inquiry.lines.filter((l) => !l.v2CurrentSnapshotId);
  const stillMissing = missingSnapshot.filter((l) => !importedOkByLineId.get(l.id));
  if (stillMissing.length > 0) {
    const err = new Error(
      `Configuration snapshot required for line(s): ${stillMissing.map((l) => l.lineNumber).join(', ')}.`
    );
    (err as Error & { code: string }).code = 'CONFIGURATION_REQUIRED';
    throw err;
  }

  const currentSnapshots = inquiry.lines.map((line) => {
    const snap = (line.v2Snapshots || []).find((s) => s.id === line.v2CurrentSnapshotId);
    return { line, snap };
  });
  const unresolved = currentSnapshots.filter((row) => !row.snap && !importedOkByLineId.get(row.line.id));
  if (unresolved.length > 0) {
    const err = new Error(
      `Configuration snapshot required for line(s): ${unresolved.map((row) => row.line.lineNumber).join(', ')}.`
    );
    (err as Error & { code: string }).code = 'CONFIGURATION_REQUIRED';
    throw err;
  }
  const invalid = currentSnapshots.filter(
    (row) =>
      row.snap &&
      (row.snap.flowState !== 'VALID' || row.snap.validationStatus === 'INVALID_CONFIGURATION')
  );
  if (invalid.length > 0) {
    const detail = invalid
      .map(
        (row) =>
          `Line ${row.line.lineNumber}: configuration snapshot is not VALID (status=${row.snap!.validationStatus}, flow=${row.snap!.flowState}).`
      )
      .join(' ');
    const err = new Error(detail);
    (err as Error & { code: string }).code =
      invalid.some((row) => row.snap!.validationStatus === 'INVALID_CONFIGURATION' || row.snap!.flowState === 'INVALID')
        ? 'INVALID_CONFIGURATION'
        : 'CONFIGURATION_REQUIRED';
    throw err;
  }

  const snapshots = inquiry.lines.flatMap((l) => l.v2Snapshots || []);
  const anyBomBlocked = snapshots.some((s) => s.bomGovernanceBlocked);
  const anyEngineeringBlocked = snapshots.some(
    (s) => s.flowState === 'BLOCKED_ENGINEERING_APPROVAL' || s.flowState === 'ENGINEERING_DATA_BLOCKED'
  );
  const allLinesValid = inquiry.lines.every((line) => {
    const snap = (line.v2Snapshots || []).find((s) => s.id === line.v2CurrentSnapshotId);
    if (snap) return snap.flowState === 'VALID' && snap.validationStatus !== 'INVALID_CONFIGURATION';
    return importedOkByLineId.get(line.id) === true;
  });

  const prisma = requirePrisma();
  assertV2StatusTransition(inquiry.status, 'SUBMITTED');

  const submitted = await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { status: 'SUBMITTED', modifiedBy: actor.name || actor.email || inquiry.modifiedBy },
    include: inquiryInclude,
  });

  assertV2StatusTransition('SUBMITTED', 'ENGINEERING_REVIEW');
  await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { status: 'ENGINEERING_REVIEW' },
    include: inquiryInclude,
  });

  const engineeringStatus = derivePostSubmitStatus({
    anyBomBlocked,
    anyEngineeringBlocked,
    allLinesValid,
  });
  const alreadyInEngineeringReview = engineeringStatus === 'ENGINEERING_REVIEW';
  if (!alreadyInEngineeringReview) {
    assertV2StatusTransition('ENGINEERING_REVIEW', engineeringStatus);
  }

  const final = await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: {
      ...(alreadyInEngineeringReview ? {} : { status: engineeringStatus }),
      commercialMetadata: {
        ...commercialMetadataRecord(submitted.commercialMetadata),
        workflowChannel: 'V2_CONFIGURATION',
        v2EngineeringSummary: {
          submittedAt: new Date().toISOString(),
          anyBomBlocked,
          anyEngineeringBlocked,
          allLinesValid,
          finalStatus: engineeringStatus,
        },
      } as Prisma.InputJsonValue,
    },
    include: inquiryInclude,
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'V2_SUBMIT',
    oldValue: { status: inquiry.status },
    newValue: { status: engineeringStatus, lineCount: inquiry.lines.length },
    message: `Submitted V2 inquiry ${inquiry.inquiryNumber} → ${engineeringStatus}`,
  });

  await startStandardInquiryWorkflow(
    {
      id: final.id,
      inquiryNumber: final.inquiryNumber,
      customerMasterId: final.customerMasterId,
      commercialMetadata: final.commercialMetadata,
    },
    actor
  );

  try {
    const { runStandardWorkflowAfterSubmit } = await import('./standardWorkflowOrchestrator');
    await runStandardWorkflowAfterSubmit(final.id, actor);
  } catch (err) {
    console.warn('[standard-workflow] post-submit orchestrator stopped at gate', err);
  }

  return projectV2Inquiry(final);
}

export async function transitionV2InquiryEngineeringStatus(
  inquiryId: string,
  toStatus: InquiryStatus,
  actor: RequestActor
) {
  if (actor.userType === 'customer') {
    const err = new Error('Customer users cannot perform engineering status transitions.');
    (err as Error & { code: string }).code = 'UNAUTHORIZED';
    throw err;
  }
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  assertV2StatusTransition(inquiry.status, toStatus);

  if (toStatus === 'READY_FOR_COMMERCIAL') {
    const prisma = requirePrisma();
    const requirements = await prisma.v2CuttingLengthRequirement.findMany({
      where: { inquiryLineId: { in: inquiry.lines.map((l) => l.id) } },
      select: {
        inquiryLineId: true,
        sequenceNo: true,
        currentCuttingPlanId: true,
      },
    });
    const planIds = [
      ...new Set(
        [
          ...inquiry.lines.map((l) => l.v2CurrentCuttingPlanId),
          ...requirements.map((r) => r.currentCuttingPlanId),
        ].filter((id): id is string => Boolean(id))
      ),
    ];
    const plans = planIds.length
      ? await prisma.v2CuttingLengthPlan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, validationStatus: true, configurationSnapshotId: true },
        })
      : [];
    const plansById = new Map(plans.map((p) => [p.id, p]));
    const requirementsByLine = new Map<string, typeof requirements>();
    for (const req of requirements) {
      const list = requirementsByLine.get(req.inquiryLineId) || [];
      list.push(req);
      requirementsByLine.set(req.inquiryLineId, list);
    }
    assertReadyForCommercialCuttingPlans(
      inquiry.lines.map((l) => ({
        id: l.id,
        lineNumber: l.lineNumber,
        v2CurrentCuttingPlanId: l.v2CurrentCuttingPlanId,
        v2CurrentSnapshotId: l.v2CurrentSnapshotId,
        cuttingRequirements: (requirementsByLine.get(l.id) || []).map((r) => ({
          sequenceNo: r.sequenceNo,
          currentCuttingPlanId: r.currentCuttingPlanId,
        })),
      })),
      plansById
    );
  }

  const prisma = requirePrisma();
  const meta = commercialMetadataRecord(inquiry.commercialMetadata);
  const prevSummary = commercialMetadataRecord(meta.v2EngineeringSummary);
  const updated = await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: {
      status: toStatus,
      modifiedBy: actor.name || actor.email || inquiry.modifiedBy,
      commercialMetadata: {
        ...meta,
        workflowChannel: 'V2_CONFIGURATION',
        v2EngineeringSummary: {
          ...prevSummary,
          lastTransitionAt: new Date().toISOString(),
          lastTransitionBy: actor.email || actor.name,
        },
      } as Prisma.InputJsonValue,
    },
    include: inquiryInclude,
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'V2_ENGINEERING_TRANSITION',
    oldValue: { status: inquiry.status },
    newValue: { status: toStatus },
    message: `V2 engineering transition ${inquiry.status} → ${toStatus}`,
  });

  return projectV2Inquiry(updated);
}

export async function listV2LineSnapshots(inquiryId: string, lineId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  return (line.v2Snapshots || []).map(mapSnapshotRow);
}
