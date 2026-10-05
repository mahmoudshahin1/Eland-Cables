/**
 * V2 quotation persistence — create, price, approve, issue, revise (Task 05F).
 */

import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { allocateNextNumber } from './numberSequenceService';
import { loadV2InquiryScoped } from './v2InquiryConfigurationRepository';
import { getV2DrumPlanHandoff } from './v2DrumPlanRepository';
import { loadImportedCableCalculationEvidence } from './importedCableCalculationEvidence';
import { assertCanAccessInquiryOwnership, assertCanApproveQuotation, assertCanIssueQuotation, assertCanManageQuotations } from './rbac';
import { assertV2StatusTransition, isV2InquiryMetadata } from '../domain/v2InquiryWorkflow';
import {
  buildIssuedCommercialOfferDocument,
  conductorWeightsFromCostingOutput,
} from '../domain/commercialOfferDocument';
import { buildQuotationIssuedEmail, quotationPortalLink, runEmailWithoutRollback } from '../domain/quotationIssuedEmail';
import { attachShippingFacts } from '../domain/customerShippingCost';
import { formatDateOnlyUtc } from '../domain/shippingCostCanonical';
import { insertFrozenQuotationShippingSnapshot, shippingFactsToFreezeOnIssue } from './customerShippingCostRepository';
import { enqueueEmail, resolveNotificationRecipients } from './emailOutboxService';
import { loadDecision5SignOff } from './decision5SignOff';
import {
  buildInquiryHeaderSnapshot,
  buildLineageSnapshot,
  buildTechnicalOfferSnapshot,
  buildTechnicalSummarySnapshot,
  calculateValidUntil,
  evaluateQuotationReadiness,
  getDefaultQuotationValidityDays,
  isQuotationIssued,
  type V2LineReadinessInput,
  V2_QUOTATION_WORKFLOW_CHANNEL,
} from '../domain/v2QuotationService';
import { calculateCommercialSellingPrice } from '../domain/commercialPricingEngine';
import { loadPricingResolutionContext, toStoredPricingRule } from './commercialPricingRepository';
import { V2_COSTING_WORKFLOW_CHANNEL } from '../domain/v2CostingRequestService';
import { evaluateMissingSnapshotForCalculation } from '../domain/importedCableCalculationAuthority';
import type { InquiryLineAttachmentSummary } from '../domain/inquiryLineAttachments';
import type { VipCalculateSnapshot } from '../domain/vipOptionalComponents';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function throwCode(message: string, code: string): never {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  throw err;
}

/** A copied line material cost is not a CostingRun. Refuse quotation create when the line claims one. */
function assertAuthoritativeCostingWhenClaimed(
  line: { lineNumber: number; costingRunId?: string | null; costingCalculationId?: string | null; materialCost?: unknown },
  readinessLine: V2LineReadinessInput
) {
  const copiedCost = line.materialCost == null ? 0 : Number(line.materialCost);
  const claimsLineage =
    Boolean(line.costingRunId) ||
    Boolean(line.costingCalculationId) ||
    (Number.isFinite(copiedCost) && copiedCost > 0);
  if (!claimsLineage) return;
  const gate = evaluateQuotationReadiness([readinessLine], 'PRICE');
  const lineage = gate.blockingReasons.filter(
    (reason) =>
      reason.includes('costing calculation') || reason.includes('material cost must be greater than zero')
  );
  if (lineage.length) throwCode(lineage.join('; '), 'QUOTATION_NOT_READY');
}

async function loadLineReadinessInputs(
  inquiryId: string,
  actor: RequestActor
): Promise<{ inquiry: Awaited<ReturnType<typeof loadV2InquiryScoped>>; lines: V2LineReadinessInput[] }> {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const prisma = requirePrisma();
  const lines: V2LineReadinessInput[] = [];

  for (const line of inquiry.lines) {
    const snapshot = line.v2CurrentSnapshotId
      ? await prisma.v2ConfigurationSnapshot.findUnique({ where: { id: line.v2CurrentSnapshotId } })
      : null;
    const cuttingPlan = line.v2CurrentCuttingPlanId
      ? await prisma.v2CuttingLengthPlan.findUnique({ where: { id: line.v2CurrentCuttingPlanId } })
      : null;
    const drumPlan = line.v2CurrentDrumPlanId
      ? await prisma.v2DrumPlan.findUnique({ where: { id: line.v2CurrentDrumPlanId } })
      : null;

    let handoff = null;
    if (drumPlan?.lifecycleStatus === 'CONFIRMED' && line.v2CurrentDrumPlanId) {
      try {
        handoff = await getV2DrumPlanHandoff(inquiry.id, line.id, line.v2CurrentDrumPlanId, actor);
      } catch {
        handoff = null;
      }
    }

    const calculation = await prisma.costingCalculation.findFirst({
      where: { inquiryLineId: line.id, workflowChannel: V2_COSTING_WORKFLOW_CHANNEL },
      orderBy: { createdAt: 'desc' },
    });
    const run = line.costingRunId
      ? await prisma.costingRun.findUnique({ where: { id: line.costingRunId } })
      : null;

    const quotationLine = await prisma.commercialQuotationLine.findFirst({
      where: { inquiryLineId: line.id, quotation: { inquiryId: inquiry.id, isCurrent: true, workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL } },
      include: { pricingSnapshot: true },
    });

    lines.push({
      lineId: line.id,
      lineNumber: line.lineNumber,
      lineStatus: line.status,
      materialNumber: line.materialNumber,
      importedCable: await loadImportedCableCalculationEvidence(line.materialNumber),
      configurationSnapshot: snapshot
        ? {
            id: snapshot.id,
            snapshotId: snapshot.snapshotId,
            versionNo: snapshot.versionNo,
            validationStatus: snapshot.validationStatus,
            engineeringStatus: snapshot.engineeringStatus,
            bomGovernanceBlocked: snapshot.bomGovernanceBlocked,
            unresolvedBomConflictCount: snapshot.unresolvedBomConflictCount,
            cableMaterialNumber: snapshot.cableMaterialNumber,
            summaryDescription: snapshot.summaryDescription,
            selections: snapshot.selections,
            estimatedDiameterMm: snapshot.estimatedDiameterMm != null ? Number(snapshot.estimatedDiameterMm) : null,
            estimatedWeightKgKm: snapshot.estimatedWeightKgKm != null ? Number(snapshot.estimatedWeightKgKm) : null,
          }
        : null,
      cuttingPlan: cuttingPlan
        ? {
            id: cuttingPlan.id,
            planId: cuttingPlan.planId,
            versionNo: cuttingPlan.versionNo,
            nominalLengthM: cuttingPlan.nominalLengthM != null ? Number(cuttingPlan.nominalLengthM) : null,
          }
        : null,
      drumPlan: drumPlan
        ? {
            id: drumPlan.id,
            planId: drumPlan.planId,
            versionNo: drumPlan.versionNo,
            lifecycleStatus: drumPlan.lifecycleStatus,
            validationStatus: drumPlan.validationStatus,
          }
        : null,
      handoff,
      costingCalculation: calculation
        ? {
            id: calculation.id,
            calculationNumber: calculation.calculationNumber,
            status: calculation.status,
            workflowChannel: calculation.workflowChannel,
          }
        : null,
      costingRun: run ? { id: run.id, materialCost: run.materialCost } : null,
      pricingSnapshot: quotationLine?.pricingSnapshot
        ? {
            id: quotationLine.pricingSnapshot.id,
            pricingStatus: quotationLine.pricingSnapshot.pricingStatus,
            finalSellingPrice: quotationLine.pricingSnapshot.finalSellingPrice,
          }
        : null,
      attachments: (line.attachments || []).map((a) => ({
        ...a,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      })) as InquiryLineAttachmentSummary[],
    });
  }

  return { inquiry, lines };
}

