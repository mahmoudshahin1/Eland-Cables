/**
 * Drum optimization service — manual validation + automatic ranking / plan build.
 * Uses the single native capacity calculator. No React-side engineering.
 */

import {
  calculateDrumCapacity,
  cableWeightOnDrumKg,
  grossLoadedDrumWeightKg,
  lengthUtilizationPercent,
  loadUtilizationPercent,
  type CableEngineeringInput,
  type DrumCapacityResult,
  type DrumGeometryInput,
} from './drumCapacityCalculator';
import {
  computeCuttingLengthToleranceBand,
  cuttingLengthRequirementsFromSchedule,
  positiveScheduleNumber,
  summarizeUnsuitableReasons,
  type DrumScheduleLengthInput,
} from './drumOptimizationPresentation';

export {
  applyAutomaticPlanToCuttingRequirements,
  computeCuttingLengthToleranceBand,
  cuttingLengthRequirementsFromSchedule,
  distinctPositiveCuttingLengths,
  expandPhysicalDrumRequirements,
  formatSuitableDrumOptionLabel,
  patchDrumScheduleRow,
  planCoversCuttingLengthRequirements,
  resolveAutomaticDrumRequirement,
  resolveAutomaticDrumRequirements,
  resolveManualCandidateListUiState,
  resolveManualFocusRow,
  summarizeUnsuitableReasons,
  totalCableLengthFromDrumSchedule,
} from './drumOptimizationPresentation';
export type {
  AutomaticDrumRequirement,
  CuttingLengthToleranceBand,
  DrumScheduleLengthInput,
  ManualCandidateFetchFailureKind,
  ManualCandidateListUiKind,
  ManualCandidateListUiState,
} from './drumOptimizationPresentation';

export type DrumPlanValidationStatus = 'VALID' | 'NOT_SUITABLE' | 'INCOMPLETE';

/** Candidate technical evaluation — never merge incomplete with unsuitable. */
export type DrumCandidateEvaluationStatus =
  | 'SUITABLE'
  | 'UNSUITABLE'
  | 'INCOMPLETE_ENGINEERING_DATA';

/** Automatic optimization terminal outcome (when not a successful recommendation). */
export type AutomaticOptimizeOutcome =
  | 'RECOMMENDED'
  | 'NO_SUITABLE_WITH_INCOMPLETE_CANDIDATES'
  | 'NO_SUITABLE'
  | 'INVALID_INPUT'
  | 'PARTIAL_ALLOCATION_FAILED';

const INCOMPLETE_CAPACITY_STATUSES = new Set([
  'MISSING_CLEARANCE',
  'MISSING_MAX_LOAD',
  'MISSING_CABLE_DATA',
  'INVALID_DIMENSIONS',
]);

export interface AuthoritativeDrumPlanLine {
  drumId: string;
  drumCode: string;
  numberOfDrums: number;
  cuttingLengthM: number;
  /** Nominal cutting length per drum — not an average. */
  nominalCuttingLengthM: number;
  cableTolerancePercent: number;
  drumTolerancePercent: number;
  minimumAllowedLengthM: number;
  maximumAllowedLengthM: number;
  maximumUsableLengthM: number | null;
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent: number | null;
  cableWeightKg: number | null;
  emptyDrumNetWeightKg: number | null;
  grossLoadedDrumWeightKg: number | null;
  validationStatus: DrumPlanValidationStatus;
  validationReasons: string[];
  /** Internal / Technical Office detail (same engine). */
  engineering?: {
    windingsPerLayer: number | null;
    layers: number | null;
    geometricalCapacityMeters: number | null;
    loadLimitedCapacityMeters: number | null;
    clearanceUsedMm: number | null;
    outputDiameterMm: number | null;
    capacityStatus: string;
  };
}

export interface AuthoritativeDrumPlan {
  /** @deprecated Prefer selectionMethod — kept for compatibility. */
  method: 'MANUAL' | 'AUTOMATIC';
  /** Authoritative selection path: MANUAL | AUTOMATIC. */
  selectionMethod: 'MANUAL' | 'AUTOMATIC';
  cableTolerancePercent: number;
  totalLengthM: number;
  lines: AuthoritativeDrumPlanLine[];
  isValid: boolean;
  blockingReasons: string[];
  rankingNotes: string[];
  /** Present on automatic plans; distinguishes incomplete master data vs fully-rejected. */
  outcome?: AutomaticOptimizeOutcome;
}

/**
 * Technical Office master-data gap report for drum engineering completeness.
 * Capacity (Excel) is intentionally NOT counted as MaxLoad.
 */
export interface DrumMasterEngineeringGapReport {
  rootCause: 'MASTER_DATA_COMPLETENESS' | 'NONE';
  activeDrumCount: number;
  populated: {
    flange: number;
    barrel: number;
    innerWidth: number;
    clearanceMm: number;
    maxLoadKg: number;
    emptyDrumNetWeightKg: number;
    capacity: number;
  };
  missing: {
    clearanceMm: number;
    maxLoadKg: number;
    emptyDrumNetWeightKg: number;
  };
  /**
   * Capacity remains the source/reference column (UOM CONFIGURATION_REQUIRED).
   * TO-approved (2026-09-01): Capacity → MaxLoad (maxWeight) for the native engine.
   */
  capacityMapsToMaxLoadPerToRule: true;
  capacityUomNote: 'CONFIGURATION_REQUIRED';
  requiredForCableDiameterMm: {
    clearanceRequired: boolean;
    maxLoadRequired: true;
    emptyWeightRequiredForSuitability: false;
  };
  minimumMasterDataUpdate: string[];
  importTemplateColumns: string[];
}

