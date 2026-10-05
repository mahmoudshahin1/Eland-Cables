/**
 * Directional cutting-length tolerance (05I-DRUM-REMEDIATION).
 * Pure. Shared by cutting-length persistence and drum planning.
 */

import { issue } from '../platform/errors/domainError';

export const CUTTING_LENGTH_TOLERANCE_MODES = ['NONE', 'POSITIVE', 'NEGATIVE', 'SYMMETRIC'] as const;
export type CuttingLengthToleranceMode = (typeof CUTTING_LENGTH_TOLERANCE_MODES)[number];

export type CuttingLengthToleranceInput = {
  nominalLengthM: number;
  mode: CuttingLengthToleranceMode;
  positivePercent?: number | null;
  negativePercent?: number | null;
};

export type CuttingLengthToleranceBounds = {
  mode: CuttingLengthToleranceMode;
  nominalLengthM: number;
  positivePercent: number;
  negativePercent: number;
  minLengthM: number;
  maxLengthM: number;
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function parseCuttingLengthToleranceMode(value: unknown): CuttingLengthToleranceMode {
  if (value == null || value === '') return 'SYMMETRIC';
  if (typeof value === 'string' && (CUTTING_LENGTH_TOLERANCE_MODES as readonly string[]).includes(value)) {
    return value as CuttingLengthToleranceMode;
  }
  throw issue('VALIDATION_FAILED', 'toleranceMode must be NONE, POSITIVE, NEGATIVE, or SYMMETRIC.');
}

export function resolveCuttingLengthTolerance(input: {
  toleranceMode?: unknown;
  tolerancePercent?: unknown;
  positiveTolerancePercent?: unknown;
  negativeTolerancePercent?: unknown;
}): { mode: CuttingLengthToleranceMode; positivePercent: number; negativePercent: number } {
  const mode = parseCuttingLengthToleranceMode(input.toleranceMode);
  const legacy =
    input.tolerancePercent == null || input.tolerancePercent === ''
      ? 0
      : Number(input.tolerancePercent);
  const posRaw = input.positiveTolerancePercent == null ? NaN : Number(input.positiveTolerancePercent);
  const negRaw = input.negativeTolerancePercent == null ? NaN : Number(input.negativeTolerancePercent);
  if (mode === 'NONE') {
    return { mode, positivePercent: 0, negativePercent: 0 };
  }
  if (mode === 'POSITIVE') {
    const positivePercent = Number.isFinite(posRaw) ? posRaw : legacy;
    if (!Number.isFinite(positivePercent) || positivePercent < 0) {
      throw issue('VALIDATION_FAILED', 'POSITIVE tolerance requires a non-negative percentage.');
    }
    return { mode, positivePercent, negativePercent: 0 };
  }
  if (mode === 'NEGATIVE') {
    const negativePercent = Number.isFinite(negRaw) ? negRaw : legacy;
    if (!Number.isFinite(negativePercent) || negativePercent < 0) {
      throw issue('VALIDATION_FAILED', 'NEGATIVE tolerance requires a non-negative percentage.');
    }
    return { mode, positivePercent: 0, negativePercent };
  }
  const symmetric = Number.isFinite(legacy) ? legacy : 0;
  const positivePercent = Number.isFinite(posRaw) ? posRaw : symmetric;
  const negativePercent = Number.isFinite(negRaw) ? negRaw : symmetric;
  if (positivePercent < 0 || negativePercent < 0) {
    throw issue('VALIDATION_FAILED', 'SYMMETRIC tolerance percentages must be non-negative.');
  }
  return { mode, positivePercent, negativePercent };
}

export function computeDirectedToleranceBounds(
  input: CuttingLengthToleranceInput
): CuttingLengthToleranceBounds {
  const nominal = Math.max(0, input.nominalLengthM);
  const resolved = resolveCuttingLengthTolerance({
    toleranceMode: input.mode,
    positiveTolerancePercent: input.positivePercent,
    negativeTolerancePercent: input.negativePercent,
  });
  const minLengthM = round3(nominal * (1 - resolved.negativePercent / 100));
  const maxLengthM = round3(nominal * (1 + resolved.positivePercent / 100));
  return {
    mode: resolved.mode,
    nominalLengthM: nominal,
    positivePercent: resolved.positivePercent,
    negativePercent: resolved.negativePercent,
    minLengthM,
    maxLengthM,
  };
}

export function lengthIsWithinToleranceBand(lengthM: number, minLengthM: number, maxLengthM: number): boolean {
  return Number.isFinite(lengthM) && lengthM + 1e-9 >= minLengthM && lengthM - 1e-9 <= maxLengthM;
}