export async function getV2QuotationReadiness(
  inquiryId: string,
  actor: RequestActor,
  stage: 'CREATE_DRAFT' | 'PRICE' | 'READY_FOR_APPROVAL' | 'APPROVE' | 'ISSUE' = 'ISSUE'
) {
  const { lines } = await loadLineReadinessInputs(inquiryId, actor);
  const decision5Signed = stage === 'ISSUE' ? (await loadDecision5SignOff()).signed : false;
  return evaluateQuotationReadiness(lines, stage, { decision5Signed });
}

export async function getV2CurrentQuotation(inquiryId: string, actor: RequestActor) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const prisma = requirePrisma();
  const quotation = await prisma.commercialQuotation.findFirst({
    where: { inquiryId: inquiry.id, isCurrent: true, workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL },
    include: { lines: { include: { pricingSnapshot: true } }, inquiry: true },
    orderBy: { versionNo: 'desc' },
  });
  return quotation;
}

export async function createV2QuotationDraft(
  inquiryId: string,
  actor: RequestActor,
  options?: { validityDays?: number; vipOrchestratorBypassRbac?: boolean }
) {
  if (!options?.vipOrchestratorBypassRbac) {
    assertCanManageQuotations(actor);
  }
  const { inquiry, lines } = await loadLineReadinessInputs(inquiryId, actor);
  if (!isV2InquiryMetadata(inquiry.commercialMetadata)) {
    throwCode('Inquiry is not a V2 configuration workflow.', 'INVALID_STATE');
  }

  const readiness = evaluateQuotationReadiness(lines, 'CREATE_DRAFT');
  if (!readiness.ready) {
    throwCode(readiness.blockingReasons.join('; '), 'QUOTATION_NOT_READY');
  }

  const existing = await getV2CurrentQuotation(inquiry.id, actor);
  if (existing && !isQuotationIssued(existing)) {
    throwCode(
      `Draft quotation ${existing.quotationNumber} V${existing.versionNo} already exists.`,
      'CONFLICT'
    );
  }

  const prisma = requirePrisma();
  const allocated = await allocateNextNumber('QUO_COMMERCIAL', actor);
  const validityDays = options?.validityDays ?? getDefaultQuotationValidityDays();
  const validUntil = calculateValidUntil(new Date(), validityDays);

  let totalMaterialCost = 0;
  const lineCreates: Array<Record<string, unknown>> = [];

  for (const line of inquiry.lines) {
    const readinessLine = lines.find((l) => l.lineId === line.id);
    if (!readinessLine?.configurationSnapshot) {
      const snapshotGate = evaluateMissingSnapshotForCalculation({
        lineNumber: line.lineNumber,
        importedCable: readinessLine?.importedCable || {
          materialNumber: line.materialNumber,
          bomLineCount: 0,
          unresolvedBomConflictCount: 0,
        },
      });
      if (snapshotGate.status === 'BLOCK') {
        throwCode(snapshotGate.message, snapshotGate.code);
      }
    }

    const cfg = readinessLine!.configurationSnapshot;
    let handoff = readinessLine!.handoff;
    if (!handoff && line.v2CurrentDrumPlanId) {
      handoff = await getV2DrumPlanHandoff(inquiry.id, line.id, line.v2CurrentDrumPlanId, actor).catch(() => null);
    }

    const plannedLength =
      handoff?.totalPlannedLengthM ?? Number(line.requestedLengthMeters) ?? 1000;
    assertAuthoritativeCostingWhenClaimed(line, readinessLine!);
    const matCost = Number(readinessLine!.costingRun?.materialCost ?? 0);
    totalMaterialCost += matCost;

    lineCreates.push({
      lineNumber: line.lineNumber,
      inquiryLineId: line.id,
      materialNumber: cfg?.cableMaterialNumber || line.materialNumber,
      itemDescription: line.cableDescription,
      quantity: line.requestedQuantity,
      quantityUom: line.quantityUom,
      lengthMeters: plannedLength,
      plannedLengthM: handoff ? handoff.totalPlannedLengthM : null,
      customerCableCode: line.customerCode,
      cuttingLengthMeters:
        readinessLine!.cuttingPlan?.nominalLengthM ??
        handoff?.lines?.[0]?.cuttingLengthM ??
        line.cuttingLengthMeters,
      numberOfCuts: handoff?.lines?.length ?? null,
      drumCount: handoff?.lines?.length ?? null,
      costingRunId: line.costingRunId,
      costingCalculationId: readinessLine!.costingCalculation?.id ?? line.costingCalculationId,
      materialCost: matCost > 0 ? matCost : null,
      materialCostCurrency: line.materialCostCurrency || inquiry.currency,
      commercialStatus: matCost > 0 ? 'MATERIAL_COST_AVAILABLE' : 'MATERIAL_COST_NOT_READY',
      workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
      v2ConfigurationSnapshotId: cfg?.id ?? null,
      v2ConfigurationSnapshotIdString: cfg?.snapshotId ?? null,
      v2CuttingLengthPlanId: readinessLine!.cuttingPlan?.id,
      v2CuttingLengthPlanIdString: readinessLine!.cuttingPlan?.planId,
      v2DrumPlanId: handoff?.drumPlanId ?? line.v2CurrentDrumPlanId,
      v2DrumPlanVersionNo: handoff?.drumPlanVersionNo,
      v2DrumPlanIdString: handoff?.drumPlanIdString,
      technicalSummarySnapshot: asJson(
        handoff && cfg
          ? buildTechnicalSummarySnapshot({
              configurationSnapshot: cfg,
              handoff,
              cuttingPlan: readinessLine!.cuttingPlan,
            })
          : {
              cableMaterialNumber: cfg?.cableMaterialNumber || line.materialNumber,
              configurationSnapshotId: cfg?.id ?? null,
              configurationSnapshotIdString: cfg?.snapshotId ?? null,
              engineeringAuthority: cfg ? 'V2_CONFIGURATION_SNAPSHOT' : 'IMPORTED_CABLE_MASTER',
            }
      ),
      drumPlanLinesSnapshot: handoff?.lines ? asJson(handoff.lines) : undefined,
      lineageSnapshot:
        handoff && readinessLine!.costingCalculation && readinessLine!.costingRun
          ? asJson(
              buildLineageSnapshot({
                configurationSnapshot: cfg,
                cuttingPlan: readinessLine!.cuttingPlan,
                handoff,
                costingCalculation: readinessLine!.costingCalculation!,
                costingRun: readinessLine!.costingRun!,
              })
            )
          : undefined,
      notes: line.notes,
    });
  }

  const quotation = await prisma.commercialQuotation.create({
    data: {
      quotationNumber: allocated.value,
      inquiryId: inquiry.id,
      customerId: inquiry.customerId,
      customerMasterId: inquiry.customerMasterId,
      customerName: inquiry.customerName,
      contactPerson: inquiry.contactPerson,
      versionNo: 1,
      isCurrent: true,
      status: 'OPEN',
      workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
      currency: inquiry.currency,
      incoterms: inquiry.incoterms,
      paymentTerms: inquiry.paymentTerms,
      deliveryTerms: inquiry.deliveryTerms,
      validUntil,
      validityDays,
      inquiryVersionNo: inquiry.versionNo,
      inquirySnapshot: asJson(buildInquiryHeaderSnapshot(inquiry)),
      materialCostTotal: totalMaterialCost,
      commercialPricingStatus: 'NOT_CONFIGURED',
      technicalOfferStatus: 'NOT_READY',
      commercialOfferStatus: 'NOT_READY',
      quotationOwner: actor.name || actor.email || 'Sales',
      createdBy: actor.name || actor.email || 'user',
      lines: { create: lineCreates as Prisma.CommercialQuotationLineCreateWithoutQuotationInput[] },
    },
    include: { lines: true, inquiry: true },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
    action: 'CREATE',
    newValue: {
      workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
      inquiryNumber: inquiry.inquiryNumber,
      lineCount: lineCreates.length,
    },
    message: `Created V2 quotation draft ${quotation.quotationNumber} from ${inquiry.inquiryNumber}`,
  });

  return quotation;
}

