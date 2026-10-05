import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { loadV2InquiryScoped } from './v2InquiryConfigurationRepository';
import { getV2DrumPlanHandoff } from './v2DrumPlanRepository';
import {
  mapV2CostingResponse,
  runV2CostingForLine,
  type V2CostingLineageAnswer,
} from '../domain/v2CostingRunService';
import { V2_COSTING_WORKFLOW_CHANNEL } from '../domain/v2CostingRequestService';
import { isV2InquiryMetadata } from '../domain/v2InquiryWorkflow';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function assertCostingAllowed(inquiry: { inquiryNumber: string; status: string }) {
  if (inquiry.status !== 'DRAFT' && inquiry.status !== 'UNDER_REVIEW') {
    const err = new Error(
      `Inquiry ${inquiry.inquiryNumber} is ${inquiry.status}. Create a new version to recalculate costs.`
    );
    (err as Error & { code: string }).code = 'COSTING_LOCKED';
    throw err;
  }
}

async function resolveV2Handoff(
  inquiryId: string,
  lineId: string,
  actor: RequestActor,
  drumPlanId?: string | null
) {
  const inquiry = await loadV2InquiryScoped(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const planId = drumPlanId || line.v2CurrentDrumPlanId;
  if (!planId) {
    const err = new Error('V2 costing requires a CONFIRMED drum plan on the inquiry line.');
    (err as Error & { code: string }).code = 'DRUM_PLAN_REQUIRED';
    throw err;
  }
  const handoff = await getV2DrumPlanHandoff(inquiry.id, line.id, planId, actor);
  return { inquiry, line, handoff };
}

export async function previewV2CostingRun(
  inquiryId: string,
  lineId: string,
  actor: RequestActor
) {
  const { inquiry, line, handoff } = await resolveV2Handoff(inquiryId, lineId, actor);
  const result = await runV2CostingForLine(
    {
      persist: false,
      inquiryId: inquiry.id,
      inquiryLineId: line.id,
      handoff,
      header: {
        currency: inquiry.currency,
        inquiryDate: inquiry.inquiryDate,
        incoterms: inquiry.incoterms,
        commercialMetadata: inquiry.commercialMetadata as Record<string, unknown> | null,
      },
      lineQuantity: Number(line.requestedQuantity),
    },
    actor
  );

  if (result.status === 'NOT_READY') {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'V2CostingRun',
      entityId: `${inquiry.inquiryNumber}-L${line.lineNumber}`,
      action: 'PREVIEW_BLOCKED',
      newValue: {
        blockingReasons: result.blockingReasons,
        errorCode: result.errorCode,
        drumPlanId: handoff.drumPlanId,
      },
      message: `V2 costing preview blocked for ${inquiry.inquiryNumber} line ${line.lineNumber}`,
    });
  }

  return mapV2CostingResponse(result, result.lineage);
}

export async function calculateV2CostingRun(
  inquiryId: string,
  lineId: string,
  actor: RequestActor,
  options?: { containerStudyResultId?: string | null }
) {
  const { inquiry, line, handoff } = await resolveV2Handoff(inquiryId, lineId, actor);
  assertCostingAllowed(inquiry);

  const result = await runV2CostingForLine(
    {
      persist: true,
      inquiryId: inquiry.id,
      inquiryLineId: line.id,
      handoff,
      header: {
        currency: inquiry.currency,
        inquiryDate: inquiry.inquiryDate,
        incoterms: inquiry.incoterms,
        commercialMetadata: inquiry.commercialMetadata as Record<string, unknown> | null,
      },
      lineQuantity: Number(line.requestedQuantity),
      containerStudyResultId: options?.containerStudyResultId,
    },
    actor
  );

  const prisma = requirePrisma();
  const calculation = result.calculationId
    ? await prisma.costingCalculation.findUnique({ where: { id: result.calculationId } })
    : null;

  if (result.persisted && result.calculationId) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'V2CostingRun',
      entityId: calculation?.calculationNumber || result.calculationId,
      action: 'CALCULATE',
      newValue: {
        inquiryNumber: inquiry.inquiryNumber,
        lineNumber: line.lineNumber,
        materialCost: result.totals.materialCost,
        currency: result.currency,
        drumPlanId: handoff.drumPlanId,
        configurationSnapshotId: handoff.configurationSnapshotId,
        costingRunId: result.costingRunId,
        containerStudyResultId: result.containerStudyResultId ?? null,
      },
      message: `V2 costing run persisted for ${inquiry.inquiryNumber} line ${line.lineNumber}`,
    });
  } else if (result.status === 'NOT_READY') {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'V2CostingRun',
      entityId: `${inquiry.inquiryNumber}-L${line.lineNumber}`,
      action: 'CALCULATE_BLOCKED',
      newValue: {
        blockingReasons: result.blockingReasons,
        errorCode: result.errorCode,
      },
      message: `V2 costing calculate blocked (gates) for ${inquiry.inquiryNumber} line ${line.lineNumber}`,
    });
  }

  return {
    ...mapV2CostingResponse(
      result,
      result.lineage,
      calculation?.referenceSnapshot as Record<string, unknown> | null
    ),
    calculationNumber: calculation?.calculationNumber,
  };
}

