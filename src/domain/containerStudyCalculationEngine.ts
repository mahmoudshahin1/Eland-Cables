import { physicalDrumKey } from './physicalDrumIdentity';
import type {
  ContainerStudyCalculationInput,
  ContainerStudyCalculationOutput,
  DecisionTraceEntry,
  EngineAllocationResult,
  EngineContainerResult,
  EngineUnallocatedResult,
  FeasibilityRejection,
  ParsedAlgorithmConfig,
  PhysicalDrum,
  SnapshotContainerPin,
} from './containerStudyCalculationTypes';
import type { UnallocatedReasonCode } from './containerStudyValidation';
import { isEngineAlgorithmParameter } from './containerStudySnapshotPins';

/**
 * LEGACY_FIRST_FIT_V1 — SaaS deterministic Rolling first-fit engine.
 * This is NOT full Excel/VBA parity (no multi-tier width, virtual layer, Forklifting, or 6100 post-adjust).
 */

const PARITY_40_HQ = '40 HQ';
const PARITY_40_STD = '40 STD';
const PARITY_20_STD = '20 STD';
const PARITY_40_OT = '40 Open Top';

type WorkingContainer = {
  containerIndex: number;
  typeCode: string;
  parityLabel: string;
  versionId: string;
  usableLengthMm: number;
  internalWidthMm: number;
  payloadCapacityKg: number;
  remainingLengthMm: number;
  remainingWeightKg: number;
  maxWidthUsedMm: number;
  drums: PhysicalDrum[];
};

function failOutput(
  input: ContainerStudyCalculationInput,
  code: string,
  message: string,
  decisionTrace: DecisionTraceEntry[] = []
): ContainerStudyCalculationOutput {
  return {
    ok: false,
    algorithmVersionCode: input.algorithmVersionCode,
    configurationVersion: input.configurationVersion,
    containers: [],
    allocations: [],
    unallocated: [],
    summary: {
      expandedDrumCount: 0,
      containerCount: 0,
      allocatedCount: 0,
      unallocatedCount: 0,
      typeCounts: {},
    },
    warnings: [],
    errors: [{ code, message }],
    decisionTrace,
    containerMasterPinJson: input.containerPins,
    packingProfilePinJson: [],
  };
}

function parseConfig(input: ContainerStudyCalculationInput): ParsedAlgorithmConfig | null {
  const map = new Map<string, { numeric: number | null; status: string }>();
  for (const p of input.algorithmParameters) {
    if (!isEngineAlgorithmParameter(p.name)) continue;
    map.set(p.name, { numeric: p.numericValue, status: p.ruleStatus });
  }
  const required = [
    'FLANGE_HQ_MIN',
    'FLANGE_OPEN_TOP_MIN',
    'SECOND_LAYER_LENGTH_LT',
    'SECOND_LAYER_SHARE_MIN',
    'CONTAINER_SEARCH_LIMIT',
    'INPUT_ROW_LIMIT',
  ];
  for (const name of required) {
    const row = map.get(name);
    if (!row || row.status !== 'ENABLED' || row.numeric == null) {
      return null;
    }
  }
  const postAdjust = map.get('POST_ADJUST_REMAINING_LENGTH_GE');
  if (postAdjust?.status === 'ENABLED') {
    return null;
  }
  return {
    flangeHqMin: map.get('FLANGE_HQ_MIN')!.numeric!,
    flangeOpenTopMin: map.get('FLANGE_OPEN_TOP_MIN')!.numeric!,
    secondLayerLengthLt: map.get('SECOND_LAYER_LENGTH_LT')!.numeric!,
    secondLayerShareMin: map.get('SECOND_LAYER_SHARE_MIN')!.numeric!,
    containerSearchLimit: map.get('CONTAINER_SEARCH_LIMIT')!.numeric!,
    inputRowLimit: map.get('INPUT_ROW_LIMIT')!.numeric!,
  };
}

