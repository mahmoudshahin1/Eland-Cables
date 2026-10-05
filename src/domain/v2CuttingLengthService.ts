import type { ResolvedCableStructure } from '../types';
import {
  getMaximumContinuousLength,
  getMinimumProductionLength,
} from '../services/cuttingLengthValidationService';
import {
  computeDirectedToleranceBounds,
  type CuttingLengthToleranceMode,
} from './cuttingLengthTolerance';

export type V2CuttingValidationStatus = 'VALID' | 'WARNING' | 'ERROR';

export interface V2CuttingLengthValidationMessage {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface V2CuttingLengthValidationInput {
  nominalLengthM: number;
  tolerancePercent: number;
  toleranceMode?: CuttingLengthToleranceMode;
  positiveTolerancePercent?: number;
  negativeTolerancePercent?: number;
  snapshot: {
    id: string;
    snapshotId: string;
    versionNo: number;
    flowState: string;
    catalogAuthoritative: boolean;
    cableMaterialNumber: string | null;
    estimatedDiameterMm: number | null;
    estimatedWeightKgKm: number | null;
    downstreamGates: unknown;
    selections: unknown;
  };
  lineCurrentSnapshotId: string | null;
}

export interface V2CuttingLengthValidationResult {
  nominalLengthM: number;
  tolerancePercent: number;
  toleranceMode: CuttingLengthToleranceMode;
  positiveTolerancePercent: number;
  negativeTolerancePercent: number;
  minLengthM: number;
  maxLengthM: number;
  validationStatus: V2CuttingValidationStatus;
  validationMessages: V2CuttingLengthValidationMessage[];
  drumHandoffReady: boolean;
}

export interface DrumSelectionHandoffDto {
  planId: string;
  planVersionNo: number;
  configurationSnapshotId: string;
  configurationSnapshotIdString: string;
  configurationSnapshotVersionNo: number;
  cableMaterialNumber: string | null;
  itemCode: string | null;
  customerCode: string | null;
  cuttingLengthMeters: number;
  cableTolerancePercent: number;
  toleranceMode: CuttingLengthToleranceMode;
  positiveTolerancePercent: number;
  negativeTolerancePercent: number;
  requestedDrumCount: number;
  cuttingLengthRequirementId: string | null;
  minLengthM: number;
  maxLengthM: number;
  cableDiameterMm: number | null;
  cableWeightKgKm: number | null;
  validationStatus: V2CuttingValidationStatus;
  validationMessages: V2CuttingLengthValidationMessage[];
  drumHandoffReady: boolean;
  notes: string | null;
  capturedAt: string;
}

export function computeToleranceBounds(
  nominalLengthM: number,
  tolerancePercent: number
): { minLengthM: number; maxLengthM: number } {
  const bounds = computeDirectedToleranceBounds({
    nominalLengthM,
    mode: 'SYMMETRIC',
    positivePercent: Math.max(0, tolerancePercent),
    negativePercent: Math.max(0, tolerancePercent),
  });
  return { minLengthM: bounds.minLengthM, maxLengthM: bounds.maxLengthM };
}

function downstreamGateOpen(downstreamGates: unknown, gate: string): boolean {
  if (!downstreamGates || typeof downstreamGates !== 'object' || Array.isArray(downstreamGates)) {
    return false;
  }
  return (downstreamGates as Record<string, unknown>)[gate] === true;
}

function adapterCableFromSnapshot(snapshot: V2CuttingLengthValidationInput['snapshot']): ResolvedCableStructure {
  const selections =
    snapshot.selections && typeof snapshot.selections === 'object' && !Array.isArray(snapshot.selections)
      ? (snapshot.selections as Record<string, unknown>)
      : {};
  const voltage = String(selections.voltage || '');
  const armour = String(selections.armour || 'No Armour');
  const weight = snapshot.estimatedWeightKgKm ?? 500;
  const diameter = snapshot.estimatedDiameterMm ?? 15;

  return {
    voltage,
    armour,
    cableDiameter: diameter,
    totalCableWeight: weight,
  } as ResolvedCableStructure;
}

export function validateV2CuttingLength(
  input: V2CuttingLengthValidationInput
): V2CuttingLengthValidationResult {
  const messages: V2CuttingLengthValidationMessage[] = [];
  const bounds = computeDirectedToleranceBounds({
    nominalLengthM: input.nominalLengthM,
    mode: input.toleranceMode ?? 'SYMMETRIC',
    positivePercent: input.positiveTolerancePercent ?? input.tolerancePercent,
    negativePercent: input.negativeTolerancePercent ?? input.tolerancePercent,
  });
  const tolerancePercent = Math.max(bounds.positivePercent, bounds.negativePercent);
  const { minLengthM, maxLengthM } = bounds;

  if (!Number.isFinite(input.nominalLengthM) || input.nominalLengthM <= 0) {
    messages.push({
      code: 'NOMINAL_LENGTH_INVALID',
      message: 'Nominal cutting length must be greater than zero.',
      severity: 'error',
    });
  }

  if (!input.lineCurrentSnapshotId) {
    messages.push({
      code: 'SNAPSHOT_REQUIRED',
      message: 'Configuration snapshot is required before saving a cutting plan.',
      severity: 'error',
    });
  } else if (input.snapshot.id !== input.lineCurrentSnapshotId) {
    messages.push({
      code: 'STALE_CONFIGURATION_SNAPSHOT',
      message: 'Cutting plan must reference the current configuration snapshot for this line.',
      severity: 'error',
    });
  }

  if (input.snapshot.flowState !== 'VALID') {
    messages.push({
      code: 'SNAPSHOT_NOT_VALID',
      message: `Configuration snapshot flow state must be VALID (current: ${input.snapshot.flowState}).`,
      severity: 'error',
    });
  }

  if (!input.snapshot.catalogAuthoritative) {
    messages.push({
      code: 'CATALOG_NOT_AUTHORITATIVE',
      message: 'Authoritative PostgreSQL cable catalog is required for cutting length persistence.',
      severity: 'error',
    });
  }

  if (!input.snapshot.cableMaterialNumber) {
    messages.push({
      code: 'CABLE_IDENTITY_MISSING',
      message: 'Configuration snapshot must resolve a cable material number.',
      severity: 'error',
    });
  }

  if (!downstreamGateOpen(input.snapshot.downstreamGates, 'cuttingLength')) {
    messages.push({
      code: 'DOWNSTREAM_GATE_BLOCKED',
      message: 'Configuration snapshot downstream gate for cutting length is not open.',
      severity: 'error',
    });
  }

  const cable = adapterCableFromSnapshot(input.snapshot);
  const minProduction = getMinimumProductionLength(cable);
  const maxContinuous = getMaximumContinuousLength(cable);

  if (input.nominalLengthM > 0 && input.nominalLengthM < minProduction) {
    messages.push({
      code: 'BELOW_MIN_PRODUCTION',
      message: `Nominal length ${input.nominalLengthM} m is below minimum production length ${minProduction} m.`,
      severity: 'warning',
    });
  }

  if (input.nominalLengthM > maxContinuous) {
    messages.push({
      code: 'EXCEEDS_MAX_CONTINUOUS',
      message: `Nominal length ${input.nominalLengthM} m exceeds maximum continuous run ${maxContinuous} m.`,
      severity: 'error',
    });
  }

  const hasError = messages.some((m) => m.severity === 'error');
  const hasWarning = messages.some((m) => m.severity === 'warning');
  const validationStatus: V2CuttingValidationStatus = hasError ? 'ERROR' : hasWarning ? 'WARNING' : 'VALID';
  const drumHandoffReady =
    !hasError &&
    input.snapshot.estimatedDiameterMm != null &&
    input.snapshot.estimatedDiameterMm > 0 &&
    input.snapshot.estimatedWeightKgKm != null &&
    input.snapshot.estimatedWeightKgKm > 0 &&
    input.nominalLengthM > 0;

  return {
    nominalLengthM: input.nominalLengthM,
    tolerancePercent,
    toleranceMode: bounds.mode,
    positiveTolerancePercent: bounds.positivePercent,
    negativeTolerancePercent: bounds.negativePercent,
    minLengthM,
    maxLengthM,
    validationStatus,
    validationMessages: messages,
    drumHandoffReady,
  };
}

export function buildDrumSelectionHandoff(input: {
  plan: {
    planId: string;
    versionNo: number;
    configurationSnapshotId: string;
    configurationSnapshotIdString: string;
    configurationSnapshotVersionNo: number;
    nominalLengthM: number;
    tolerancePercent: number;
    toleranceMode?: CuttingLengthToleranceMode;
    positiveTolerancePercent?: number;
    negativeTolerancePercent?: number;
    requestedDrumCount?: number;
    cuttingLengthRequirementId?: string | null;
    minLengthM: number;
    maxLengthM: number;
    validationStatus: string;
    validationMessages: unknown;
    notes: string | null;
    capturedAt: Date | string;
  };
  snapshot: {
    cableMaterialNumber: string | null;
    itemCode: string | null;
    customerCode: string | null;
    estimatedDiameterMm: number | null;
    estimatedWeightKgKm: number | null;
  };
  lineCurrentSnapshotId: string | null;
}): DrumSelectionHandoffDto {
  const validation = validateV2CuttingLength({
    nominalLengthM: input.plan.nominalLengthM,
    tolerancePercent: input.plan.tolerancePercent,
    toleranceMode: input.plan.toleranceMode,
    positiveTolerancePercent: input.plan.positiveTolerancePercent,
    negativeTolerancePercent: input.plan.negativeTolerancePercent,
    snapshot: {
      id: input.plan.configurationSnapshotId,
      snapshotId: input.plan.configurationSnapshotIdString,
      versionNo: input.plan.configurationSnapshotVersionNo,
      flowState: 'VALID',
      catalogAuthoritative: true,
      cableMaterialNumber: input.snapshot.cableMaterialNumber,
      estimatedDiameterMm: input.snapshot.estimatedDiameterMm,
      estimatedWeightKgKm: input.snapshot.estimatedWeightKgKm,
      downstreamGates: { cuttingLength: true },
      selections: {},
    },
    lineCurrentSnapshotId: input.lineCurrentSnapshotId,
  });

  const storedMessages = Array.isArray(input.plan.validationMessages)
    ? (input.plan.validationMessages as V2CuttingLengthValidationMessage[])
    : validation.validationMessages;

  const stale =
    input.lineCurrentSnapshotId != null &&
    input.plan.configurationSnapshotId !== input.lineCurrentSnapshotId;

  return {
    planId: input.plan.planId,
    planVersionNo: input.plan.versionNo,
    configurationSnapshotId: input.plan.configurationSnapshotId,
    configurationSnapshotIdString: input.plan.configurationSnapshotIdString,
    configurationSnapshotVersionNo: input.plan.configurationSnapshotVersionNo,
    cableMaterialNumber: input.snapshot.cableMaterialNumber,
    itemCode: input.snapshot.itemCode,
    customerCode: input.snapshot.customerCode,
    cuttingLengthMeters: input.plan.nominalLengthM,
    cableTolerancePercent: input.plan.tolerancePercent,
    toleranceMode: input.plan.toleranceMode ?? validation.toleranceMode,
    positiveTolerancePercent: input.plan.positiveTolerancePercent ?? validation.positiveTolerancePercent,
    negativeTolerancePercent: input.plan.negativeTolerancePercent ?? validation.negativeTolerancePercent,
    requestedDrumCount: Math.max(1, Math.floor(input.plan.requestedDrumCount ?? 1)),
    cuttingLengthRequirementId: input.plan.cuttingLengthRequirementId ?? null,
    minLengthM: input.plan.minLengthM,
    maxLengthM: input.plan.maxLengthM,
    cableDiameterMm: input.snapshot.estimatedDiameterMm,
    cableWeightKgKm: input.snapshot.estimatedWeightKgKm,
    validationStatus: stale ? 'ERROR' : (input.plan.validationStatus as V2CuttingValidationStatus),
    validationMessages: stale
      ? [
          {
            code: 'STALE_CONFIGURATION_SNAPSHOT',
            message: 'Cutting plan references a superseded configuration snapshot.',
            severity: 'error',
          },
          ...storedMessages,
        ]
      : storedMessages,
    drumHandoffReady: stale ? false : input.plan.validationStatus !== 'ERROR' && validation.drumHandoffReady,
    notes: input.plan.notes,
    capturedAt:
      typeof input.plan.capturedAt === 'string'
        ? input.plan.capturedAt
        : input.plan.capturedAt.toISOString(),
  };
}

export function assertReadyForCommercialCuttingPlans(
  lines: Array<{
    id: string;
    lineNumber: number;
    v2CurrentCuttingPlanId: string | null;
    v2CurrentSnapshotId: string | null;
    cuttingRequirements?: Array<{
      sequenceNo: number;
      currentCuttingPlanId: string | null;
    }>;
  }>,
  plansById: Map<string, { validationStatus: string; configurationSnapshotId: string }>
): void {
  for (const line of lines) {
    const requirements = line.cuttingRequirements ?? [];
    const planIds =
      requirements.length > 0
        ? requirements.map((r) => r.currentCuttingPlanId)
        : [line.v2CurrentCuttingPlanId];
    if (planIds.some((id) => !id)) {
      const err = new Error(
        `Cutting plan required for line ${line.lineNumber}${
          requirements.length > 0 ? ' cutting-length requirement(s)' : ''
        } before READY_FOR_COMMERCIAL.`
      );
      (err as Error & { code: string }).code = 'CUTTING_PLAN_REQUIRED';
      throw err;
    }

    for (const planId of planIds) {
      const plan = plansById.get(planId!);
      if (!plan) {
        const err = new Error(`Cutting plan ${planId} not found for line ${line.lineNumber}.`);
        (err as Error & { code: string }).code = 'CUTTING_PLAN_REQUIRED';
        throw err;
      }
      if (plan.validationStatus === 'ERROR') {
        const err = new Error(
          `Line ${line.lineNumber} cutting plan has ERROR validation — resolve before READY_FOR_COMMERCIAL.`
        );
        (err as Error & { code: string }).code = 'VALIDATION_FAILED';
        throw err;
      }
      if (line.v2CurrentSnapshotId && plan.configurationSnapshotId !== line.v2CurrentSnapshotId) {
        const err = new Error(
          `Line ${line.lineNumber} cutting plan references a stale configuration snapshot. Re-save cutting length.`
        );
        (err as Error & { code: string }).code = 'STALE_CONFIGURATION_SNAPSHOT';
        throw err;
      }
    }
  }
}
