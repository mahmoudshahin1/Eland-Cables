/**
 * STANDARD_WORKFLOW post-submit orchestrator.
 * Reuses existing V2 costing, pricing, quotation draft, and workflow runtime.
 * Does not fabricate lineage. Stops at the real gate.
 */

import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { loadV2InquiryScoped } from './v2InquiryConfigurationRepository';
import { loadImportedCableCalculationEvidence } from './importedCableCalculationEvidence';
import { calculateV2CostingRun } from './v2CostingRunRepository';
import {
  createV2QuotationDraftForVipCalculate,
  getV2CurrentQuotation,
  persistV2QuotationPricingForVipCalculate,
} from './v2QuotationRepository';
import {
  findActiveWorkflowForEntity,
  transitionWorkflow,
} from './workflowRuntimeRepository';
import { assertStandardSubmitAllowed, getInquiryProcessCode } from '../domain/inquiryProcessCommands';
import { isV2InquiryMetadata } from '../domain/v2InquiryWorkflow';
import { emitDomainEvent } from '../domain/domainEventBus';
import {
  evaluateStandardPostSubmitReadiness,
  type StandardLineEvidence,
} from '../domain/standardWorkflowReadiness';
import type { StandardContainerStudyWorkflowEvidence } from '../domain/standardContainerStudyWorkflowReadiness';
import { notifyStandardWorkflowEvent } from './standardWorkflowNotifications';
import { WORKFLOW_ENTITY_COMMERCIAL_INQUIRY } from '../domain/workflowRuntimeService';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export interface StandardWorkflowResult {
  status:
    | 'ENGINEERING_APPROVED'
    | 'TO_REQUIRED'
    | 'CONTAINER_STUDY_BLOCKED'
    | 'COSTING_BLOCKED'
    | 'QUOTATION_DRAFT'
    | 'SKIPPED'
    | 'BLOCKED';
  inquiryId: string;
  inquiryNumber: string;
  workflowStep: string | null;
  gates: Array<{ gate: string; status: string; message: string; code?: string; lineNumber?: number }>;
  blockingReasons: string[];
  quotation?: { id: string; quotationNumber: string; versionNo: number; created: boolean } | null;
}

