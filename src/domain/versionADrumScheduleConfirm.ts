/**
 * Version A Confirm Drum Plan — confirms the existing commercial drumSchedule.
 * Does not create a V2 configuration snapshot or cutting-length requirements.
 */

import { evaluateDrumPlanConfirmReadiness, type DrumPlanConfirmIssue } from './drumPlanConfirmReadiness';
import {
  expandPhysicalDrumsFromInquirySchedule,
  inquiryDrumScheduleIsConfirmed,
  parseInquiryDrumSchedule,
  type InquiryDrumSchedule,
  type InquiryDrumScheduleRow,
} from './inquiryDrumSchedule';

export function evaluateVersionADrumScheduleConfirm(input: {
  inquiryId?: string | null;
  lineId?: string | null;
  customerScopeValid?: boolean;
  schedule: InquiryDrumSchedule | null;
  drumMasterCodes?: Iterable<string> | null;
}): {
  canConfirm: boolean;
  confirmed: boolean;
  canEditInPlace: boolean;
  issues: DrumPlanConfirmIssue[];
  physicalDrums: ReturnType<typeof expandPhysicalDrumsFromInquirySchedule>;
} {
  const schedule = input.schedule;
  const rows = schedule?.rows || [];
  const readiness = evaluateDrumPlanConfirmReadiness({
    lifecycleStatus: schedule?.lifecycleStatus,
    rows,
    inquiryId: input.inquiryId,
    lineId: input.lineId,
  });
  const issues = [...readiness.issues];
  if (input.customerScopeValid === false) {
    issues.push({
      code: 'CUSTOMER_SCOPE_INVALID',
      message: 'Customer scope is not valid for this inquiry.',
    });
  }
  if (input.drumMasterCodes != null) {
    const masters = new Set(
      [...input.drumMasterCodes].map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)
    );
    for (const row of rows) {
      const code = String(row.drumCode || '').trim();
      if (code && !masters.has(code.toUpperCase())) {
        issues.push({
          code: 'DRUM_MASTER_NOT_FOUND',
          message: `Selected drum ${code} is not a valid Drum Master record.`,
        });
      }
    }
  }
  const physicalDrums = schedule
    ? expandPhysicalDrumsFromInquirySchedule(schedule, input.lineId || 'line')
    : [];
  return {
    canConfirm: issues.length === 0,
    confirmed: readiness.confirmed,
    canEditInPlace: readiness.canEditInPlace,
    issues,
    physicalDrums,
  };
}

export function buildConfirmedVersionADrumSchedule(input: {
  rows: InquiryDrumScheduleRow[];
  cableTolerancePercent: number;
  versionNo?: number;
  confirmedAt?: string;
}): InquiryDrumSchedule {
  return {
    cableTolerancePercent: input.cableTolerancePercent,
    rows: input.rows,
    lifecycleStatus: 'CONFIRMED',
    versionNo: input.versionNo ?? 1,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
  };
}

export function parseScheduleOrNull(value: unknown): InquiryDrumSchedule | null {
  return parseInquiryDrumSchedule(value);
}

export function versionAConfirmedScheduleId(lineId: string, versionNo?: number): string {
  return `commercial-schedule:${lineId}:v${versionNo || 1}`;
}

export function inquiryDrumScheduleIsConfirmedStatus(value: unknown): boolean {
  return inquiryDrumScheduleIsConfirmed(parseInquiryDrumSchedule(value));
}