export function buildDrumMasterEngineeringGapReport(args: {
  drums: DrumMasterForOptimization[];
  cableDiameterMm: number;
}): DrumMasterEngineeringGapReport {
  const active = args.drums.filter((d) => (d.status || 'ACTIVE') === 'ACTIVE');
  const clearanceRequired = Number.isFinite(args.cableDiameterMm) && args.cableDiameterMm <= 50;
  const populated = {
    flange: active.filter((d) => Number.isFinite(d.flange) && d.flange > 0).length,
    barrel: active.filter((d) => Number.isFinite(d.barrel) && d.barrel > 0).length,
    innerWidth: active.filter((d) => Number.isFinite(d.innerWidth) && d.innerWidth > 0).length,
    clearanceMm: active.filter((d) => d.clearanceMm != null && Number.isFinite(d.clearanceMm)).length,
    maxLoadKg: active.filter((d) => d.maxWeight != null && Number.isFinite(d.maxWeight) && d.maxWeight > 0)
      .length,
    emptyDrumNetWeightKg: active.filter(
      (d) => d.emptyDrumNetWeightKg != null && Number.isFinite(d.emptyDrumNetWeightKg)
    ).length,
    capacity: active.filter((d) => d.capacity != null && Number.isFinite(d.capacity) && d.capacity > 0)
      .length,
  };
  const missing = {
    clearanceMm: active.length - populated.clearanceMm,
    maxLoadKg: active.length - populated.maxLoadKg,
    emptyDrumNetWeightKg: active.length - populated.emptyDrumNetWeightKg,
  };
  const needsClearance = clearanceRequired && missing.clearanceMm > 0;
  const needsMaxLoad = missing.maxLoadKg > 0;
  const rootCause: DrumMasterEngineeringGapReport['rootCause'] =
    needsClearance || needsMaxLoad ? 'MASTER_DATA_COMPLETENESS' : 'NONE';
  const minimumMasterDataUpdate: string[] = [];
  if (needsMaxLoad) {
    minimumMasterDataUpdate.push(
      `Populate Max Load Kg on ${missing.maxLoadKg} ACTIVE drum(s). TO rule: set MaxLoad from Capacity when Capacity is valid (>0).`
    );
  }
  if (needsClearance) {
    minimumMasterDataUpdate.push(
      `Populate Clearance Mm on ${missing.clearanceMm} ACTIVE drum(s) (TO default 50 mm for Ø ≤ 50).`
    );
  }
  if (missing.emptyDrumNetWeightKg > 0) {
    minimumMasterDataUpdate.push(
      `Optional: populate Empty Drum Net Weight Kg on ${missing.emptyDrumNetWeightKg} drum(s) for logistics/gross weight only (not suitability).`
    );
  }
  return {
    rootCause,
    activeDrumCount: active.length,
    populated,
    missing,
    capacityMapsToMaxLoadPerToRule: true,
    capacityUomNote: 'CONFIGURATION_REQUIRED',
    requiredForCableDiameterMm: {
      clearanceRequired,
      maxLoadRequired: true,
      emptyWeightRequiredForSuitability: false,
    },
    minimumMasterDataUpdate,
    importTemplateColumns: [
      'Drum Code',
      'Flange',
      'Barrel',
      'Inner Width',
      'Outer Width',
      'Capacity',
      'Clearance Mm',
      'Max Load Kg',
      'Empty Drum Net Weight Kg',
      'Description',
    ],
  };
}

export interface DrumMasterForOptimization {
  id: string;
  drumCode: string;
  drumType?: string | null;
  description?: string | null;
  flange: number;
  barrel: number;
  innerWidth: number;
  outerWidth?: number;
  /** Excel Capacity — source/reference; TO maps valid Capacity → MaxLoad (maxWeight). */
  capacity?: number | null;
  clearanceMm?: number | null;
  /** MaxLoad = permitted cable payload kg (DrumMaster.maxWeight). */
  maxWeight?: number | null;
  emptyDrumNetWeightKg?: number | null;
  status?: string;
}

export function toDrumGeometry(drum: DrumMasterForOptimization): DrumGeometryInput {
  return {
    drumCode: drum.drumCode,
    flange: drum.flange,
    barrel: drum.barrel,
    innerWidth: drum.innerWidth,
    clearanceMm: drum.clearanceMm ?? null,
    maxLoadKg: drum.maxWeight ?? null,
    emptyDrumNetWeightKg: drum.emptyDrumNetWeightKg ?? null,
  };
}

export interface DrumUnavailabilityDiagnostic {
  drumCode: string;
  evaluationStatus: DrumCandidateEvaluationStatus;
  missingFields: string[];
  geometry: {
    flange: number;
    barrel: number;
    innerWidth: number;
    clearanceMm: number | null;
    clearanceRequired: boolean;
    clearanceUsedMm: number | null;
  };
  load: {
    maxLoadKg: number | null;
    emptyDrumNetWeightKg: number | null;
    permittedCablePayloadKg: number | null;
  };
  usableLengthM: number | null;
  requiredMaximumLengthM: number;
  capacityStatus: string;
  decision: string;
  rejectionReasons: string[];
  warnings: string[];
}

