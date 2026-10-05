import type { UnallocatedReasonCode } from './containerStudyValidation';

export type SnapshotDrumLine = {
  sourceLineId: string;
  quantity: number;
  packedLengthMm: number;
  packedWidthMm: number;
  grossWeightKg: number;
};

export type SnapshotContainerPin = {
  versionId: string;
  code: string;
  parityLabel: string;
  usableLengthMm: number;
  internalWidthMm: number;
  payloadCapacityKg: number;
  dimensionsStatus: 'PENDING_APPROVAL' | 'APPROVED';
};

export type SnapshotAlgorithmParameter = {
  name: string;
  value: string;
  numericValue: number | null;
  ruleStatus: 'ENABLED' | 'DISABLED' | 'BLOCKED';
};

export type ContainerStudyCalculationInput = {
  snapshotId: string;
  stuffingMethod: 'Rolling' | 'Forklifting';
  region: 'Europe' | 'Africa';
  algorithmVersionCode: string;
  configurationVersion: string;
  drums: SnapshotDrumLine[];
  containerPins: SnapshotContainerPin[];
  algorithmParameters: SnapshotAlgorithmParameter[];
};

export type PhysicalDrum = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
  packedLengthMm: number;
  packedWidthMm: number;
  grossWeightKg: number;
};

export type FeasibilityRejection = {
  containerIndex: number;
  reasonCode: UnallocatedReasonCode;
  detail: string;
};

export type DecisionTraceEntry = {
  sequence: number;
  physicalDrumKey: string;
  action: 'consider' | 'reject' | 'accept' | 'open_container' | 'unallocated';
  containerIndex?: number;
  rejection?: FeasibilityRejection;
  detail?: string;
};

export type EngineContainerResult = {
  containerIndex: number;
  typeCode: string;
  parityLabel: string;
  usableLengthMm: number;
  internalWidthMm: number;
  payloadCapacityKg: number;
  loadedWeightKg: number;
  remainingWeightKg: number;
  remainingLengthMm: number;
  remainingWidthMm: number;
  utilizationWeightPct: number;
  utilizationLengthPct: number;
  utilizationWidthPct: number | null;
  drumCountQ3: number;
  secondLayerEnabled: boolean;
};

export type EngineAllocationResult = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
  containerIndex: number;
  allocationKind: 'PHYSICAL';
  acceptReason: string;
};

export type EngineUnallocatedResult = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
  reasonCode: UnallocatedReasonCode;
  detail: string;
  traceRef: string;
};

export type ContainerStudyCalculationSummary = {
  expandedDrumCount: number;
  containerCount: number;
  allocatedCount: number;
  unallocatedCount: number;
  typeCounts: Record<string, number>;
};

export type ContainerStudyCalculationOutput = {
  ok: boolean;
  algorithmVersionCode: string;
  configurationVersion: string;
  containers: EngineContainerResult[];
  allocations: EngineAllocationResult[];
  unallocated: EngineUnallocatedResult[];
  summary: ContainerStudyCalculationSummary;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
  decisionTrace: DecisionTraceEntry[];
  containerMasterPinJson: unknown;
  packingProfilePinJson: unknown;
};

export type ParsedAlgorithmConfig = {
  flangeHqMin: number;
  flangeOpenTopMin: number;
  secondLayerLengthLt: number;
  secondLayerShareMin: number;
  containerSearchLimit: number;
  inputRowLimit: number;
};
