/**
 * Native Energya Technical Office drum capacity calculator.
 * Authoritative engineering math for STEP 6 drum selection / optimization.
 * Does not invent MaxLoad, clearance, or empty-drum weights — callers pass configured values or null.
 */

export interface DrumGeometryInput {
  drumCode: string;
  flange: number;
  barrel: number;
  innerWidth: number;
  /** Flange clearance (mm). Required when cableDiameterMm <= 50. */
  clearanceMm?: number | null;
  /**
   * MaxLoad = permitted cable payload (kg), mapped from DrumMaster.maxWeight.
   * Empty drum weight must NOT be included in this value.
   */
  maxLoadKg?: number | null;
  emptyDrumNetWeightKg?: number | null;
}

export interface CableEngineeringInput {
  /** Outside diameter (mm). Also used as winding/output diameter until a distinct field exists. */
  cableDiameterMm: number;
  /** Optional distinct winding diameter; defaults to cableDiameterMm. */
  outputDiameterMm?: number | null;
  /** Cable mass intensity (kg/km) — existing Energya weight model. */
  approxWeightKgKm: number;
}

export type DrumCapacityStatus =
  | 'OK'
  | 'UNSUITABLE_GEOMETRY'
  | 'MISSING_CLEARANCE'
  | 'MISSING_MAX_LOAD'
  | 'MISSING_CABLE_DATA'
  | 'INVALID_DIMENSIONS';

export interface DrumCapacityResult {
  status: DrumCapacityStatus;
  reasons: string[];
  /** Non-blocking notes (e.g. missing empty drum weight for logistics). */
  warnings: string[];
  windingsPerLayer: number | null;
  layers: number | null;
  geometricalCapacityMeters: number | null;
  loadLimitedCapacityMeters: number | null;
  maximumUsableLengthMeters: number | null;
  permittedCablePayloadKg: number | null;
  cableWeightPerMeter: number | null;
  emptyDrumNetWeightKg: number | null;
  clearanceUsedMm: number | null;
  outputDiameterMm: number | null;
  windingAllowanceFactor: number;
}

const EMPTY_DRUM_WEIGHT_WARNING = 'Empty drum weight not configured';

function baseCapacityFields(partial: {
  status: DrumCapacityStatus;
  reasons: string[];
  warnings?: string[];
  windingsPerLayer?: number | null;
  layers?: number | null;
  geometricalCapacityMeters?: number | null;
  loadLimitedCapacityMeters?: number | null;
  maximumUsableLengthMeters?: number | null;
  permittedCablePayloadKg?: number | null;
  cableWeightPerMeter: number | null;
  emptyDrumNetWeightKg: number | null;
  clearanceUsedMm: number | null;
  outputDiameterMm: number | null;
  windingAllowanceFactor: number;
}): DrumCapacityResult {
  return {
    status: partial.status,
    reasons: partial.reasons,
    warnings: partial.warnings ?? [],
    windingsPerLayer: partial.windingsPerLayer ?? null,
    layers: partial.layers ?? null,
    geometricalCapacityMeters: partial.geometricalCapacityMeters ?? null,
    loadLimitedCapacityMeters: partial.loadLimitedCapacityMeters ?? null,
    maximumUsableLengthMeters: partial.maximumUsableLengthMeters ?? null,
    permittedCablePayloadKg: partial.permittedCablePayloadKg ?? null,
    cableWeightPerMeter: partial.cableWeightPerMeter,
    emptyDrumNetWeightKg: partial.emptyDrumNetWeightKg,
    clearanceUsedMm: partial.clearanceUsedMm,
    outputDiameterMm: partial.outputDiameterMm,
    windingAllowanceFactor: partial.windingAllowanceFactor,
  };
}

export const WINDING_ALLOWANCE_FACTOR = 1.03;

/** Floor toward zero to the nearest 10 meters (Technical Office rule — not normal round). */
export function floorToNearest10(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / 10) * 10;
}

export function cableWeightPerMeterFromKgKm(approxWeightKgKm: number): number | null {
  if (!Number.isFinite(approxWeightKgKm) || approxWeightKgKm <= 0) return null;
  return approxWeightKgKm / 1000;
}

/**
 * Compute geometrical + load-limited capacity for one drum / cable pair.
 * Capacity = floorToNearest10(min(geo, loadLimited)).
 */
