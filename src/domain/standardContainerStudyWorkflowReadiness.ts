/**
 * 05I-DF-E — STANDARD_WORKFLOW Container Study gate from persisted DF-B/C/D facts.
 * Orchestrates existing domains only. Does not calculate CS, costing, drums, or pricing.
 * Does not read commercialMetadata.containerStudyReadiness.
 */

import {
  CONTAINER_STUDY_RESULT_AMBIGUOUS,
  CONTAINER_STUDY_RESULT_REQUIRED,
  CONTAINER_STUDY_RESULT_SNAPSHOT_MISMATCH,
  containerStudyRequiredForCosting,
  historicalCostingPinRemainsValid,
} from './costingContainerStudyPin';
export type StandardCsWorkflowGateStatus = 'PASS' | 'BLOCK' | 'WARN' | 'INFO';

export interface StandardCsWorkflowGateResult {
  gate: string;
  status: StandardCsWorkflowGateStatus;
  lineNumber?: number;
  message: string;
  code?: string;
}

export const CONTAINER_STUDY_NOT_REQUIRED = 'CONTAINER_STUDY_NOT_REQUIRED';
export const SHIPMENT_GROUP_REQUIRED = 'SHIPMENT_GROUP_REQUIRED';
export const CONTAINER_STUDY_MISSING = 'CONTAINER_STUDY_MISSING';
export const CONTAINER_STUDY_SNAPSHOT_NOT_READY = 'CONTAINER_STUDY_SNAPSHOT_NOT_READY';
export const CONTAINER_STUDY_CALCULATION_INCOMPLETE = 'CONTAINER_STUDY_CALCULATION_INCOMPLETE';
export const CONTAINER_STUDY_RESULT_READY = 'CONTAINER_STUDY_RESULT_READY';
export const CONTAINER_STUDY_CONFIRMATION_REQUIRED = 'CONTAINER_STUDY_CONFIRMATION_REQUIRED';
export const COSTING_CONTAINER_STUDY_PIN_REQUIRED = 'COSTING_CONTAINER_STUDY_PIN_REQUIRED';
export const COSTING_CONTAINER_STUDY_PIN_STALE = 'COSTING_CONTAINER_STUDY_PIN_STALE';
export const CONTAINER_STUDY_DEPENDENCY_MISMATCH = 'CONTAINER_STUDY_DEPENDENCY_MISMATCH';

export type StandardCsStudyEvidence = {
  id: string;
  shipmentGroupId: string | null;
  status: string;
  currentSnapshotId: string | null;
  currentResultId: string | null;
  resultInputSnapshotId: string | null;
};

export type StandardCsCostingRunEvidence = {
  id: string;
  inquiryLineId: string | null;
  containerStudyResultId: string | null;
};

export type StandardContainerStudyWorkflowEvidence = {
  processCode: string;
  shipmentGroups: Array<{ id: string }>;
  studies: StandardCsStudyEvidence[];
  drumPlansConfirmed: boolean;
  /** Inquiry-line current CostingRun rows only — not “latest result”. */
  currentLineCostingRuns?: StandardCsCostingRunEvidence[];
};

export type StandardContainerStudyWorkflowGate = StandardCsWorkflowGateResult & {
  required: boolean;
  ready: boolean;
  requiredResultId: string | null;
};

export function deriveStandardShipmentCalculationRequired(input: {
  processCode: string;
  shipmentGroupCount: number;
  containerStudyCount: number;
}): boolean {
  return containerStudyRequiredForCosting({
    hasInquiry: true,
    processCode: input.processCode,
    logisticsScenarioActive: input.shipmentGroupCount > 0 || input.containerStudyCount > 0,
  });
}

/** Existing CostingRun pin is never rewritten when a newer result appears. */
export function costingRunPinMustRemain(existingPinnedResultId: string | null, newerResultId: string): string | null {
  void newerResultId;
  return existingPinnedResultId;
}