export async function persistV2QuotationPricing(
  inquiryId: string,
  actor: RequestActor,
  options?: {
    requestedDiscountPercentage?: number;
    vipOrchestratorBypassRbac?: boolean;
    vipCalculateSnapshot?: VipCalculateSnapshot;
  }
) {
  if (!options?.vipOrchestratorBypassRbac) {
    assertCanManageQuotations(actor);
  }
  const quotation = await getV2CurrentQuotation(inquiryId, actor);
  if (!quotation) throwCode('No V2 quotation found for inquiry.', 'NOT_FOUND');
  if (isQuotationIssued(quotation)) {
    throwCode('Issued quotations are immutable.', 'BUSINESS_RULE_REQUIRED');
  }

  const { lines: readinessLines } = await loadLineReadinessInputs(inquiryId, actor);
  const readiness = evaluateQuotationReadiness(readinessLines, 'PRICE');
  if (!readiness.ready) {
    throwCode(readiness.blockingReasons.join('; '), 'QUOTATION_NOT_READY');
  }

  const prisma = requirePrisma();
  const pricingRules = await prisma.commercialPricingRule.findMany({
    where: { isCurrent: true, workflowStatus: 'APPROVED' },
  });
  const storedRules = pricingRules.map(toStoredPricingRule);

  let totalSelling = 0;
  let hasApprovalRequired = false;

  for (const line of quotation.lines) {
    const matCost = Number(line.materialCost ?? 0);
    if (matCost <= 0) throwCode(`Line ${line.lineNumber} has no material cost.`, 'PRICE_NOT_READY');

    const customerId = quotation.customerMasterId || quotation.customerId;
    const context = await loadPricingResolutionContext(customerId, line.materialNumber);
    const result = calculateCommercialSellingPrice(
      {
        materialCost: line.materialCost ?? matCost,
        currency: quotation.currency,
        materialNumber: line.materialNumber || undefined,
        customerId,
        customerGroupId: context.customerGroupId,
        cableFamily: context.cableFamily,
        pricingDate: new Date(),
        quantity: Number(line.quantity),
        lengthMeters: Number(line.plannedLengthM ?? line.lengthMeters),
        requestedDiscountPercentage: options?.requestedDiscountPercentage,
      },
      { approvedPricingRules: storedRules }
    );

    if (!result.success || result.finalSellingPrice == null || result.baseSellingPrice == null) {
      throwCode(
        `Pricing blocked for line ${line.lineNumber}: ${result.blockingReasons.join('; ')}`,
        result.errorCode || 'PRICING_NOT_CONFIGURED'
      );
    }
    if (result.approvalRequired) hasApprovalRequired = true;
    totalSelling += result.finalSellingPrice;

    await prisma.commercialPricingSnapshot.upsert({
      where: { quotationLineId: line.id },
      create: {
        quotationId: quotation.id,
        quotationLineId: line.id,
        quotationNumber: quotation.quotationNumber,
        versionNo: quotation.versionNo,
        materialNumber: line.materialNumber || 'UNMAPPED',
        costingRunId: line.costingRunId,
        v2CostingCalculationId: line.costingCalculationId,
        drumPlanId: line.v2DrumPlanId,
        materialCost: line.materialCost ?? matCost,
        currency: result.currency,
        pricingRuleId: result.pricingRuleId || null,
        pricingRuleRevision: result.pricingRuleRevision || 1,
        pricingRuleType: result.pricingRuleType || 'GROSS_MARGIN',
        pricingRuleScope: result.pricingRuleScope as never,
        percentageValue: result.percentageValueExact || result.percentageValue || 0,
        resolutionReason: result.resolutionReason || null,
        baseSellingPrice: result.baseSellingPriceExact || result.baseSellingPrice,
        discountPercentage: result.discountPercentage || 0,
        discountAmount: result.discountAmount || 0,
        finalSellingPrice: result.finalSellingPriceExact || result.finalSellingPrice,
        unitSellingPrice: result.unitSellingPrice ?? result.finalSellingPrice,
        pricingStatus: result.approvalRequired ? 'PRICING_APPROVAL_REQUIRED' : 'PRICING_CALCULATED',
        approvalRequired: result.approvalRequired,
        approvalReason: result.approvalReason,
      },
      update: {
        materialCost: line.materialCost ?? matCost,
        costingRunId: line.costingRunId,
        v2CostingCalculationId: line.costingCalculationId,
        drumPlanId: line.v2DrumPlanId,
        pricingRuleId: result.pricingRuleId || null,
        pricingRuleRevision: result.pricingRuleRevision || 1,
        pricingRuleType: result.pricingRuleType || 'GROSS_MARGIN',
        pricingRuleScope: result.pricingRuleScope as never,
        percentageValue: result.percentageValueExact || result.percentageValue || 0,
        resolutionReason: result.resolutionReason || null,
        baseSellingPrice: result.baseSellingPriceExact || result.baseSellingPrice,
        discountPercentage: result.discountPercentage || 0,
        discountAmount: result.discountAmount || 0,
        finalSellingPrice: result.finalSellingPriceExact || result.finalSellingPrice,
        unitSellingPrice: result.unitSellingPrice ?? result.finalSellingPrice,
        pricingStatus: result.approvalRequired ? 'PRICING_APPROVAL_REQUIRED' : 'PRICING_CALCULATED',
        approvalRequired: result.approvalRequired,
        approvalReason: result.approvalReason,
      },
    });

    await prisma.commercialQuotationLine.update({
      where: { id: line.id },
      data: {
        sellingPrice: result.finalSellingPrice,
        commercialStatus: result.approvalRequired ? 'PRICING_APPROVAL_REQUIRED' : 'PRICING_CALCULATED',
      },
    });
  }

  const updated = await prisma.commercialQuotation.update({
    where: { id: quotation.id },
    data: {
      sellingPrice: totalSelling,
      commercialPricingStatus: hasApprovalRequired ? 'PRICING_APPROVAL_REQUIRED' : 'PRICING_CALCULATED',
      commercialOfferStatus: 'READY',
      ...(options?.vipCalculateSnapshot
        ? {
            commercialOfferSnapshot: asJson({
              ...(typeof quotation.commercialOfferSnapshot === 'object' && quotation.commercialOfferSnapshot
                ? (quotation.commercialOfferSnapshot as Record<string, unknown>)
                : {}),
              vipCalculateSnapshot: options.vipCalculateSnapshot,
              optionalComponents: options.vipCalculateSnapshot.optionalComponents,
              optionalWarnings: options.vipCalculateSnapshot.warnings,
            }),
          }
        : {}),
    },
    include: { lines: { include: { pricingSnapshot: true } } },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
    action: 'PRICE',
    newValue: { sellingPrice: totalSelling, commercialPricingStatus: updated.commercialPricingStatus },
    message: `Priced V2 quotation ${quotation.quotationNumber}`,
  });

  return updated;
}