function expandDrums(input: ContainerStudyCalculationInput): PhysicalDrum[] {
  const expanded: PhysicalDrum[] = [];
  for (const line of input.drums) {
    for (let i = 0; i < line.quantity; i += 1) {
      expanded.push({
        physicalDrumKey: physicalDrumKey(line.sourceLineId, i),
        sourceLineId: line.sourceLineId,
        instanceIndex: i,
        packedLengthMm: line.packedLengthMm,
        packedWidthMm: line.packedWidthMm,
        grossWeightKg: line.grossWeightKg,
      });
    }
  }
  return expanded;
}

function sortDrums(drums: PhysicalDrum[]): PhysicalDrum[] {
  return [...drums].sort((a, b) => {
    if (b.packedLengthMm !== a.packedLengthMm) return b.packedLengthMm - a.packedLengthMm;
    if (b.packedWidthMm !== a.packedWidthMm) return b.packedWidthMm - a.packedWidthMm;
    if (a.sourceLineId !== b.sourceLineId) return a.sourceLineId < b.sourceLineId ? -1 : 1;
    return a.instanceIndex - b.instanceIndex;
  });
}

function classifyParityLabel(maxPackedLengthMm: number, config: ParsedAlgorithmConfig): string {
  if (maxPackedLengthMm >= config.flangeOpenTopMin) return PARITY_40_OT;
  if (maxPackedLengthMm >= config.flangeHqMin) return PARITY_40_HQ;
  return PARITY_40_STD;
}

function findPin(pins: SnapshotContainerPin[], parityLabel: string): SnapshotContainerPin | null {
  const exact = pins.find((p) => p.parityLabel === parityLabel);
  if (exact) return exact;
  const normalized = parityLabel.replace(/\s+/g, ' ').trim();
  return pins.find((p) => p.parityLabel.replace(/\s+/g, ' ').trim() === normalized) ?? null;
}

function validatePins(pins: SnapshotContainerPin[]): string | null {
  if (!pins.length) return 'NO_CONTAINER_TYPE';
  for (const pin of pins) {
    if (pin.dimensionsStatus !== 'APPROVED') {
      return `Container type ${pin.code} dimensions are pending approval.`;
    }
    if (
      pin.usableLengthMm == null ||
      pin.internalWidthMm == null ||
      pin.payloadCapacityKg == null ||
      !Number.isFinite(pin.usableLengthMm) ||
      !Number.isFinite(pin.internalWidthMm) ||
      !Number.isFinite(pin.payloadCapacityKg)
    ) {
      return `Container type ${pin.code} has incomplete dimensions in snapshot.`;
    }
  }
  return null;
}

function checkFeasibility(
  drum: PhysicalDrum,
  container: WorkingContainer
): FeasibilityRejection | null {
  if (drum.grossWeightKg > container.remainingWeightKg) {
    return {
      containerIndex: container.containerIndex,
      reasonCode: 'WEIGHT_LIMIT',
      detail: `Drum weight ${drum.grossWeightKg} exceeds remaining payload ${container.remainingWeightKg}.`,
    };
  }
  if (drum.packedLengthMm > container.remainingLengthMm) {
    return {
      containerIndex: container.containerIndex,
      reasonCode: 'DIMENSION_LIMIT',
      detail: `Drum length ${drum.packedLengthMm} exceeds remaining length ${container.remainingLengthMm}.`,
    };
  }
  if (drum.packedWidthMm > container.internalWidthMm) {
    return {
      containerIndex: container.containerIndex,
      reasonCode: 'DIMENSION_LIMIT',
      detail: `Drum width ${drum.packedWidthMm} exceeds container width ${container.internalWidthMm}.`,
    };
  }
  return null;
}

function openContainer(
  pins: SnapshotContainerPin[],
  parityLabel: string,
  containerIndex: number
): WorkingContainer | null {
  const pin = findPin(pins, parityLabel);
  if (!pin) return null;
  return {
    containerIndex,
    typeCode: pin.code,
    parityLabel: pin.parityLabel,
    versionId: pin.versionId,
    usableLengthMm: pin.usableLengthMm,
    internalWidthMm: pin.internalWidthMm,
    payloadCapacityKg: pin.payloadCapacityKg,
    remainingLengthMm: pin.usableLengthMm,
    remainingWeightKg: pin.payloadCapacityKg,
    maxWidthUsedMm: 0,
    drums: [],
  };
}