export interface EvaluatedDrumCandidate {
  drum: DrumMasterForOptimization;
  capacity: DrumCapacityResult;
  /** @deprecated Prefer evaluationStatus === 'SUITABLE'. */
  suitableForCutting: boolean;
  evaluationStatus: DrumCandidateEvaluationStatus;
  missingFields: string[];
  rejectionReasons: string[];
  warnings: string[];
  decision: string;
  diagnostic: DrumUnavailabilityDiagnostic;
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent: number | null;
  cableWeightKg: number | null;
  grossLoadedDrumWeightKg: number | null;
  /** Alias of rejectionReasons for older callers. */
  reasons: string[];
  /** Lower is better for ranking among suitable drums. */
  rankScore: number;
}

function collectMissingEngineeringFields(
  drum: DrumMasterForOptimization,
  cableDiameterMm: number,
  capacityStatus: string
): string[] {
  const missing: string[] = [];
  if (
    ![drum.flange, drum.barrel, drum.innerWidth].every((n) => Number.isFinite(n) && n > 0) ||
    drum.flange <= drum.barrel ||
    capacityStatus === 'INVALID_DIMENSIONS'
  ) {
    missing.push('flange/barrel/innerWidth');
  }
  if (cableDiameterMm <= 50 && (drum.clearanceMm == null || !Number.isFinite(drum.clearanceMm))) {
    missing.push('clearanceMm');
  }
  if (drum.maxWeight == null || !Number.isFinite(drum.maxWeight) || drum.maxWeight <= 0) {
    missing.push('maxWeight (MaxLoad)');
  }
  return missing;
}

function decisionForStatus(
  status: DrumCandidateEvaluationStatus,
  capacityStatus: string,
  usable: number | null,
  requiredMax: number
): string {
  if (status === 'SUITABLE') {
    return `SUITABLE — usable ${usable} m covers required maximum ${requiredMax} m.`;
  }
  if (status === 'INCOMPLETE_ENGINEERING_DATA') {
    return `INCOMPLETE_ENGINEERING_DATA — capacity status ${capacityStatus}; cannot fully evaluate technical suitability.`;
  }
  if (capacityStatus === 'OK' && usable != null) {
    return `UNSUITABLE — usable ${usable} m is below required maximum ${requiredMax} m.`;
  }
  return `UNSUITABLE — capacity status ${capacityStatus}.`;
}

/** Admin/dev diagnostic: why a drum is unavailable for this cutting request. */
export function explainDrumUnavailability(candidate: EvaluatedDrumCandidate): DrumUnavailabilityDiagnostic {
  return candidate.diagnostic;
}

function buildPlanLine(args: {
  drum: DrumMasterForOptimization;
  capacity: DrumCapacityResult;
  numberOfDrums: number;
  cuttingLengthM: number;
  cableTolerancePercent: number;
  drumTolerancePercent: number;
  includeEngineering: boolean;
}): AuthoritativeDrumPlanLine {
  const band = computeCuttingLengthToleranceBand(args.cuttingLengthM, args.cableTolerancePercent);
  const usable = args.capacity.maximumUsableLengthMeters;
  const weightPerM = args.capacity.cableWeightPerMeter;
  const cableWeightKg =
    weightPerM != null ? cableWeightOnDrumKg(args.cuttingLengthM, weightPerM) : null;
  const empty = args.capacity.emptyDrumNetWeightKg;
  const gross =
    cableWeightKg != null ? grossLoadedDrumWeightKg(cableWeightKg, empty) : null;
  const lengthUtil =
    usable != null ? lengthUtilizationPercent(args.cuttingLengthM, usable) : null;
  const loadUtil =
    cableWeightKg != null && args.capacity.permittedCablePayloadKg != null
      ? loadUtilizationPercent(cableWeightKg, args.capacity.permittedCablePayloadKg)
      : null;

  const reasons = [...args.capacity.reasons];
  let validationStatus: DrumPlanValidationStatus = 'VALID';

  if (INCOMPLETE_CAPACITY_STATUSES.has(args.capacity.status)) {
    validationStatus = 'INCOMPLETE';
  } else if (args.capacity.status !== 'OK' || usable == null) {
    validationStatus = 'NOT_SUITABLE';
  } else if (usable < band.maximumAllowedLengthM) {
    validationStatus = 'NOT_SUITABLE';
    reasons.push(
      `Maximum usable length is ${usable} m, while the required maximum length is ${band.maximumAllowedLengthM} m.`
    );
  }

  return {
    drumId: args.drum.id,
    drumCode: args.drum.drumCode,
    numberOfDrums: args.numberOfDrums,
    cuttingLengthM: args.cuttingLengthM,
    nominalCuttingLengthM: band.nominalCuttingLengthM,
    cableTolerancePercent: band.cableTolerancePercent,
    drumTolerancePercent: Math.max(0, args.drumTolerancePercent),
    minimumAllowedLengthM: band.minimumAllowedLengthM,
    maximumAllowedLengthM: band.maximumAllowedLengthM,
    maximumUsableLengthM: usable,
    lengthUtilizationPercent: lengthUtil,
    loadUtilizationPercent: loadUtil,
    cableWeightKg,
    emptyDrumNetWeightKg: empty,
    grossLoadedDrumWeightKg: gross,
    validationStatus,
    validationReasons: reasons,
    engineering: args.includeEngineering
      ? {
          windingsPerLayer: args.capacity.windingsPerLayer,
          layers: args.capacity.layers,
          geometricalCapacityMeters: args.capacity.geometricalCapacityMeters,
          loadLimitedCapacityMeters: args.capacity.loadLimitedCapacityMeters,
          clearanceUsedMm: args.capacity.clearanceUsedMm,
          outputDiameterMm: args.capacity.outputDiameterMm,
          capacityStatus: args.capacity.status,
        }
      : undefined,
  };
}

