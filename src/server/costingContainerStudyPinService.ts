/**
 * 05I-DF-D — resolve a ContainerStudyResult once at CostingRun creation and bind shipping to that pin.
 * Never queries latest study/result after the pin is chosen. Does not calculate Container Study.
 */

import { getPrisma } from './db';
import { appendServerAudit } from './serverAudit';
import { getInquiryProcessCode } from '../domain/inquiryProcessCommands';
import {
  CONTAINER_STUDY_RESULT_AMBIGUOUS,
  CONTAINER_STUDY_RESULT_NOT_FOUND,
  CONTAINER_STUDY_RESULT_REQUIRED,
  VIP_SHIPMENT_NOT_CONFIGURED,
  containerStudyRequiredForCosting,
  evaluateCostingContainerStudyPin,
  type PinnedContainerStudyResultView,
} from '../domain/costingContainerStudyPin';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export type PinnedShippingFacts = {
  containerStudyResultId: string;
  transactionSnapshot: {
    id: string;
    resolutionCode: string;
    amount: number | null;
    currency: string | null;
    deliveryPoint: string | null;
    containerType: string | null;
  } | null;
  shipmentCostSnapshot: {
    id: string;
    totalAmount: number;
    currencyCode: string;
    destinationPortCode: string;
    incotermCode: string;
  } | null;
};

export type CostingContainerStudyPinSuccess = {
  ok: true;
  required: boolean;
  containerStudyResultId: string | null;
  studyId: string | null;
  inputSnapshotId: string | null;
  warnings: string[];
  shipping: PinnedShippingFacts | null;
};

export type CostingContainerStudyPinFailure = {
  ok: false;
  code: string;
  message: string;
  blockingReasons: string[];
};

export type CostingContainerStudyPinResult = CostingContainerStudyPinSuccess | CostingContainerStudyPinFailure;

function toView(row: {
  id: string;
  studyId: string;
  inputSnapshotId: string;
  study: { inquiryId: string };
}): PinnedContainerStudyResultView {
  return {
    id: row.id,
    studyId: row.studyId,
    inputSnapshotId: row.inputSnapshotId,
    inquiryId: row.study.inquiryId,
  };
}

export async function loadShippingBoundToPinnedResult(
  containerStudyResultId: string
): Promise<PinnedShippingFacts> {
  const prisma = requirePrisma();
  const [txn, b4c] = await Promise.all([
    prisma.shippingCostTransactionSnapshot.findUnique({
      where: { containerStudyResultId },
    }),
    prisma.shipmentCostSnapshot.findUnique({
      where: { containerStudyResultId },
    }),
  ]);
  return {
    containerStudyResultId,
    transactionSnapshot: txn
      ? {
          id: txn.id,
          resolutionCode: txn.resolutionCode,
          amount: txn.amount != null ? Number(txn.amount) : null,
          currency: txn.currency,
          deliveryPoint: txn.deliveryPoint,
          containerType: txn.containerType,
        }
      : null,
    shipmentCostSnapshot: b4c
      ? {
          id: b4c.id,
          totalAmount: Number(b4c.totalAmount),
          currencyCode: b4c.currencyCode,
          destinationPortCode: b4c.destinationPortCode,
          incotermCode: b4c.incotermCode,
        }
      : null,
  };
}

async function loadResultByIdOrResultId(requested: string) {
  const prisma = requirePrisma();
  return prisma.containerStudyResult.findFirst({
    where: { OR: [{ id: requested }, { resultId: requested }] },
    include: { study: { select: { inquiryId: true, currentResultId: true } } },
  });
}

function studyCoversLine(
  study: {
    shipmentGroup: {
      deliveryAllocationMode: string;
      inquiryLineId: string | null;
      memberLines: Array<{ inquiryLineId: string }>;
    };
  },
  inquiryLineId: string | undefined
): boolean {
  if (!inquiryLineId) return true;
  if (study.shipmentGroup.memberLines.some((m) => m.inquiryLineId === inquiryLineId)) return true;
  if (study.shipmentGroup.deliveryAllocationMode === 'ENTIRE_INQUIRY') return true;
  if (study.shipmentGroup.inquiryLineId === inquiryLineId) return true;
  return false;
}

/**
 * Resolve the exact ContainerStudyResult once for a new CostingRun.
 * Subsequent costing/shipping for that run must use the returned id, not currentResultId.
 */