export async function approveV2Quotation(inquiryId: string, actor: RequestActor) {
  assertCanApproveQuotation(actor);
  const quotation = await getV2CurrentQuotation(inquiryId, actor);
  if (!quotation) throwCode('No V2 quotation found.', 'NOT_FOUND');
  if (isQuotationIssued(quotation)) throwCode('Issued quotations are immutable.', 'BUSINESS_RULE_REQUIRED');

  const { lines: readinessLines } = await loadLineReadinessInputs(inquiryId, actor);
  const readiness = evaluateQuotationReadiness(readinessLines, 'APPROVE');
  if (!readiness.ready) {
    throwCode(readiness.blockingReasons.join('; '), 'QUOTATION_NOT_READY');
  }

  const prisma = requirePrisma();
  for (const line of quotation.lines) {
    if (line.pricingSnapshot) {
      await prisma.commercialPricingSnapshot.update({
        where: { id: line.pricingSnapshot.id },
        data: {
          pricingStatus: 'PRICING_APPROVED',
          approvalRequired: false,
          approvedBy: actor.name || actor.email || 'approver',
          approvedAt: new Date(),
        },
      });
    }
    await prisma.commercialQuotationLine.update({
      where: { id: line.id },
      data: { commercialStatus: 'PRICING_APPROVED' },
    });
  }

  const approvedAt = new Date();
  const updated = await prisma.commercialQuotation.update({
    where: { id: quotation.id },
    data: {
      commercialPricingStatus: 'PRICING_APPROVED',
      quotationApprovedBy: actor.name || actor.email || 'approver',
      quotationApprovedAt: approvedAt,
      technicalOfferStatus: 'READY',
      commercialOfferStatus: 'READY',
    },
    include: { lines: { include: { pricingSnapshot: true } } },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
    action: 'APPROVE_QUOTATION',
    newValue: { quotationApprovedAt: approvedAt.toISOString() },
    message: `Approved V2 quotation ${quotation.quotationNumber} for issue`,
  });

  try {
    const { syncStandardWorkflowAfterApprove } = await import('./standardWorkflowOrchestrator');
    await syncStandardWorkflowAfterApprove(inquiryId, actor);
  } catch (err) {
    console.warn('[standard-workflow] approve sync skipped', err);
  }

  return updated;
}

function metaRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function positiveTolerance(lines: Array<{ cableTolerancePercent?: unknown }>): number | null {
  const values = lines
    .map((line) => (line.cableTolerancePercent == null ? null : Number(line.cableTolerancePercent)))
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (!values.length) return null;
  const first = values[0];
  return values.every((value) => Math.abs(value - first) < 0.0001) ? first : null;
}

