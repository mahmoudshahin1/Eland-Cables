import type { ContainerStudyCalculationInput } from './containerStudyCalculationTypes';
import { issue } from '../platform/errors/domainError';
import { isEngineAlgorithmParameter } from './containerStudySnapshotPins';

type RawPin = {
  versionId?: string;
  code?: string;
  parityLabel?: string;
  usableLengthMm?: number | null;
  internalWidthMm?: number | null;
  payloadCapacityKg?: number | null;
  dimensionsStatus?: 'PENDING_APPROVAL' | 'APPROVED';
};

type RawParameter = {
  name: string;
  value: string;
  numericValue?: number | null;
  ruleStatus?: 'ENABLED' | 'DISABLED' | 'BLOCKED';
};

type RawDrum = {
  sourceLineId: string;
  quantity: number;
  packedLengthMm?: number | null;
  packedWidthMm?: number | null;
  grossWeightKg?: number | null;
};

export type SnapshotForCalculation = {
  snapshotId: string;
  stuffingMethod: 'Rolling' | 'Forklifting';
  region: 'Europe' | 'Africa';
  algorithmVersionCode: string;
  configurationVersion: string;
  containerMasterPinJson: unknown;
  algorithmParameterPinJson: unknown;
  packingProfilePinJson: unknown;
  drums: RawDrum[];
  containerPins: Array<{
    containerTypeVersionId: string;
    code: string;
    parityLabel: string;
    usableLengthMm?: unknown;
    internalWidthMm?: unknown;
    payloadCapacityKg?: unknown;
    dimensionsStatus: 'PENDING_APPROVAL' | 'APPROVED';
  }>;
};

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function requirePositive(value: unknown, field: string, code: 'INVALID_DIMENSION' | 'INVALID_WEIGHT'): number {
  const n = toNum(value);
  if (n == null || n <= 0) {
    throw issue('VALIDATION_FAILED', `${field} must be a finite number > 0.`, {
      issues: [{ code, field, message: `${field} must be a finite number > 0.` }],
    });
  }
  return n;
}

export function mapSnapshotToCalculationInput(snapshot: SnapshotForCalculation): ContainerStudyCalculationInput {
  const jsonPins = Array.isArray(snapshot.containerMasterPinJson)
    ? (snapshot.containerMasterPinJson as RawPin[])
    : [];
  const rowPins = snapshot.containerPins.map((p) => ({
    versionId: p.containerTypeVersionId,
    code: p.code,
    parityLabel: p.parityLabel,
    usableLengthMm: toNum(p.usableLengthMm),
    internalWidthMm: toNum(p.internalWidthMm),
    payloadCapacityKg: toNum(p.payloadCapacityKg),
    dimensionsStatus: p.dimensionsStatus,
  }));
  const sourcePins = rowPins.length
    ? rowPins
    : jsonPins.map((p) => ({
        versionId: String(p.versionId ?? ''),
        code: String(p.code ?? ''),
        parityLabel: String(p.parityLabel ?? ''),
        usableLengthMm: toNum(p.usableLengthMm),
        internalWidthMm: toNum(p.internalWidthMm),
        payloadCapacityKg: toNum(p.payloadCapacityKg),
        dimensionsStatus: (p.dimensionsStatus ?? 'PENDING_APPROVAL') as 'PENDING_APPROVAL' | 'APPROVED',
      }));
  const pins = sourcePins.map((p) => ({
    versionId: p.versionId,
    code: p.code,
    parityLabel: p.parityLabel,
    usableLengthMm: requirePositive(p.usableLengthMm, 'usableLengthMm', 'INVALID_DIMENSION'),
    internalWidthMm: requirePositive(p.internalWidthMm, 'internalWidthMm', 'INVALID_DIMENSION'),
    payloadCapacityKg: requirePositive(p.payloadCapacityKg, 'payloadCapacityKg', 'INVALID_WEIGHT'),
    dimensionsStatus: p.dimensionsStatus,
  }));

  const params = Array.isArray(snapshot.algorithmParameterPinJson)
    ? (snapshot.algorithmParameterPinJson as RawParameter[])
    : [];

  const drums = snapshot.drums.map((d) => ({
    sourceLineId: d.sourceLineId,
    quantity: d.quantity,
    packedLengthMm: requirePositive(d.packedLengthMm, 'packedLengthMm', 'INVALID_DIMENSION'),
    packedWidthMm: requirePositive(d.packedWidthMm, 'packedWidthMm', 'INVALID_DIMENSION'),
    grossWeightKg: requirePositive(d.grossWeightKg, 'grossWeightKg', 'INVALID_WEIGHT'),
  }));

  return {
    snapshotId: snapshot.snapshotId,
    stuffingMethod: snapshot.stuffingMethod,
    region: snapshot.region,
    algorithmVersionCode: snapshot.algorithmVersionCode,
    configurationVersion: snapshot.configurationVersion,
    drums,
    containerPins: pins,
    algorithmParameters: params
      .filter((p) => isEngineAlgorithmParameter(p.name))
      .map((p) => ({
        name: p.name,
        value: p.value,
        numericValue: toNum(p.numericValue),
        ruleStatus: (p.ruleStatus ?? 'ENABLED') as 'ENABLED' | 'DISABLED' | 'BLOCKED',
      })),
  };
}