function drumFitsAnyCandidate(drum: PhysicalDrum, pins: SnapshotContainerPin[]): UnallocatedReasonCode | null {
  let anyLength = false;
  let anyWidth = false;
  let anyWeight = false;
  for (const pin of pins) {
    if (drum.packedLengthMm <= pin.usableLengthMm) anyLength = true;
    if (drum.packedWidthMm <= pin.internalWidthMm) anyWidth = true;
    if (drum.grossWeightKg <= pin.payloadCapacityKg) anyWeight = true;
  }
  if (!anyWeight) return 'WEIGHT_LIMIT';
  if (!anyLength) return 'DIMENSION_LIMIT';
  if (!anyWidth) return 'DIMENSION_LIMIT';
  return null;
}

function computeSecondLayerFlag(
  container: WorkingContainer,
  region: 'Europe' | 'Africa',
  stuffingMethod: string,
  config: ParsedAlgorithmConfig
): boolean {
  if (stuffingMethod !== 'Rolling' || region === 'Europe' || container.drums.length === 0) {
    return false;
  }
  const smallCount = container.drums.filter((d) => d.packedLengthMm < config.secondLayerLengthLt).length;
  const share = smallCount / container.drums.length;
  return share >= config.secondLayerShareMin;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function finalizeContainer(
  container: WorkingContainer,
  region: 'Europe' | 'Africa',
  stuffingMethod: string,
  config: ParsedAlgorithmConfig
): EngineContainerResult {
  const usedLength = container.usableLengthMm - container.remainingLengthMm;
  const usedWeight = container.payloadCapacityKg - container.remainingWeightKg;
  const maxWidth = container.maxWidthUsedMm;
  return {
    containerIndex: container.containerIndex,
    typeCode: container.typeCode,
    parityLabel: container.parityLabel,
    usableLengthMm: container.usableLengthMm,
    internalWidthMm: container.internalWidthMm,
    payloadCapacityKg: container.payloadCapacityKg,
    loadedWeightKg: usedWeight,
    remainingWeightKg: container.remainingWeightKg,
    remainingLengthMm: container.remainingLengthMm,
    remainingWidthMm: container.internalWidthMm - maxWidth,
    utilizationWeightPct: pct(usedWeight, container.payloadCapacityKg),
    utilizationLengthPct: pct(usedLength, container.usableLengthMm),
    utilizationWidthPct: maxWidth > 0 ? pct(maxWidth, container.internalWidthMm) : null,
    drumCountQ3: container.drums.length,
    secondLayerEnabled: computeSecondLayerFlag(container, region, stuffingMethod, config),
  };
}

/**
 * Pure Rolling first-fit engine. No I/O, clocks, randomness, or live master lookups.
 * V1 model: serial placement along container length; width checked against internal width.
 * 6100 post-adjust and virtual second-layer loading are NOT implemented.
 */
export function calculateContainerStudy(
  input: ContainerStudyCalculationInput
): ContainerStudyCalculationOutput {
  const decisionTrace: DecisionTraceEntry[] = [];
  let traceSeq = 0;
  const pushTrace = (entry: Omit<DecisionTraceEntry, 'sequence'>) => {
    traceSeq += 1;
    decisionTrace.push({ sequence: traceSeq, ...entry });
  };

  if (input.stuffingMethod === 'Forklifting') {
    return failOutput(
      input,
      'STUFFING_METHOD_NOT_IMPLEMENTED',
      'Forklifting placement engine is BLOCKED.',
      decisionTrace
    );
  }

  if (input.stuffingMethod !== 'Rolling') {
    return failOutput(input, 'STUFFING_METHOD_NOT_IMPLEMENTED', `Unsupported stuffing method: ${input.stuffingMethod}`);
  }

  if (input.algorithmVersionCode !== 'LEGACY_FIRST_FIT_V1') {
    return failOutput(
      input,
      'ALGORITHM_NOT_IMPLEMENTED',
      `Algorithm ${input.algorithmVersionCode} is not implemented.`
    );
  }

  const pinError = validatePins(input.containerPins);
  if (pinError === 'NO_CONTAINER_TYPE') {
    return failOutput(input, 'NO_CONTAINER_TYPE', 'No approved container type pins on snapshot.');
  }
  if (pinError) {
    return failOutput(input, 'CONFIGURATION_ERROR', pinError);
  }

  const config = parseConfig(input);
  if (!config) {
    return failOutput(
      input,
      'CONFIGURATION_ERROR',
      'Algorithm configuration parameters are incomplete or contain blocked rules.'
    );
  }

  if (input.drums.length === 0) {
    return failOutput(input, 'CONFIGURATION_ERROR', 'At least one drum input line is required.');
  }

  const logicalRows = input.drums.reduce((sum, d) => sum + d.quantity, 0);
  if (logicalRows > config.inputRowLimit) {
    return failOutput(
      input,
      'SEARCH_BOUND_REACHED',
      `Expanded drum count exceeds INPUT_ROW_LIMIT (${config.inputRowLimit}).`
    );
  }

  for (const line of input.drums) {
    if (
      !line.sourceLineId ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.packedLengthMm == null ||
      line.packedWidthMm == null ||
      line.grossWeightKg == null
    ) {
      return failOutput(input, 'CONFIGURATION_ERROR', 'Snapshot drum lines are incomplete.');
    }
  }

  const sorted = sortDrums(expandDrums(input));
  const working: WorkingContainer[] = [];
  const allocations: EngineAllocationResult[] = [];
  const unallocated: EngineUnallocatedResult[] = [];

  for (const drum of sorted) {
    pushTrace({ physicalDrumKey: drum.physicalDrumKey, action: 'consider' });

    let placed = false;
    for (const container of working) {
      const rejection = checkFeasibility(drum, container);
      if (rejection) {
        pushTrace({
          physicalDrumKey: drum.physicalDrumKey,
          action: 'reject',
          containerIndex: container.containerIndex,
          rejection,
        });
        continue;
      }
      container.drums.push(drum);
      container.remainingLengthMm -= drum.packedLengthMm;
      container.remainingWeightKg -= drum.grossWeightKg;
      container.maxWidthUsedMm = Math.max(container.maxWidthUsedMm, drum.packedWidthMm);
      const maxLen = container.drums.reduce((m, d) => Math.max(m, d.packedLengthMm), 0);
      const newLabel = classifyParityLabel(maxLen, config);
      if (newLabel !== container.parityLabel) {
        const pin = findPin(input.containerPins, newLabel);
        if (pin) {
          container.parityLabel = pin.parityLabel;
          container.typeCode = pin.code;
          container.versionId = pin.versionId;
          container.usableLengthMm = pin.usableLengthMm;
          container.internalWidthMm = pin.internalWidthMm;
          container.payloadCapacityKg = pin.payloadCapacityKg;
        }
      }
      allocations.push({
        physicalDrumKey: drum.physicalDrumKey,
        sourceLineId: drum.sourceLineId,
        instanceIndex: drum.instanceIndex,
        containerIndex: container.containerIndex,
        allocationKind: 'PHYSICAL',
        acceptReason: 'ROLLING_FIRST_FIT_FEASIBLE',
      });
      pushTrace({
        physicalDrumKey: drum.physicalDrumKey,
        action: 'accept',
        containerIndex: container.containerIndex,
        detail: 'Allocated to first feasible existing container.',
      });
      placed = true;
      break;
    }

    if (placed) continue;

    if (working.length >= config.containerSearchLimit) {
      const detail = `Container search limit (${config.containerSearchLimit}) reached.`;
      unallocated.push({
        physicalDrumKey: drum.physicalDrumKey,
        sourceLineId: drum.sourceLineId,
        instanceIndex: drum.instanceIndex,
        reasonCode: 'SEARCH_BOUND_REACHED',
        detail,
        traceRef: `trace:${input.snapshotId}:${drum.physicalDrumKey}`,
      });
      pushTrace({ physicalDrumKey: drum.physicalDrumKey, action: 'unallocated', detail });
      continue;
    }

    const parityLabel = classifyParityLabel(drum.packedLengthMm, config);
    const opened = openContainer(input.containerPins, parityLabel, working.length + 1);
    if (!opened) {
      const reason = drumFitsAnyCandidate(drum, input.containerPins) ?? 'NO_FEASIBLE_CONTAINER';
      unallocated.push({
        physicalDrumKey: drum.physicalDrumKey,
        sourceLineId: drum.sourceLineId,
        instanceIndex: drum.instanceIndex,
        reasonCode: reason,
        detail: `No container candidate for parity label ${parityLabel}.`,
        traceRef: `trace:${input.snapshotId}:${drum.physicalDrumKey}`,
      });
      pushTrace({ physicalDrumKey: drum.physicalDrumKey, action: 'unallocated', detail: 'No container candidate.' });
      continue;
    }

    const openRejection = checkFeasibility(drum, opened);
    if (openRejection) {
      const globalReason = drumFitsAnyCandidate(drum, input.containerPins) ?? openRejection.reasonCode;
      unallocated.push({
        physicalDrumKey: drum.physicalDrumKey,
        sourceLineId: drum.sourceLineId,
        instanceIndex: drum.instanceIndex,
        reasonCode: globalReason,
        detail: openRejection.detail,
        traceRef: `trace:${input.snapshotId}:${drum.physicalDrumKey}`,
      });
      pushTrace({
        physicalDrumKey: drum.physicalDrumKey,
        action: 'unallocated',
        rejection: openRejection,
      });
      continue;
    }

    opened.drums.push(drum);
    opened.remainingLengthMm -= drum.packedLengthMm;
    opened.remainingWeightKg -= drum.grossWeightKg;
    opened.maxWidthUsedMm = drum.packedWidthMm;
    working.push(opened);
    allocations.push({
      physicalDrumKey: drum.physicalDrumKey,
      sourceLineId: drum.sourceLineId,
      instanceIndex: drum.instanceIndex,
      containerIndex: opened.containerIndex,
      allocationKind: 'PHYSICAL',
      acceptReason: 'ROLLING_FIRST_FIT_NEW_CONTAINER',
    });
    pushTrace({
      physicalDrumKey: drum.physicalDrumKey,
      action: 'open_container',
      containerIndex: opened.containerIndex,
      detail: `Opened ${opened.parityLabel}.`,
    });
    pushTrace({
      physicalDrumKey: drum.physicalDrumKey,
      action: 'accept',
      containerIndex: opened.containerIndex,
      detail: 'Allocated to newly opened container.',
    });
  }

  const containers = working.map((c) =>
    finalizeContainer(c, input.region, input.stuffingMethod, config)
  );
  const typeCounts: Record<string, number> = {};
  for (const c of containers) {
    typeCounts[c.parityLabel] = (typeCounts[c.parityLabel] ?? 0) + 1;
  }

  const warnings: Array<{ code: string; message: string }> = [];
  for (const c of containers) {
    if (c.secondLayerEnabled) {
      warnings.push({
        code: 'SECOND_LAYER_FLAG_NOT_LOADED',
        message: `Container ${c.containerIndex}: second-layer flag set; virtual load is not implemented.`,
      });
    }
  }

  return {
    ok: true,
    algorithmVersionCode: input.algorithmVersionCode,
    configurationVersion: input.configurationVersion,
    containers,
    allocations,
    unallocated,
    summary: {
      expandedDrumCount: sorted.length,
      containerCount: containers.length,
      allocatedCount: allocations.length,
      unallocatedCount: unallocated.length,
      typeCounts,
    },
    warnings,
    errors: [],
    decisionTrace,
    containerMasterPinJson: input.containerPins,
    packingProfilePinJson: [],
  };
}

/** Test helper: confirms 6100 post-adjust is never applied. */
export function usesPostAdjust6100Rule(): false {
  return false;
}
