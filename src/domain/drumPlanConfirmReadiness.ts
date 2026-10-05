/**
 * Confirm Drum Plan readiness — pure rules only.
 * Persistence uses existing createDraft → validate → confirm commands.
 */

import {
  cuttingLengthRequirementsFromSchedule,
  expandPhysicalDrumRequirements,
} from './drumOptimizationPresentation';
import { expandPhysicalDrumsFromPlanLines, type DrumPlanLineInput } from './inquiryContainerStudyPresentation';

export type DrumPlanConfirmRowInput = {
  cuttingLengthM: number | string;
  noOfDrums?: number | string;
  numberOfDrums?: number | string;
  drumCode?: string | null;
};

export type DrumPlanConfirmIssue = {
  code: string;
  message: string;
};

export type DrumPlanConfirmPhysicalDrum = {
  cuttingLengthM: number;
  drumCode: string;
};

export type DrumPlanConfirmReadiness = {
  confirmed: boolean;
  canShowConfirm: boolean;
  canConfirm: boolean;
  canEditInPlace: boolean;
  issues: DrumPlanConfirmIssue[];
  physicalDrumCount: number;
  physicalDrums: DrumPlanConfirmPhysicalDrum[];
};

export const DRUM_PLAN_CONFIRMED_STATUS_LABEL = 'Drum Plan: CONFIRMED';
export const DRUM_PLAN_NOT_CONFIRMED_STATUS_LABEL = 'Drum Plan: NOT CONFIRMED';

export type AutoConfirmDrumPlanDecision = {
  shouldAutoConfirm: boolean;
  confirmed: boolean;
  issues: DrumPlanConfirmIssue[];
};

function positiveInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function positiveLength(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function canEditDrumPlanInPlace(lifecycleStatus?: string | null): boolean {
  return lifecycleStatus !== 'CONFIRMED';
}

export function expandConfirmPhysicalDrums(rows: DrumPlanConfirmRowInput[]): DrumPlanConfirmPhysicalDrum[] {
  const out: DrumPlanConfirmPhysicalDrum[] = [];
  for (const row of rows) {
    const cuttingLengthM = positiveLength(row.cuttingLengthM);
    const count = positiveInt(row.numberOfDrums ?? row.noOfDrums);
    const drumCode = String(row.drumCode || '').trim();
    if (!cuttingLengthM || !count) continue;
    for (let i = 0; i < count; i += 1) {
      out.push({ cuttingLengthM, drumCode });
    }
  }
  return out;
}

export function evaluateDrumPlanConfirmReadiness(input: {
  lifecycleStatus?: string | null;
  rows: DrumPlanConfirmRowInput[];
  unresolvedErrors?: string[];
  inquiryId?: string | null;
  lineId?: string | null;
}): DrumPlanConfirmReadiness {
  const physicalDrums = expandConfirmPhysicalDrums(input.rows);
  const physicalDrumCount = physicalDrums.length;
  const requirements = cuttingLengthRequirementsFromSchedule(input.rows);
  const confirmed = input.lifecycleStatus === 'CONFIRMED';

  if (confirmed) {
    return {
      confirmed: true,
      canShowConfirm: false,
      canConfirm: false,
      canEditInPlace: false,
      issues: [
        {
          code: 'ALREADY_CONFIRMED',
          message: 'Confirmed drum plan cannot be edited in place. Use a new version to supersede it.',
        },
      ],
      physicalDrumCount,
      physicalDrums,
    };
  }

  const issues: DrumPlanConfirmIssue[] = [];

  if (!physicalDrumCount) {
    issues.push({
      code: 'NO_PHYSICAL_DRUMS',
      message: 'At least one physical drum is required before Confirm Drum Plan.',
    });
  }

  if (!requirements.length) {
    issues.push({
      code: 'INCOMPLETE_COVERAGE',
      message: 'All required cutting-length requirements need physical drum coverage.',
    });
  }

  for (const row of input.rows) {
    const cuttingLengthM = positiveLength(row.cuttingLengthM);
    const count = positiveInt(row.numberOfDrums ?? row.noOfDrums);
    const drumCode = String(row.drumCode || '').trim();
    if (cuttingLengthM && count && !drumCode) {
      issues.push({
        code: 'DRUM_NOT_SELECTED',
        message: `Cutting length ${cuttingLengthM} m has no valid selected drum.`,
      });
    }
  }

  const coverageComplete =
    requirements.length > 0 &&
    requirements.every((requirement) => {
      const covered = physicalDrums.filter(
        (drum) => drum.cuttingLengthM === requirement.cuttingLengthM && drum.drumCode
      ).length;
      return covered >= requirement.requestedDrumCount;
    });

  if (requirements.length > 0 && !coverageComplete) {
    issues.push({
      code: 'INCOMPLETE_COVERAGE',
      message: 'Physical drum coverage is incomplete for one or more cutting-length requirements.',
    });
  }

  for (const message of input.unresolvedErrors || []) {
    const trimmed = String(message || '').trim();
    if (!trimmed) continue;
    issues.push({ code: 'DRUM_SELECTION_ERROR', message: trimmed });
  }

  if (!input.inquiryId || !input.lineId) {
    issues.push({
      code: 'SCOPE_REQUIRED',
      message: 'Confirm Drum Plan requires the current inquiry and line.',
    });
  }

  const hasValidDraftShape =
    physicalDrumCount > 0 &&
    coverageComplete &&
    physicalDrums.every((drum) => Boolean(drum.drumCode)) &&
    !(input.unresolvedErrors || []).some((message) => String(message || '').trim());

  return {
    confirmed: false,
    canShowConfirm: hasValidDraftShape,
    canConfirm: issues.length === 0,
    canEditInPlace: true,
    issues,
    physicalDrumCount,
    physicalDrums,
  };
}

/**
 * Auto-CONFIRM only after a valid physical plan (cutting + drum + coverage)
 * and successful capacity/technical validation. Does not invent V2 records.
 */
export function evaluateAutoConfirmDrumPlan(input: {
  lifecycleStatus?: string | null;
  rows: DrumPlanConfirmRowInput[];
  unresolvedErrors?: string[];
  inquiryId?: string | null;
  lineId?: string | null;
  technicalPlanValid: boolean | null;
}): AutoConfirmDrumPlanDecision {
  const readiness = evaluateDrumPlanConfirmReadiness({
    lifecycleStatus: input.lifecycleStatus,
    rows: input.rows,
    unresolvedErrors: input.unresolvedErrors,
    inquiryId: input.inquiryId,
    lineId: input.lineId,
  });
  if (readiness.confirmed) {
    return { shouldAutoConfirm: false, confirmed: true, issues: [] };
  }
  const issues = [...readiness.issues];
  if (input.technicalPlanValid === false && readiness.canShowConfirm) {
    issues.push({
      code: 'CAPACITY_VALIDATION_FAILED',
      message: 'Drum capacity/technical validation did not pass.',
    });
  }
  return {
    shouldAutoConfirm: readiness.canConfirm && input.technicalPlanValid === true,
    confirmed: false,
    issues,
  };
}

export function cuttingLengthsIntact(
  before: DrumPlanConfirmRowInput[],
  after: DrumPlanConfirmRowInput[]
): boolean {
  const beforeReq = cuttingLengthRequirementsFromSchedule(before);
  const afterReq = cuttingLengthRequirementsFromSchedule(after);
  if (beforeReq.length !== afterReq.length) return false;
  return beforeReq.every(
    (requirement, index) =>
      afterReq[index]?.cuttingLengthM === requirement.cuttingLengthM &&
      afterReq[index]?.requestedDrumCount === requirement.requestedDrumCount
  );
}

export function confirmedPhysicalPopulationFromPlanLines(lines: DrumPlanLineInput[]) {
  return expandPhysicalDrumsFromPlanLines(lines);
}

export function expectedPhysicalCountFromSchedule(rows: DrumPlanConfirmRowInput[]): number {
  return expandPhysicalDrumRequirements(rows).length;
}
