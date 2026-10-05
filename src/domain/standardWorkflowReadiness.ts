/**
 * STANDARD_WORKFLOW post-submit readiness — reuse existing lineage gates.
 * Does not fabricate snapshots, cutting plans, drum plans, or CS results.
 * Container Study readiness comes from persisted DF-B/C/D facts, not metadata flags.
 */

import {
  evaluateStandardContainerStudyWorkflowGate,
  evaluateStandardCostingPinForCurrentWorkflow,
  type StandardContainerStudyWorkflowEvidence,
} from './standardContainerStudyWorkflowReadiness';
import {
  evaluateMissingSnapshotForCalculation,
  importedCableSatisfiesCalculationEngineering,
  snapshotNotRequiredForImportedCableMessage,
  type ImportedCableCalculationEvidence,
} from './importedCableCalculationAuthority';

export type StandardWorkflowGateStatus = 'PASS' | 'BLOCK' | 'WARN' | 'INFO';

export interface StandardWorkflowGateResult {
  gate: string;
  status: StandardWorkflowGateStatus;
  lineNumber?: number;
  message: string;
  code?: string;
}

export interface StandardLineEvidence {
  lineId: string;
  lineNumber: number;
  v2CurrentSnapshotId: string | null;
  v2CurrentCuttingPlanId: string | null;
  v2CurrentDrumPlanId: string | null;
  technicalOfficeRequestId?: string | null;
  configurationSnapshot?: {
    id: string;
    validationStatus: string;
    flowState: string;
    bomGovernanceBlocked: boolean;
    unresolvedBomConflictCount: number;
    engineeringStatus?: string | null;
  } | null;
  cuttingPlan?: {
    id: string;
    validationStatus: string;
  } | null;
  drumPlan?: {
    id: string;
    lifecycleStatus: string;
    validationStatus?: string | null;
  } | null;
  importedCable?: ImportedCableCalculationEvidence | null;
}

const EXCEPTION_FLOW = new Set(['BLOCKED_ENGINEERING_APPROVAL', 'ENGINEERING_DATA_BLOCKED']);
const EXCEPTION_VALIDATION = new Set(['ENGINEERING_BLOCKED', 'INVALID_CONFIGURATION', 'TECHNICALLY_VALID_NOT_MASTER']);

export function lineRequiresTechnicalOffice(line: StandardLineEvidence): boolean {
  const importedOk = importedCableSatisfiesCalculationEngineering(
    line.importedCable || { materialNumber: null, bomLineCount: 0, unresolvedBomConflictCount: 0 }
  );
  if (importedOk && !line.configurationSnapshot) return false;
  const snap = line.configurationSnapshot;
  if (!snap) return true;
  if (EXCEPTION_FLOW.has(snap.flowState)) return true;
  if (EXCEPTION_VALIDATION.has(snap.validationStatus)) return true;
  if (snap.engineeringStatus === 'ENGINEERING_BLOCKED') return true;
  if (snap.bomGovernanceBlocked) return true;
  if (line.technicalOfficeRequestId) return true;
  return false;
}