async function buildIssuedOfferForQuotation(
  prisma: ReturnType<typeof requirePrisma>,
  inquiry: {
    id: string;
    customerName: string;
    contactPerson?: string | null;
    customerReference?: string | null;
    commercialMetadata?: unknown;
    salesAgent?: string | null;
    quotationOwner?: string | null;
    lines?: Array<{ id: string; cableTolerancePercent?: unknown }>;
  },
  quotation: {
    quotationNumber: string;
    versionNo: number;
    currency: string;
    validUntil?: Date | null;
    validityDays?: number | null;
    incoterms?: string | null;
    paymentTerms?: string | null;
    deliveryTerms?: string | null;
    shipTo?: string | null;
    quotationOwner?: string | null;
    lines: Array<{
      lineNumber: number;
      itemDescription: string;
      quantity: unknown;
      quantityUom: string;
      lengthMeters?: unknown;
      plannedLengthM?: unknown;
      materialNumber?: string | null;
      costingCalculationId?: string | null;
      sellingPrice?: unknown;
      pricingSnapshot?: { unitSellingPrice?: unknown; finalSellingPrice?: unknown } | null;
    }>;
  },
  issuedAt: Date
) {
  const meta = metaRecord(inquiry.commercialMetadata);
  const destination =
    (typeof meta.deliveryDestination === 'string' && meta.deliveryDestination.trim()) ||
    quotation.shipTo ||
    null;
  const offer = await prisma.financialOfferSnapshot.findFirst({
    where: { inquiryId: inquiry.id, isCurrent: true },
    select: { id: true, productsTotal: true, shipmentTotal: true, inquiryTotal: true },
  });
  const calcIds = quotation.lines.map((line) => line.costingCalculationId).filter((id): id is string => Boolean(id));
  const calculations = calcIds.length
    ? await prisma.costingCalculation.findMany({
        where: { id: { in: calcIds } },
        select: { id: true, outputSnapshot: true },
      })
    : [];
  const weightByCalc = new Map(calculations.map((row) => [row.id, conductorWeightsFromCostingOutput(row.outputSnapshot)]));

  return buildIssuedCommercialOfferDocument({
    quotationNumber: quotation.quotationNumber,
    versionNo: quotation.versionNo,
    currency: quotation.currency,
    validUntil: quotation.validUntil,
    validityDays: quotation.validityDays,
    issuedAt,
    incoterms: quotation.incoterms,
    destination,
    paymentTerms: quotation.paymentTerms,
    deliveryTerms: quotation.deliveryTerms,
    tolerancePercent: positiveTolerance(inquiry.lines || []),
    copperBase: meta.copperPriceRate,
    aluminiumBase: meta.aluminiumPriceRate,
    metalCurrency: typeof meta.copperPriceCurrency === 'string' ? meta.copperPriceCurrency : quotation.currency,
    metalUnitBasis: typeof meta.copperPriceUom === 'string' ? meta.copperPriceUom : null,
    financialOfferSnapshotId: offer?.id ?? null,
    productsTotal: offer?.productsTotal ?? null,
    shipmentTotal: offer?.shipmentTotal ?? null,
    grandTotal: offer?.inquiryTotal ?? null,
    customerName: inquiry.customerName,
    contactPerson: inquiry.contactPerson,
    customerReference: inquiry.customerReference,
    quotationOwner: quotation.quotationOwner || inquiry.quotationOwner || inquiry.salesAgent,
    ownerTitle: typeof meta.ownerTitle === 'string' ? meta.ownerTitle : null,
    ownerEmail: typeof meta.ownerEmail === 'string' ? meta.ownerEmail : null,
    ownerTelephone: typeof meta.ownerTelephone === 'string' ? meta.ownerTelephone : null,
    ownerMobile: typeof meta.ownerMobile === 'string' ? meta.ownerMobile : null,
    customerCountry: typeof meta.customerCountry === 'string' ? meta.customerCountry : null,
    lines: quotation.lines.map((line) => {
      const lengthM = Number(line.plannedLengthM ?? line.lengthMeters);
      const qty = Number(line.quantity);
      const uom = (line.quantityUom || '').toUpperCase();
      const moqKm = uom === 'KM' && Number.isFinite(qty) ? qty : Number.isFinite(lengthM) ? lengthM / 1000 : null;
      const weights = line.costingCalculationId ? weightByCalc.get(line.costingCalculationId) : undefined;
      const unit = line.pricingSnapshot?.unitSellingPrice;
      const total = line.pricingSnapshot?.finalSellingPrice ?? line.sellingPrice;
      const unitPrice = unit == null || unit === '' || !Number.isFinite(Number(unit)) ? null : Number(unit);
      const lineTotal = total == null || total === '' || !Number.isFinite(Number(total)) ? null : Number(total);
      return {
        lineNumber: line.lineNumber,
        itemDescription: line.itemDescription,
        moqKm: moqKm != null && Number.isFinite(moqKm) ? moqKm : null,
        quantityUom: line.quantityUom || 'KM',
        cuWeightKgPerKm: weights?.cuWeightKgPerKm ?? null,
        alWeightKgPerKm: weights?.alWeightKgPerKm ?? null,
        unitSellingPrice: unitPrice,
        lineTotal,
        materialNumber: line.materialNumber,
      };
    }),
  });
}

/** Current quotation data for a draft preview. Reads only — does not issue, freeze, or email. */
export async function buildCurrentCommercialOfferDocument(quotationId: string, actor: RequestActor) {
  const quotation = await getV2QuotationById(quotationId, actor);
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({
    where: { id: quotation.inquiryId },
    select: {
      id: true,
      customerName: true,
      contactPerson: true,
      customerReference: true,
      commercialMetadata: true,
      salesAgent: true,
      quotationOwner: true,
      status: true,
      lines: { select: { id: true, cableTolerancePercent: true } },
    },
  });
  if (!inquiry) throwCode('Inquiry not found.', 'NOT_FOUND');
  const doc = await buildIssuedOfferForQuotation(prisma, inquiry, quotation, new Date());
  return { ...doc, draft: true as const };
}

