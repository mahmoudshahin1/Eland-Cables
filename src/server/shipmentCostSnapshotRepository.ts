import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit, appendServerAuditTx } from './serverAudit';
import { issue } from '../platform/errors/domainError';
import { assertCanAccessInquiryOwnership } from './rbac';
import { canonicalizeCode, dateOnlyToUtc, formatDateOnlyUtc, parseDateOnly } from '../domain/shippingCostCanonical';
import {
  aggregateResultContainerQuantities,
  assertHomogeneousCurrency,
} from '../domain/shipmentCostSnapshotQuantities';
import { resolveShippingCostRateOn } from './shippingCostRepository';

const SNAPSHOT_ENTITY = 'ShipmentCostSnapshot';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorId(actor: RequestActor): string | null {
  return actor.id || actor.email || null;
}

function fail(issueCode: string, message: string, extra?: Record<string, unknown>): never {
  const code =
    issueCode === 'RESULT_NOT_FOUND' || issueCode === 'SNAPSHOT_NOT_FOUND'
      ? 'NOT_FOUND'
      : issueCode === 'SNAPSHOT_AS_OF_MISMATCH'
        ? 'CONFLICT'
        : 'VALIDATION_FAILED';
  throw issue(code, message, { issueCode, ...extra });
}

export type ShipmentCostSnapshotLineView = {
  id: string;
  containerTypeCode: string;
  containerQuantity: number;
  shippingCostRateId: string;
  rateAmount: string;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lineTotal: string;
};

export type ShipmentCostSnapshotView = {
  id: string;
  inquiryId: string;
  shipmentGroupId: string;
  containerStudyId: string;
  containerStudyResultId: string;
  resultId: string;
  destinationPortCode: string;
  incotermCode: string;
  rateAsOfDate: string;
  totalAmount: string;
  currencyCode: string;
  createdBy: string | null;
  createdAt: Date;
  lines: ShipmentCostSnapshotLineView[];
};

type SnapshotRow = {
  id: string;
  inquiryId: string;
  shipmentGroupId: string;
  containerStudyId: string;
  containerStudyResultId: string;
  destinationPortCode: string;
  incotermCode: string;
  rateAsOfDate: Date;
  totalAmount: Prisma.Decimal;
  currencyCode: string;
  createdBy: string | null;
  createdAt: Date;
  lines: Array<{
    id: string;
    containerTypeCode: string;
    containerQuantity: number;
    shippingCostRateId: string;
    rateAmount: Prisma.Decimal;
    currencyCode: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    lineTotal: Prisma.Decimal;
  }>;
  containerStudyResult: { resultId: string };
};

function serializeSnapshot(row: SnapshotRow): ShipmentCostSnapshotView {
  const lines = [...row.lines]
    .sort((a, b) => a.containerTypeCode.localeCompare(b.containerTypeCode))
    .map((line) => ({
      id: line.id,
      containerTypeCode: line.containerTypeCode,
      containerQuantity: line.containerQuantity,
      shippingCostRateId: line.shippingCostRateId,
      rateAmount: line.rateAmount.toString(),
      currencyCode: line.currencyCode,
      effectiveFrom: formatDateOnlyUtc(line.effectiveFrom),
      effectiveTo: line.effectiveTo ? formatDateOnlyUtc(line.effectiveTo) : null,
      lineTotal: line.lineTotal.toString(),
    }));
  return {
    id: row.id,
    inquiryId: row.inquiryId,
    shipmentGroupId: row.shipmentGroupId,
    containerStudyId: row.containerStudyId,
    containerStudyResultId: row.containerStudyResultId,
    resultId: row.containerStudyResult.resultId,
    destinationPortCode: row.destinationPortCode,
    incotermCode: row.incotermCode,
    rateAsOfDate: formatDateOnlyUtc(row.rateAsOfDate),
    totalAmount: row.totalAmount.toString(),
    currencyCode: row.currencyCode,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lines,
  };
}

const snapshotInclude = {
  lines: true,
  containerStudyResult: { select: { resultId: true } },
} as const;

async function loadResultGraph(
  tx: Prisma.TransactionClient,
  containerStudyResultId: string
) {
  return tx.containerStudyResult.findFirst({
    where: { OR: [{ id: containerStudyResultId }, { resultId: containerStudyResultId }] },
    include: {
      containers: { select: { typeCode: true } },
      unallocated: { select: { id: true } },
      study: {
        include: {
          shipmentGroup: true,
          inquiry: { select: { id: true, customerId: true, customerMasterId: true, inquiryDate: true } },
        },
      },
    },
  });
}

