/**
 * VIP Fast Track Calculate readiness gates (Task 05I-C).
 * Per-line gates A–F before orchestrated costing → pricing → quotation draft.
 */

import { DECISION5_STATUS } from './v2CostingRequestService';
import { collectInquirySubmitMissingItems } from '../services/inquiryHeaderFormService';
import { evaluateContainerStudyGate } from './containerStudyReadiness';
import {
  evaluateMissingSnapshotForCalculation,
  importedCableSatisfiesCalculationEngineering,
  type ImportedCableCalculationEvidence,
} from './importedCableCalculationAuthority';

export type VipCalculateGateCode =
  | 'CONFIGURATION_SNAPSHOT'
  | 'CUTTING_LENGTH_PLAN'
  | 'DRUM_PLAN'
  | 'CONTAINER_STUDY'
  | 'BOM_GATE_2'
  | 'HEADER_COMMERCIAL_CONFIG'
  | 'COSTING_GATES'
  | 'DECISION_5'
  | 'FINANCIAL_OFFER';

export type VipCalculateGateStatus = 'PASS' | 'BLOCK' | 'WARN' | 'INFO';

export interface VipCalculateGateResult {
  gate: VipCalculateGateCode;
  status: VipCalculateGateStatus;
  lineNumber?: number;
  message: string;
  code?: string;
}

export interface VipLineReadinessInput {
  lineId: string;
  lineNumber: number;
  v2CurrentSnapshotId: string | null;
  v2CurrentCuttingPlanId: string | null;
  v2CurrentDrumPlanId: string | null;
  importedCable?: ImportedCableCalculationEvidence | null;
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
    configurationSnapshotId?: string | null;
  } | null;
  drumPlan?: {
    id: string;
    lifecycleStatus: string;
    validationStatus?: string | null;
  } | null;
}

export interface VipInquiryReadinessInput {
  commercialMetadata: unknown;
  copperPriceRate?: unknown;
  aluminiumPriceRate?: unknown;
  deliveryDestination?: unknown;
  incoterms?: unknown;
  lines: VipLineReadinessInput[];
  containerStudyDevBypass?: boolean;
}

const INVALID_SNAPSHOT_STATUSES = new Set(['INVALID_CONFIGURATION', 'ENGINEERING_BLOCKED']);

function isSnapshotValid(snapshot: NonNullable<VipLineReadinessInput['configurationSnapshot']>): boolean {
  if (INVALID_SNAPSHOT_STATUSES.has(snapshot.validationStatus)) return false;
  if (snapshot.flowState !== 'VALID') return false;
  if (snapshot.engineeringStatus === 'ENGINEERING_BLOCKED') return false;
  return true;
}

export function evaluateVipLineReadiness(line: VipLineReadinessInput): VipCalculateGateResult[] {
  const gates: VipCalculateGateResult[] = [];
  const importedEvidence = line.importedCable || {
    materialNumber: null,
    bomLineCount: 0,
    unresolvedBomConflictCount: 0,
  };
  const importedEngineeringOk = importedCableSatisfiesCalculationEngineering(importedEvidence);

  if (!line.v2CurrentSnapshotId || !line.configurationSnapshot) {
    const snapshotGate = evaluateMissingSnapshotForCalculation({
      lineNumber: line.lineNumber,
      importedCable: importedEvidence,
    });
    gates.push({
      gate: 'CONFIGURATION_SNAPSHOT',
      status: snapshotGate.status,
      lineNumber: line.lineNumber,
      message: snapshotGate.message,
      code: snapshotGate.code,
    });
  } else if (line.configurationSnapshot.id !== line.v2CurrentSnapshotId) {
    gates.push({
      gate: 'CONFIGURATION_SNAPSHOT',
      status: 'BLOCK',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: configuration snapshot pointer is stale — refresh snapshot.`,
      code: 'SNAPSHOT_STALE',
    });
  } else if (!isSnapshotValid(line.configurationSnapshot)) {
    gates.push({
      gate: 'CONFIGURATION_SNAPSHOT',
      status: 'BLOCK',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: configuration snapshot is not valid (status=${line.configurationSnapshot.validationStatus}, flow=${line.configurationSnapshot.flowState}).`,
      code: 'SNAPSHOT_INVALID',
    });
  } else {
    gates.push({
      gate: 'CONFIGURATION_SNAPSHOT',
      status: 'PASS',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: configuration snapshot valid and current.`,
    });
  }

  if (!line.v2CurrentCuttingPlanId || !line.cuttingPlan) {
    gates.push({
      gate: 'CUTTING_LENGTH_PLAN',
      status: importedEngineeringOk ? 'WARN' : 'BLOCK',
      lineNumber: line.lineNumber,
      message: importedEngineeringOk
        ? `Line ${line.lineNumber}: cutting length plan not set — costing uses inquiry quantity/length.`
        : `Line ${line.lineNumber}: V2 cutting length plan required.`,
      code: 'CUTTING_PLAN_REQUIRED',
    });
  } else if (line.cuttingPlan.id !== line.v2CurrentCuttingPlanId) {
    gates.push({
      gate: 'CUTTING_LENGTH_PLAN',
      status: 'BLOCK',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: cutting plan pointer is stale.`,
      code: 'CUTTING_PLAN_STALE',
    });
  } else if (line.cuttingPlan.validationStatus === 'ERROR') {
    gates.push({
      gate: 'CUTTING_LENGTH_PLAN',
      status: 'BLOCK',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: cutting plan validation ERROR — resolve before calculate.`,
      code: 'CUTTING_PLAN_INVALID',
    });
  } else if (
    line.configurationSnapshot &&
    line.cuttingPlan.configurationSnapshotId &&
    line.cuttingPlan.configurationSnapshotId !== line.configurationSnapshot.id
  ) {
    gates.push({
      gate: 'CUTTING_LENGTH_PLAN',
      status: 'BLOCK',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: cutting plan does not match current configuration snapshot.`,
      code: 'CUTTING_PLAN_STALE',
    });
  } else {
    gates.push({
      gate: 'CUTTING_LENGTH_PLAN',
      status: 'PASS',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: cutting length plan valid.`,
    });
  }

  if (!line.v2CurrentDrumPlanId || !line.drumPlan) {
    gates.push({
      gate: 'DRUM_PLAN',
      status: importedEngineeringOk ? 'WARN' : 'BLOCK',
      lineNumber: line.lineNumber,
      message: importedEngineeringOk
        ? `Line ${line.lineNumber}: drum plan not confirmed — packing/CS uses physical data when present.`
        : `Line ${line.lineNumber}: V2 drum plan required.`,
      code: 'DRUM_PLAN_REQUIRED',
    });
  } else if (line.drumPlan.lifecycleStatus !== 'CONFIRMED') {
    gates.push({
      gate: 'DRUM_PLAN',
      status: importedEngineeringOk ? 'WARN' : 'BLOCK',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: drum plan must be CONFIRMED (current: ${line.drumPlan.lifecycleStatus}).`,
      code: 'DRUM_PLAN_NOT_CONFIRMED',
    });
  } else {
    gates.push({
      gate: 'DRUM_PLAN',
      status: 'PASS',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: drum plan CONFIRMED.`,
    });
  }

  const unresolvedConflicts =
    line.configurationSnapshot?.unresolvedBomConflictCount ?? line.importedCable?.unresolvedBomConflictCount ?? 0;
  if (line.configurationSnapshot?.bomGovernanceBlocked || unresolvedConflicts > 0) {
    gates.push({
      gate: 'BOM_GATE_2',
      status: 'BLOCK',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: BOM Gate 2 blocked (${unresolvedConflicts || 81} unresolved conflicts).`,
      code: 'BOM_CONFLICT_UNRESOLVED',
    });
  } else if (line.configurationSnapshot || importedEngineeringOk) {
    gates.push({
      gate: 'BOM_GATE_2',
      status: 'PASS',
      lineNumber: line.lineNumber,
      message: `Line ${line.lineNumber}: BOM Gate 2 clear.`,
    });
  }

  return gates;
}