export async function issueV2Quotation(inquiryId: string, actor: RequestActor) {
  assertCanIssueQuotation(actor);
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const quotation = await getV2CurrentQuotation(inquiry.id, actor);
  if (!quotation) throwCode('No V2 quotation found.', 'NOT_FOUND');
  if (isQuotationIssued(quotation)) throwCode('Quotation already issued.', 'CONFLICT');
  if (!quotation.quotationApprovedAt) {
    throwCode('Quotation must be approved before issue.', 'BUSINESS_RULE_REQUIRED');
  }

  const { lines: readinessLines } = await loadLineReadinessInputs(inquiryId, actor);
  const decision5Signed = (await loadDecision5SignOff()).signed;
  const readiness = evaluateQuotationReadiness(readinessLines, 'ISSUE', { decision5Signed });
  if (!readiness.ready) {
    throwCode(readiness.blockingReasons.join('; '), 'QUOTATION_NOT_READY');
  }

  const prisma = requirePrisma();
  const issuedAt = new Date();

  const lineSnapshots = [];
  for (const line of quotation.lines) {
    const readinessLine = readinessLines.find((l) => l.lineId === line.inquiryLineId);
    const attachmentMeta = (readinessLine?.attachments || [])
      .filter((a) => a.kind === 'TECHNICAL_OFFER')
      .map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
        capturedAt: a.createdAt,
      }));

    await prisma.commercialQuotationLine.update({
      where: { id: line.id },
      data: {
        technicalOfferAttachmentIds: asJson(attachmentMeta),
        lineageSnapshot:
          line.lineageSnapshot ||
          (readinessLine?.handoff &&
          readinessLine.configurationSnapshot &&
          readinessLine.costingCalculation &&
          readinessLine.costingRun
            ? asJson(
                buildLineageSnapshot({
                  configurationSnapshot: readinessLine.configurationSnapshot,
                  cuttingPlan: readinessLine.cuttingPlan,
                  handoff: readinessLine.handoff,
                  costingCalculation: readinessLine.costingCalculation,
                  costingRun: readinessLine.costingRun,
                  pricingSnapshot: readinessLine.pricingSnapshot,
                })
              )
            : undefined),
      },
    });

    lineSnapshots.push({
      lineNumber: line.lineNumber,
      itemDescription: line.itemDescription,
      technicalSummarySnapshot: line.technicalSummarySnapshot,
      drumPlanLinesSnapshot: line.drumPlanLinesSnapshot,
      technicalOfferAttachmentIds: attachmentMeta,
      plannedLengthM: line.plannedLengthM,
      drumCount: line.drumCount,
    });
  }

  const technicalOfferSnapshot = buildTechnicalOfferSnapshot(lineSnapshots);
  let commercialOfferSnapshot = await buildIssuedOfferForQuotation(prisma, inquiry, quotation, issuedAt);
  const shippingFacts = await shippingFactsToFreezeOnIssue(inquiry.id, formatDateOnlyUtc(issuedAt));
  if (shippingFacts) {
    commercialOfferSnapshot = attachShippingFacts(
      { ...commercialOfferSnapshot } as Record<string, unknown>,
      shippingFacts
    ) as unknown as typeof commercialOfferSnapshot;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const q = await tx.commercialQuotation.update({
      where: { id: quotation.id },
      data: {
        issuedAt,
        issuedBy: actor.name || actor.email || 'issuer',
        status: 'SUBMITTED',
        technicalOfferStatus: 'ISSUED',
        commercialOfferStatus: 'ISSUED',
        technicalOfferSnapshot: asJson(technicalOfferSnapshot),
        commercialOfferSnapshot: asJson(commercialOfferSnapshot),
        inquirySnapshot: asJson(buildInquiryHeaderSnapshot(inquiry)),
        ...(quotation.shipTo || !commercialOfferSnapshot.destination
          ? {}
          : { shipTo: commercialOfferSnapshot.destination }),
      },
      include: { lines: { include: { pricingSnapshot: true } } },
    });

    if (inquiry.status !== 'QUOTED') {
      assertV2StatusTransition(inquiry.status, 'QUOTED');
      await tx.commercialInquiry.update({
        where: { id: inquiry.id },
        data: { status: 'QUOTED' },
      });
    }

    if (shippingFacts) {
      await insertFrozenQuotationShippingSnapshot(tx, quotation.id, shippingFacts);
    }

    return q;
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
    action: 'ISSUE',
    newValue: {
      issuedAt: issuedAt.toISOString(),
      inquiryNumber: inquiry.inquiryNumber,
      lineage: quotation.lines.map((l) => ({
        lineNumber: l.lineNumber,
        v2ConfigurationSnapshotId: l.v2ConfigurationSnapshotId,
        v2DrumPlanId: l.v2DrumPlanId,
        costingCalculationId: l.costingCalculationId,
        pricingSnapshotId: l.pricingSnapshotId,
      })),
    },
    message: `Issued V2 quotation ${quotation.quotationNumber} to customer`,
  });

  try {
    const { syncStandardWorkflowAfterIssue } = await import('./standardWorkflowOrchestrator');
    await syncStandardWorkflowAfterIssue(inquiry.id, actor);
  } catch (err) {
    console.warn('[standard-workflow] issue sync skipped', err);
  }

  try {
    const { notifyStandardWorkflowEvent } = await import('./standardWorkflowNotifications');
    await notifyStandardWorkflowEvent({
      eventCode: 'STANDARD_QUOTATION_ISSUED',
      title: `Quotation issued: ${quotation.quotationNumber}`,
      message: `Quotation ${quotation.quotationNumber} is now visible for ${inquiry.inquiryNumber}.`,
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      customerMasterId: inquiry.customerMasterId,
      notifyCustomer: true,
      notifyRole: 'SALES_MANAGER',
    });
  } catch (err) {
    console.warn('[email] issue notification failed — quotation remains ISSUED', err);
  }

  await runEmailWithoutRollback(async () => {
    const addresses = new Set(resolveNotificationRecipients());
    if (inquiry.customerMasterId) {
      const links = await prisma.customerUser.findMany({
        where: { customerId: inquiry.customerMasterId, status: 'ACTIVE' },
        select: { userAccount: { select: { email: true } } },
      });
      for (const link of links) {
        if (link.userAccount.email) addresses.add(link.userAccount.email);
      }
    }
    if (addresses.size === 0) addresses.add('unconfigured@localhost');
    const mail = buildQuotationIssuedEmail({
      customerName: inquiry.customerName,
      quotationNumber: quotation.quotationNumber,
      revision: quotation.versionNo,
      total: commercialOfferSnapshot.grandTotal,
      currency: quotation.currency,
      validityLabel: commercialOfferSnapshot.validityLabel,
      portalLink: quotationPortalLink(inquiry.id, process.env.APP_BASE_URL),
    });
    for (const toAddress of addresses) {
      await enqueueEmail({
        toAddress,
        subject: mail.subject,
        bodyText: mail.bodyText,
        eventCode: 'QUOTATION_ISSUED',
        entityType: 'CommercialQuotation',
        entityId: quotation.id,
      });
    }
  });

  return updated;
}

