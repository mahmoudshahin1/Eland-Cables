/**
 * V2 costing orchestration — builds input from DrumPlanHandoffDto, delegates to costingEngine via orchestrator.
 */

import type { DrumPlanHandoffDto } from './v2DrumPlanService';
import {
  buildV2CostingRequestFromHandoff,
  buildV2LineageStamp,
  DECISION5_STATUS,
  V2_COSTING_WORKFLOW_CHANNEL,
  type V2CostingLineageStamp,
} from './v2CostingRequestService';
import type { InquiryHeaderCostingContext } from '../services/costingRequestService';
import {
  executeCostingForInquiryLine,
  type InquiryLineCostingResult,
} from '../server/costingOrchestrationService';
import type { RequestActor } from '../server/auth';

export interface V2CostingRunOptions {
  persist: boolean;
  inquiryId: string;
  inquiryLineId: string;
  handoff: DrumPlanHandoffDto;
  header: InquiryHeaderCostingContext;
  lineQuantity: number;
  containerStudyResultId?: string | null;
}

export interface V2CostingLineageAnswer {
  inquiryLineId: string;
  configurationSnapshotId: string;
  configurationSnapshotIdString: string;
  cuttingLengthPlanId: string;
  cuttingLengthPlanIdString: string;
  drumPlanId: string;
  drumPlanIdString: string;
  drumPlanVersionNo: number;
  bomVersion: number | null;
  engineeringRevision: number | null;
  workflowChannel: string;
  decision5Status: string;
  governedBomLineIds?: string[];
  rawMaterialPriceIds?: Record<string, string>;
  metalPricingSnapshot?: unknown;
}

export type { V2CostingLineageStamp } from './v2CostingRequestService';
export { buildV2LineageStamp, extractPriceIdMap } from './v2CostingRequestService';

export function mapV2CostingResponse(
  result: InquiryLineCostingResult,
  lineage: V2CostingLineageStamp,
  referenceSnapshot?: Record<string, unknown> | null
): {
  calculationId?: string;
  costingRunId?: string;
  calculationNumber?: string;
  costingRunNumber?: string;
  materialCost: number;
  currency: string;
  status: 'READY' | 'NOT_READY';
  blockingReasons: string[];
  errorCode?: string;
  persisted: boolean;
  decision5Status: string;
  containerStudyResultId?: string | null;
  lineage: V2CostingLineageAnswer;
} {
  const materialCost = Number(result.totals.materialCost) || 0;
  const ref = (referenceSnapshot || {}) as Record<string, unknown>;
  return {
    calculationId: result.calculationId,
    costingRunId: result.costingRunId,
    materialCost,
    currency: result.currency,
    status: result.status,
    blockingReasons: result.blockingReasons,
    errorCode: result.errorCode,
    persisted: result.persisted,
    decision5Status: DECISION5_STATUS,
    containerStudyResultId: result.containerStudyResultId ?? (ref.containerStudyResultId as string | null | undefined) ?? null,
    lineage: {
      inquiryLineId: lineage.v2Handoff.inquiryLineId,
      configurationSnapshotId: lineage.configurationSnapshotId,
      configurationSnapshotIdString: lineage.configurationSnapshotIdString,
      cuttingLengthPlanId: lineage.cuttingLengthPlanId,
      cuttingLengthPlanIdString: lineage.cuttingLengthPlanIdString,
      drumPlanId: lineage.drumPlanId,
      drumPlanIdString: lineage.drumPlanIdString,
      drumPlanVersionNo: lineage.drumPlanVersionNo,
      bomVersion: (ref.bomVersion as number) ?? result.bomVersion ?? null,
      engineeringRevision: (ref.engineeringRevision as number) ?? result.engineeringRevision ?? null,
      workflowChannel: lineage.workflowChannel,
      decision5Status: DECISION5_STATUS,
      governedBomLineIds: ref.governedBomLineIds as string[] | undefined,
      rawMaterialPriceIds: ref.rawMaterialPriceIds as Record<string, string> | undefined,
      metalPricingSnapshot: ref.marketMetalSnapshot,
    },
  };
}

export async function runV2CostingForLine(
  options: V2CostingRunOptions,
  actor: RequestActor
): Promise<InquiryLineCostingResult & { lineage: V2CostingLineageStamp }> {
  const request = buildV2CostingRequestFromHandoff(
    options.handoff,
    options.header,
    options.lineQuantity,
    {
      previewOnly: !options.persist,
      inquiryLineId: options.inquiryLineId,
    }
  );
  if ('error' in request) {
    const err = new Error(request.error);
    (err as Error & { code: string; blockingReasons: string[] }).code = 'NOT_READY';
    (err as Error & { code: string; blockingReasons: string[] }).blockingReasons = [request.error];
    throw err;
  }

  const lineage = buildV2LineageStamp(options.handoff);
  const result = await executeCostingForInquiryLine(request, actor, {
    persist: options.persist,
    inquiryId: options.inquiryId,
    inquiryLineId: options.inquiryLineId,
    v2Lineage: lineage,
    containerStudyResultId: options.containerStudyResultId,
  });

  return { ...result, lineage };
}
