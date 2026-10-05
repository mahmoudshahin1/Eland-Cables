import {
  cableWeightKgFromCuttingLength,
  drumCapacityFillPercent,
} from '../services/drumMasterService';

export interface InquiryDrumScheduleRow {
  drumCode: string;
  noOfDrums: number;
  cuttingLengthM: number;
  drumTolerancePercent: number;
}

export type InquiryDrumScheduleLifecycleStatus = 'DRAFT' | 'CONFIRMED' | 'SUPERSEDED';

export interface InquiryDrumSchedule {
  cableTolerancePercent: number;
  rows: InquiryDrumScheduleRow[];
  lifecycleStatus?: InquiryDrumScheduleLifecycleStatus;
  versionNo?: number;
  confirmedAt?: string | null;
}

export interface DrumScheduleRowMetrics {
  nominalLineM: number;
  minLineM: number;
  maxLineM: number;
  cableWeightPerDrumKg: number;
  totalLineWeightKg: number;
  fillPercent: number | null;
}

export function computeDrumScheduleRowMetrics(
  row: Pick<InquiryDrumScheduleRow, 'noOfDrums' | 'cuttingLengthM' | 'drumTolerancePercent'>,
  approxWeightKgKm: number,
  drumCapacityKg?: number | null
): DrumScheduleRowMetrics {
  const nominalLineM = row.noOfDrums * row.cuttingLengthM;
  const tolerance = Math.max(0, row.drumTolerancePercent) / 100;
  const minLineM = Math.round(nominalLineM * (1 - tolerance));
  const maxLineM = Math.round(nominalLineM * (1 + tolerance));
  const cableWeightPerDrumKg = cableWeightKgFromCuttingLength(row.cuttingLengthM, approxWeightKgKm);
  const totalLineWeightKg = cableWeightPerDrumKg * row.noOfDrums;
  const fillPercent =
    drumCapacityKg && drumCapacityKg > 0
      ? drumCapacityFillPercent(cableWeightPerDrumKg, drumCapacityKg)
      : null;

  return {
    nominalLineM,
    minLineM,
    maxLineM,
    cableWeightPerDrumKg,
    totalLineWeightKg,
    fillPercent,
  };
}

export function computeCableOrderLengthRange(
  totalNominalM: number,
  cableTolerancePercent: number
): { minM: number; maxM: number } {
  const tolerance = Math.max(0, cableTolerancePercent) / 100;
  return {
    minM: Math.round(totalNominalM * (1 - tolerance)),
    maxM: Math.round(totalNominalM * (1 + tolerance)),
  };
}

export function parseInquiryDrumSchedule(value: unknown): InquiryDrumSchedule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const cableTolerancePercent = Number(source.cableTolerancePercent);
  const rawRows = source.rows;
  if (!Array.isArray(rawRows)) return null;

  const rows: InquiryDrumScheduleRow[] = [];
  for (const entry of rawRows) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const drumCode = String(row.drumCode || '').trim();
    const noOfDrums = Number(row.noOfDrums);
    const cuttingLengthM = Number(row.cuttingLengthM);
    const drumTolerancePercent = Number(row.drumTolerancePercent);
    if (!drumCode || !Number.isFinite(noOfDrums) || noOfDrums <= 0) continue;
    if (!Number.isFinite(cuttingLengthM) || cuttingLengthM <= 0) continue;
    if (!Number.isFinite(drumTolerancePercent) || drumTolerancePercent < 0) continue;
    rows.push({ drumCode, noOfDrums, cuttingLengthM, drumTolerancePercent });
  }

  if (!rows.length || !Number.isFinite(cableTolerancePercent) || cableTolerancePercent < 0) {
    return null;
  }

  const rawStatus = String(source.lifecycleStatus || '').trim().toUpperCase();
  const lifecycleStatus: InquiryDrumScheduleLifecycleStatus | undefined =
    rawStatus === 'CONFIRMED' || rawStatus === 'DRAFT' || rawStatus === 'SUPERSEDED'
      ? rawStatus
      : undefined;
  const versionNo = Number(source.versionNo);
  const confirmedAt = typeof source.confirmedAt === 'string' ? source.confirmedAt : null;

  return {
    cableTolerancePercent,
    rows,
    lifecycleStatus,
    versionNo: Number.isFinite(versionNo) && versionNo > 0 ? versionNo : undefined,
    confirmedAt,
  };
}

export function buildInquiryDrumSchedule(
  rows: InquiryDrumScheduleRow[],
  cableTolerancePercent: number,
  extras: Partial<Pick<InquiryDrumSchedule, 'lifecycleStatus' | 'versionNo' | 'confirmedAt'>> = {}
): InquiryDrumSchedule {
  return {
    cableTolerancePercent: Math.max(0, cableTolerancePercent),
    rows,
    ...extras,
  };
}

export function inquiryDrumScheduleIsConfirmed(schedule: InquiryDrumSchedule | null | undefined): boolean {
  return schedule?.lifecycleStatus === 'CONFIRMED';
}

/** Current Version A schedule has physical drum rows (CONFIRMED or not). Does not invent rows. */
export function inquiryDrumScheduleHasPhysicalPopulation(
  schedule: InquiryDrumSchedule | null | undefined
): boolean {
  if (!schedule?.rows.length) return false;
  return schedule.rows.some((row) => {
    const count = Math.floor(Number(row.noOfDrums) || 0);
    const cutting = Number(row.cuttingLengthM);
    return count > 0 && cutting > 0 && Boolean(String(row.drumCode || '').trim());
  });
}

export function canEditInquiryDrumScheduleInPlace(schedule: InquiryDrumSchedule | null | undefined): boolean {
  return schedule?.lifecycleStatus !== 'CONFIRMED';
}

export function inquiryDrumScheduleRowsEquivalent(
  left: InquiryDrumScheduleRow[] | undefined,
  right: InquiryDrumScheduleRow[] | undefined
): boolean {
  const a = left || [];
  const b = right || [];
  if (a.length !== b.length) return false;
  return a.every(
    (row, index) =>
      row.drumCode === b[index]?.drumCode &&
      row.noOfDrums === b[index]?.noOfDrums &&
      row.cuttingLengthM === b[index]?.cuttingLengthM
  );
}

export function expandPhysicalDrumsFromInquirySchedule(
  schedule: InquiryDrumSchedule,
  inquiryLineId: string
): Array<{
  physicalDrumKey: string;
  sourceLineId: string;
  inquiryLineId: string;
  drumCode: string;
  drumDescription: null;
  drumLabel: string;
  instanceIndex: number;
  cuttingLengthM: number;
  grossWeightKg: null;
}> {
  const out: Array<{
    physicalDrumKey: string;
    sourceLineId: string;
    inquiryLineId: string;
    drumCode: string;
    drumDescription: null;
    drumLabel: string;
    instanceIndex: number;
    cuttingLengthM: number;
    grossWeightKg: null;
  }> = [];
  schedule.rows.forEach((row, rowIndex) => {
    const count = Math.floor(Number(row.noOfDrums) || 0);
    const cutting = Number(row.cuttingLengthM);
    if (!count || !(cutting > 0)) return;
    for (let i = 0; i < count; i += 1) {
      out.push({
        physicalDrumKey: `${inquiryLineId}#${rowIndex + 1}#${i + 1}`,
        sourceLineId: inquiryLineId,
        inquiryLineId,
        drumCode: row.drumCode,
        drumDescription: null,
        drumLabel: row.drumCode,
        instanceIndex: i + 1,
        cuttingLengthM: cutting,
        grossWeightKg: null,
      });
    }
  });
  return out;
}