/**
 * Ranking among suitable drums (documented, deterministic):
 * 1. Suitable only (caller filters)
 * 2. Length fit — reject over-100% length util first
 * 3. Reasonable length utilization (closer to 100% without exceeding)
 * 4. Reasonable load utilization (closer to 100% without exceeding)
 * 5. Smaller drum size (flange)
 * 6. Lower empty drum weight when known (null sorts last)
 */
export function rankScoreForSuitableDrum(candidate: {
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent?: number | null;
  drum: { flange: number; emptyDrumNetWeightKg?: number | null };
}): number {
  const lengthUtil = candidate.lengthUtilizationPercent ?? 0;
  const loadUtil = candidate.loadUtilizationPercent ?? 0;
  const lengthOver = lengthUtil > 100 ? (lengthUtil - 100) * 1000 : 0;
  const lengthUnder = lengthUtil <= 100 ? 100 - lengthUtil : 0;
  const loadOver = loadUtil > 100 ? (loadUtil - 100) * 1000 : 0;
  const loadUnder = loadUtil <= 100 ? 100 - loadUtil : 0;
  const flange = candidate.drum.flange || 0;
  const empty =
    candidate.drum.emptyDrumNetWeightKg != null && Number.isFinite(candidate.drum.emptyDrumNetWeightKg)
      ? candidate.drum.emptyDrumNetWeightKg
      : 1_000_000;
  return (
    lengthOver * 1_000_000_000 +
    loadOver * 10_000_000 +
    lengthUnder * 100_000 +
    loadUnder * 1_000 +
    flange +
    empty / 100_000
  );
}

export function evaluateDrumForCutting(args: {
  drum: DrumMasterForOptimization;
  cable: CableEngineeringInput;
  cuttingLengthM: number;
  cableTolerancePercent: number;
  minLengthM?: number;
  maxLengthM?: number;
}): EvaluatedDrumCandidate {
  const capacity = calculateDrumCapacity(toDrumGeometry(args.drum), args.cable);
  const band = computeCuttingLengthToleranceBand(args.cuttingLengthM, args.cableTolerancePercent, {
    minLengthM: args.minLengthM,
    maxLengthM: args.maxLengthM,
  });
  const reasons = [...capacity.reasons];
  const warnings = [...(capacity.warnings || [])];
  let evaluationStatus: DrumCandidateEvaluationStatus = 'UNSUITABLE';
  const weightPerM = capacity.cableWeightPerMeter;
  const cableWeightKg =
    weightPerM != null ? cableWeightOnDrumKg(args.cuttingLengthM, weightPerM) : null;
  const gross =
    cableWeightKg != null
      ? grossLoadedDrumWeightKg(cableWeightKg, capacity.emptyDrumNetWeightKg)
      : null;
  const lengthUtil =
    capacity.maximumUsableLengthMeters != null
      ? lengthUtilizationPercent(args.cuttingLengthM, capacity.maximumUsableLengthMeters)
      : null;
  const loadUtil =
    cableWeightKg != null && capacity.permittedCablePayloadKg != null
      ? loadUtilizationPercent(cableWeightKg, capacity.permittedCablePayloadKg)
      : null;

  if (INCOMPLETE_CAPACITY_STATUSES.has(capacity.status)) {
    evaluationStatus = 'INCOMPLETE_ENGINEERING_DATA';
  } else if (capacity.status === 'OK' && capacity.maximumUsableLengthMeters != null) {
    if (capacity.maximumUsableLengthMeters >= band.maximumAllowedLengthM) {
      evaluationStatus = 'SUITABLE';
    } else {
      evaluationStatus = 'UNSUITABLE';
      reasons.push(
        `Maximum usable length is ${capacity.maximumUsableLengthMeters} m, while the required maximum length is ${band.maximumAllowedLengthM} m.`
      );
    }
  } else {
    evaluationStatus = 'UNSUITABLE';
  }

  // Empty drum weight is logistics-only — never flips SUITABLE → reject.
  const missingFields =
    evaluationStatus === 'INCOMPLETE_ENGINEERING_DATA'
      ? collectMissingEngineeringFields(args.drum, args.cable.cableDiameterMm, capacity.status)
      : [];

  const decision = decisionForStatus(
    evaluationStatus,
    capacity.status,
    capacity.maximumUsableLengthMeters,
    band.maximumAllowedLengthM
  );

  const diagnostic: DrumUnavailabilityDiagnostic = {
    drumCode: args.drum.drumCode,
    evaluationStatus,
    missingFields,
    geometry: {
      flange: args.drum.flange,
      barrel: args.drum.barrel,
      innerWidth: args.drum.innerWidth,
      clearanceMm: args.drum.clearanceMm ?? null,
      clearanceRequired: args.cable.cableDiameterMm <= 50,
      clearanceUsedMm: capacity.clearanceUsedMm,
    },
    load: {
      maxLoadKg: args.drum.maxWeight ?? null,
      emptyDrumNetWeightKg: capacity.emptyDrumNetWeightKg,
      permittedCablePayloadKg: capacity.permittedCablePayloadKg,
    },
    usableLengthM: capacity.maximumUsableLengthMeters,
    requiredMaximumLengthM: band.maximumAllowedLengthM,
    capacityStatus: capacity.status,
    decision,
    rejectionReasons: reasons,
    warnings,
  };

  const candidate: EvaluatedDrumCandidate = {
    drum: args.drum,
    capacity,
    suitableForCutting: evaluationStatus === 'SUITABLE',
    evaluationStatus,
    missingFields,
    rejectionReasons: reasons,
    warnings,
    decision,
    diagnostic,
    lengthUtilizationPercent: lengthUtil,
    loadUtilizationPercent: loadUtil,
    cableWeightKg,
    grossLoadedDrumWeightKg: gross,
    reasons,
    rankScore: 0,
  };
  candidate.rankScore =
    evaluationStatus === 'SUITABLE'
      ? rankScoreForSuitableDrum({
          lengthUtilizationPercent: candidate.lengthUtilizationPercent,
          loadUtilizationPercent: candidate.loadUtilizationPercent,
          drum: candidate.drum,
        })
      : Number.POSITIVE_INFINITY;
  return candidate;
}

