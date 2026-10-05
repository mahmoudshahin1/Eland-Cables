/**
 * VIP Fast Track Calculate orchestrator (Task 05I-C).
 * Gates → V2 costing → commercial pricing → quotation DRAFT (no approve/issue).
 */

import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { assertCanAccessInquiryOwnership } from './rbac';
import { loadV2InquiryScoped } from './v2InquiryConfigurationRepository';
import { calculateV2CostingRun } from './v2CostingRunRepository';
import {
  createV2QuotationDraftForVipCalculate,
  getV2CurrentQuotation,
  persistV2QuotationPricingForVipCalculate,
} from './v2QuotationRepository';
import { createFinancialOfferSnapshot } from './financialOfferSnapshotRepository';
import { assertVipCalculateAllowed } from '../domain/inquiryProcessCommands';
import { isV2InquiryMetadata } from '../domain/v2InquiryWorkflow';
import {
  appendCostingGateResults,
  evaluateVipInquiryReadiness,
  type VipCalculateGateResult,
  type VipLineReadinessInput,
} from '../domain/vipCalculateReadiness';
import { isContainerStudyDevBypassEnabled } from '../domain/containerStudyReadiness';
import {
  buildVipCalculateSnapshot,
  evaluateVipOptionalComponents,
  type VipOptionalComponentResult,
} from '../domain/vipOptionalComponents';
import { emitDomainEvent } from '../domain/domainEventBus';
import { DECISION5_STATUS } from '../domain/v2CostingRequestService';
import { isQuotationIssued } from '../domain/v2QuotationService';
import { snapshotMissingInquiryMetalPrices } from './marketMetalPriceDefaultRepository';
import { loadImportedCableCalculationEvidence } from './importedCableCalculationEvidence';
import { executeCostingForInquiryLine } from './costingOrchestrationService';
import { buildCostingRequestFromInquiryLine } from '../services/costingRequestService';
import { importedCableSatisfiesCalculationEngineering } from '../domain/importedCableCalculationAuthority';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function throwCode(message: string, code: string, extra?: Record<string, unknown>): never {
  const err = new Error(message) as Error & { code: string } & Record<string, unknown>;
  err.code = code;
  if (extra) Object.assign(err, extra);
  throw err;
}

export interface VipCalculateLineOutcome {
  lineId: string;
  lineNumber: number;
  costingStatus: 'READY' | 'NOT_READY' | 'SKIPPED';
  persisted: boolean;
  blockingReasons: string[];
  errorCode?: string;
  calculationId?: string;
  costingRunId?: string;
}

export interface VipCalculateResult {
  status: 'COMPLETED' | 'BLOCKED' | 'PARTIAL' | 'QUOTATION_BLOCKED';
  inquiryId: string;
  inquiryNumber: string;
  gates: VipCalculateGateResult[];
  blockingReasons: string[];
  optionalComponents: VipOptionalComponentResult[];
  optionalWarnings: string[];
  lines: VipCalculateLineOutcome[];
  quotation?: {
    id: string;
    quotationNumber: string;
    versionNo: number;
    status: string;
    created: boolean;
  } | null;
  financialOffer?: {
    id: string;
    inquiryTotal: string;
    created: boolean;
  } | null;
  decision5Status: string;
  idempotent: boolean;
}

async function loadVipLineReadinessInputs(inquiryId: string, actor: RequestActor): Promise<{
  inquiry: Awaited<ReturnType<typeof loadV2InquiryScoped>>;
  lines: VipLineReadinessInput[];
}> {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const prisma = requirePrisma();
  const lines: VipLineReadinessInput[] = [];

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

    lines.push({
      lineId: line.id,
      lineNumber: line.lineNumber,
      v2CurrentSnapshotId: line.v2CurrentSnapshotId,
      v2CurrentCuttingPlanId: line.v2CurrentCuttingPlanId,
      v2CurrentDrumPlanId: line.v2CurrentDrumPlanId,
      importedCable: await loadImportedCableCalculationEvidence(line.materialNumber),
      configurationSnapshot: snapshot
        ? {
            id: snapshot.id,
            validationStatus: snapshot.validationStatus,
            flowState: snapshot.flowState,
            bomGovernanceBlocked: snapshot.bomGovernanceBlocked,
            unresolvedBomConflictCount: snapshot.unresolvedBomConflictCount,
            engineeringStatus: snapshot.engineeringStatus,
          }
        : null,
      cuttingPlan: cuttingPlan
        ? {
            id: cuttingPlan.id,
            validationStatus: cuttingPlan.validationStatus,
            configurationSnapshotId: cuttingPlan.configurationSnapshotId,
          }
        : null,
      drumPlan: drumPlan
        ? {
            id: drumPlan.id,
            lifecycleStatus: drumPlan.lifecycleStatus,
            validationStatus: drumPlan.validationStatus,
          }
        : null,
    });
  }

  return { inquiry, lines };
}