export async function getV2CurrentCostingRun(
  inquiryId: string,
  lineId: string,
  actor: RequestActor
) {
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
  if (!calculation) {
    return { run: null };
  }

  const run = line.costingRunId
    ? await prisma.costingRun.findUnique({ where: { id: line.costingRunId } })
    : await prisma.costingRun.findFirst({
        where: { inquiryLineId: line.id, isCurrent: true },
        orderBy: { createdAt: 'desc' },
      });

  const ref = (calculation.referenceSnapshot || {}) as Record<string, unknown>;
  const lineage: V2CostingLineageAnswer = {
    inquiryLineId: line.id,
    configurationSnapshotId: calculation.configurationSnapshotId || String(ref.configurationSnapshotId || ''),
    configurationSnapshotIdString: String(ref.configurationSnapshotId || calculation.configurationSnapshotId || ''),
    cuttingLengthPlanId: calculation.cuttingLengthPlanId || String(ref.cuttingLengthPlanId || ''),
    cuttingLengthPlanIdString: String(ref.cuttingLengthPlanId || calculation.cuttingLengthPlanId || ''),
    drumPlanId: calculation.drumPlanId || String(ref.drumPlanId || ''),
    drumPlanIdString: String(ref.drumPlanId || calculation.drumPlanId || ''),
    drumPlanVersionNo: calculation.drumPlanVersionNo ?? Number(ref.drumPlanVersionNo) ?? 0,
    bomVersion: (ref.bomVersion as number) ?? null,
    engineeringRevision: (ref.engineeringRevision as number) ?? null,
    workflowChannel: calculation.workflowChannel || V2_COSTING_WORKFLOW_CHANNEL,
    decision5Status: 'PENDING_BUSINESS_SIGN_OFF',
    governedBomLineIds: ref.governedBomLineIds as string[] | undefined,
    rawMaterialPriceIds: ref.rawMaterialPriceIds as Record<string, string> | undefined,
    metalPricingSnapshot: ref.marketMetalSnapshot,
  };

  const output = (calculation.outputSnapshot || {}) as { totals?: { materialCost?: string } };
  return {
    run: {
      calculationId: calculation.id,
      calculationNumber: calculation.calculationNumber,
      costingRunId: run?.id ?? line.costingRunId,
      costingRunNumber: run?.costingRunNumber ?? null,
      materialCost: Number(output.totals?.materialCost ?? line.materialCost ?? 0),
      currency: run?.currency ?? line.materialCostCurrency ?? inquiry.currency,
      status: calculation.status,
      createdAt: calculation.createdAt.toISOString(),
      lineage,
      blockingReasons: (run?.blockingReasons as string[]) || [],
      containerStudyResultId: run ? run.containerStudyResultId ?? null : calculation.containerStudyResultId ?? null,
    },
  };
}

export async function getV2CostingRunLineage(
  inquiryId: string,
  lineId: string,
  calculationId: string,
  actor: RequestActor
) {
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
      id: calculationId,
      inquiryLineId: line.id,
      workflowChannel: V2_COSTING_WORKFLOW_CHANNEL,
    },
  });
  if (!calculation) {
    const err = new Error(`V2 costing calculation ${calculationId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const input = (calculation.inputSnapshot || {}) as Record<string, unknown>;
  const ref = (calculation.referenceSnapshot || {}) as Record<string, unknown>;
  const output = (calculation.outputSnapshot || {}) as { totals?: { materialCost?: string } };

  return {
    calculationId: calculation.id,
    calculationNumber: calculation.calculationNumber,
    inquiryNumber: inquiry.inquiryNumber,
    lineNumber: line.lineNumber,
    materialCost: Number(output.totals?.materialCost ?? 0),
    currency: inquiry.currency,
    capturedAt: calculation.createdAt.toISOString(),
    workflowChannel: calculation.workflowChannel,
    decision5Status: 'PENDING_BUSINESS_SIGN_OFF',
    containerStudyResultId: calculation.containerStudyResultId,
    lineage: {
      inquiryLineId: line.id,
      configurationSnapshotId: calculation.configurationSnapshotId,
      configurationSnapshotIdString: ref.configurationSnapshotId,
      cuttingLengthPlanId: calculation.cuttingLengthPlanId,
      cuttingLengthPlanIdString: ref.cuttingLengthPlanId,
      drumPlanId: calculation.drumPlanId,
      drumPlanIdString: ref.drumPlanId,
      drumPlanVersionNo: calculation.drumPlanVersionNo,
      bomVersion: ref.bomVersion,
      engineeringRevision: ref.engineeringRevision,
      governedBomLineIds: ref.governedBomLineIds,
      rawMaterialPriceIds: ref.rawMaterialPriceIds,
      metalPricingSnapshot: ref.marketMetalSnapshot ?? input.metalPricingSnapshot,
      v2Handoff: input.v2Handoff,
    },
    answer:
      'This cost was produced from the pinned V2 configuration snapshot, cutting plan, CONFIRMED drum plan, governed BOM lines, and raw-material prices snapshotted at calculation time.',
  };
}

export function assertV2CostingChannel(metadata: unknown) {
  if (!isV2InquiryMetadata(metadata)) {
    const err = new Error('Costing endpoint requires V2_CONFIGURATION workflow channel.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
}