export async function resolveCostingContainerStudyPin(input: {
  inquiryId: string;
  inquiryLineId?: string | null;
  requestedResultId?: string | null;
  expectedStudyId?: string | null;
  expectedSnapshotId?: string | null;
}): Promise<CostingContainerStudyPinResult> {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({
    where: { id: input.inquiryId },
    select: { id: true, commercialMetadata: true },
  });
  if (!inquiry) {
    return {
      ok: false,
      code: CONTAINER_STUDY_RESULT_NOT_FOUND,
      message: 'Inquiry was not found for Container Study costing pin.',
      blockingReasons: ['Inquiry was not found for Container Study costing pin.'],
    };
  }

  const processCode = getInquiryProcessCode(inquiry);
  const [groupCount, studyCount] = await Promise.all([
    prisma.containerShipmentGroup.count({ where: { inquiryId: input.inquiryId } }),
    prisma.containerStudy.count({ where: { inquiryId: input.inquiryId } }),
  ]);
  const logisticsScenarioActive = groupCount > 0 || studyCount > 0;
  const required = containerStudyRequiredForCosting({
    hasInquiry: true,
    processCode,
    logisticsScenarioActive,
  });

  const requested = String(input.requestedResultId || '').trim();
  let chosen: ReturnType<typeof toView> | null = null;
  let studyId: string | null = null;
  let inputSnapshotId: string | null = null;

  if (requested) {
    const row = await loadResultByIdOrResultId(requested);
    if (!row) {
      return {
        ok: false,
        code: CONTAINER_STUDY_RESULT_NOT_FOUND,
        message: 'Container Study Result was not found.',
        blockingReasons: ['Container Study Result was not found.'],
      };
    }
    const checked = evaluateCostingContainerStudyPin({
      result: toView(row),
      inquiryId: input.inquiryId,
      expectedStudyId: input.expectedStudyId,
      expectedSnapshotId: input.expectedSnapshotId,
    });
    if (checked.ok === false) {
      return {
        ok: false,
        code: checked.code,
        message: checked.message,
        blockingReasons: [checked.message],
      };
    }
    chosen = toView(row);
    studyId = row.studyId;
    inputSnapshotId = row.inputSnapshotId;
  } else if (logisticsScenarioActive) {
    const studies = await prisma.containerStudy.findMany({
      where: { inquiryId: input.inquiryId },
      include: {
        shipmentGroup: {
          select: {
            deliveryAllocationMode: true,
            inquiryLineId: true,
            memberLines: { select: { inquiryLineId: true } },
          },
        },
      },
    });
    const covering = studies.filter((s) => studyCoversLine(s, input.inquiryLineId || undefined));
    const currentIds = covering.map((s) => s.currentResultId).filter((id): id is string => Boolean(id));
    const unique = [...new Set(currentIds)];
    if (unique.length > 1) {
      return {
        ok: false,
        code: CONTAINER_STUDY_RESULT_AMBIGUOUS,
        message: 'Multiple Container Study Results apply; pin an explicit containerStudyResultId.',
        blockingReasons: ['Multiple Container Study Results apply; pin an explicit containerStudyResultId.'],
      };
    }
    if (unique.length === 1) {
      const row = await loadResultByIdOrResultId(unique[0]);
      if (!row) {
        return {
          ok: false,
          code: CONTAINER_STUDY_RESULT_NOT_FOUND,
          message: 'Container Study Result was not found.',
          blockingReasons: ['Container Study Result was not found.'],
        };
      }
      const checked = evaluateCostingContainerStudyPin({
        result: toView(row),
        inquiryId: input.inquiryId,
        expectedStudyId: input.expectedStudyId,
        expectedSnapshotId: input.expectedSnapshotId,
      });
      if (checked.ok === false) {
        return {
          ok: false,
          code: checked.code,
          message: checked.message,
          blockingReasons: [checked.message],
        };
      }
      chosen = toView(row);
      studyId = row.studyId;
      inputSnapshotId = row.inputSnapshotId;
    }
  }

  if (required && !chosen) {
    const message = 'A valid Container Study Result is required before costing can proceed.';
    return {
      ok: false,
      code: CONTAINER_STUDY_RESULT_REQUIRED,
      message,
      blockingReasons: [message],
    };
  }

  const warnings: string[] = [];
  if (!required && logisticsScenarioActive && !chosen && processCode === 'VIP_FAST_TRACK') {
    warnings.push(VIP_SHIPMENT_NOT_CONFIGURED);
  }
  const shipping = chosen ? await loadShippingBoundToPinnedResult(chosen.id) : null;
  if (chosen && !shipping?.shipmentCostSnapshot && (shipping?.transactionSnapshot?.amount == null || shipping.transactionSnapshot.amount === 0)) {
    warnings.push(processCode === 'VIP_FAST_TRACK' ? VIP_SHIPMENT_NOT_CONFIGURED : 'SHIPPING_CHARGES_NOT_AVAILABLE');
  }

  return {
    ok: true,
    required,
    containerStudyResultId: chosen?.id ?? null,
    studyId,
    inputSnapshotId,
    warnings,
    shipping,
  };
}

export async function auditCostingContainerStudyPin(input: {
  actor: { id?: string; name?: string; email?: string };
  costingRunId: string;
  costingRunNumber: string;
  containerStudyResultId: string | null;
  inquiryId?: string;
  inquiryLineId?: string;
}): Promise<void> {
  await appendServerAudit({
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email,
    entity: 'CostingRun',
    entityId: input.costingRunNumber,
    action: 'PIN_CONTAINER_STUDY_RESULT',
    newValue: {
      costingRunId: input.costingRunId,
      costingRunNumber: input.costingRunNumber,
      containerStudyResultId: input.containerStudyResultId,
      inquiryId: input.inquiryId,
      inquiryLineId: input.inquiryLineId,
    },
    message: input.containerStudyResultId
      ? `CostingRun ${input.costingRunNumber} pinned ContainerStudyResult ${input.containerStudyResultId}`
      : `CostingRun ${input.costingRunNumber} created without a Container Study Result pin`,
  });
}