function auditNewValue(view: ShipmentCostSnapshotView) {
  return {
    containerStudyResultId: view.containerStudyResultId,
    resultId: view.resultId,
    shipmentGroupId: view.shipmentGroupId,
    destinationPortCode: view.destinationPortCode,
    incotermCode: view.incotermCode,
    rateAsOfDate: view.rateAsOfDate,
    currencyCode: view.currencyCode,
    totalAmount: view.totalAmount,
    lines: view.lines.map((line) => ({
      containerTypeCode: line.containerTypeCode,
      containerQuantity: line.containerQuantity,
      shippingCostRateId: line.shippingCostRateId,
      rateAmount: line.rateAmount,
      currencyCode: line.currencyCode,
      lineTotal: line.lineTotal,
    })),
  };
}

async function recordCreateFailed(input: {
  actor: RequestActor;
  entityId: string;
  issueCode: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await appendServerAudit({
    actorId: actorId(input.actor),
    actorName: input.actor.name || input.actor.email || null,
    entity: SNAPSHOT_ENTITY,
    entityId: input.entityId,
    action: 'SHIPMENT_COST_SNAPSHOT_CREATE_FAILED',
    newValue: { issueCode: input.issueCode, ...(input.details || {}) },
    message: input.message,
  });
}

export async function createShipmentCostSnapshot(
  input: {
    containerStudyResultId?: unknown;
    shipmentGroupId?: unknown;
    rateAsOfDate?: unknown;
    containerQuantities?: unknown;
    customerId?: unknown;
  },
  actor: RequestActor
): Promise<{ snapshot: ShipmentCostSnapshotView; created: boolean }> {
  const prisma = requirePrisma();
  const requestedResultId = String(input.containerStudyResultId ?? '').trim();
  if (!requestedResultId) fail('RESULT_NOT_FOUND', 'containerStudyResultId is required.');
  const requestedGroupId = String(input.shipmentGroupId ?? '').trim() || null;
  const callerSuppliedAsOf = input.rateAsOfDate !== undefined && input.rateAsOfDate !== null && String(input.rateAsOfDate).trim() !== '';

  try {
    return await prisma.$transaction(async (tx) => {
      const result = await loadResultGraph(tx, requestedResultId);
      if (!result) fail('RESULT_NOT_FOUND', 'Container study result was not found.');
      const study = result.study;
      assertCanAccessInquiryOwnership(actor, study.inquiry.customerId, study.inquiry.customerMasterId);

      if (requestedGroupId && requestedGroupId !== study.shipmentGroupId) {
        fail('INVALID_SHIPMENT_GROUP', 'shipmentGroupId does not match the result’s study group.');
      }
      if (study.shipmentGroupId !== study.shipmentGroup.id || study.inquiryId !== study.inquiry.id) {
        fail('RESULT_INTEGRITY_FAILED', 'Result/study/group/inquiry graph is inconsistent.');
      }
      if (study.shipmentGroup.status === 'SUPERSEDED') {
        fail('INVALID_SHIPMENT_GROUP', 'Cannot snapshot a SUPERSEDED shipment group.');
      }
      if (study.status === 'SUPERSEDED') {
        fail('RESULT_SUPERSEDED', 'Cannot snapshot a SUPERSEDED study. Confirm a successor result first.');
      }
      if (study.status !== 'CONFIRMED') {
        fail('RESULT_NOT_CONFIRMED', 'Shipment cost snapshot requires a CONFIRMED container study.');
      }
      if (study.currentResultId !== result.id) {
        fail('RESULT_NOT_CONFIRMED', 'Snapshot must bind to the study’s current confirmed result.');
      }
      if (result.inputSnapshotId !== study.currentSnapshotId) {
        fail('RESULT_INTEGRITY_FAILED', 'Result input snapshot is not the study’s current snapshot.');
      }
      if (result.unallocated.length > 0) {
        fail('UNALLOCATED_CONTAINERS', 'Unallocated drums block shipment cost snapshot creation.');
      }

      const destinationPortCode = canonicalizeCode(study.shipmentGroup.destinationPortCode);
      const incotermCode = canonicalizeCode(study.shipmentGroup.incotermCode);
      if (!destinationPortCode || !incotermCode) {
        fail('INVALID_SHIPMENT_GROUP', 'Shipment group destination port and incoterm are required.');
      }

      let rateAsOfDate = callerSuppliedAsOf ? parseDateOnly(input.rateAsOfDate) : formatDateOnlyUtc(study.inquiry.inquiryDate);
      if (!rateAsOfDate) fail('INVALID_AS_OF_DATE', 'rateAsOfDate must be a calendar date (YYYY-MM-DD).');

      const existing = await tx.shipmentCostSnapshot.findUnique({
        where: { containerStudyResultId: result.id },
        include: snapshotInclude,
      });
      if (existing) {
        const view = serializeSnapshot(existing);
        if (callerSuppliedAsOf && view.rateAsOfDate !== rateAsOfDate) {
          fail('SNAPSHOT_AS_OF_MISMATCH', 'A snapshot already exists for this result with a different rateAsOfDate.');
        }
        return { snapshot: view, created: false };
      }

      const aggregated = aggregateResultContainerQuantities(result.containers);
      if (aggregated.ok === false) {
        fail(
          aggregated.issueCode,
          aggregated.issueCode === 'CONTAINER_TYPE_NOT_FOUND'
            ? 'Every result container must have a non-blank typeCode.'
            : 'Confirmed result has no shippable containers.'
        );
      }

      const typeCodes = aggregated.lines.map((line) => line.containerTypeCode);
      const knownTypes = await tx.containerType.findMany({
        where: { code: { in: typeCodes } },
        select: { code: true },
      });
      const known = new Set(knownTypes.map((row) => row.code));
      const unknown = typeCodes.filter((code) => !known.has(code));
      if (unknown.length) {
        fail('CONTAINER_TYPE_NOT_FOUND', `Unknown container type code(s): ${unknown.join(', ')}.`, {
          containerTypeCodes: unknown,
        });
      }

      const resolvedLines: Array<{
        containerTypeCode: string;
        containerQuantity: number;
        shippingCostRateId: string;
        rateAmount: Prisma.Decimal;
        currencyCode: string;
        effectiveFrom: Date;
        effectiveTo: Date | null;
        lineTotal: Prisma.Decimal;
      }> = [];

      for (const line of aggregated.lines) {
        const resolved = await resolveShippingCostRateOn(tx, {
          destinationPortCode,
          incotermCode,
          containerTypeCode: line.containerTypeCode,
          asOfDate: rateAsOfDate,
        });
        if (resolved.status === 'RATE_NOT_FOUND') {
          fail('RATE_NOT_FOUND', `No shipping cost rate covers ${line.containerTypeCode} on ${rateAsOfDate}.`, {
            containerTypeCode: line.containerTypeCode,
            destinationPortCode,
            incotermCode,
            rateAsOfDate,
          });
        }
        if (resolved.status === 'RATE_AMBIGUOUS') {
          fail('RATE_AMBIGUOUS', `Multiple shipping cost rates cover ${line.containerTypeCode} on ${rateAsOfDate}.`, {
            containerTypeCode: line.containerTypeCode,
            matchIds: resolved.matchIds,
            matchCount: resolved.matchCount,
          });
        }
        const selected = resolved.rate;
        if (!selected) fail('RATE_NOT_FOUND', 'Resolver returned SELECT without a rate.');
        const dbRate = await tx.shippingCostRate.findUnique({ where: { id: selected.id } });
        if (!dbRate) fail('RATE_NOT_FOUND', 'Selected shipping cost rate is no longer present.');
        const quantity = new Prisma.Decimal(line.containerQuantity);
        const rateAmount = dbRate.rateAmount;
        resolvedLines.push({
          containerTypeCode: line.containerTypeCode,
          containerQuantity: line.containerQuantity,
          shippingCostRateId: dbRate.id,
          rateAmount,
          currencyCode: dbRate.currencyCode,
          effectiveFrom: dbRate.effectiveFrom,
          effectiveTo: dbRate.effectiveTo,
          lineTotal: quantity.mul(rateAmount),
        });
      }

      const currency = assertHomogeneousCurrency(resolvedLines.map((line) => line.currencyCode));
      if (currency.ok === false) {
        fail('CURRENCY_INCOMPATIBLE', 'Selected shipping rates do not share one currency. No FX is performed.');
      }
      const totalAmount = resolvedLines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));

      const created = await tx.shipmentCostSnapshot.create({
        data: {
          inquiryId: study.inquiryId,
          shipmentGroupId: study.shipmentGroupId,
          containerStudyId: study.id,
          containerStudyResultId: result.id,
          destinationPortCode,
          incotermCode,
          rateAsOfDate: dateOnlyToUtc(rateAsOfDate),
          totalAmount,
          currencyCode: currency.currencyCode,
          createdBy: actorId(actor),
          lines: {
            create: resolvedLines.map((line) => ({
              containerTypeCode: line.containerTypeCode,
              containerQuantity: line.containerQuantity,
              shippingCostRateId: line.shippingCostRateId,
              rateAmount: line.rateAmount,
              currencyCode: line.currencyCode,
              effectiveFrom: line.effectiveFrom,
              effectiveTo: line.effectiveTo,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: snapshotInclude,
      });
      const view = serializeSnapshot(created);
      await appendServerAuditTx(tx, {
        actorId: actorId(actor),
        actorName: actor.name || actor.email || null,
        entity: SNAPSHOT_ENTITY,
        entityId: view.id,
        action: 'SHIPMENT_COST_SNAPSHOT_CREATED',
        newValue: auditNewValue(view),
        message: `Shipment cost snapshot created for result ${view.resultId}`,
      });
      return { snapshot: view, created: true };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.shipmentCostSnapshot.findFirst({
        where: {
          containerStudyResult: {
            OR: [{ id: requestedResultId }, { resultId: requestedResultId }],
          },
        },
        include: snapshotInclude,
      });
      if (!winner) throw err;
      const view = serializeSnapshot(winner);
      if (callerSuppliedAsOf) {
        const supplied = parseDateOnly(input.rateAsOfDate);
        if (supplied && view.rateAsOfDate !== supplied) {
          fail('SNAPSHOT_AS_OF_MISMATCH', 'A snapshot already exists for this result with a different rateAsOfDate.');
        }
      }
      return { snapshot: view, created: false };
    }
    if (err && typeof err === 'object' && 'details' in err) {
      const details = (err as { details?: { issueCode?: string } }).details;
      const issueCode = details?.issueCode;
      if (
        issueCode &&
        issueCode !== 'RESULT_NOT_FOUND' &&
        issueCode !== 'SNAPSHOT_AS_OF_MISMATCH' &&
        issueCode !== 'SNAPSHOT_NOT_FOUND'
      ) {
        await recordCreateFailed({
          actor,
          entityId: requestedResultId,
          issueCode,
          message: err instanceof Error ? err.message : 'Shipment cost snapshot create failed',
          details: details as Record<string, unknown>,
        });
      }
    }
    throw err;
  }
}

export async function getShipmentCostSnapshot(id: string, actor: RequestActor): Promise<ShipmentCostSnapshotView> {
  const prisma = requirePrisma();
  const row = await prisma.shipmentCostSnapshot.findUnique({
    where: { id },
    include: {
      ...snapshotInclude,
      inquiry: { select: { customerId: true, customerMasterId: true } },
    },
  });
  if (!row) fail('SNAPSHOT_NOT_FOUND', 'Shipment cost snapshot was not found.');
  assertCanAccessInquiryOwnership(actor, row.inquiry.customerId, row.inquiry.customerMasterId);
  return serializeSnapshot(row);
}

export async function getShipmentCostSnapshotByResult(
  containerStudyResultId: string,
  actor: RequestActor
): Promise<ShipmentCostSnapshotView> {
  const prisma = requirePrisma();
  const result = await prisma.containerStudyResult.findFirst({
    where: { OR: [{ id: containerStudyResultId }, { resultId: containerStudyResultId }] },
    include: {
      study: { include: { inquiry: { select: { customerId: true, customerMasterId: true } } } },
      shipmentCostSnapshot: { include: snapshotInclude },
    },
  });
  if (!result) fail('RESULT_NOT_FOUND', 'Container study result was not found.');
  assertCanAccessInquiryOwnership(actor, result.study.inquiry.customerId, result.study.inquiry.customerMasterId);
  if (!result.shipmentCostSnapshot) fail('SNAPSHOT_NOT_FOUND', 'No shipment cost snapshot exists for this result.');
  return serializeSnapshot(result.shipmentCostSnapshot);
}