export async function calculateInquiry(
  inquiryId: string,
  actor: RequestActor,
  options?: { recalculate?: boolean }
): Promise<VipCalculateResult> {
  const { inquiry, lines: readinessLines } = await loadVipLineReadinessInputs(inquiryId, actor);

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  assertVipCalculateAllowed(inquiry);

  if (!isV2InquiryMetadata(inquiry.commercialMetadata)) {
    throwCode(
      'VIP Calculate requires a V2 configuration workflow inquiry (workflowChannel: V2_CONFIGURATION).',
      'INVALID_STATE'
    );
  }

  if (inquiry.status !== 'DRAFT' && inquiry.status !== 'UNDER_REVIEW') {
    throwCode(
      `Inquiry ${inquiry.inquiryNumber} is ${inquiry.status}. Create a new version to recalculate.`,
      'COSTING_LOCKED'
    );
  }

  const meta = await snapshotMissingInquiryMetalPrices(inquiry.id);

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'VIP_CALCULATE_STARTED',
    newValue: { recalculate: options?.recalculate === true },
    message: `VIP calculate started for ${inquiry.inquiryNumber}`,
  });

  emitDomainEvent({
    type: 'INQUIRY_CALCULATION_STARTED',
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    actorId: actor.id,
    actorName: actor.name || actor.email,
    payload: { recalculate: options?.recalculate === true },
  });

  const readiness = evaluateVipInquiryReadiness({
    commercialMetadata: meta,
    copperPriceRate: meta.copperPriceRate,
    aluminiumPriceRate: meta.aluminiumPriceRate,
    deliveryDestination: meta.deliveryDestination,
    incoterms: meta.incoterms ?? inquiry.incoterms,
    lines: readinessLines,
    containerStudyDevBypass: isContainerStudyDevBypassEnabled(),
  });

  const optionalComponents = evaluateVipOptionalComponents({
    commercialMetadata: meta,
    incoterms: meta.incoterms ?? inquiry.incoterms,
    deliveryDestination: meta.deliveryDestination,
    currency: inquiry.currency,
  });
  let optionalWarnings = optionalComponents.filter((c) => c.hasWarning).map((c) => c.warningMessage || c.reasonCode);

  if (!readiness.ready) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'VIP_CALCULATE_BLOCKED',
      newValue: { gates: readiness.gates, blockingReasons: readiness.blockingReasons },
      message: `VIP calculate blocked for ${inquiry.inquiryNumber}`,
    });

    emitDomainEvent({
      type: 'INQUIRY_CALCULATION_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      actorId: actor.id,
      actorName: actor.name || actor.email,
      payload: { gates: readiness.gates, blockingReasons: readiness.blockingReasons },
    });

    return {
      status: 'BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      gates: readiness.gates,
      blockingReasons: readiness.blockingReasons,
      optionalComponents,
      optionalWarnings,
      lines: [],
      quotation: null,
      financialOffer: null,
      decision5Status: DECISION5_STATUS,
      idempotent: false,
    };
  }

  const existingQuotation = await getV2CurrentQuotation(inquiry.id, actor);
  let quotationCreated = false;
  let gates = [...readiness.gates];
  const lineOutcomes: VipCalculateLineOutcome[] = [];
  let anyCostingFailed = false;
  const prisma = requirePrisma();

  for (const line of inquiry.lines) {
    const readinessLine = readinessLines.find((l) => l.lineId === line.id);
    if (!readinessLine) continue;

    const skipCosting =
      !options?.recalculate &&
      Boolean(line.costingCalculationId && line.costingRunId);

    if (skipCosting) {
      lineOutcomes.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        costingStatus: 'SKIPPED',
        persisted: false,
        blockingReasons: [],
      });
      continue;
    }

    try {
      const importedOk = importedCableSatisfiesCalculationEngineering(
        readinessLine.importedCable || {
          materialNumber: line.materialNumber,
          bomLineCount: 0,
          unresolvedBomConflictCount: 0,
        }
      );
      const usePathA = importedOk && !line.v2CurrentDrumPlanId;
      if (usePathA) {
        const built = buildCostingRequestFromInquiryLine(
          {
            materialNumber: line.materialNumber,
            requestedQuantity: Number(line.requestedQuantity),
            requestedLengthMeters: Number(line.requestedLengthMeters),
            cuttingLengthMeters: line.cuttingLengthMeters != null ? Number(line.cuttingLengthMeters) : null,
            drumType: line.drumType,
            cableTolerancePercent:
              line.cableTolerancePercent != null ? Number(line.cableTolerancePercent) : null,
            drumSchedule: line.drumSchedule as Record<string, unknown> | null,
          },
          {
            currency: inquiry.currency,
            inquiryDate: inquiry.inquiryDate,
            incoterms: inquiry.incoterms,
            commercialMetadata: inquiry.commercialMetadata as Record<string, unknown> | null,
          },
          { previewOnly: false }
        );
        if ('error' in built) {
          anyCostingFailed = true;
          gates = appendCostingGateResults(gates, line.lineNumber, [built.error], 'NOT_READY');
          lineOutcomes.push({
            lineId: line.id,
            lineNumber: line.lineNumber,
            costingStatus: 'NOT_READY',
            persisted: false,
            blockingReasons: [built.error],
            errorCode: 'NOT_READY',
          });
        } else {
          const pathA = await executeCostingForInquiryLine(built, actor, {
            persist: true,
            inquiryId: inquiry.id,
            inquiryLineId: line.id,
          });
          const refreshed = await prisma.commercialInquiryLine.findUnique({ where: { id: line.id } });
          if (pathA.status === 'NOT_READY') {
            anyCostingFailed = true;
            gates = appendCostingGateResults(gates, line.lineNumber, pathA.blockingReasons, pathA.errorCode);
            lineOutcomes.push({
              lineId: line.id,
              lineNumber: line.lineNumber,
              costingStatus: 'NOT_READY',
              persisted: Boolean(pathA.persisted),
              blockingReasons: pathA.blockingReasons,
              errorCode: pathA.errorCode,
            });
          } else {
            gates = appendCostingGateResults(gates, line.lineNumber, []);
            lineOutcomes.push({
              lineId: line.id,
              lineNumber: line.lineNumber,
              costingStatus: 'READY',
              persisted: Boolean(pathA.persisted),
              blockingReasons: pathA.calculationWarnings || [],
              calculationId: refreshed?.costingCalculationId || undefined,
              costingRunId: refreshed?.costingRunId || pathA.costingRunId,
            });
          }
        }
      } else {
      const costing = await calculateV2CostingRun(inquiry.id, line.id, actor);
      if (costing.status === 'NOT_READY') {
        anyCostingFailed = true;
        gates = appendCostingGateResults(
          gates,
          line.lineNumber,
          costing.blockingReasons,
          costing.errorCode
        );
        lineOutcomes.push({
          lineId: line.id,
          lineNumber: line.lineNumber,
          costingStatus: 'NOT_READY',
          persisted: false,
          blockingReasons: costing.blockingReasons,
          errorCode: costing.errorCode,
        });
      } else {
        gates = appendCostingGateResults(gates, line.lineNumber, []);
        lineOutcomes.push({
          lineId: line.id,
          lineNumber: line.lineNumber,
          costingStatus: 'READY',
          persisted: costing.persisted,
          blockingReasons: [],
          calculationId: costing.calculationId,
          costingRunId: costing.costingRunId,
        });
      }
      }
    } catch (err) {
      anyCostingFailed = true;
      const coded = err as Error & { code?: string; blockingReasons?: string[] };
      const reasons = coded.blockingReasons || [coded.message];
      gates = appendCostingGateResults(gates, line.lineNumber, reasons, coded.code);
      lineOutcomes.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        costingStatus: 'NOT_READY',
        persisted: false,
        blockingReasons: reasons,
        errorCode: coded.code,
      });
    }
  }

  if (anyCostingFailed) {
    const blockingReasons = gates.filter((g) => g.status === 'BLOCK').map((g) => g.message);
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'VIP_CALCULATE_BLOCKED',
      newValue: { gates, blockingReasons, phase: 'COSTING' },
      message: `VIP calculate blocked at costing for ${inquiry.inquiryNumber}`,
    });

    emitDomainEvent({
      type: 'INQUIRY_CALCULATION_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      actorId: actor.id,
      actorName: actor.name || actor.email,
      payload: { gates, blockingReasons, phase: 'COSTING' },
    });

    return {
      status: 'PARTIAL',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      gates,
      blockingReasons,
      optionalComponents,
      optionalWarnings,
      lines: lineOutcomes,
      quotation: null,
      financialOffer: null,
      decision5Status: DECISION5_STATUS,
      idempotent: false,
    };
  }

  if (!existingQuotation || isQuotationIssued(existingQuotation)) {
    const draftQuotation = await createV2QuotationDraftForVipCalculate(inquiry.id, actor);
    quotationCreated = true;

    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialQuotation',
      entityId: `${draftQuotation.quotationNumber}-V${draftQuotation.versionNo}`,
      action: 'VIP_QUOTATION_DRAFT_CREATED',
      newValue: { inquiryNumber: inquiry.inquiryNumber, workflowChannel: draftQuotation.workflowChannel },
      message: `VIP quotation draft ${draftQuotation.quotationNumber} created for ${inquiry.inquiryNumber}`,
    });

    emitDomainEvent({
      type: 'QUOTATION_DRAFT_CREATED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      actorId: actor.id,
      actorName: actor.name || actor.email,
      payload: {
        quotationId: draftQuotation.id,
        quotationNumber: draftQuotation.quotationNumber,
        versionNo: draftQuotation.versionNo,
      },
    });
  }

  const pricedQuotation = await persistV2QuotationPricingForVipCalculate(inquiry.id, actor, {
    vipCalculateSnapshot: buildVipCalculateSnapshot(optionalComponents),
  });

  let financialOffer: VipCalculateResult['financialOffer'] = null;
  try {
    const offer = await createFinancialOfferSnapshot({ inquiryId: inquiry.id }, actor);
    financialOffer = {
      id: offer.snapshot.id,
      inquiryTotal: offer.snapshot.inquiryTotal,
      created: offer.created,
    };
    gates = [
      ...gates,
      {
        gate: 'FINANCIAL_OFFER',
        status: 'PASS',
        message: 'Financial offer snapshot generated.',
        code: 'FINANCIAL_OFFER_GENERATED',
      },
    ];
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'FinancialOfferSnapshot',
      entityId: offer.snapshot.id,
      action: 'FINANCIAL_OFFER_GENERATED',
      newValue: {
        inquiryNumber: inquiry.inquiryNumber,
        quotationNumber: pricedQuotation.quotationNumber,
        inquiryTotal: offer.snapshot.inquiryTotal,
      },
      message: `Financial offer generated for ${inquiry.inquiryNumber}`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Financial offer could not be generated from priced quotation snapshots.';
    gates = [
      ...gates,
      {
        gate: 'FINANCIAL_OFFER',
        status: 'BLOCK',
        message,
        code: 'FINANCIAL_OFFER_BLOCKED',
      },
    ];
    const blockingReasons = [message];
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'VIP_CALCULATE_BLOCKED',
      newValue: { gates, blockingReasons, phase: 'FINANCIAL_OFFER' },
      message: `VIP calculate blocked at financial offer for ${inquiry.inquiryNumber}`,
    });
    emitDomainEvent({
      type: 'INQUIRY_CALCULATION_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      actorId: actor.id,
      actorName: actor.name || actor.email,
      payload: { gates, blockingReasons, phase: 'FINANCIAL_OFFER' },
    });
    return {
      status: 'QUOTATION_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      gates,
      blockingReasons,
      optionalComponents,
      optionalWarnings,
      lines: lineOutcomes,
      quotation: null,
      financialOffer: null,
      decision5Status: DECISION5_STATUS,
      idempotent: false,
    };
  }

  const calculateSnapshot = buildVipCalculateSnapshot(optionalComponents);
  await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: {
      commercialMetadata: JSON.parse(
        JSON.stringify({
          ...meta,
          vipLastCalculateSnapshot: calculateSnapshot,
        })
      ),
    },
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'VIP_CALCULATE_COMPLETED',
    newValue: {
      quotationNumber: pricedQuotation.quotationNumber,
      quotationCreated,
      financialOfferId: financialOffer.id,
      lineCount: lineOutcomes.length,
      optionalWarningCount: optionalWarnings.length,
    },
    message: `VIP calculate completed for ${inquiry.inquiryNumber}`,
  });

  emitDomainEvent({
    type: 'INQUIRY_CALCULATION_COMPLETED',
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    actorId: actor.id,
    actorName: actor.name || actor.email,
    payload: {
      quotationNumber: pricedQuotation.quotationNumber,
      quotationCreated,
      financialOfferId: financialOffer.id,
    },
  });

  return {
    status: 'COMPLETED',
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    gates,
    blockingReasons: optionalWarnings,
    optionalComponents,
    optionalWarnings,
    lines: lineOutcomes,
    quotation: {
      id: pricedQuotation.id,
      quotationNumber: pricedQuotation.quotationNumber,
      versionNo: pricedQuotation.versionNo,
      status: pricedQuotation.status,
      created: quotationCreated,
    },
    financialOffer,
    decision5Status: DECISION5_STATUS,
    idempotent: !quotationCreated && !options?.recalculate,
  };
}
