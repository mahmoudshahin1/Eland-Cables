/**
 * V2 costing request builder — consumes DrumPlanHandoffDto only (Task 05E).
 * No drum optimization or duplicate drum math in costing.
 */

import type { DrumPlanHandoffDto } from './v2DrumPlanService';
import {
  buildLayerInputsFromCommercialMetadata,
  mergeInquiryHeaderIntoCommercialMetadata,
  normalizeCostingDate,
  type InquiryHeaderCostingContext,
  type StructuredCostingRequest,
} from '../services/costingRequestService';

export const V2_COSTING_WORKFLOW_CHANNEL = 'V2_CONFIGURATION';

/** Decision 5 remains OPEN — Option B (LME/base only) per costingEngine freeze. */
export const DECISION5_STATUS = 'PENDING_BUSINESS_SIGN_OFF';

export interface V2CostingLineageStamp {
  configurationSnapshotId: string;
  configurationSnapshotIdString: string;
  cuttingLengthPlanId: string;
  cuttingLengthPlanIdString: string;
  drumPlanId: string;
  drumPlanIdString: string;
  drumPlanVersionNo: number;
  workflowChannel: typeof V2_COSTING_WORKFLOW_CHANNEL;
  v2Handoff: DrumPlanHandoffDto;
}

export function buildV2LineageStamp(handoff: DrumPlanHandoffDto): V2CostingLineageStamp {
  return {
    configurationSnapshotId: handoff.configurationSnapshotId,
    configurationSnapshotIdString: handoff.configurationSnapshotIdString,
    cuttingLengthPlanId: handoff.cuttingLengthPlanId,
    cuttingLengthPlanIdString: handoff.cuttingLengthPlanIdString,
    drumPlanId: handoff.drumPlanId,
    drumPlanIdString: handoff.drumPlanIdString,
    drumPlanVersionNo: handoff.drumPlanVersionNo,
    workflowChannel: V2_COSTING_WORKFLOW_CHANNEL,
    v2Handoff: handoff,
  };
}

export function extractPriceIdMap(result: {
  materialBreakdown: Array<{ rawMaterialCode: string; priceId?: string }>;
}): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of result.materialBreakdown) {
    if (line.priceId) {
      map[line.rawMaterialCode] = line.priceId;
    }
  }
  return map;
}

export function buildV2CostingRequestFromHandoff(
  handoff: DrumPlanHandoffDto,
  header: InquiryHeaderCostingContext,
  lineQuantity: number,
  options?: { configurationVersionId?: string; previewOnly?: boolean; inquiryLineId?: string }
): StructuredCostingRequest | { error: string } {
  if (handoff.lifecycleStatus !== 'CONFIRMED') {
    return { error: 'Drum plan must be CONFIRMED before V2 costing can run.' };
  }
  if (!handoff.cableMaterialNumber?.trim()) {
    return { error: 'Drum plan handoff has no cable material number.' };
  }
  if (!Number.isFinite(handoff.totalPlannedLengthM) || handoff.totalPlannedLengthM <= 0) {
    return { error: 'Drum plan handoff totalPlannedLengthM must be greater than zero.' };
  }
  const quantity = Number(lineQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be greater than zero.' };
  }

  const commercialMetadata = mergeInquiryHeaderIntoCommercialMetadata(header) || {};
  commercialMetadata.workflowChannel = V2_COSTING_WORKFLOW_CHANNEL;
  commercialMetadata.v2DrumPlanId = handoff.drumPlanId;
  commercialMetadata.v2DrumPlanVersionNo = handoff.drumPlanVersionNo;
  commercialMetadata.drumHandoffLines = handoff.lines.map((l) => ({
    drumCode: l.drumCode,
    numberOfDrums: l.numberOfDrums,
    cuttingLengthM: l.cuttingLengthM,
    plannedCableLengthM: l.plannedCableLengthM,
  }));

  return {
    materialNumber: handoff.cableMaterialNumber.trim(),
    costingDate: normalizeCostingDate(header.inquiryDate),
    quantity,
    lengthMeters: handoff.totalPlannedLengthM,
    currency: (header.currency || 'USD').toUpperCase(),
    configurationVersionId: options?.configurationVersionId,
    inquiryLineId: options?.inquiryLineId,
    commercialMetadata,
    layerInputs: buildLayerInputsFromCommercialMetadata(commercialMetadata),
    previewOnly: options?.previewOnly ?? true,
  };
}
