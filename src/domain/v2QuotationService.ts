/**
 * V2 quotation domain — readiness gates, offer snapshot builders, validity (Task 05F).
 * Never imports costingEngine; reads frozen upstream snapshots only.
 */

import { DECISION5_STATUS, V2_COSTING_WORKFLOW_CHANNEL } from './v2CostingRequestService';
import { lineHasRequiredTechnicalOffer, type InquiryLineAttachmentSummary } from './inquiryLineAttachments';
import type { DrumPlanHandoffDto } from './v2DrumPlanService';
import {
  evaluateMissingSnapshotForCalculation,
  importedCableSatisfiesCalculationEngineering,
} from './importedCableCalculationAuthority';

export const V2_QUOTATION_WORKFLOW_CHANNEL = V2_COSTING_WORKFLOW_CHANNEL;

export type QuotationGateStage =
  | 'CREATE_DRAFT'
  | 'PRICE'
  | 'READY_FOR_APPROVAL'
  | 'APPROVE'
  | 'ISSUE';

export interface V2LineReadinessInput {
  lineId: string;
  lineNumber: number;
  lineStatus?: string | null;
  materialNumber?: string | null;
  importedCable?: import('./importedCableCalculationAuthority').ImportedCableCalculationEvidence | null;
  configurationSnapshot?: {
    id: string;
    snapshotId: string;
    versionNo: number;
    validationStatus: string;
    engineeringStatus?: string | null;
    bomGovernanceBlocked: boolean;
    unresolvedBomConflictCount?: number;
    cableMaterialNumber?: string | null;
    summaryDescription?: string | null;
    selections?: unknown;
    estimatedDiameterMm?: number | null;
    estimatedWeightKgKm?: number | null;
  } | null;
  cuttingPlan?: {
    id: string;
    planId: string;
    versionNo: number;
    nominalLengthM?: number | null;
  } | null;
  drumPlan?: {
    id: string;
    planId: string;
    versionNo: number;
    lifecycleStatus: string;
    validationStatus?: string | null;
  } | null;
  handoff?: DrumPlanHandoffDto | null;
  costingCalculation?: {
    id: string;
    calculationNumber?: string | null;
    status: string;
    workflowChannel?: string | null;
  } | null;
  costingRun?: {
    id: string;
    materialCost?: unknown;
  } | null;
  pricingSnapshot?: {
    id: string;
    pricingStatus: string;
    finalSellingPrice?: unknown;
  } | null;
  attachments?: InquiryLineAttachmentSummary[];
}

export interface QuotationReadinessResult {
  ready: boolean;
  stage: QuotationGateStage;
  blockingReasons: string[];
  warnings: string[];
  decision5Status: string;
}

