/**
 * V2 commercial pricing boundary — reads frozen engineering materialCost; never recalculates Direct RM.
 */

import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { loadV2InquiryScoped } from './v2InquiryConfigurationRepository';
import {
  calculateCommercialSellingPrice,
  type PricingResolutionRequest,
} from '../domain/commercialPricingEngine';
import {
  DECISION5_STATUS,
  V2_COSTING_WORKFLOW_CHANNEL,
} from '../domain/v2CostingRequestService';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export interface V2CommercialPricingPreview {
  materialCost: number;
  costingCurrency: string;
  pricingCurrency: string;
  finalSellingPrice: number | null;
  baseSellingPrice: number | null;
  unitSellingPrice: number | null;
  pricingStatus: string;
  blockingReasons: string[];
  errorCode?: string;
  costingRunId: string | null;
  costingCalculationId: string | null;
  drumPlanId: string | null;
  decision5Status: string;
  boundaryNote: string;
}

export async function previewV2CommercialPricing(
  inquiryId: string,
  lineId: string,
  actor: RequestActor,
  options?: { pricingCurrency?: string; requestedDiscountPercentage?: number }
): Promise<V2CommercialPricingPreview> {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const prisma = requirePrisma();
  const calculation = await prisma.costingCalculation.findFirst({
    where: {
      inquiryLineId: line.id,
      workflowChannel: V2_COSTING_WORKFLOW_CHANNEL,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!calculation || !line.costingRunId) {
    const err = new Error('V2 commercial pricing requires a persisted V2 costing run.');
    (err as Error & { code: string }).code = 'COSTING_REQUIRED';
    throw err;
  }

  const run = await prisma.costingRun.findUnique({ where: { id: line.costingRunId } });
  const materialCost = Number(run?.materialCost ?? line.materialCost ?? 0);
  const costingCurrency = run?.currency ?? line.materialCostCurrency ?? inquiry.currency;
  const pricingCurrency = (options?.pricingCurrency || inquiry.currency).toUpperCase();

  const pricingRules = await prisma.commercialPricingRule.findMany({
    where: { isCurrent: true, workflowStatus: 'APPROVED' },
  });

  const request: PricingResolutionRequest = {
    materialCost,
    currency: pricingCurrency,
    materialNumber: line.materialNumber || undefined,
    customerId: inquiry.customerMasterId || inquiry.customerId,
    pricingDate: inquiry.inquiryDate,
    quantity: Number(line.requestedQuantity),
    lengthMeters: Number(run?.lengthMeters ?? line.requestedLengthMeters),
    requestedDiscountPercentage: options?.requestedDiscountPercentage,
  };

  const result = calculateCommercialSellingPrice(request, {
    approvedPricingRules: pricingRules.map((r) => ({
      id: r.id,
      ruleCode: r.ruleCode,
      ruleName: r.ruleName,
      scope: r.scope,
      ruleType: r.ruleType,
      customerId: r.customerId,
      customerTierCode: r.customerTierCode,
      cableMaterialNumber: r.cableMaterialNumber,
      percentageValue: Number(r.percentageValue),
      currency: r.currency,
      priority: r.priority,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      workflowStatus: r.workflowStatus,
      isCurrent: r.isCurrent,
      revision: r.revision,
      minMarginThreshold: r.minMarginThreshold != null ? Number(r.minMarginThreshold) : null,
      maxDiscountAllowed: r.maxDiscountAllowed != null ? Number(r.maxDiscountAllowed) : null,
    })),
  });

  const preview: V2CommercialPricingPreview = {
    materialCost,
    costingCurrency,
    pricingCurrency,
    finalSellingPrice: result.success ? result.finalSellingPrice : null,
    baseSellingPrice: result.success ? result.baseSellingPrice : null,
    unitSellingPrice: result.success ? result.unitSellingPrice : null,
    pricingStatus: result.pricingStatus,
    blockingReasons: result.blockingReasons,
    errorCode: result.errorCode,
    costingRunId: line.costingRunId,
    costingCalculationId: calculation.id,
    drumPlanId: calculation.drumPlanId,
    decision5Status: DECISION5_STATUS,
    boundaryNote:
      'Commercial pricing consumes frozen engineering materialCost only — Direct RM is never recalculated here.',
  };

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'V2CommercialPricing',
    entityId: calculation.calculationNumber,
    action: result.success ? 'PREVIEW' : 'PREVIEW_BLOCKED',
    newValue: {
      materialCost,
      costingCurrency,
      pricingCurrency,
      finalSellingPrice: preview.finalSellingPrice,
      blockingReasons: preview.blockingReasons,
    },
    message: `V2 commercial pricing preview for ${inquiry.inquiryNumber} line ${line.lineNumber}`,
  });

  return preview;
}