export function listDrumCandidates(args: {
  drums: DrumMasterForOptimization[];
  cable: CableEngineeringInput;
  cuttingLengthM: number;
  cableTolerancePercent: number;
  minLengthM?: number;
  maxLengthM?: number;
}): {
  suitable: EvaluatedDrumCandidate[];
  incomplete: EvaluatedDrumCandidate[];
  unsuitable: EvaluatedDrumCandidate[];
} {
  const active = args.drums.filter((d) => (d.status || 'ACTIVE') === 'ACTIVE');
  const evaluated = active.map((drum) =>
    evaluateDrumForCutting({
      drum,
      cable: args.cable,
      cuttingLengthM: args.cuttingLengthM,
      cableTolerancePercent: args.cableTolerancePercent,
      minLengthM: args.minLengthM,
      maxLengthM: args.maxLengthM,
    })
  );
  const suitable = evaluated
    .filter((c) => c.evaluationStatus === 'SUITABLE')
    .sort((a, b) => a.rankScore - b.rankScore || a.drum.drumCode.localeCompare(b.drum.drumCode));
  const incomplete = evaluated
    .filter((c) => c.evaluationStatus === 'INCOMPLETE_ENGINEERING_DATA')
    .sort((a, b) => a.drum.drumCode.localeCompare(b.drum.drumCode));
  const unsuitable = evaluated
    .filter((c) => c.evaluationStatus === 'UNSUITABLE')
    .sort((a, b) => a.drum.drumCode.localeCompare(b.drum.drumCode));
  return { suitable, incomplete, unsuitable };
}

/** Manual: validate one or more customer-chosen schedule rows into an authoritative plan. */
export function validateManualDrumPlan(args: {
  drums: DrumMasterForOptimization[];
  cable: CableEngineeringInput;
  cableTolerancePercent: number;
  rows: Array<{
    drumCode: string;
    numberOfDrums: number;
    cuttingLengthM: number;
    drumTolerancePercent: number;
  }>;
  includeEngineering?: boolean;
}): AuthoritativeDrumPlan {
  const includeEngineering = args.includeEngineering !== false;
  const byCode = new Map(args.drums.map((d) => [d.drumCode.toUpperCase(), d]));
  const lines: AuthoritativeDrumPlanLine[] = [];
  const blockingReasons: string[] = [];

  for (const row of args.rows) {
    const drum = byCode.get(row.drumCode.trim().toUpperCase());
    if (!drum) {
      lines.push({
        drumId: '',
        drumCode: row.drumCode,
        numberOfDrums: row.numberOfDrums,
        cuttingLengthM: row.cuttingLengthM,
        nominalCuttingLengthM: row.cuttingLengthM,
        cableTolerancePercent: args.cableTolerancePercent,
        drumTolerancePercent: row.drumTolerancePercent,
        minimumAllowedLengthM: 0,
        maximumAllowedLengthM: 0,
        maximumUsableLengthM: null,
        lengthUtilizationPercent: null,
        loadUtilizationPercent: null,
        cableWeightKg: null,
        emptyDrumNetWeightKg: null,
        grossLoadedDrumWeightKg: null,
        validationStatus: 'NOT_SUITABLE',
        validationReasons: [`Drum code ${row.drumCode} is not in Drum Master.`],
      });
      blockingReasons.push(`Drum code ${row.drumCode} is not in Drum Master.`);
      continue;
    }
    const capacity = calculateDrumCapacity(toDrumGeometry(drum), args.cable);
    const line = buildPlanLine({
      drum,
      capacity,
      numberOfDrums: row.numberOfDrums,
      cuttingLengthM: row.cuttingLengthM,
      cableTolerancePercent: args.cableTolerancePercent,
      drumTolerancePercent: row.drumTolerancePercent,
      includeEngineering,
    });
    lines.push(line);
    if (line.validationStatus !== 'VALID') {
      blockingReasons.push(...line.validationReasons);
    }
  }

  const totalLengthM = lines.reduce((acc, l) => acc + l.numberOfDrums * l.cuttingLengthM, 0);
  return {
    method: 'MANUAL',
    selectionMethod: 'MANUAL',
    cableTolerancePercent: args.cableTolerancePercent,
    totalLengthM,
    lines,
    isValid: lines.length > 0 && lines.every((l) => l.validationStatus === 'VALID'),
    blockingReasons,
    rankingNotes: [],
  };
}

