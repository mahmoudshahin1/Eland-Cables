import { DrumMasterRecord } from '../../types.js';

export const DRUM_DEFAULT_CLEARANCE_MM = 50;

export type DrumEngineeringWarning = {
  field: string;
  code: string;
  message: string;
};

export function resolveDrumEngineeringFields(
  capacity: number,
  input: {
    clearanceMm?: number | null;
    maxLoadKg?: number | null;
    emptyDrumNetWeightKg?: number | null;
  }
): {
  clearanceMm: number;
  maxWeight: number;
  emptyDrumNetWeightKg: number | null;
  warnings: DrumEngineeringWarning[];
} {
  const warnings: DrumEngineeringWarning[] = [];
  let clearanceMm = input.clearanceMm;
  if (clearanceMm == null || !Number.isFinite(clearanceMm)) {
    clearanceMm = DRUM_DEFAULT_CLEARANCE_MM;
    warnings.push({
      field: 'Clearance Mm',
      code: 'DEFAULT_APPLIED',
      message: 'Clearance Mm defaulted to 50 mm (TO rule).',
    });
  }
  let maxWeight = input.maxLoadKg;
  if (maxWeight == null || !Number.isFinite(maxWeight)) {
    maxWeight = capacity;
    warnings.push({
      field: 'Max Load Kg',
      code: 'DEFAULT_APPLIED',
      message: 'MaxLoad set from Capacity (TO rule).',
    });
  }
  const emptyDrumNetWeightKg =
    input.emptyDrumNetWeightKg != null && Number.isFinite(input.emptyDrumNetWeightKg)
      ? input.emptyDrumNetWeightKg
      : null;
  return { clearanceMm, maxWeight, emptyDrumNetWeightKg, warnings };
}

export function buildDrumDescription(
  flange: number,
  barrel: number,
  innerWidth: number,
  outerWidth: number,
  prefix = 'Wooden Drum'
): string {
  return `${prefix} F${flange} x B${barrel} x ${innerWidth} x ${outerWidth}`;
}

export function resolveDrumDescription(drum: DrumMasterRecord): string {
  const stored = (drum.description || '').trim();
  if (stored) return stored;
  return buildDrumDescription(drum.flange, drum.barrel, drum.innerWidth, drum.outerWidth);
}
