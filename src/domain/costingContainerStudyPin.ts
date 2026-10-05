/**
 * 05I-DF-D — CostingRun pins a specific ContainerStudyResult.
 * Pure policy. No Prisma, clocks, or latest-result lookup.
 */

export const CONTAINER_STUDY_RESULT_REQUIRED = 'CONTAINER_STUDY_RESULT_REQUIRED';
export const CONTAINER_STUDY_RESULT_NOT_FOUND = 'CONTAINER_STUDY_RESULT_NOT_FOUND';
export const CONTAINER_STUDY_RESULT_STUDY_MISMATCH = 'CONTAINER_STUDY_RESULT_STUDY_MISMATCH';
export const CONTAINER_STUDY_RESULT_SNAPSHOT_MISMATCH = 'CONTAINER_STUDY_RESULT_SNAPSHOT_MISMATCH';
export const CONTAINER_STUDY_RESULT_INQUIRY_MISMATCH = 'CONTAINER_STUDY_RESULT_INQUIRY_MISMATCH';
export const CONTAINER_STUDY_RESULT_AMBIGUOUS = 'CONTAINER_STUDY_RESULT_AMBIGUOUS';
export const VIP_SHIPMENT_NOT_CONFIGURED = 'VIP_SHIPMENT_NOT_CONFIGURED';

export type CostingCsProcessCode = 'VIP_FAST_TRACK' | 'STANDARD_WORKFLOW' | string;

export type PinnedContainerStudyResultView = {
  id: string;
  studyId: string;
  inquiryId: string;
  inputSnapshotId: string;
};

/**
 * Shipment/logistics scenario controls Container Study requirement for both VIP and STANDARD.
 * VIP may skip CS only when logisticsScenarioActive is false (no shipment path).
 * Monetary rates remain optional downstream (0 + warning) — this gate is physical CS only.
 */
export function containerStudyRequiredForCosting(input: {
  hasInquiry: boolean;
  processCode: CostingCsProcessCode;
  logisticsScenarioActive: boolean;
}): boolean {
  if (!input.hasInquiry) return false;
  if (!input.logisticsScenarioActive) return false;
  void input.processCode;
  return true;
}

export function evaluateCostingContainerStudyPin(input: {
  result: PinnedContainerStudyResultView | null;
  inquiryId: string;
  expectedStudyId?: string | null;
  expectedSnapshotId?: string | null;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (!input.result) {
    return {
      ok: false,
      code: CONTAINER_STUDY_RESULT_NOT_FOUND,
      message: 'Container Study Result was not found.',
    };
  }
  if (input.result.inquiryId !== input.inquiryId) {
    return {
      ok: false,
      code: CONTAINER_STUDY_RESULT_INQUIRY_MISMATCH,
      message: 'Container Study Result does not belong to this inquiry.',
    };
  }
  if (input.expectedStudyId && input.result.studyId !== input.expectedStudyId) {
    return {
      ok: false,
      code: CONTAINER_STUDY_RESULT_STUDY_MISMATCH,
      message: 'Container Study Result does not belong to the expected study.',
    };
  }
  if (input.expectedSnapshotId && input.result.inputSnapshotId !== input.expectedSnapshotId) {
    return {
      ok: false,
      code: CONTAINER_STUDY_RESULT_SNAPSHOT_MISMATCH,
      message: 'Container Study Result does not belong to the expected input snapshot.',
    };
  }
  return { ok: true };
}

export const COSTING_CONTAINER_STUDY_PIN_WRITE_ONCE = 'COSTING_CONTAINER_STUDY_PIN_WRITE_ONCE';

/** Historical CostingRun pins stay valid when operational currentResultId has moved on. */
export function historicalCostingPinRemainsValid(input: {
  pinnedResultId: string;
  currentResultId: string | null | undefined;
}): boolean {
  return Boolean(input.pinnedResultId);
}

/**
 * CostingRun.containerStudyResultId is write-once.
 * A newer ContainerStudyResult must never silently replace an existing pin.
 */
export function evaluateCostingRunPinWriteOnce(input: {
  existingPin: string | null | undefined;
  nextPin: string | null | undefined;
}): { ok: true } | { ok: false; code: string; message: string } {
  const existing = String(input.existingPin || '').trim();
  if (!existing) return { ok: true };
  const next = String(input.nextPin || '').trim();
  if (next && next !== existing) {
    return {
      ok: false,
      code: COSTING_CONTAINER_STUDY_PIN_WRITE_ONCE,
      message: 'CostingRun containerStudyResultId is write-once and cannot be repointed.',
    };
  }
  return { ok: true };
}