export function getDefaultQuotationValidityDays(): number {
  const raw = process.env.V2_QUOTATION_VALIDITY_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : 30;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function calculateValidUntil(from: Date, validityDays?: number): Date {
  const days = validityDays ?? getDefaultQuotationValidityDays();
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

function pushBomBlock(input: V2LineReadinessInput, stage: QuotationGateStage, blocking: string[]) {
  if (!input.configurationSnapshot) return;
  if (
    input.configurationSnapshot.bomGovernanceBlocked &&
    (stage === 'PRICE' || stage === 'READY_FOR_APPROVAL' || stage === 'APPROVE' || stage === 'ISSUE')
  ) {
    const count = input.configurationSnapshot.unresolvedBomConflictCount ?? 81;
    blocking.push(`Line ${input.lineNumber}: BOM Gate 2 blocked (${count} unresolved conflicts).`);
  }
}

export type QuotationReadinessOptions = {
  /** True only when a recorded Decision 5 Option B / LME-base sign-off exists. Default unsigned. */
  decision5Signed?: boolean;
};

function pushDecision5Block(stage: QuotationGateStage, blocking: string[], decision5Signed = false) {
  if (stage === 'ISSUE' && !decision5Signed) {
    blocking.push('Decision 5 unsigned — production issue blocked (Option B / LME-base only).');
  }
}

function decision5StatusLabel(decision5Signed: boolean): string {
  return decision5Signed ? 'SIGNED' : DECISION5_STATUS;
}

export function evaluateLineQuotationReadiness(
  input: V2LineReadinessInput,
  stage: QuotationGateStage,
  options?: QuotationReadinessOptions
): QuotationReadinessResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  const importedOk = importedCableSatisfiesCalculationEngineering(
    input.importedCable || {
      materialNumber: input.materialNumber || null,
      bomLineCount: 0,
      unresolvedBomConflictCount: 0,
    }
  );

  if (!input.configurationSnapshot) {
    const snapshotGate = evaluateMissingSnapshotForCalculation({
      lineNumber: input.lineNumber,
      importedCable: input.importedCable || {
        materialNumber: input.materialNumber || null,
        bomLineCount: 0,
        unresolvedBomConflictCount: 0,
      },
    });
    if (snapshotGate.status === 'BLOCK') {
      blockingReasons.push(snapshotGate.message);
    }
  } else {
    if (input.configurationSnapshot.engineeringStatus === 'ENGINEERING_BLOCKED') {
      blockingReasons.push(`Line ${input.lineNumber}: engineering status is ENGINEERING_BLOCKED.`);
    }
    if (input.configurationSnapshot.bomGovernanceBlocked && stage === 'CREATE_DRAFT') {
      warnings.push(`Line ${input.lineNumber}: BOM Gate 2 has open conflicts (quotation issue will be blocked).`);
    }
    pushBomBlock(input, stage, blockingReasons);
  }

  if (!input.cuttingPlan && stage !== 'CREATE_DRAFT' && !(importedOk && stage !== 'ISSUE')) {
    blockingReasons.push(`Line ${input.lineNumber}: cutting length plan required.`);
  }

  if (stage !== 'CREATE_DRAFT' && !(importedOk && stage !== 'ISSUE')) {
    if (!input.drumPlan || input.drumPlan.lifecycleStatus !== 'CONFIRMED') {
      blockingReasons.push(`Line ${input.lineNumber}: CONFIRMED drum plan required.`);
    }
  } else if (!input.drumPlan) {
    warnings.push(`Line ${input.lineNumber}: drum plan not yet created.`);
  }

  if (stage === 'PRICE' || stage === 'READY_FOR_APPROVAL' || stage === 'APPROVE' || stage === 'ISSUE') {
    const v2Costing =
      input.costingCalculation && input.costingCalculation.workflowChannel === V2_QUOTATION_WORKFLOW_CHANNEL;
    if (!v2Costing && !(importedOk && input.costingRun)) {
      blockingReasons.push(`Line ${input.lineNumber}: persisted V2 costing calculation required.`);
    } else if (v2Costing && input.costingCalculation && input.costingCalculation.status !== 'LOCKED') {
      blockingReasons.push(`Line ${input.lineNumber}: costing calculation must be LOCKED.`);
    }
    const matCost = Number(input.costingRun?.materialCost ?? 0);
    if (!Number.isFinite(matCost) || matCost <= 0) {
      blockingReasons.push(`Line ${input.lineNumber}: material cost must be greater than zero.`);
    }
  }

  if (stage === 'READY_FOR_APPROVAL' || stage === 'APPROVE' || stage === 'ISSUE') {
    if (!lineHasRequiredTechnicalOffer(input.attachments)) {
      blockingReasons.push(`Line ${input.lineNumber}: technical offer attachment required.`);
    }
    if (!input.pricingSnapshot) {
      blockingReasons.push(`Line ${input.lineNumber}: commercial pricing snapshot required.`);
    } else if (
      stage === 'APPROVE' ||
      stage === 'ISSUE'
    ) {
      if (input.pricingSnapshot.pricingStatus !== 'PRICING_APPROVED' && stage === 'ISSUE') {
        blockingReasons.push(`Line ${input.lineNumber}: pricing must be PRICING_APPROVED before issue.`);
      }
    }
  }

  const decision5Signed = options?.decision5Signed === true;
  if (stage === 'ISSUE') {
    pushDecision5Block(stage, blockingReasons, decision5Signed);
    if (!input.handoff) {
      blockingReasons.push(`Line ${input.lineNumber}: drum plan handoff snapshot required for issue.`);
    }
  }

  return {
    ready: blockingReasons.length === 0,
    stage,
    blockingReasons,
    warnings,
    decision5Status: decision5StatusLabel(decision5Signed),
  };
}

export function evaluateQuotationReadiness(
  lines: V2LineReadinessInput[],
  stage: QuotationGateStage,
  options?: QuotationReadinessOptions
): QuotationReadinessResult {
  const decision5Signed = options?.decision5Signed === true;
  if (lines.length === 0) {
    return {
      ready: false,
      stage,
      blockingReasons: ['Inquiry has no lines.'],
      warnings: [],
      decision5Status: decision5StatusLabel(decision5Signed),
    };
  }
  const results = lines.map((l) => evaluateLineQuotationReadiness(l, stage, options));
  const blockingReasons = results.flatMap((r) => r.blockingReasons);
  const warnings = results.flatMap((r) => r.warnings);
  if (stage === 'ISSUE') {
    pushDecision5Block(stage, blockingReasons, decision5Signed);
  }
  return {
    ready: blockingReasons.length === 0,
    stage,
    blockingReasons,
    warnings,
    decision5Status: decision5StatusLabel(decision5Signed),
  };
}

export function buildTechnicalSummarySnapshot(input: {
  configurationSnapshot: NonNullable<V2LineReadinessInput['configurationSnapshot']>;
  handoff: DrumPlanHandoffDto;
  cuttingPlan?: V2LineReadinessInput['cuttingPlan'];
}) {
  return {
    cableMaterialNumber: input.configurationSnapshot.cableMaterialNumber,
    summaryDescription: input.configurationSnapshot.summaryDescription,
    selections: input.configurationSnapshot.selections,
    estimatedDiameterMm: input.configurationSnapshot.estimatedDiameterMm,
    estimatedWeightKgKm: input.configurationSnapshot.estimatedWeightKgKm,
    configurationSnapshotId: input.configurationSnapshot.id,
    configurationSnapshotIdString: input.configurationSnapshot.snapshotId,
    configurationVersionNo: input.configurationSnapshot.versionNo,
    cuttingLengthM: input.cuttingPlan?.nominalLengthM ?? input.handoff.lines[0]?.cuttingLengthM,
    cuttingPlanId: input.cuttingPlan?.id,
    cuttingPlanIdString: input.cuttingPlan?.planId,
    totalPlannedLengthM: input.handoff.totalPlannedLengthM,
    drumCount: input.handoff.lines?.length ?? 0,
  };
}

export function buildLineageSnapshot(input: {
  configurationSnapshot: NonNullable<V2LineReadinessInput['configurationSnapshot']>;
  cuttingPlan?: V2LineReadinessInput['cuttingPlan'];
  handoff: DrumPlanHandoffDto;
  costingCalculation: NonNullable<V2LineReadinessInput['costingCalculation']>;
  costingRun: NonNullable<V2LineReadinessInput['costingRun']>;
  pricingSnapshot?: V2LineReadinessInput['pricingSnapshot'];
}) {
  return {
    workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
    configurationSnapshotId: input.configurationSnapshot.id,
    configurationSnapshotIdString: input.configurationSnapshot.snapshotId,
    cuttingLengthPlanId: input.cuttingPlan?.id,
    cuttingLengthPlanIdString: input.cuttingPlan?.planId,
    drumPlanId: input.handoff.drumPlanId,
    drumPlanIdString: input.handoff.drumPlanIdString,
    drumPlanVersionNo: input.handoff.drumPlanVersionNo,
    costingCalculationId: input.costingCalculation.id,
    costingCalculationNumber: input.costingCalculation.calculationNumber,
    costingRunId: input.costingRun.id,
    pricingSnapshotId: input.pricingSnapshot?.id,
    decision5Status: DECISION5_STATUS,
  };
}

export function buildInquiryHeaderSnapshot(inquiry: {
  inquiryNumber: string;
  versionNo: number;
  currency: string;
  incoterms?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  copperPriceRate?: unknown;
  aluminiumPriceRate?: unknown;
  commercialMetadata?: unknown;
}) {
  const meta =
    inquiry.commercialMetadata && typeof inquiry.commercialMetadata === 'object'
      ? (inquiry.commercialMetadata as Record<string, unknown>)
      : {};
  return {
    inquiryNumber: inquiry.inquiryNumber,
    inquiryVersionNo: inquiry.versionNo,
    currency: inquiry.currency,
    incoterms: inquiry.incoterms,
    paymentTerms: inquiry.paymentTerms,
    deliveryTerms: inquiry.deliveryTerms,
    copperPriceRate: inquiry.copperPriceRate ?? meta.copperPriceRate,
    aluminiumPriceRate: inquiry.aluminiumPriceRate ?? meta.aluminiumPriceRate,
    metalRateSources: meta.metalRateSources ?? 'INQUIRY_SYSTEM_DEFAULT',
    capturedAt: new Date().toISOString(),
  };
}

export function buildTechnicalOfferSnapshot(
  lines: Array<{
    lineNumber: number;
    itemDescription: string;
    technicalSummarySnapshot: unknown;
    drumPlanLinesSnapshot: unknown;
    technicalOfferAttachmentIds: unknown;
    plannedLengthM?: unknown;
    drumCount?: number | null;
  }>
) {
  return {
    generatedAt: new Date().toISOString(),
    lines,
  };
}

export function buildCommercialOfferSnapshot(quotation: {
  quotationNumber: string;
  versionNo: number;
  currency: string;
  validUntil?: Date | null;
  validityDays?: number | null;
  incoterms?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  sellingPrice?: unknown;
  lines: Array<{
    lineNumber: number;
    itemDescription: string;
    quantity: unknown;
    quantityUom: string;
    plannedLengthM?: unknown;
    unitSellingPrice?: unknown;
    finalSellingPrice?: unknown;
    materialNumber?: string | null;
  }>;
}) {
  return {
    quotationNumber: quotation.quotationNumber,
    versionNo: quotation.versionNo,
    currency: quotation.currency,
    validUntil: quotation.validUntil?.toISOString() ?? null,
    validityDays: quotation.validityDays,
    incoterms: quotation.incoterms,
    paymentTerms: quotation.paymentTerms,
    deliveryTerms: quotation.deliveryTerms,
    totalSellingPrice: quotation.sellingPrice,
    generatedAt: new Date().toISOString(),
    lines: quotation.lines,
  };
}

export function isQuotationIssued(quotation: { issuedAt?: Date | null }): boolean {
  return quotation.issuedAt != null;
}
