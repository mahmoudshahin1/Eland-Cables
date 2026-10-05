/**
 * Drum planning helpers — capacity-based suggestions only.
 * Does not fabricate drum costs; use governed pricing when available.
 */

export interface DrumTypeSpec {
  id: string;
  name: string;
  maxCapacityM: number;
}

export const APPROVED_DRUM_TYPES: DrumTypeSpec[] = [
  { id: 'k-12', name: 'Wooden Reel K-12 (1200mm)', maxCapacityM: 1000 },
  { id: 'k-14', name: 'Wooden Reel K-14 (1400mm)', maxCapacityM: 1400 },
  { id: 'k-18', name: 'Heavy Duty Wooden K-18 (1800mm)', maxCapacityM: 2000 },
  { id: 's-18', name: 'Steel Reel S-18 (1800mm)', maxCapacityM: 2200 },
  { id: 's-22', name: 'Steel Reel S-22 (2200mm)', maxCapacityM: 2800 },
  { id: 's-26', name: 'Steel Reel S-26 (2600mm)', maxCapacityM: 3500 },
  { id: 'p-10', name: 'Plywood Reel P-10 (1000mm)', maxCapacityM: 800 },
];

export interface DrumPlanSuggestion {
  drumTypeName: string;
  drumTypeId: string;
  cuttingLengthMeters: number;
  drumCount: number;
  fillRatioPercent: number;
  withinCapacity: boolean;
  message?: string;
}

export function validateCuttingLength(
  requestedLengthMeters: number,
  cuttingLengthMeters?: number | null
): { valid: boolean; message?: string } {
  if (cuttingLengthMeters == null || cuttingLengthMeters === 0) {
    return { valid: true };
  }
  if (cuttingLengthMeters <= 0) {
    return { valid: false, message: 'Cutting length must be greater than zero.' };
  }
  if (cuttingLengthMeters > requestedLengthMeters) {
    return {
      valid: false,
      message: `Cutting length (${cuttingLengthMeters} m) cannot exceed line length (${requestedLengthMeters} m).`,
    };
  }
  return { valid: true };
}

function pickDrumForCutting(cuttingM: number): DrumTypeSpec {
  const sorted = [...APPROVED_DRUM_TYPES].sort((a, b) => a.maxCapacityM - b.maxCapacityM);
  const fit = sorted.find((d) => d.maxCapacityM >= cuttingM);
  return fit || sorted[sorted.length - 1];
}

export function isGovernedDrumSelection(
  drumValue: string | null | undefined,
  drums: Array<{ drumCode: string; drumType?: string | null }>
): boolean {
  const t = (drumValue || '').trim();
  if (!t) return false;
  const upper = t.toUpperCase();
  return drums.some(
    (d) => d.drumCode.toUpperCase() === upper || (d.drumType || '').trim().toUpperCase() === upper
  );
}

function pickDrumFromMaster(
  cuttingM: number,
  drums: Array<{ drumCode: string; drumType?: string | null; capacity?: number | null }>
): { id: string; name: string; maxCapacityM: number } | null {
  const withCapacity = drums
    .map((d) => ({
      id: d.drumCode,
      name: d.drumType || d.drumCode,
      maxCapacityM: Number(d.capacity),
    }))
    .filter((d) => Number.isFinite(d.maxCapacityM) && d.maxCapacityM > 0)
    .sort((a, b) => a.maxCapacityM - b.maxCapacityM);
  if (withCapacity.length === 0) return null;
  return withCapacity.find((d) => d.maxCapacityM >= cuttingM) || withCapacity[withCapacity.length - 1];
}

/** Suggest drum type and count from line length and optional cutting length. */
export function suggestDrumPlan(
  requestedLengthMeters: number,
  cuttingLengthMeters?: number | null,
  drums?: Array<{ drumCode: string; drumType?: string | null; capacity?: number | null }>
): DrumPlanSuggestion {
  const lineLength = Math.max(1, Number(requestedLengthMeters) || 1);
  const cutting = cuttingLengthMeters && cuttingLengthMeters > 0 ? cuttingLengthMeters : lineLength;
  const fromMaster = drums && drums.length > 0 ? pickDrumFromMaster(cutting, drums) : null;
  const drum = fromMaster || pickDrumForCutting(cutting);
  const drumCount = Math.max(1, Math.ceil(lineLength / cutting));
  const fillRatioPercent = Math.min(100, Math.round((cutting / drum.maxCapacityM) * 100));
  const withinCapacity = cutting <= drum.maxCapacityM;

  if (drums && drums.length === 0) {
    return {
      drumTypeId: '',
      drumTypeName: '',
      cuttingLengthMeters: cutting,
      drumCount,
      fillRatioPercent: 0,
      withinCapacity: false,
      message: 'DRUM_CONFIGURATION_REQUIRED — import Drum Master to auto-select a drum',
    };
  }

  return {
    drumTypeId: drum.id,
    drumTypeName: drum.name,
    cuttingLengthMeters: cutting,
    drumCount,
    fillRatioPercent,
    withinCapacity,
    message: withinCapacity
      ? `${drumCount} × ${drum.name} @ ${cutting} m per drum`
      : `Cutting length exceeds ${drum.name} capacity (${drum.maxCapacityM} m) — review manually`,
  };
}
