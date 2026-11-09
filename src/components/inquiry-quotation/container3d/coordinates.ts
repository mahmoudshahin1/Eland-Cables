/** 1 world unit = 1 meter. */
export const MM_TO_METERS = 0.001;

export function mmToMeters(mm: number): number {
  return mm * MM_TO_METERS;
}

/** Internal height is the third figure in a spec string such as "5.90 × 2.35 × 2.39 m". */
export function containerHeightMeters(dims: string | null | undefined): number {
  const parts = String(dims || '')
    .split('×')
    .map((part) => parseFloat(part));
  const height = parts[2];
  return Number.isFinite(height) && height > 0 ? height : 2.39;
}

/**
 * Engine coordinates: xMm runs from the front bulkhead along the length,
 * yMm runs across the width from the port side. World Z is that width axis.
 * The drum rests on the floor, so its center height is the flange radius.
 */
export function drumWorldPosition(drum: {
  xMm: number;
  yMm: number;
  flangeMm: number;
  isSecondLayer?: boolean;
}): {
  x: number;
  y: number;
  z: number;
} {
  const radius = mmToMeters(drum.flangeMm) / 2;
  const stacked = drum.isSecondLayer ? radius * 2 : 0;
  return {
    x: mmToMeters(drum.xMm),
    y: radius + stacked,
    z: mmToMeters(drum.yMm),
  };
}