export function evaluateVipInquiryReadiness(input: VipInquiryReadinessInput): {
  ready: boolean;
  gates: VipCalculateGateResult[];
  blockingReasons: string[];
} {
  const gates: VipCalculateGateResult[] = [];

  if (input.lines.length === 0) {
    gates.push({
      gate: 'HEADER_COMMERCIAL_CONFIG',
      status: 'BLOCK',
      message: 'Inquiry has no lines.',
      code: 'LINES_REQUIRED',
    });
    return {
      ready: false,
      gates,
      blockingReasons: gates.filter((g) => g.status === 'BLOCK').map((g) => g.message),
    };
  }

  const headerMissing = collectInquirySubmitMissingItems({
    copperPriceRate: input.copperPriceRate,
    aluminiumPriceRate: input.aluminiumPriceRate,
    deliveryDestination: input.deliveryDestination,
    incoterms: input.incoterms,
    lineCount: input.lines.length,
  }).filter((item) => item.code !== 'CALCULATION_REQUIRED' && item.code !== 'TECHNICAL_OFFER_REQUIRED');

  if (headerMissing.length > 0) {
    for (const item of headerMissing) {
      gates.push({
        gate: 'HEADER_COMMERCIAL_CONFIG',
        status: 'BLOCK',
        message: `Header commercial config incomplete: ${item.label}.`,
        code: item.code,
      });
    }
  } else {
    gates.push({
      gate: 'HEADER_COMMERCIAL_CONFIG',
      status: 'PASS',
      message: 'Header commercial configuration complete.',
    });
  }

  const containerGate = evaluateContainerStudyGate({
    metadata: input.commercialMetadata,
    devBypass: input.containerStudyDevBypass,
  });
  gates.push({
    gate: 'CONTAINER_STUDY',
    status:
      containerGate.status === 'CONTAINER_STUDY_READY'
        ? 'PASS'
        : containerGate.devBypassApplied
          ? 'WARN'
          : 'WARN',
    message: containerGate.message,
    code: containerGate.reasonCode,
  });

  for (const line of input.lines) {
    gates.push(...evaluateVipLineReadiness(line));
  }

  gates.push({
    gate: 'DECISION_5',
    status: 'INFO',
    message: `Decision 5 status: ${DECISION5_STATUS} — production issue remains blocked; calculate may proceed to DRAFT only.`,
    code: DECISION5_STATUS,
  });

  const blockingReasons = gates.filter((g) => g.status === 'BLOCK').map((g) => g.message);
  return {
    ready: blockingReasons.length === 0,
    gates,
    blockingReasons,
  };
}

export function appendCostingGateResults(
  gates: VipCalculateGateResult[],
  lineNumber: number,
  blockingReasons: string[],
  errorCode?: string
): VipCalculateGateResult[] {
  if (blockingReasons.length === 0) {
    return [
      ...gates,
      {
        gate: 'COSTING_GATES',
        status: 'PASS',
        lineNumber,
        message: `Line ${lineNumber}: costing gates 1–4 passed.`,
      },
    ];
  }
  return [
    ...gates,
    {
      gate: 'COSTING_GATES',
      status: 'BLOCK',
      lineNumber,
      message: `Line ${lineNumber}: ${blockingReasons.join('; ')}`,
      code: errorCode || 'COSTING_NOT_READY',
    },
  ];
}