async function loadEvidence(inquiryId: string, actor: RequestActor): Promise<{
  inquiry: Awaited<ReturnType<typeof loadV2InquiryScoped>>;
  lines: StandardLineEvidence[];
}> {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const prisma = requirePrisma();
  const lines: StandardLineEvidence[] = [];
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
      technicalOfficeRequestId: line.technicalOfficeRequestId,
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
        ? { id: cuttingPlan.id, validationStatus: cuttingPlan.validationStatus }
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

async function loadContainerStudyEvidence(
  inquiryId: string,
  processCode: string,
  lines: StandardLineEvidence[],
  inquiryLines: Array<{ id: string; costingRunId: string | null }>
): Promise<StandardContainerStudyWorkflowEvidence> {
  const prisma = requirePrisma();
  const [shipmentGroups, studies, costingRuns] = await Promise.all([
    prisma.containerShipmentGroup.findMany({
      where: { inquiryId },
      select: { id: true },
    }),
    prisma.containerStudy.findMany({
      where: { inquiryId },
      select: {
        id: true,
        shipmentGroupId: true,
        status: true,
        currentSnapshotId: true,
        currentResultId: true,
        currentResult: { select: { inputSnapshotId: true } },
      },
    }),
    prisma.costingRun.findMany({
      where: {
        id: { in: inquiryLines.map((l) => l.costingRunId).filter((id): id is string => Boolean(id)) },
      },
      select: { id: true, inquiryLineId: true, containerStudyResultId: true },
    }),
  ]);

  const drumPlansConfirmed =
    lines.length > 0 &&
    lines.every((line) => Boolean(line.v2CurrentDrumPlanId && line.drumPlan?.lifecycleStatus === 'CONFIRMED'));

  return {
    processCode,
    shipmentGroups,
    studies: studies.map((s) => ({
      id: s.id,
      shipmentGroupId: s.shipmentGroupId,
      status: s.status,
      currentSnapshotId: s.currentSnapshotId,
      currentResultId: s.currentResultId,
      resultInputSnapshotId: s.currentResult?.inputSnapshotId ?? null,
    })),
    drumPlansConfirmed,
    currentLineCostingRuns: costingRuns.map((r) => ({
      id: r.id,
      inquiryLineId: r.inquiryLineId,
      containerStudyResultId: r.containerStudyResultId,
    })),
  };
}

async function advance(
  instanceId: string,
  transitionCode: string,
  actor: RequestActor,
  taskResult?: string
) {
  return transitionWorkflow(instanceId, transitionCode, actor, { taskResult: taskResult ?? null }, { orchestrator: true });
}

export async function runStandardWorkflowAfterSubmit(
  inquiryId: string,
  actor: RequestActor
): Promise<StandardWorkflowResult> {
  const prisma = requirePrisma();
  const raw = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!raw) {
    const err = new Error(`Inquiry ${inquiryId} not found.`) as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }

  try {
    assertStandardSubmitAllowed(raw);
  } catch {
    return {
      status: 'SKIPPED',
      inquiryId: raw.id,
      inquiryNumber: raw.inquiryNumber,
      workflowStep: null,
      gates: [],
      blockingReasons: [],
      quotation: null,
    };
  }

  if (!isV2InquiryMetadata(raw.commercialMetadata)) {
    return {
      status: 'SKIPPED',
      inquiryId: raw.id,
      inquiryNumber: raw.inquiryNumber,
      workflowStep: null,
      gates: [{ gate: 'WORKFLOW_CHANNEL', status: 'INFO', message: 'V1 inquiry — STANDARD auto-chain skipped.' }],
      blockingReasons: [],
      quotation: null,
    };
  }

  const { inquiry, lines } = await loadEvidence(raw.id, actor);
  const processCode = getInquiryProcessCode(inquiry);
  const containerStudyEvidence = await loadContainerStudyEvidence(
    inquiry.id,
    processCode,
    lines,
    inquiry.lines.map((l) => ({ id: l.id, costingRunId: l.costingRunId }))
  );
  const readiness = evaluateStandardPostSubmitReadiness({
    lines,
    containerStudyEvidence,
  });

  const wfRow = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiry.id);
  const wf = wfRow ? { id: wfRow.id, currentStepCode: wfRow.currentStepCode } : null;
  const instanceId = wf?.id ?? null;

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'STANDARD_WORKFLOW_STARTED',
    newValue: {
      engineeringApproved: readiness.engineering.allApproved,
      toRequired: readiness.engineering.toRequired,
      blockingReasons: readiness.blockingReasons,
    },
    message: `STANDARD_WORKFLOW post-submit orchestration for ${inquiry.inquiryNumber}`,
  });

  emitDomainEvent({
    type: 'STANDARD_WORKFLOW_SUBMITTED',
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    actorId: actor.id,
    actorName: actor.name || actor.email,
    payload: { toRequired: readiness.engineering.toRequired },
  });

  if (!readiness.engineering.allApproved) {
    await notifyStandardWorkflowEvent({
      eventCode: 'STANDARD_TO_REQUIRED',
      title: `Technical Office required: ${inquiry.inquiryNumber}`,
      message: readiness.blockingReasons.join('; ') || 'Engineering exception — TO queue.',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      customerMasterId: inquiry.customerMasterId,
      notifyRole: 'TECHNICAL_OFFICE_ENGINEER',
    });
    emitDomainEvent({
      type: 'STANDARD_TO_REQUIRED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      actorId: actor.id,
      payload: { blockingReasons: readiness.blockingReasons },
    });
    return {
      status: 'TO_REQUIRED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      workflowStep: wf?.currentStepCode ?? 'TECHNICAL_REVIEW',
      gates: [...readiness.engineering.gates, ...readiness.lineageGates, readiness.containerStudy],
      blockingReasons: readiness.blockingReasons,
      quotation: null,
    };
  }

  if (inquiry.status === 'ENGINEERING_REVIEW' || inquiry.status === 'SUBMITTED') {
    await prisma.commercialInquiry.update({
      where: { id: inquiry.id },
      data: { status: 'READY_FOR_COMMERCIAL' },
    });
  }

  emitDomainEvent({
    type: 'STANDARD_ENGINEERING_APPROVED',
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    actorId: actor.id,
  });

  if (instanceId && wf?.currentStepCode === 'TECHNICAL_REVIEW') {
    await advance(instanceId, 'TECHNICAL_COMPLETE', actor, 'APPROVED');
    await advance(instanceId, 'TO_CONTAINER_STUDY', actor);
  }

  const lineageBlocks = readiness.lineageGates.filter((g) => g.status === 'BLOCK');
  if (lineageBlocks.length > 0) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'STANDARD_WORKFLOW_BLOCKED',
      newValue: { phase: 'LINEAGE', blockingReasons: lineageBlocks.map((g) => g.message) },
      message: `STANDARD_WORKFLOW stopped at lineage gate for ${inquiry.inquiryNumber}`,
    });
    return {
      status: 'COSTING_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      workflowStep: 'CONTAINER_STUDY',
      gates: [...readiness.engineering.gates, ...readiness.lineageGates, readiness.containerStudy],
      blockingReasons: lineageBlocks.map((g) => g.message),
      quotation: null,
    };
  }

  if (readiness.containerStudy.status === 'BLOCK') {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'STANDARD_WORKFLOW_BLOCKED',
      newValue: {
        phase: 'CONTAINER_STUDY',
        code: readiness.containerStudy.code,
        blockingReasons: [readiness.containerStudy.message],
      },
      message: `STANDARD_WORKFLOW stopped at Container Study gate for ${inquiry.inquiryNumber}`,
    });
    return {
      status: 'CONTAINER_STUDY_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      workflowStep: 'CONTAINER_STUDY',
      gates: [...readiness.engineering.gates, ...readiness.lineageGates, readiness.containerStudy],
      blockingReasons: [readiness.containerStudy.message],
      quotation: null,
    };
  }

  if (readiness.costingPin?.status === 'BLOCK') {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'STANDARD_WORKFLOW_BLOCKED',
      newValue: {
        phase: 'COSTING_PIN',
        code: readiness.costingPin.code,
        blockingReasons: [readiness.costingPin.message],
      },
      message: `STANDARD_WORKFLOW stopped at costing Container Study pin for ${inquiry.inquiryNumber}`,
    });
    return {
      status: 'COSTING_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      workflowStep: 'COSTING',
      gates: [
        ...readiness.engineering.gates,
        ...readiness.lineageGates,
        readiness.containerStudy,
        readiness.costingPin,
      ],
      blockingReasons: [readiness.costingPin.message],
      quotation: null,
    };
  }

  if (instanceId) {
    const atCs = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiry.id);
    if (atCs?.currentStepCode === 'CONTAINER_STUDY') {
      await advance(instanceId, 'TO_COSTING', actor);
    }
  }

  const costingGates = [
    ...readiness.engineering.gates,
    ...readiness.lineageGates,
    readiness.containerStudy,
    ...(readiness.costingPin ? [readiness.costingPin] : []),
  ];
  const requiredResultId = readiness.containerStudy.required ? readiness.containerStudy.requiredResultId : null;
  let costingFailed = false;
  for (const line of inquiry.lines) {
    if (line.costingCalculationId && line.costingRunId) continue;
    try {
      const costing = await calculateV2CostingRun(inquiry.id, line.id, actor, {
        containerStudyResultId: requiredResultId,
      });
      if (costing.status === 'NOT_READY') {
        costingFailed = true;
        costingGates.push({
          gate: 'COSTING',
          status: 'BLOCK',
          lineNumber: line.lineNumber,
          message: costing.blockingReasons.join('; ') || `Line ${line.lineNumber}: costing not ready.`,
          code: costing.errorCode,
        });
      }
    } catch (err) {
      costingFailed = true;
      const coded = err as Error & { code?: string; blockingReasons?: string[] };
      costingGates.push({
        gate: 'COSTING',
        status: 'BLOCK',
        lineNumber: line.lineNumber,
        message: (coded.blockingReasons || [coded.message]).join('; '),
        code: coded.code,
      });
    }
  }

  if (costingFailed) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'STANDARD_WORKFLOW_BLOCKED',
      newValue: { phase: 'COSTING' },
      message: `STANDARD_WORKFLOW stopped at costing for ${inquiry.inquiryNumber}`,
    });
    return {
      status: 'COSTING_BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      workflowStep: 'COSTING',
      gates: costingGates,
      blockingReasons: costingGates.filter((g) => g.status === 'BLOCK').map((g) => g.message),
      quotation: null,
    };
  }

  if (instanceId) {
    const latest = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiry.id);
    if (latest?.currentStepCode === 'COSTING') {
      await advance(instanceId, 'TO_SALES_REVIEW', actor);
    }
  }

  try {
    const existing = await getV2CurrentQuotation(inquiry.id, actor);
    let created = false;
    if (!existing) {
      await createV2QuotationDraftForVipCalculate(inquiry.id, actor);
      created = true;
    }
    const priced = await persistV2QuotationPricingForVipCalculate(inquiry.id, actor);

    emitDomainEvent({
      type: 'STANDARD_QUOTATION_DRAFT_CREATED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      actorId: actor.id,
      payload: { quotationNumber: priced.quotationNumber, created },
    });

    await notifyStandardWorkflowEvent({
      eventCode: 'STANDARD_QUOTATION_DRAFT_CREATED',
      title: `Quotation draft ${priced.quotationNumber}`,
      message: `STANDARD_WORKFLOW reached internal review for ${inquiry.inquiryNumber}.`,
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      customerMasterId: inquiry.customerMasterId,
      notifyRole: 'SALES_MANAGER',
    });

    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialQuotation',
      entityId: `${priced.quotationNumber}-V${priced.versionNo}`,
      action: 'STANDARD_QUOTATION_DRAFT',
      newValue: { inquiryNumber: inquiry.inquiryNumber, created },
      message: `STANDARD_WORKFLOW quotation draft ${priced.quotationNumber} for ${inquiry.inquiryNumber}`,
    });

    return {
      status: 'QUOTATION_DRAFT',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      workflowStep: 'SALES_REVIEW',
      gates: costingGates,
      blockingReasons: [],
      quotation: {
        id: priced.id,
        quotationNumber: priced.quotationNumber,
        versionNo: priced.versionNo,
        created,
      },
    };
  } catch (err) {
    const coded = err as Error & { code?: string };
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialInquiry',
      entityId: inquiry.inquiryNumber,
      action: 'STANDARD_WORKFLOW_BLOCKED',
      newValue: { phase: 'QUOTATION', code: coded.code, message: coded.message },
      message: `STANDARD_WORKFLOW stopped at quotation gate for ${inquiry.inquiryNumber}`,
    });
    return {
      status: 'BLOCKED',
      inquiryId: inquiry.id,
      inquiryNumber: inquiry.inquiryNumber,
      workflowStep: 'SALES_REVIEW',
      gates: costingGates,
      blockingReasons: [coded.message],
      quotation: null,
    };
  }
}