/**
 * Max nominal cutting length that still satisfies usable >= maximumAllowedLength.
 * Uses the same rounded band as computeCuttingLengthToleranceBand.
 */
export function maxNominalCuttingForUsableLength(
  maximumUsableLengthM: number,
  cableTolerancePercent: number
): number {
  if (!Number.isFinite(maximumUsableLengthM) || maximumUsableLengthM <= 0) return 0;
  const tol = Math.max(0, cableTolerancePercent) / 100;
  if (tol === 0) return Math.floor(maximumUsableLengthM);
  // maximumAllowed = round(C * (1+tol)) <= usable
  let lo = 0;
  let hi = Math.floor(maximumUsableLengthM);
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const band = computeCuttingLengthToleranceBand(mid, cableTolerancePercent);
    if (band.maximumAllowedLengthM <= maximumUsableLengthM) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function listDrumCandidatesByCuttingLengths(args: {
  drums: DrumMasterForOptimization[];
  cable: CableEngineeringInput;
  cuttingLengthsM: number[];
  cableTolerancePercent: number;
  minLengthM?: number;
  maxLengthM?: number;
}): Record<number, ReturnType<typeof listDrumCandidates>> {
  const out: Record<number, ReturnType<typeof listDrumCandidates>> = {};
  for (const cuttingLengthM of args.cuttingLengthsM) {
    if (!(cuttingLengthM > 0) || out[cuttingLengthM]) continue;
    out[cuttingLengthM] = listDrumCandidates({
      drums: args.drums,
      cable: args.cable,
      cuttingLengthM,
      cableTolerancePercent: args.cableTolerancePercent,
      minLengthM: args.minLengthM,
      maxLengthM: args.maxLengthM,
    });
  }
  return out;
}

/**
 * Automatic optimization: recommend a drum plan covering totalOrderLengthM.
 * Ranking notes document the deterministic algorithm.
 */
export function optimizeDrumPlan(args: {
  drums: DrumMasterForOptimization[];
  cable: CableEngineeringInput;
  /** Per-drum cutting length for type selection. Never pass length × requestedDrumCount. */
  totalOrderLengthM: number;
  cableTolerancePercent: number;
  drumTolerancePercent?: number;
  includeEngineering?: boolean;
  /** Physical drum count after type selection. Does not change drum type. */
  requestedDrumCount?: number;
  minLengthM?: number;
  maxLengthM?: number;
}): AuthoritativeDrumPlan {
  const includeEngineering = args.includeEngineering !== false;
  const drumTol = args.drumTolerancePercent ?? 0;
  const rankingNotes = [
    'Ranking (deterministic): suitable only → length fit (≤100% length util) → reasonable length utilization → reasonable load utilization → smaller flange → lower empty drum weight when known (nulls last).',
    'Multi-cut: cover remaining length greedily using the best-ranked drum that can accept the largest feasible cutting length for the remainder.',
  ];

  if (!Number.isFinite(args.totalOrderLengthM) || args.totalOrderLengthM <= 0) {
    return {
      method: 'AUTOMATIC',
      selectionMethod: 'AUTOMATIC',
      cableTolerancePercent: args.cableTolerancePercent,
      totalLengthM: 0,
      lines: [],
      isValid: false,
      blockingReasons: ['Total order length must be greater than zero.'],
      rankingNotes,
      outcome: 'INVALID_INPUT',
    };
  }

  const active = args.drums.filter((d) => (d.status || 'ACTIVE') === 'ACTIVE');
  const lines: AuthoritativeDrumPlanLine[] = [];
  let remaining = args.totalOrderLengthM;
  const safety = active.length * 20 + 50;
  let steps = 0;

  while (remaining > 0 && steps < safety) {
    steps += 1;
    const { suitable } = listDrumCandidates({
      drums: active,
      cable: args.cable,
      cuttingLengthM: remaining,
      cableTolerancePercent: args.cableTolerancePercent,
      minLengthM: args.minLengthM,
      maxLengthM: args.maxLengthM,
    });

    if (suitable.length > 0) {
      const best = suitable[0];
      const line = buildPlanLine({
        drum: best.drum,
        capacity: best.capacity,
        numberOfDrums: 1,
        cuttingLengthM: remaining,
        cableTolerancePercent: args.cableTolerancePercent,
        drumTolerancePercent: drumTol,
        includeEngineering,
      });
      lines.push(line);
      remaining = 0;
      break;
    }

    // Split: pick drum with largest feasible nominal cutting for its usable length, then best rank.
    type SplitOption = {
      drum: DrumMasterForOptimization;
      capacity: DrumCapacityResult;
      cutting: number;
      rankScore: number;
    };
    const options: SplitOption[] = [];
    for (const drum of active) {
      const capacity = calculateDrumCapacity(toDrumGeometry(drum), args.cable);
      if (capacity.status !== 'OK' || capacity.maximumUsableLengthMeters == null) continue;
      const maxCut = maxNominalCuttingForUsableLength(
        capacity.maximumUsableLengthMeters,
        args.cableTolerancePercent
      );
      const cutting = Math.min(remaining, maxCut);
      if (cutting <= 0) continue;
      const lengthUtil = lengthUtilizationPercent(cutting, capacity.maximumUsableLengthMeters);
      const weightPerM = capacity.cableWeightPerMeter;
      const cableKg =
        weightPerM != null ? cableWeightOnDrumKg(cutting, weightPerM) : null;
      const loadUtil =
        cableKg != null && capacity.permittedCablePayloadKg != null
          ? loadUtilizationPercent(cableKg, capacity.permittedCablePayloadKg)
          : null;
      options.push({
        drum,
        capacity,
        cutting,
        rankScore: rankScoreForSuitableDrum({
          lengthUtilizationPercent: lengthUtil,
          loadUtilizationPercent: loadUtil,
          drum,
        }),
      });
    }

    if (options.length === 0) {
      const classified = listDrumCandidates({
        drums: active,
        cable: args.cable,
        cuttingLengthM: remaining,
        cableTolerancePercent: args.cableTolerancePercent,
        minLengthM: args.minLengthM,
        maxLengthM: args.maxLengthM,
      });
      const hasIncomplete = classified.incomplete.length > 0;
      const outcome: AutomaticOptimizeOutcome = hasIncomplete
        ? 'NO_SUITABLE_WITH_INCOMPLETE_CANDIDATES'
        : 'NO_SUITABLE';
      const missingSummary = summarizeUnsuitableReasons(classified.incomplete)
        .slice(0, 3)
        .map((r) => r.reason)
        .join('; ');
      return {
        method: 'AUTOMATIC',
        selectionMethod: 'AUTOMATIC',
        cableTolerancePercent: args.cableTolerancePercent,
        totalLengthM: lines.reduce((a, l) => a + l.numberOfDrums * l.cuttingLengthM, 0),
        lines,
        isValid: false,
        blockingReasons: [
          hasIncomplete
            ? `No suitable drums available. ${classified.incomplete.length} drum(s) have incomplete engineering data${
                missingSummary ? ` (${missingSummary})` : ''
              }. Configure Drum Master clearance (when Ø≤50) and MaxLoad, then retry.`
            : 'No suitable drums available. All drums were fully evaluated and rejected for capacity or geometry.',
        ],
        rankingNotes,
        outcome,
      };
    }

    options.sort(
      (a, b) =>
        b.cutting - a.cutting ||
        a.rankScore - b.rankScore ||
        a.drum.drumCode.localeCompare(b.drum.drumCode)
    );
    const pick = options[0];
    const count = Math.max(1, Math.floor(remaining / pick.cutting));
    const line = buildPlanLine({
      drum: pick.drum,
      capacity: pick.capacity,
      numberOfDrums: count,
      cuttingLengthM: pick.cutting,
      cableTolerancePercent: args.cableTolerancePercent,
      drumTolerancePercent: drumTol,
      includeEngineering,
    });
    lines.push(line);
    remaining -= count * pick.cutting;
  }

  if (remaining > 0) {
    return {
      method: 'AUTOMATIC',
      selectionMethod: 'AUTOMATIC',
      cableTolerancePercent: args.cableTolerancePercent,
      totalLengthM: lines.reduce((a, l) => a + l.numberOfDrums * l.cuttingLengthM, 0),
      lines,
      isValid: false,
      blockingReasons: [`Unable to allocate remaining ${remaining} m to drums.`],
      rankingNotes,
      outcome: 'PARTIAL_ALLOCATION_FAILED',
    };
  }

  // Merge adjacent identical drum+cutting lines
  const merged: AuthoritativeDrumPlanLine[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.drumCode === line.drumCode &&
      prev.cuttingLengthM === line.cuttingLengthM &&
      prev.validationStatus === line.validationStatus
    ) {
      prev.numberOfDrums += line.numberOfDrums;
    } else {
      merged.push({ ...line });
    }
  }

  const requestedDrumCount = Math.max(1, Math.floor(args.requestedDrumCount ?? 1));
  if (requestedDrumCount > 1) {
    for (const line of merged) {
      line.numberOfDrums *= requestedDrumCount;
    }
  }

  const totalLengthM = merged.reduce((a, l) => a + l.numberOfDrums * l.cuttingLengthM, 0);
  const isValid = merged.length > 0 && merged.every((l) => l.validationStatus === 'VALID');
  return {
    method: 'AUTOMATIC',
    selectionMethod: 'AUTOMATIC',
    cableTolerancePercent: args.cableTolerancePercent,
    totalLengthM,
    lines: merged,
    isValid,
    blockingReasons: isValid
      ? []
      : merged.flatMap((l) => l.validationReasons),
    rankingNotes,
    outcome: isValid ? 'RECOMMENDED' : 'NO_SUITABLE',
  };
}