export function evaluateStandardEngineering(lines: StandardLineEvidence[]): {
  allApproved: boolean;
  toRequired: boolean;
  gates: StandardWorkflowGateResult[];
} {
  const gates: StandardWorkflowGateResult[] = [];
  if (lines.length === 0) {
    return {
      allApproved: false,
      toRequired: false,
      gates: [{ gate: 'ENGINEERING', status: 'BLOCK', message: 'Inquiry has no lines.', code: 'EMPTY_INQUIRY' }],
    };
  }

  let toRequired = false;
  let allApproved = true;

  for (const line of lines) {
    if (!line.v2CurrentSnapshotId || !line.configurationSnapshot) {
      const snapshotGate = evaluateMissingSnapshotForCalculation({
        lineNumber: line.lineNumber,
        importedCable: line.importedCable,
      });
      if (snapshotGate.status === 'PASS') {
        gates.push({
          gate: 'ENGINEERING',
          status: 'PASS',
          lineNumber: line.lineNumber,
          message: snapshotNotRequiredForImportedCableMessage(line.lineNumber),
          code: 'ENGINEERING_APPROVED',
        });
        continue;
      }
      allApproved = false;
      toRequired = true;
      gates.push({
        gate: 'CONFIGURATION_SNAPSHOT',
        status: 'BLOCK',
        lineNumber: line.lineNumber,
        message: snapshotGate.message,
        code: snapshotGate.code,
      });
      continue;
    }
    if (line.configurationSnapshot.id !== line.v2CurrentSnapshotId) {
      allApproved = false;
      gates.push({
        gate: 'CONFIGURATION_SNAPSHOT',
        status: 'BLOCK',
        lineNumber: line.lineNumber,
        message: `Line ${line.lineNumber}: snapshot pointer is stale.`,
        code: 'SNAPSHOT_STALE',
      });
      continue;
    }
    if (lineRequiresTechnicalOffice(line)) {
      allApproved = false;
      toRequired = true;
      gates.push({
        gate: 'ENGINEERING',
        status: 'BLOCK',
        lineNumber: line.lineNumber,
        message: `Line ${line.lineNumber}: Technical Office required (exception).`,
        code: 'TO_REQUIRED',
      });
      continue;
    }
    gates.push({
      gate: 'ENGINEERING',
      status: 'PASS',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: engineering auto-cleared (existing cable / valid snapshot).`,
      code: 'ENGINEERING_APPROVED',
    });
  }

  return { allApproved, toRequired, gates };
}

export function evaluateStandardCostingLineage(lines: StandardLineEvidence[]): StandardWorkflowGateResult[] {
  const gates: StandardWorkflowGateResult[] = [];
  for (const line of lines) {
    const importedOk = importedCableSatisfiesCalculationEngineering(
      line.importedCable || { materialNumber: null, bomLineCount: 0, unresolvedBomConflictCount: 0 }
    );
    if (!line.v2CurrentCuttingPlanId || !line.cuttingPlan) {
      gates.push({
        gate: 'CUTTING_LENGTH_PLAN',
        status: importedOk ? 'WARN' : 'BLOCK',
        lineNumber: line.lineNumber,
        message: importedOk
          ? `Line ${line.lineNumber}: cutting length plan not set — costing uses inquiry quantity/length.`
          : `Line ${line.lineNumber}: cutting length plan required.`,
        code: 'CUTTING_PLAN_REQUIRED',
      });
    } else if (line.cuttingPlan.validationStatus === 'ERROR') {
      gates.push({
        gate: 'CUTTING_LENGTH_PLAN',
        status: 'BLOCK',
        lineNumber: line.lineNumber,
        message: `Line ${line.lineNumber}: cutting plan validation ERROR.`,
        code: 'CUTTING_PLAN_ERROR',
      });
    }
    if (!line.v2CurrentDrumPlanId || !line.drumPlan) {
      gates.push({
        gate: 'DRUM_PLAN',
        status: importedOk ? 'WARN' : 'BLOCK',
        lineNumber: line.lineNumber,
        message: importedOk
          ? `Line ${line.lineNumber}: drum plan not confirmed — packing/CS uses physical data when present.`
          : `Line ${line.lineNumber}: drum plan required.`,
        code: 'DRUM_PLAN_REQUIRED',
      });
    } else if (line.drumPlan.lifecycleStatus !== 'CONFIRMED') {
      gates.push({
        gate: 'DRUM_PLAN',
        status: importedOk ? 'WARN' : 'BLOCK',
        lineNumber: line.lineNumber,
        message: importedOk
          ? `Line ${line.lineNumber}: drum plan is ${line.drumPlan.lifecycleStatus} — packing waits for CONFIRMED drums.`
          : `Line ${line.lineNumber}: CONFIRMED drum plan required.`,
        code: 'DRUM_PLAN_NOT_CONFIRMED',
      });
    }
  }
  return gates;
}

export function evaluateStandardContainerStudyGate(
  evidence: StandardContainerStudyWorkflowEvidence
): ReturnType<typeof evaluateStandardContainerStudyWorkflowGate> {
  return evaluateStandardContainerStudyWorkflowGate(evidence);
}

export function evaluateStandardPostSubmitReadiness(input: {
  lines: StandardLineEvidence[];
  containerStudyEvidence: StandardContainerStudyWorkflowEvidence;
}): {
  engineering: ReturnType<typeof evaluateStandardEngineering>;
  lineageGates: StandardWorkflowGateResult[];
  containerStudy: ReturnType<typeof evaluateStandardContainerStudyWorkflowGate>;
  costingPin: StandardWorkflowGateResult | null;
  blockingReasons: string[];
} {
  const engineering = evaluateStandardEngineering(input.lines);
  const lineageGates = evaluateStandardCostingLineage(input.lines);
  const drumConfirmed = !lineageGates.some((g) => g.code === 'DRUM_PLAN_REQUIRED' || g.code === 'DRUM_PLAN_NOT_CONFIRMED');
  const containerStudy = evaluateStandardContainerStudyWorkflowGate({
    ...input.containerStudyEvidence,
    drumPlansConfirmed: input.containerStudyEvidence.drumPlansConfirmed && drumConfirmed,
  });
  const costingPin = evaluateStandardCostingPinForCurrentWorkflow({
    required: containerStudy.required && containerStudy.ready,
    requiredResultId: containerStudy.requiredResultId,
    currentLineCostingRuns: input.containerStudyEvidence.currentLineCostingRuns || [],
  });
  const blockingReasons = [
    ...engineering.gates,
    ...lineageGates,
    containerStudy,
    ...(costingPin ? [costingPin] : []),
  ]
    .filter((g) => g.status === 'BLOCK')
    .map((g) => g.message);
  return { engineering, lineageGates, containerStudy, costingPin, blockingReasons };
}