export async function reviseV2Quotation(inquiryId: string, actor: RequestActor) {
  assertCanManageQuotations(actor);
  const quotation = await getV2CurrentQuotation(inquiryId, actor);
  if (!quotation) throwCode('No V2 quotation found.', 'NOT_FOUND');

  const prisma = requirePrisma();
  const nextVersionNo = quotation.versionNo + 1;

  const revised = await prisma.$transaction(async (tx) => {
    await tx.commercialQuotation.update({
      where: { id: quotation.id },
      data: { isCurrent: false, status: 'SUPERSEDED', supersededByQuotationId: undefined },
    });

    const newQuotation = await tx.commercialQuotation.create({
      data: {
        quotationNumber: quotation.quotationNumber,
        inquiryId: quotation.inquiryId,
        customerId: quotation.customerId,
        customerMasterId: quotation.customerMasterId,
        customerName: quotation.customerName,
        contactPerson: quotation.contactPerson,
        versionNo: nextVersionNo,
        isCurrent: true,
        supersedesQuotationId: quotation.id,
        status: 'OPEN',
        workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
        currency: quotation.currency,
        incoterms: quotation.incoterms,
        paymentTerms: quotation.paymentTerms,
        deliveryTerms: quotation.deliveryTerms,
        validUntil: calculateValidUntil(new Date(), quotation.validityDays ?? getDefaultQuotationValidityDays()),
        validityDays: quotation.validityDays,
        inquiryVersionNo: quotation.inquiryVersionNo,
        materialCostTotal: quotation.materialCostTotal,
        commercialPricingStatus: 'NOT_CONFIGURED',
        technicalOfferStatus: 'NOT_READY',
        commercialOfferStatus: 'NOT_READY',
        sellingPrice: null,
        quotationApprovedBy: null,
        quotationApprovedAt: null,
        quotationOwner: actor.name || actor.email || quotation.quotationOwner,
        createdBy: actor.name || actor.email || 'user',
        lines: {
          create: quotation.lines.map((l) => ({
            lineNumber: l.lineNumber,
            inquiryLineId: l.inquiryLineId,
            materialNumber: l.materialNumber,
            itemDescription: l.itemDescription,
            quantity: l.quantity,
            quantityUom: l.quantityUom,
            lengthMeters: l.lengthMeters,
            plannedLengthM: l.plannedLengthM,
            customerCableCode: l.customerCableCode,
            cuttingLengthMeters: l.cuttingLengthMeters,
            numberOfCuts: l.numberOfCuts,
            drumCount: l.drumCount,
            costingRunId: l.costingRunId,
            costingCalculationId: l.costingCalculationId,
            materialCost: l.materialCost,
            materialCostCurrency: l.materialCostCurrency,
            commercialStatus: l.commercialStatus,
            workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
            v2ConfigurationSnapshotId: l.v2ConfigurationSnapshotId,
            v2ConfigurationSnapshotIdString: l.v2ConfigurationSnapshotIdString,
            v2CuttingLengthPlanId: l.v2CuttingLengthPlanId,
            v2CuttingLengthPlanIdString: l.v2CuttingLengthPlanIdString,
            v2DrumPlanId: l.v2DrumPlanId,
            v2DrumPlanVersionNo: l.v2DrumPlanVersionNo,
            v2DrumPlanIdString: l.v2DrumPlanIdString,
            technicalSummarySnapshot: l.technicalSummarySnapshot,
            drumPlanLinesSnapshot: l.drumPlanLinesSnapshot,
            lineageSnapshot: l.lineageSnapshot,
            notes: l.notes,
          })),
        },
      },
      include: { lines: true },
    });

    await tx.commercialQuotation.update({
      where: { id: quotation.id },
      data: { supersededByQuotationId: newQuotation.id },
    });

    return newQuotation;
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${nextVersionNo}`,
    action: 'REVISE',
    newValue: { supersedesVersionNo: quotation.versionNo },
    message: `Revised V2 quotation ${quotation.quotationNumber} to V${nextVersionNo}`,
  });

  return revised;
}

export async function getV2QuotationById(quotationId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const quotation = await prisma.commercialQuotation.findFirst({
    where: {
      OR: [{ id: quotationId }, { quotationNumber: quotationId, isCurrent: true }],
      workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
    },
    include: { lines: { include: { pricingSnapshot: true } }, inquiry: true },
  });
  if (!quotation) throwCode('Quotation not found.', 'NOT_FOUND');
  assertCanAccessInquiryOwnership(actor, quotation.customerId, quotation.customerMasterId);
  return quotation;
}

/** VIP Calculate orchestrator — skips quotation RBAC; caller must verify INQUIRY:CALCULATE. */
export async function createV2QuotationDraftForVipCalculate(
  inquiryId: string,
  actor: RequestActor,
  options?: { validityDays?: number }
) {
  const { inquiry, lines } = await loadLineReadinessInputs(inquiryId, actor);
  if (!isV2InquiryMetadata(inquiry.commercialMetadata)) {
    throwCode('Inquiry is not a V2 configuration workflow.', 'INVALID_STATE');
  }

  const readiness = evaluateQuotationReadiness(lines, 'CREATE_DRAFT');
  if (!readiness.ready) {
    throwCode(readiness.blockingReasons.join('; '), 'QUOTATION_NOT_READY');
  }

  const existing = await getV2CurrentQuotation(inquiry.id, actor);
  if (existing && !isQuotationIssued(existing)) {
    return existing;
  }

  return createV2QuotationDraft(inquiryId, actor, { ...options, vipOrchestratorBypassRbac: true });
}

/** VIP Calculate orchestrator — persists pricing on draft without quotation-manage RBAC. */
export async function persistV2QuotationPricingForVipCalculate(
  inquiryId: string,
  actor: RequestActor,
  options?: { requestedDiscountPercentage?: number; vipCalculateSnapshot?: VipCalculateSnapshot }
) {
  return persistV2QuotationPricing(inquiryId, actor, {
    ...options,
    vipOrchestratorBypassRbac: true,
  });
}

export async function returnV2Quotation(
  inquiryId: string,
  actor: RequestActor,
  reason: string
) {
  assertCanApproveQuotation(actor);
  const trimmed = String(reason || '').trim();
  if (!trimmed) throwCode('Return reason is required.', 'VALIDATION');
  const quotation = await getV2CurrentQuotation(inquiryId, actor);
  if (!quotation) throwCode('No V2 quotation found.', 'NOT_FOUND');
  if (isQuotationIssued(quotation)) throwCode('Issued quotations cannot be returned.', 'BUSINESS_RULE_REQUIRED');

  const prisma = requirePrisma();
  const returnedAt = new Date();
  const updated = await prisma.commercialQuotation.update({
    where: { id: quotation.id },
    data: {
      quotationApprovedAt: null,
      quotationApprovedBy: null,
      quotationReturnedAt: returnedAt,
      quotationReturnedBy: actor.name || actor.email || 'reviewer',
      quotationReturnReason: trimmed,
      commercialPricingStatus: quotation.commercialPricingStatus === 'PRICING_APPROVED' ? 'PRICED' : quotation.commercialPricingStatus,
      commercialOfferStatus: 'RETURNED',
    },
    include: { lines: { include: { pricingSnapshot: true } } },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
    action: 'RETURN_QUOTATION',
    newValue: { reason: trimmed, quotationReturnedAt: returnedAt.toISOString() },
    message: `Returned V2 quotation ${quotation.quotationNumber}: ${trimmed}`,
  });

  try {
    const { syncStandardWorkflowAfterReturn } = await import('./standardWorkflowOrchestrator');
    await syncStandardWorkflowAfterReturn(inquiryId, actor);
  } catch (err) {
    console.warn('[standard-workflow] return sync skipped', err);
  }

  try {
    const { notifyStandardWorkflowEvent } = await import('./standardWorkflowNotifications');
    await notifyStandardWorkflowEvent({
      eventCode: 'STANDARD_QUOTATION_RETURNED',
      title: `Quotation returned: ${quotation.quotationNumber}`,
      message: trimmed,
      inquiryId,
      notifyRole: 'SALES_MANAGER',
    });
    const ownerRef = quotation.quotationOwner || quotation.quotationApprovedBy;
    if (ownerRef) {
      const owner = await prisma.userAccount.findFirst({
        where: { OR: [{ email: ownerRef }, { fullName: ownerRef }] },
        select: { id: true },
      });
      if (owner) {
        const { createUserNotification } = await import('./userNotificationService');
        await createUserNotification({
          userAccountId: owner.id,
          title: `Quotation returned: ${quotation.quotationNumber}`,
          message: trimmed,
          eventCode: 'STANDARD_QUOTATION_RETURNED',
          entityType: 'CommercialInquiry',
          entityId: inquiryId,
        });
      }
    }
  } catch {
    // notification must not roll back return
  }

  return updated;
}

export async function recordCustomerQuotationDecision(
  inquiryId: string,
  actor: RequestActor,
  input: { decision: 'ACCEPT' | 'REJECT' | 'CLARIFICATION'; reason?: string }
) {
  if (actor.userType !== 'customer') {
    throwCode('Only the customer can record a quotation decision.', 'UNAUTHORIZED');
  }
  const decision = input.decision;
  const reason = String(input.reason || '').trim();
  if ((decision === 'REJECT' || decision === 'CLARIFICATION') && !reason) {
    throwCode(`${decision === 'REJECT' ? 'Reject' : 'Clarification'} reason is required.`, 'VALIDATION');
  }

  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const quotation = await getV2CurrentQuotation(inquiry.id, actor);
  if (!quotation || !isQuotationIssued(quotation)) {
    throwCode('Only issued quotations can be accepted, rejected, or clarified.', 'UNAUTHORIZED');
  }
  if (quotation.customerDecision === 'ACCEPT' || quotation.customerDecision === 'REJECT') {
    throwCode(`Quotation already ${quotation.customerDecision}.`, 'CONFLICT');
  }

  const prisma = requirePrisma();
  const decidedAt = new Date();
  const status =
    decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'REJECT' ? 'REJECTED' : quotation.status;

  const updated = await prisma.commercialQuotation.update({
    where: { id: quotation.id },
    data: {
      customerDecision: decision,
      customerDecisionReason: reason || null,
      customerDecisionAt: decidedAt,
      customerDecisionBy: actor.name || actor.email || actor.id || 'customer',
      status,
    },
    include: { lines: { include: { pricingSnapshot: true } } },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
    action: `CUSTOMER_${decision}`,
    newValue: { decision, reason: reason || null },
    message: `Customer ${decision} on quotation ${quotation.quotationNumber}`,
  });

  if (decision === 'ACCEPT') {
    try {
      const { createCommitmentFromQuotation } = await import('./commercialCommitmentRepository');
      await createCommitmentFromQuotation(quotation.id, actor, { fulfillmentType: 'DIRECT_ORDER' });
    } catch (err) {
      const coded = err as Error & { code?: string };
      if (coded.code !== 'CONFLICT') {
        await appendServerAudit({
          actorId: actor.id,
          actorName: actor.name || actor.email,
          entity: 'CommercialQuotation',
          entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
          action: 'STANDARD_COMMITMENT_BLOCKED',
          newValue: { code: coded.code, message: coded.message },
          message: `Customer accepted ${quotation.quotationNumber} but existing commitment was not created: ${coded.message}`,
        });
      }
    }
    try {
      const { syncStandardWorkflowAfterCustomerAccept } = await import('./standardWorkflowOrchestrator');
      await syncStandardWorkflowAfterCustomerAccept(inquiry.id, actor);
    } catch (err) {
      console.warn('[standard-workflow] customer accept sync skipped', err);
    }
  }

  try {
    const { notifyStandardWorkflowEvent } = await import('./standardWorkflowNotifications');
    await notifyStandardWorkflowEvent({
      eventCode: decision === 'CLARIFICATION' ? 'STANDARD_CLARIFICATION_REQUESTED' : 'STANDARD_CUSTOMER_DECISION',
      title: `Customer ${decision.toLowerCase()}: ${quotation.quotationNumber}`,
      message: reason || `Customer recorded ${decision} for ${inquiry.inquiryNumber}.`,
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      customerMasterId: inquiry.customerMasterId,
      notifyRole: 'SALES_MANAGER',
    });
  } catch {
    // email/notification failure must not roll back the decision
  }

  return updated;
}

