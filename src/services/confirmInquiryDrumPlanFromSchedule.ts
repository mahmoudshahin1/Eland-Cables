/**
 * Client orchestrator for Confirm Drum Plan on Version A inquiries.
 * Confirms the existing commercial drumSchedule. Does not invent a V2 snapshot.
 */

import {
  cuttingLengthsIntact,
  evaluateAutoConfirmDrumPlan,
  evaluateDrumPlanConfirmReadiness,
  type DrumPlanConfirmRowInput,
} from '../domain/drumPlanConfirmReadiness';
import { confirmCommercialDrumSchedule } from './commercialInquiryApiService';

export type ConfirmInquiryDrumPlanDeps = {
  confirmCommercialDrumSchedule: typeof confirmCommercialDrumSchedule;
};

const defaultDeps: ConfirmInquiryDrumPlanDeps = {
  confirmCommercialDrumSchedule,
};

function positiveInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function positiveLength(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeConfirmScheduleRows(rows: DrumPlanConfirmRowInput[]): Array<{
  drumCode: string;
  noOfDrums: number;
  cuttingLengthM: number;
}> {
  const out: Array<{ drumCode: string; noOfDrums: number; cuttingLengthM: number }> = [];
  for (const row of rows) {
    const cuttingLengthM = positiveLength(row.cuttingLengthM);
    const noOfDrums = positiveInt(row.numberOfDrums ?? row.noOfDrums);
    const drumCode = String(row.drumCode || '').trim();
    if (!cuttingLengthM || !noOfDrums) continue;
    out.push({ drumCode, noOfDrums, cuttingLengthM });
  }
  return out;
}

export async function confirmInquiryDrumPlanFromSchedule(
  input: {
    token: string;
    inquiryId: string;
    lineId: string;
    selectionMethod?: 'AUTOMATIC' | 'MANUAL';
    rows: DrumPlanConfirmRowInput[];
    cableTolerancePercent?: number | string;
    unresolvedErrors?: string[];
  },
  deps: ConfirmInquiryDrumPlanDeps = defaultDeps
): Promise<{
  lifecycleStatus: 'CONFIRMED';
  physicalDrums: Array<{ cuttingLengthM: number; drumCode: string }>;
  rows: DrumPlanConfirmRowInput[];
}> {
  const readiness = evaluateDrumPlanConfirmReadiness({
    rows: input.rows,
    unresolvedErrors: input.unresolvedErrors,
    inquiryId: input.inquiryId,
    lineId: input.lineId,
  });
  if (!readiness.canConfirm) {
    throw new Error(readiness.issues[0]?.message || 'Drum plan is not ready to confirm.');
  }

  const scheduleRows = normalizeConfirmScheduleRows(input.rows);
  const result = await deps.confirmCommercialDrumSchedule(input.token, input.inquiryId, input.lineId, {
    rows: scheduleRows,
    cableTolerancePercent: input.cableTolerancePercent,
  });
  if (!cuttingLengthsIntact(input.rows, scheduleRows)) {
    throw new Error('Confirm Drum Plan must not change cutting-length requirements.');
  }
  if (result.lifecycleStatus !== 'CONFIRMED') {
    throw new Error('Drum plan could not be confirmed.');
  }

  return {
    lifecycleStatus: 'CONFIRMED',
    physicalDrums: readiness.physicalDrums,
    rows: input.rows,
  };
}

/**
 * After a successful valid optimize/validate persist, confirm via the existing
 * Version A POST /drum-schedule/confirm path. Does not invent a V2 snapshot.
 */
export async function autoConfirmInquiryDrumPlanFromSchedule(
  input: {
    token: string;
    inquiryId: string;
    lineId: string;
    selectionMethod?: 'AUTOMATIC' | 'MANUAL';
    rows: DrumPlanConfirmRowInput[];
    cableTolerancePercent?: number | string;
    unresolvedErrors?: string[];
    technicalPlanValid: boolean | null;
    lifecycleStatus?: string | null;
  },
  deps: ConfirmInquiryDrumPlanDeps = defaultDeps
): Promise<
  | { skipped: true; lifecycleStatus: 'CONFIRMED' | 'NOT_CONFIRMED' }
  | {
      skipped: false;
      lifecycleStatus: 'CONFIRMED';
      physicalDrums: Array<{ cuttingLengthM: number; drumCode: string }>;
      rows: DrumPlanConfirmRowInput[];
    }
> {
  const decision = evaluateAutoConfirmDrumPlan({
    lifecycleStatus: input.lifecycleStatus,
    rows: input.rows,
    unresolvedErrors: input.unresolvedErrors,
    inquiryId: input.inquiryId,
    lineId: input.lineId,
    technicalPlanValid: input.technicalPlanValid,
  });
  if (decision.confirmed) {
    return { skipped: true, lifecycleStatus: 'CONFIRMED' };
  }
  if (!decision.shouldAutoConfirm) {
    return { skipped: true, lifecycleStatus: 'NOT_CONFIRMED' };
  }
  const result = await confirmInquiryDrumPlanFromSchedule(input, deps);
  return { skipped: false, ...result };
}

/** After a line persist that already passed optimize/validate, confirm via the existing endpoint. */
export async function autoConfirmPersistedCommercialDrumSchedule(
  input: {
    token: string;
    inquiryId: string;
    lineId: string;
    schedule?: {
      rows?: DrumPlanConfirmRowInput[];
      cableTolerancePercent?: number | string;
    } | null;
  },
  deps: ConfirmInquiryDrumPlanDeps = defaultDeps
): Promise<{ lifecycleStatus: 'CONFIRMED' | 'NOT_CONFIRMED' }> {
  const rows = input.schedule?.rows || [];
  if (!rows.length) return { lifecycleStatus: 'NOT_CONFIRMED' };
  const result = await autoConfirmInquiryDrumPlanFromSchedule(
    {
      token: input.token,
      inquiryId: input.inquiryId,
      lineId: input.lineId,
      rows,
      cableTolerancePercent: input.schedule?.cableTolerancePercent,
      technicalPlanValid: true,
    },
    deps
  );
  return { lifecycleStatus: result.lifecycleStatus === 'CONFIRMED' ? 'CONFIRMED' : 'NOT_CONFIRMED' };
}