export async function syncStandardWorkflowAfterApprove(inquiryId: string, actor: RequestActor) {
  const wf = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiryId);
  if (!wf) return;
  if (wf.currentStepCode === 'SALES_REVIEW') {
    await advance(wf.id, 'TO_QUOTATION_APPROVAL', actor);
  }
  const latest = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiryId);
  if (latest?.currentStepCode === 'QUOTATION_APPROVAL') {
    await advance(latest.id, 'TO_QUOTATION_ISSUE', actor, 'APPROVED');
  }
}

export async function syncStandardWorkflowAfterReturn(inquiryId: string, actor: RequestActor) {
  const wf = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiryId);
  if (!wf) return;
  if (wf.currentStepCode === 'QUOTATION_APPROVAL') {
    await advance(wf.id, 'RETURN_TO_SALES', actor, 'RETURNED');
  } else if (wf.currentStepCode === 'QUOTATION_ISSUE') {
    await advance(wf.id, 'RETURN_FROM_ISSUE', actor, 'RETURNED');
  }
}

export async function syncStandardWorkflowAfterIssue(inquiryId: string, actor: RequestActor) {
  const wf = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiryId);
  if (!wf) return;
  if (wf.currentStepCode === 'QUOTATION_ISSUE') {
    await advance(wf.id, 'TO_CUSTOMER_DECISION', actor);
  }
}

export async function syncStandardWorkflowAfterCustomerAccept(inquiryId: string, actor: RequestActor) {
  const wf = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiryId);
  if (!wf) return;
  if (wf.currentStepCode === 'CUSTOMER_DECISION') {
    await advance(wf.id, 'TO_COMMITMENT', actor, 'ACCEPTED');
    const latest = await findActiveWorkflowForEntity(WORKFLOW_ENTITY_COMMERCIAL_INQUIRY, inquiryId);
    if (latest?.currentStepCode === 'COMMERCIAL_COMMITMENT') {
      await advance(latest.id, 'TO_FULFILLMENT', actor);
    }
  }
}