export function calculateDrumCapacity(
  drum: DrumGeometryInput,
  cable: CableEngineeringInput
): DrumCapacityResult {
  const reasons: string[] = [];
  const windingAllowanceFactor = WINDING_ALLOWANCE_FACTOR;
  const emptyDrumNetWeightKg =
    drum.emptyDrumNetWeightKg != null && Number.isFinite(drum.emptyDrumNetWeightKg)
      ? drum.emptyDrumNetWeightKg
      : null;

  const cableDiameterMm = cable.cableDiameterMm;
  const outputDiameterMm =
    cable.outputDiameterMm != null && Number.isFinite(cable.outputDiameterMm) && cable.outputDiameterMm > 0
      ? cable.outputDiameterMm
      : cableDiameterMm;
  const weightPerM = cableWeightPerMeterFromKgKm(cable.approxWeightKgKm);

  if (!Number.isFinite(cableDiameterMm) || cableDiameterMm <= 0 || !weightPerM) {
    return baseCapacityFields({
      status: 'MISSING_CABLE_DATA',
      reasons: ['Cable diameter and weight (kg/km) are required for drum capacity calculation.'],
      cableWeightPerMeter: weightPerM,
      emptyDrumNetWeightKg,
      clearanceUsedMm: null,
      outputDiameterMm: Number.isFinite(outputDiameterMm) ? outputDiameterMm : null,
      windingAllowanceFactor,
    });
  }

  const { flange, barrel, innerWidth } = drum;
  if (
    ![flange, barrel, innerWidth, outputDiameterMm].every((n) => Number.isFinite(n) && n > 0) ||
    flange <= barrel
  ) {
    return baseCapacityFields({
      status: 'INVALID_DIMENSIONS',
      reasons: [
        `Drum ${drum.drumCode} has invalid flange/barrel/inner width for capacity calculation.`,
      ],
      cableWeightPerMeter: weightPerM,
      emptyDrumNetWeightKg,
      clearanceUsedMm: null,
      outputDiameterMm,
      windingAllowanceFactor,
    });
  }

  let clearanceUsedMm: number | null = null;
  if (cableDiameterMm > 50) {
    clearanceUsedMm = cableDiameterMm;
  } else {
    if (drum.clearanceMm == null || !Number.isFinite(drum.clearanceMm) || drum.clearanceMm < 0) {
      return baseCapacityFields({
        status: 'MISSING_CLEARANCE',
        reasons: ['Missing drum clearance for cable diameter ≤50 mm.'],
        cableWeightPerMeter: weightPerM,
        emptyDrumNetWeightKg,
        clearanceUsedMm: null,
        outputDiameterMm,
        windingAllowanceFactor,
      });
    }
    clearanceUsedMm = drum.clearanceMm;
  }

  const maxLoadKg =
    drum.maxLoadKg != null && Number.isFinite(drum.maxLoadKg) && drum.maxLoadKg > 0
      ? drum.maxLoadKg
      : null;
  if (maxLoadKg == null) {
    return baseCapacityFields({
      status: 'MISSING_MAX_LOAD',
      reasons: ['Missing drum MaxLoad.'],
      cableWeightPerMeter: weightPerM,
      emptyDrumNetWeightKg,
      clearanceUsedMm,
      outputDiameterMm,
      windingAllowanceFactor,
    });
  }

  const windingsPerLayer = Math.floor(innerWidth / (outputDiameterMm * windingAllowanceFactor));
  const layers = Math.floor(
    (flange - barrel - 2 * clearanceUsedMm) / (2 * outputDiameterMm)
  );

  if (windingsPerLayer <= 0 || layers <= 0) {
    reasons.push(
      windingsPerLayer <= 0
        ? `Insufficient windings per layer (${windingsPerLayer}) for cable diameter ${cableDiameterMm} mm on ${drum.drumCode}.`
        : `Insufficient usable layers (${layers}) for cable diameter ${cableDiameterMm} mm on ${drum.drumCode}.`
    );
    return baseCapacityFields({
      status: 'UNSUITABLE_GEOMETRY',
      reasons,
      windingsPerLayer,
      layers,
      permittedCablePayloadKg: maxLoadKg,
      cableWeightPerMeter: weightPerM,
      emptyDrumNetWeightKg,
      clearanceUsedMm,
      outputDiameterMm,
      windingAllowanceFactor,
    });
  }

  const geometricalCapacityMeters =
    (windingsPerLayer * Math.PI * layers * (barrel + layers * outputDiameterMm)) / 1000;
  const loadLimitedCapacityMeters = maxLoadKg / weightPerM;
  const maximumUsableLengthMeters = floorToNearest10(
    Math.min(geometricalCapacityMeters, loadLimitedCapacityMeters)
  );

  const warnings: string[] = [];
  if (emptyDrumNetWeightKg == null) {
    warnings.push(EMPTY_DRUM_WEIGHT_WARNING);
  }

  return baseCapacityFields({
    status: 'OK',
    reasons: [],
    warnings,
    windingsPerLayer,
    layers,
    geometricalCapacityMeters,
    loadLimitedCapacityMeters,
    maximumUsableLengthMeters,
    permittedCablePayloadKg: maxLoadKg,
    cableWeightPerMeter: weightPerM,
    emptyDrumNetWeightKg,
    clearanceUsedMm,
    outputDiameterMm,
    windingAllowanceFactor,
  });
}

export function cableWeightOnDrumKg(cuttingLengthM: number, cableWeightPerMeter: number): number {
  if (!Number.isFinite(cuttingLengthM) || cuttingLengthM <= 0) return 0;
  if (!Number.isFinite(cableWeightPerMeter) || cableWeightPerMeter <= 0) return 0;
  return cuttingLengthM * cableWeightPerMeter;
}

export function grossLoadedDrumWeightKg(
  cableWeightKg: number,
  emptyDrumNetWeightKg: number | null | undefined
): number | null {
  if (!Number.isFinite(cableWeightKg) || cableWeightKg < 0) return null;
  if (emptyDrumNetWeightKg == null || !Number.isFinite(emptyDrumNetWeightKg)) return null;
  return cableWeightKg + emptyDrumNetWeightKg;
}

export function lengthUtilizationPercent(
  nominalCuttingLengthM: number,
  maximumUsableLengthM: number
): number | null {
  if (!Number.isFinite(nominalCuttingLengthM) || nominalCuttingLengthM <= 0) return null;
  if (!Number.isFinite(maximumUsableLengthM) || maximumUsableLengthM <= 0) return null;
  return (nominalCuttingLengthM / maximumUsableLengthM) * 100;
}

export function loadUtilizationPercent(
  cableWeightOnDrum: number,
  permittedCablePayloadKg: number
): number | null {
  if (!Number.isFinite(cableWeightOnDrum) || cableWeightOnDrum < 0) return null;
  if (!Number.isFinite(permittedCablePayloadKg) || permittedCablePayloadKg <= 0) return null;
  return (cableWeightOnDrum / permittedCablePayloadKg) * 100;
}