export function evaluateStandardCostingPinForCurrentWorkflow(input: {
  required: boolean;
  requiredResultId: string | null;
  currentLineCostingRuns: StandardCsCostingRunEvidence[];
}): StandardCsWorkflowGateResult | null {
  if (!input.required) return null;
  if (!input.requiredResultId) {
    return {
      gate: 'COSTING_CONTAINER_STUDY_PIN',
      status: 'BLOCK',
      message: 'A valid Container Study Result is required before costing can proceed.',
      code: CONTAINER_STUDY_RESULT_REQUIRED,
    };
  }

  if (input.currentLineCostingRuns.length === 0) return null;

  for (const run of input.currentLineCostingRuns) {
    if (!run.containerStudyResultId) {
      return {
        gate: 'COSTING_CONTAINER_STUDY_PIN',
        status: 'BLOCK',
        message: 'Current CostingRun must pin the Container Study Result required by this workflow.',
        code: COSTING_CONTAINER_STUDY_PIN_REQUIRED,
      };
    }
    if (run.containerStudyResultId !== input.requiredResultId) {
      return {
        gate: 'COSTING_CONTAINER_STUDY_PIN',
        status: 'BLOCK',
        message:
          'Current workflow requires a CostingRun pinned to the current Container Study Result. Historical runs are unchanged — create a new CostingRun with an explicit pin.',
        code: COSTING_CONTAINER_STUDY_PIN_STALE,
      };
    }
  }

  return {
    gate: 'COSTING_CONTAINER_STUDY_PIN',
    status: 'PASS',
    message: 'Current CostingRun pins the required Container Study Result.',
    code: 'COSTING_CONTAINER_STUDY_PIN_OK',
  };
}

export function evaluateStandardContainerStudyWorkflowGate(
  evidence: StandardContainerStudyWorkflowEvidence
): StandardContainerStudyWorkflowGate {
  const required = deriveStandardShipmentCalculationRequired({
    processCode: evidence.processCode,
    shipmentGroupCount: evidence.shipmentGroups.length,
    containerStudyCount: evidence.studies.length,
  });

  const pass = (message: string, code: string, requiredResultId: string | null = null): StandardContainerStudyWorkflowGate => ({
    gate: 'CONTAINER_STUDY',
    status: 'PASS',
    message,
    code,
    required,
    ready: true,
    requiredResultId,
  });

  const block = (message: string, code: string): StandardContainerStudyWorkflowGate => ({
    gate: 'CONTAINER_STUDY',
    status: 'BLOCK',
    message,
    code,
    required: true,
    ready: false,
    requiredResultId: null,
  });

  if (!required) {
    return pass('Container Study is not required (no shipment calculation scenario).', CONTAINER_STUDY_NOT_REQUIRED);
  }

  const groupIds = new Set(evidence.shipmentGroups.map((g) => g.id));
  if (evidence.shipmentGroups.length === 0) {
    return block('Shipment calculation requires a persisted Shipment Group.', SHIPMENT_GROUP_REQUIRED);
  }

  const studiesBoundToGroups = evidence.studies.filter((s) => s.shipmentGroupId && groupIds.has(s.shipmentGroupId));
  if (studiesBoundToGroups.length === 0) {
    if (evidence.studies.length > 0) {
      return block(
        'Container Study is not bound to a persisted Shipment Group on this inquiry.',
        CONTAINER_STUDY_DEPENDENCY_MISMATCH
      );
    }
    return block('Shipment calculation requires a Container Study on the Shipment Group.', CONTAINER_STUDY_MISSING);
  }

  if (!evidence.drumPlansConfirmed) {
    return block('CONFIRMED drum plan is required before Container Study can satisfy Standard workflow.', 'DRUM_PLAN_NOT_CONFIRMED');
  }

  for (const study of studiesBoundToGroups) {
    if (!study.currentSnapshotId) {
      return block('Immutable Container Study input snapshot is not ready.', CONTAINER_STUDY_SNAPSHOT_NOT_READY);
    }
    if (!study.currentResultId) {
      return block('Container Study calculation is not complete (no ContainerStudyResult).', CONTAINER_STUDY_CALCULATION_INCOMPLETE);
    }
    if (!study.resultInputSnapshotId || study.resultInputSnapshotId !== study.currentSnapshotId) {
      return block(
        'Container Study Result does not match the current immutable input snapshot.',
        CONTAINER_STUDY_RESULT_SNAPSHOT_MISMATCH
      );
    }
  }

  const resultIds = [...new Set(studiesBoundToGroups.map((s) => s.currentResultId).filter((id): id is string => Boolean(id)))];
  if (resultIds.length !== 1) {
    return block('Multiple Container Study Results apply; pin an explicit containerStudyResultId.', CONTAINER_STUDY_RESULT_AMBIGUOUS);
  }

  const confirmationPending = studiesBoundToGroups.some(
    (s) => s.status !== 'CONFIRMED' && s.status !== 'SUPERSEDED' && s.status !== 'VALIDATED' && s.status !== 'DRAFT'
  );
  if (confirmationPending) {
    return block('Container Study status is not a governed lifecycle state.', CONTAINER_STUDY_CONFIRMATION_REQUIRED);
  }

  return pass('Container Study Result is ready for Standard costing.', CONTAINER_STUDY_RESULT_READY, resultIds[0]);
}

export function historicalStandardCostingPinRemainsValid(pinnedResultId: string, currentResultId: string | null | undefined): boolean {
  return historicalCostingPinRemainsValid({ pinnedResultId, currentResultId });
}