function mergeAdjacentPlanLines(lines: AuthoritativeDrumPlanLine[]): AuthoritativeDrumPlanLine[] {
  const merged: AuthoritativeDrumPlanLine[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.drumCode === line.drumCode &&
      prev.cuttingLengthM === line.cuttingLengthM &&
      prev.validationStatus === line.validationStatus
    ) {
      prev.numberOfDrums += line.numberOfDrums;
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

export function mergeAutomaticDrumPlans(plans: AuthoritativeDrumPlan[]): AuthoritativeDrumPlan {
  if (plans.length === 1) return plans[0];
  const lines = mergeAdjacentPlanLines(plans.flatMap((plan) => plan.lines.map((line) => ({ ...line }))));
  const isValid = plans.length > 0 && plans.every((plan) => plan.isValid);
  const totalLengthM = lines.reduce((acc, line) => acc + line.numberOfDrums * line.cuttingLengthM, 0);
  const failed = plans.find((plan) => !plan.isValid);
  return {
    method: 'AUTOMATIC',
    selectionMethod: 'AUTOMATIC',
    cableTolerancePercent: plans[0]?.cableTolerancePercent ?? 0,
    totalLengthM,
    lines,
    isValid,
    blockingReasons: isValid ? [] : plans.flatMap((plan) => plan.blockingReasons),
    rankingNotes: plans.flatMap((plan) => plan.rankingNotes),
    outcome: isValid ? 'RECOMMENDED' : failed?.outcome || 'NO_SUITABLE',
  };
}

/**
 * Automatic optimization for a multi-line cutting schedule.
 * Each original cutting-length requirement is evaluated independently at its
 * per-drum length. Different requirements are never dropped, merged, or summed
 * before suitability. Cutting lengths are never split/replaced.
 */
export function optimizeDrumPlanForSchedule(args: {
  drums: DrumMasterForOptimization[];
  cable: CableEngineeringInput;
  cableTolerancePercent: number;
  drumTolerancePercent?: number;
  includeEngineering?: boolean;
  minLengthM?: number;
  maxLengthM?: number;
  rows?: DrumScheduleLengthInput[];
  requirements?: Array<{
    perDrumCuttingLengthM?: number;
    totalOrderLengthM?: number;
    requestedDrumCount?: number;
  }>;
}): AuthoritativeDrumPlan {
  const includeEngineering = args.includeEngineering !== false;
  const drumTol = args.drumTolerancePercent ?? 0;
  const requirements = args.rows?.length
    ? cuttingLengthRequirementsFromSchedule(args.rows)
    : (args.requirements || [])
        .map((req, sourceIndex) => ({
          sourceIndex,
          cuttingLengthM: positiveScheduleNumber(req.perDrumCuttingLengthM ?? req.totalOrderLengthM),
          requestedDrumCount: Math.max(1, Math.floor(positiveScheduleNumber(req.requestedDrumCount) || 1)),
        }))
        .filter((req) => req.cuttingLengthM > 0);

  if (!requirements.length) {
    return {
      method: 'AUTOMATIC',
      selectionMethod: 'AUTOMATIC',
      cableTolerancePercent: args.cableTolerancePercent,
      totalLengthM: 0,
      lines: [],
      isValid: false,
      blockingReasons: ['Enter cutting length and number of drums before automatic optimization.'],
      rankingNotes: [],
      outcome: 'INVALID_INPUT',
    };
  }

  const lines: AuthoritativeDrumPlanLine[] = [];
  const rankingNotes: string[] = [];
  for (const requirement of requirements) {
    rankingNotes.push(
      `Requirement ${requirement.sourceIndex + 1}: ${requirement.requestedDrumCount} × ${requirement.cuttingLengthM} m`
    );
    const physicalLines: AuthoritativeDrumPlanLine[] = [];
    for (let physical = 0; physical < requirement.requestedDrumCount; physical += 1) {
      const classified = listDrumCandidates({
        drums: args.drums,
        cable: args.cable,
        cuttingLengthM: requirement.cuttingLengthM,
        cableTolerancePercent: args.cableTolerancePercent,
        minLengthM: args.minLengthM,
        maxLengthM: args.maxLengthM,
      });
      const best = classified.suitable[0] || classified.incomplete[0] || classified.unsuitable[0];
      if (!best) {
        physicalLines.push({
          drumId: '',
          drumCode: '',
          numberOfDrums: 1,
          cuttingLengthM: requirement.cuttingLengthM,
          nominalCuttingLengthM: requirement.cuttingLengthM,
          cableTolerancePercent: args.cableTolerancePercent,
          drumTolerancePercent: drumTol,
          minimumAllowedLengthM: 0,
          maximumAllowedLengthM: 0,
          maximumUsableLengthM: null,
          lengthUtilizationPercent: null,
          loadUtilizationPercent: null,
          cableWeightKg: null,
          emptyDrumNetWeightKg: null,
          grossLoadedDrumWeightKg: null,
          validationStatus: 'NOT_SUITABLE',
          validationReasons: [`No drum master rows available for ${requirement.cuttingLengthM} m.`],
        });
        continue;
      }
      physicalLines.push(
        buildPlanLine({
          drum: best.drum,
          capacity: best.capacity,
          numberOfDrums: 1,
          cuttingLengthM: requirement.cuttingLengthM,
          cableTolerancePercent: args.cableTolerancePercent,
          drumTolerancePercent: drumTol,
          includeEngineering,
        })
      );
    }
    // Collapse identical physical results back onto the original requirement.
    // Do not merge different cutting lengths or drop later requirements.
    if (physicalLines.length) {
      const first = { ...physicalLines[0], numberOfDrums: physicalLines.length };
      lines.push(first);
    }
  }

  const totalLengthM = lines.reduce((acc, line) => acc + line.numberOfDrums * line.cuttingLengthM, 0);
  const isValid = lines.length > 0 && lines.every((line) => line.validationStatus === 'VALID');
  const hasIncomplete = lines.some((line) => line.validationStatus === 'INCOMPLETE');
  return {
    method: 'AUTOMATIC',
    selectionMethod: 'AUTOMATIC',
    cableTolerancePercent: args.cableTolerancePercent,
    totalLengthM,
    lines,
    isValid,
    blockingReasons: isValid ? [] : lines.flatMap((line) => line.validationReasons),
    rankingNotes,
    outcome: isValid
      ? 'RECOMMENDED'
      : hasIncomplete
        ? 'NO_SUITABLE_WITH_INCOMPLETE_CANDIDATES'
        : 'NO_SUITABLE',
  };
}
