import type { CableEngineeringInput } from './drumCapacityCalculator';
import {
  listDrumCandidates,
  optimizeDrumPlan,
  validateManualDrumPlan,
  type AuthoritativeDrumPlan,
  type AuthoritativeDrumPlanLine,
  type DrumMasterForOptimization,
} from './drumOptimizationService';
import type { DrumSelectionHandoffDto } from './v2CuttingLengthService';
import { lengthIsWithinToleranceBand } from './cuttingLengthTolerance';

export type V2DrumPlanLifecycleStatus = 'DRAFT' | 'VALIDATED' | 'CONFIRMED' | 'SUPERSEDED';
export type V2DrumPlanValidationStatus = 'VALID' | 'WARNING' | 'ERROR';
export type V2DrumPlanSelectionMethod = 'AUTOMATIC' | 'MANUAL' | 'MIXED';
export type QuantityReconciliationStatus = 'OK' | 'UNDER' | 'OVER' | 'REMAINDER';

export interface V2DrumPlanValidationMessage {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface DrumPlanHandoffLineDto {
  lineNo: number;
  drumCode: string;
  drumMasterId: string | null;
  numberOfDrums: number;
  cuttingLengthM: number;
  isRemainderDrum: boolean;
  plannedCableLengthM: number;
  clearanceMm: number | null;
  capacityM: number | null;
  maxLoadKg: number | null;
  cableWeightKg: number | null;
  grossLoadedDrumWeightKg: number | null;
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent: number | null;
}

/** Read-only handoff contract for future costing — confirmed plans only. */
export interface DrumPlanHandoffDto {
  inquiryLineId: string;
  drumPlanId: string;
  drumPlanIdString: string;
  drumPlanVersionNo: number;
  cuttingLengthPlanId: string;
  cuttingLengthPlanIdString: string;
  configurationSnapshotId: string;
  configurationSnapshotIdString: string;
  cableMaterialNumber: string | null;
  selectionMethod: V2DrumPlanSelectionMethod;
  cableTolerancePercent: number;
  totalPlannedLengthM: number;
  drumCount: number;
  remainderLengthM: number;
  quantityReconciliationStatus: QuantityReconciliationStatus | null;
  quantityReconciliationMessages: V2DrumPlanValidationMessage[];
  validationStatus: V2DrumPlanValidationStatus;
  lifecycleStatus: V2DrumPlanLifecycleStatus;
  lines: DrumPlanHandoffLineDto[];
  capturedAt: string;
}

export interface DrumSelectionContext {
  handoff: DrumSelectionHandoffDto;
  cuttingLengthPlanId: string;
  cuttingLengthRequirementId: string | null;
  configurationSnapshotId: string;
  cable: CableEngineeringInput;
  /** Per-drum cutting length used for type selection — never length × drum count. */
  totalOrderLengthM: number;
}

export interface PersistDrumPlanRowInput {
  drumCode: string;
  numberOfDrums: number;
  cuttingLengthM: number;
  drumTolerancePercent?: number;
}

export interface BuildDrumPlanInput {
  selectionMethod: 'AUTOMATIC' | 'MANUAL';
  cableTolerancePercent?: number;
  totalOrderLengthM?: number;
  rows?: PersistDrumPlanRowInput[];
  confirmAutomaticRecommendation?: boolean;
}

export interface QuantityReconciliationResult {
  status: QuantityReconciliationStatus;
  messages: V2DrumPlanValidationMessage[];
  totalScheduledM: number;
  remainderLengthM: number;
  targetLengthM: number;
}

export interface MappedDrumPlanPersistData {
  selectionMethod: V2DrumPlanSelectionMethod;
  cableTolerancePercent: number;
  totalPlannedLengthM: number;
  drumCount: number;
  remainderLengthM: number;
  validationStatus: V2DrumPlanValidationStatus;
  quantityReconciliation: QuantityReconciliationResult;
  engineeringSnapshot: AuthoritativeDrumPlan;
  lines: Array<{
    lineNo: number;
    drumCode: string;
    drumMasterId: string | null;
    numberOfDrums: number;
    cuttingLengthM: number;
    isRemainderDrum: boolean;
    clearanceMm: number | null;
    capacityM: number | null;
    maxLoadKg: number | null;
    plannedCableLengthM: number;
    cableWeightKg: number | null;
    emptyDrumNetWeightKg: number | null;
    grossLoadedDrumWeightKg: number | null;
    lengthUtilizationPercent: number | null;
    loadUtilizationPercent: number | null;
    validationStatus: string;
    validationReasons: string[];
    engineering: AuthoritativeDrumPlanLine['engineering'];
  }>;
}

function downstreamGateOpen(downstreamGates: unknown, gate: string): boolean {
  if (!downstreamGates || typeof downstreamGates !== 'object' || Array.isArray(downstreamGates)) {
    return false;
  }
  return (downstreamGates as Record<string, unknown>)[gate] === true;
}

export function buildCableFromHandoff(handoff: DrumSelectionHandoffDto): CableEngineeringInput {
  return {
    cableDiameterMm: handoff.cableDiameterMm ?? 0,
    approxWeightKgKm: handoff.cableWeightKgKm ?? 0,
  };
}

export function assertDrumSelectionContext(args: {
  handoff: DrumSelectionHandoffDto;
  lineCurrentCuttingPlanId: string | null;
  lineCurrentSnapshotId: string | null;
  cuttingLengthPlanId: string;
  cuttingPlanConfigurationSnapshotId: string;
  downstreamGates?: unknown;
  requirementCurrentCuttingPlanId?: string | null;
  cuttingLengthRequirementId?: string | null;
}): DrumSelectionContext {
  const currentCuttingPlanId = args.requirementCurrentCuttingPlanId ?? args.lineCurrentCuttingPlanId;
  if (!currentCuttingPlanId) {
    const err = new Error('Cutting plan is required before drum selection.');
    (err as Error & { code: string }).code = 'CUTTING_PLAN_REQUIRED';
    throw err;
  }
  if (args.cuttingLengthPlanId !== currentCuttingPlanId) {
    const err = new Error('Drum plan must reference the current cutting plan for this cutting-length requirement.');
    (err as Error & { code: string }).code = 'STALE_CUTTING_PLAN';
    throw err;
  }
  if (
    args.lineCurrentSnapshotId &&
    args.cuttingPlanConfigurationSnapshotId !== args.lineCurrentSnapshotId
  ) {
    const err = new Error('Cutting plan references a stale configuration snapshot.');
    (err as Error & { code: string }).code = 'STALE_CONFIGURATION_SNAPSHOT';
    throw err;
  }
  if (!args.handoff.drumHandoffReady) {
    const err = new Error('Drum selection handoff is not ready — resolve cutting plan prerequisites.');
    (err as Error & { code: string }).code = 'HANDOFF_NOT_READY';
    throw err;
  }
  if (args.downstreamGates && !downstreamGateOpen(args.downstreamGates, 'drumSelection')) {
    const err = new Error('Configuration snapshot downstream gate for drum selection is not open.');
    (err as Error & { code: string }).code = 'HANDOFF_NOT_READY';
    throw err;
  }

  return {
    handoff: args.handoff,
    cuttingLengthPlanId: args.cuttingLengthPlanId,
    cuttingLengthRequirementId: args.cuttingLengthRequirementId ?? args.handoff.cuttingLengthRequirementId ?? null,
    configurationSnapshotId: args.cuttingPlanConfigurationSnapshotId,
    cable: buildCableFromHandoff(args.handoff),
    totalOrderLengthM: args.handoff.cuttingLengthMeters,
  };
}

export function listV2DrumSelectionCandidates(
  context: DrumSelectionContext,
  drums: DrumMasterForOptimization[]
) {
  return listDrumCandidates({
    drums,
    cable: context.cable,
    cuttingLengthM: context.handoff.cuttingLengthMeters,
    cableTolerancePercent: context.handoff.cableTolerancePercent,
    minLengthM: context.handoff.minLengthM,
    maxLengthM: context.handoff.maxLengthM,
  });
}

export function previewAutomaticDrumPlan(
  context: DrumSelectionContext,
  drums: DrumMasterForOptimization[],
  totalOrderLengthM?: number
): AuthoritativeDrumPlan {
  return optimizeDrumPlan({
    drums,
    cable: context.cable,
    totalOrderLengthM: totalOrderLengthM ?? context.handoff.cuttingLengthMeters,
    cableTolerancePercent: context.handoff.cableTolerancePercent,
    requestedDrumCount: context.handoff.requestedDrumCount ?? 1,
    minLengthM: context.handoff.minLengthM,
    maxLengthM: context.handoff.maxLengthM,
  });
}

export function previewManualDrumPlan(
  context: DrumSelectionContext,
  drums: DrumMasterForOptimization[],
  rows: PersistDrumPlanRowInput[]
): AuthoritativeDrumPlan {
  return validateManualDrumPlan({
    drums,
    cable: context.cable,
    cableTolerancePercent: context.handoff.cableTolerancePercent,
    rows: rows.map((r) => ({
      drumCode: r.drumCode,
      numberOfDrums: r.numberOfDrums,
      cuttingLengthM: r.cuttingLengthM,
      drumTolerancePercent: r.drumTolerancePercent ?? 0,
    })),
  });
}

export function buildAuthoritativePlanFromInput(
  context: DrumSelectionContext,
  drums: DrumMasterForOptimization[],
  input: BuildDrumPlanInput
): AuthoritativeDrumPlan {
  if (input.selectionMethod === 'AUTOMATIC') {
    return previewAutomaticDrumPlan(context, drums, input.totalOrderLengthM);
  }
  if (!input.rows || input.rows.length === 0) {
    return {
      method: 'MANUAL',
      selectionMethod: 'MANUAL',
      cableTolerancePercent: context.handoff.cableTolerancePercent,
      totalLengthM: 0,
      lines: [],
      isValid: false,
      blockingReasons: ['Manual drum plan requires at least one schedule row.'],
      rankingNotes: [],
    };
  }
  return previewManualDrumPlan(context, drums, input.rows);
}

export function reconcileDrumPlanQuantity(
  handoff: DrumSelectionHandoffDto,
  plan: AuthoritativeDrumPlan,
  targetLengthM?: number
): QuantityReconciliationResult {
  const messages: V2DrumPlanValidationMessage[] = [];
  const requestedDrumCount = Math.max(1, Math.floor(handoff.requestedDrumCount ?? 1));
  const perDrumTarget = targetLengthM ?? handoff.cuttingLengthMeters;
  const totalScheduledM = plan.lines.reduce((acc, l) => acc + l.numberOfDrums * l.cuttingLengthM, 0);
  const physicalDrumCount = plan.lines.reduce((acc, l) => acc + l.numberOfDrums, 0);
  const expectedTotalM = perDrumTarget * requestedDrumCount;
  const remainderLengthM = Math.round((expectedTotalM - totalScheduledM) * 1000) / 1000;
  const allPerDrumInBand = plan.lines.every((l) =>
    lengthIsWithinToleranceBand(l.cuttingLengthM, handoff.minLengthM, handoff.maxLengthM)
  );

  if (!allPerDrumInBand) {
    const expectedMin = handoff.minLengthM * requestedDrumCount;
    const expectedMax = handoff.maxLengthM * requestedDrumCount;
    if (totalScheduledM + 1e-9 < expectedMin) {
      messages.push({
        code: 'BELOW_MIN_TOLERANCE',
        message: `Total scheduled ${totalScheduledM} m is below ${requestedDrumCount} × minimum ${handoff.minLengthM} m.`,
        severity: 'error',
      });
    }
    if (totalScheduledM - 1e-9 > expectedMax) {
      messages.push({
        code: 'ABOVE_MAX_TOLERANCE',
        message: `Total scheduled ${totalScheduledM} m exceeds ${requestedDrumCount} × maximum ${handoff.maxLengthM} m.`,
        severity: 'error',
      });
    } else {
      messages.push({
        code: 'SPLIT_ALLOCATION',
        message: `Physical drums were split to cover one ${perDrumTarget} m cutting-length instance; requested drum count is ${requestedDrumCount}.`,
        severity: 'warning',
      });
    }
  } else {
    for (const line of plan.lines) {
      if (!lengthIsWithinToleranceBand(line.cuttingLengthM, handoff.minLengthM, handoff.maxLengthM)) {
        messages.push({
          code: 'PER_DRUM_OUT_OF_TOLERANCE',
          message: `Drum ${line.drumCode} cutting length ${line.cuttingLengthM} m is outside ${handoff.minLengthM}–${handoff.maxLengthM} m.`,
          severity: 'error',
        });
      }
    }
    if (physicalDrumCount !== requestedDrumCount) {
      messages.push({
        code: 'DRUM_COUNT_MISMATCH',
        message: `Physical drum count ${physicalDrumCount} does not match requested ${requestedDrumCount}.`,
        severity: 'warning',
      });
    }
  }

  if (remainderLengthM > 0 && allPerDrumInBand) {
    messages.push({
      code: 'REMAINDER_EXPLICIT',
      message: `Explicit remainder: ${remainderLengthM} m not allocated to drums.`,
      severity: 'warning',
    });
  } else if (remainderLengthM < 0 && allPerDrumInBand && totalScheduledM - 1e-9 > handoff.maxLengthM * requestedDrumCount) {
    messages.push({
      code: 'OVER_SCHEDULED',
      message: `Scheduled length ${totalScheduledM} m exceeds ${requestedDrumCount} × maximum ${handoff.maxLengthM} m.`,
      severity: 'error',
    });
  }

  const hasError = messages.some((m) => m.severity === 'error');
  const hasWarning = messages.some((m) => m.severity === 'warning');
  let status: QuantityReconciliationStatus = 'OK';
  if (remainderLengthM > 0) status = 'REMAINDER';
  else if (remainderLengthM < 0 && hasError) status = 'OVER';
  if (messages.some((m) => m.code === 'BELOW_MIN_TOLERANCE')) status = 'UNDER';
  if (messages.some((m) => m.code === 'ABOVE_MAX_TOLERANCE' || m.code === 'OVER_SCHEDULED')) status = 'OVER';

  if (!hasError && !hasWarning && physicalDrumCount === requestedDrumCount && allPerDrumInBand) {
    messages.push({
      code: 'QUANTITY_RECONCILED',
      message: `${physicalDrumCount} physical drum(s) at ${perDrumTarget} m each are within the cutting-length requirement band.`,
      severity: 'warning',
    });
  }

  return {
    status,
    messages,
    totalScheduledM,
    remainderLengthM,
    targetLengthM: expectedTotalM,
  };
}

function derivePlanValidationStatus(
  plan: AuthoritativeDrumPlan,
  reconciliation: QuantityReconciliationResult
): V2DrumPlanValidationStatus {
  const hasEngineError = !plan.isValid || plan.lines.some((l) => l.validationStatus !== 'VALID');
  const hasReconError = reconciliation.messages.some((m) => m.severity === 'error');
  const hasWarning =
    reconciliation.messages.some((m) => m.severity === 'warning') ||
    plan.lines.some((l) => l.validationStatus === 'INCOMPLETE');

  if (hasEngineError || hasReconError) return 'ERROR';
  if (hasWarning || reconciliation.status === 'REMAINDER') return 'WARNING';
  return 'VALID';
}

function drumCapacityFromEngineering(
  line: AuthoritativeDrumPlanLine
): number | null {
  const geo = line.engineering?.geometricalCapacityMeters;
  const load = line.engineering?.loadLimitedCapacityMeters;
  if (geo != null && load != null) return Math.min(geo, load);
  return geo ?? load ?? line.maximumUsableLengthM;
}

export function mapAuthoritativePlanToPersistData(
  context: DrumSelectionContext,
  plan: AuthoritativeDrumPlan,
  drums: DrumMasterForOptimization[]
): MappedDrumPlanPersistData {
  const byCode = new Map(drums.map((d) => [d.drumCode.toUpperCase(), d]));
  const reconciliation = reconcileDrumPlanQuantity(context.handoff, plan);
  const validationStatus = derivePlanValidationStatus(plan, reconciliation);
  const drumCount = plan.lines.reduce((acc, l) => acc + l.numberOfDrums, 0);
  const totalPlannedLengthM = reconciliation.totalScheduledM;

  const lines = plan.lines.map((line, idx) => {
    const master = byCode.get(line.drumCode.toUpperCase());
    const isRemainder =
      reconciliation.remainderLengthM > 0 && idx === plan.lines.length - 1 && line.numberOfDrums === 1;
    return {
      lineNo: idx + 1,
      drumCode: line.drumCode,
      drumMasterId: master?.id ?? line.drumId ?? null,
      numberOfDrums: line.numberOfDrums,
      cuttingLengthM: line.cuttingLengthM,
      isRemainderDrum: isRemainder,
      clearanceMm: line.engineering?.clearanceUsedMm ?? master?.clearanceMm ?? null,
      capacityM: drumCapacityFromEngineering(line),
      maxLoadKg: master?.maxWeight ?? null,
      plannedCableLengthM: line.numberOfDrums * line.cuttingLengthM,
      cableWeightKg: line.cableWeightKg,
      emptyDrumNetWeightKg: line.emptyDrumNetWeightKg,
      grossLoadedDrumWeightKg: line.grossLoadedDrumWeightKg,
      lengthUtilizationPercent: line.lengthUtilizationPercent,
      loadUtilizationPercent: line.loadUtilizationPercent,
      validationStatus: line.validationStatus,
      validationReasons: line.validationReasons,
      engineering: line.engineering,
    };
  });

  const methods = new Set(plan.lines.length > 0 ? [plan.selectionMethod] : []);
  const selectionMethod: V2DrumPlanSelectionMethod =
    methods.size > 1 ? 'MIXED' : plan.selectionMethod;

  return {
    selectionMethod,
    cableTolerancePercent: plan.cableTolerancePercent,
    totalPlannedLengthM,
    drumCount,
    remainderLengthM: reconciliation.remainderLengthM,
    validationStatus,
    quantityReconciliation: reconciliation,
    engineeringSnapshot: plan,
    lines,
  };
}

export function buildDrumPlanHandoffDto(args: {
  inquiryLineId: string;
  plan: {
    id: string;
    planId: string;
    versionNo: number;
    lifecycleStatus: string;
    validationStatus: string;
    selectionMethod: string;
    cableTolerancePercent: number;
    totalPlannedLengthM: number;
    drumCount: number;
    remainderLengthM: number;
    quantityReconciliationStatus: string | null;
    quantityReconciliationMessages: unknown;
    cuttingLengthPlanId: string;
    cuttingLengthPlanIdString: string;
    configurationSnapshotId: string;
    configurationSnapshotIdString: string;
    capturedAt: Date | string;
  };
  lines: Array<{
    lineNo: number;
    drumCode: string;
    drumMasterId: string | null;
    numberOfDrums: number;
    cuttingLengthM: number;
    isRemainderDrum: boolean;
    clearanceMm: number | null;
    capacityM: number | null;
    maxLoadKg: number | null;
    plannedCableLengthM: number;
    cableWeightKg: number | null;
    grossLoadedDrumWeightKg: number | null;
    lengthUtilizationPercent: number | null;
    loadUtilizationPercent: number | null;
  }>;
  cableMaterialNumber: string | null;
}): DrumPlanHandoffDto {
  const messages = Array.isArray(args.plan.quantityReconciliationMessages)
    ? (args.plan.quantityReconciliationMessages as V2DrumPlanValidationMessage[])
    : [];

  return {
    inquiryLineId: args.inquiryLineId,
    drumPlanId: args.plan.id,
    drumPlanIdString: args.plan.planId,
    drumPlanVersionNo: args.plan.versionNo,
    cuttingLengthPlanId: args.plan.cuttingLengthPlanId,
    cuttingLengthPlanIdString: args.plan.cuttingLengthPlanIdString,
    configurationSnapshotId: args.plan.configurationSnapshotId,
    configurationSnapshotIdString: args.plan.configurationSnapshotIdString,
    cableMaterialNumber: args.cableMaterialNumber,
    selectionMethod: args.plan.selectionMethod as V2DrumPlanSelectionMethod,
    cableTolerancePercent: args.plan.cableTolerancePercent,
    totalPlannedLengthM: args.plan.totalPlannedLengthM,
    drumCount: args.plan.drumCount,
    remainderLengthM: args.plan.remainderLengthM,
    quantityReconciliationStatus: args.plan.quantityReconciliationStatus as QuantityReconciliationStatus | null,
    quantityReconciliationMessages: messages,
    validationStatus: args.plan.validationStatus as V2DrumPlanValidationStatus,
    lifecycleStatus: args.plan.lifecycleStatus as V2DrumPlanLifecycleStatus,
    lines: args.lines.map((l) => ({
      lineNo: l.lineNo,
      drumCode: l.drumCode,
      drumMasterId: l.drumMasterId,
      numberOfDrums: l.numberOfDrums,
      cuttingLengthM: l.cuttingLengthM,
      isRemainderDrum: l.isRemainderDrum,
      plannedCableLengthM: l.plannedCableLengthM,
      clearanceMm: l.clearanceMm,
      capacityM: l.capacityM,
      maxLoadKg: l.maxLoadKg,
      cableWeightKg: l.cableWeightKg,
      grossLoadedDrumWeightKg: l.grossLoadedDrumWeightKg,
      lengthUtilizationPercent: l.lengthUtilizationPercent,
      loadUtilizationPercent: l.loadUtilizationPercent,
    })),
    capturedAt:
      typeof args.plan.capturedAt === 'string'
        ? args.plan.capturedAt
        : args.plan.capturedAt.toISOString(),
  };
}

export function assertCanConfirmDrumPlan(plan: {
  lifecycleStatus: string;
  validationStatus: string;
}): void {
  if (plan.lifecycleStatus !== 'VALIDATED') {
    const err = new Error('Drum plan must be VALIDATED before confirmation.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  if (plan.validationStatus === 'ERROR') {
    const err = new Error('Drum plan has ERROR validation — cannot confirm.');
    (err as Error & { code: string }).code = 'VALIDATION_FAILED';
    throw err;
  }
}
