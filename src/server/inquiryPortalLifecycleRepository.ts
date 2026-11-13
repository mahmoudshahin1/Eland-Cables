/**
 * Portal lifecycle on top of the existing inquiry rows.
 * Does not change the InquiryStatus enum and does not drop data.
 * Open stays DRAFT. Not Submitted / Accepted are stored in commercialMetadata.
 * A new version is a new row that keeps the same display number.
 */

import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { assertCanAccessInquiryOwnership } from './rbac';
import { allocateNextNumber } from './numberSequenceService';
import {
  displayInquiryNumber,
  inquiryCalculationFingerprint,
  legacyInquiryLineFingerprint,
  portalLifecycleFromInquiry,
  shouldForkCalculatedInquiry,
  withPortalLifecycle,
} from '../domain/inquiryPortalLifecycle';
import {
  buildInquiryVersionSnapshot,
  diffInquiryVersions,
  parseInquiryVersionSnapshot,
  type VersionChangeItem,
} from '../domain/inquiryVersionDiff';
import { appendServerAudit } from './serverAudit';

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw Object.assign(new Error('Database is not configured.'), { code: 'DB_UNAVAILABLE' });
  return prisma;
}

function throwCode(message: string, code: string): never {
  throw Object.assign(new Error(message), { code });
}

function metadataOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export async function allocatePortalInquiryNumber(actor?: RequestActor): Promise<string> {
  const prisma = requirePrisma();
  const code = 'INQ_PORTAL';
  const existing = await prisma.numberSequence.findUnique({ where: { code } });
  if (!existing) {
    try {
      await prisma.numberSequence.create({
        data: {
          code,
          name: 'Portal inquiry',
          prefix: 'INQ-',
          format: '{PREFIX}{YY}-{###}',
          nextSerial: 1,
          active: true,
          description: 'Short inquiry numbers such as INQ-26-001. Existing long numbers stay valid.',
        },
      });
    } catch (err) {
      const known = err as { code?: string };
      if (known.code !== 'P2002') throw err;
    }
  }
  const allocated = await allocateNextNumber(code, actor);
  return allocated.value;
}

async function loadInquiry(inquiryId: string) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!inquiry) throwCode(`Inquiry ${inquiryId} not found.`, 'NOT_FOUND');
  return inquiry;
}

function lineCreates(lines: Awaited<ReturnType<typeof loadInquiry>>['lines']) {
  return lines.map((line) => ({
    lineNumber: line.lineNumber,
    materialNumber: line.materialNumber,
    customerCode: line.customerCode,
    itemCode: line.itemCode,
    cableDescription: line.cableDescription,
    requestedQuantity: line.requestedQuantity,
    quantityUom: line.quantityUom,
    requestedLengthMeters: line.requestedLengthMeters,
    cuttingLengthMeters: line.cuttingLengthMeters,
    drumType: line.drumType,
    cableTolerancePercent: line.cableTolerancePercent,
    drumSchedule: line.drumSchedule === null ? Prisma.JsonNull : line.drumSchedule,
    configurationPayload: line.configurationPayload === null ? Prisma.JsonNull : line.configurationPayload,
    cableAuthorityStatus: line.cableAuthorityStatus,
    technicalOfficeRequestId: line.technicalOfficeRequestId,
    costingReadinessStatus: line.costingReadinessStatus,
    costingRunId: line.costingRunId,
    costingCalculationId: line.costingCalculationId,
    materialCost: line.materialCost,
    materialCostCurrency: line.materialCostCurrency,
    status: 'DRAFT' as const,
    notes: line.notes,
    v2CurrentSnapshotId: line.v2CurrentSnapshotId,
    v2CurrentCuttingPlanId: line.v2CurrentCuttingPlanId,
    v2CurrentDrumPlanId: line.v2CurrentDrumPlanId,
  }));
}

function inquiryInclude() {
  return {
    lines: { orderBy: { lineNumber: 'asc' as const } },
    quotations: { where: { isCurrent: true } },
  };
}

export async function preparePortalCalculateTarget(inquiryId: string, actor: RequestActor) {
  const current = await loadInquiry(inquiryId);
  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);
  const legacyFingerprint = legacyInquiryLineFingerprint(current.lines);
  const fingerprint = inquiryCalculationFingerprint(current);
  const lifecycle = portalLifecycleFromInquiry(current);
  const acceptedAt =
    typeof metadataOf(current.commercialMetadata).acceptedAt === 'string'
      ? String(metadataOf(current.commercialMetadata).acceptedAt)
      : null;

  if (lifecycle === 'ACCEPTED') {
    const editable = await acceptedOrderStillEditable(current.id, current.inquiryGroupKey || current.inquiryNumber);
    if (!editable) {
      throwCode(
        'This inquiry is Accepted and the sales order is outside the 7-day window or already released to production.',
        'INVALID_STATE'
      );
    }
  }

  if (!shouldForkCalculatedInquiry({
    ...current,
    lineFingerprint: fingerprint,
    legacyLineFingerprint: legacyFingerprint,
  })) {
    return {
      inquiryId: current.id,
      inquiryNumber: current.inquiryNumber,
      supersededInquiryId: null as string | null,
      fingerprint,
      acceptedAt: lifecycle === 'ACCEPTED' ? acceptedAt : null,
    };
  }

  const created = await createVersionRow(current, actor);
  return {
    inquiryId: created.id,
    inquiryNumber: created.inquiryNumber,
    supersededInquiryId: current.id,
    fingerprint,
    acceptedAt: lifecycle === 'ACCEPTED' ? acceptedAt : null,
  };
}

async function createVersionRow(
  current: Awaited<ReturnType<typeof loadInquiry>>,
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const nextVersion = (current.versionNo || 1) + 1;
  const display = displayInquiryNumber(current);
  const inquiryNumber = `${display}-V${nextVersion}`;
  const metadata = withPortalLifecycle(current.commercialMetadata, 'OPEN', {
    displayInquiryNumber: display,
    calculatedLineFingerprint: null,
  });
  return prisma.$transaction(async (tx) => {
    await tx.commercialInquiry.update({
      where: { id: current.id },
      data: { isCurrent: false },
    });
    return tx.commercialInquiry.create({
      data: {
        inquiryNumber,
        customerId: current.customerId,
        customerMasterId: current.customerMasterId,
        customerName: current.customerName,
        contactPerson: current.contactPerson,
        customerReference: current.customerReference,
        inquiryDate: current.inquiryDate,
        requestedDeliveryDate: current.requestedDeliveryDate,
        currency: current.currency,
        incoterms: current.incoterms,
        paymentTerms: current.paymentTerms,
        deliveryTerms: current.deliveryTerms,
        projectName: current.projectName,
        status: 'DRAFT',
        notes: current.notes,
        salesAgent: current.salesAgent,
        quotationOwner: current.quotationOwner || actor.name || actor.email,
        commercialMetadata: metadata as Prisma.InputJsonValue,
        inquiryGroupKey: current.inquiryGroupKey || current.inquiryNumber,
        versionNo: nextVersion,
        isCurrent: true,
        supersedesInquiryId: current.id,
        createdBy: actor.name || actor.email || current.createdBy,
        modifiedBy: actor.name || actor.email || current.modifiedBy,
        lines: { create: lineCreates(current.lines) },
      },
    });
  });
}

export async function finishPortalCalculate(input: {
  inquiryId: string;
  supersededInquiryId: string | null;
  fingerprint: string;
  acceptedAt: string | null;
  completed: boolean;
}) {
  const prisma = requirePrisma();
  if (!input.completed) {
    if (input.supersededInquiryId) {
      await prisma.commercialInquiry.update({
        where: { id: input.inquiryId },
        data: {
          isCurrent: false,
          status: 'CANCELLED',
          commercialMetadata: withPortalLifecycle(
            (await prisma.commercialInquiry.findUnique({ where: { id: input.inquiryId } }))?.commercialMetadata,
            'CANCELED',
            { cancelReason: 'ABANDONED' }
          ) as Prisma.InputJsonValue,
        },
      });
      await prisma.commercialInquiry.update({
        where: { id: input.supersededInquiryId },
        data: { isCurrent: true },
      });
    }
    const originalId = input.supersededInquiryId || input.inquiryId;
    const original = await prisma.commercialInquiry.findUnique({ where: { id: originalId } });
    return { inquiryId: originalId, inquiryNumber: original?.inquiryNumber || '' };
  }

  let current = await prisma.commercialInquiry.findUnique({
    where: { id: input.inquiryId },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  const keepAccepted = Boolean(input.acceptedAt);
  const nextLifecycle = keepAccepted ? 'ACCEPTED' : 'NOT_SUBMITTED';
  const quote = await prisma.commercialQuotation.findFirst({
    where: { inquiryId: input.inquiryId, isCurrent: true },
    select: { sellingPrice: true },
  });
  const calculatedAt = new Date().toISOString();
  const after = buildInquiryVersionSnapshot({
    incoterms: current?.incoterms,
    currency: current?.currency,
    paymentTerms: current?.paymentTerms,
    deliveryTerms: current?.deliveryTerms,
    commercialMetadata: current?.commercialMetadata,
    totalValue: quote?.sellingPrice != null ? Number(quote.sellingPrice) : '',
    lines: current?.lines || [],
  });
  const before = parseInquiryVersionSnapshot(metadataOf(current?.commercialMetadata).calculatedSnapshot);
  let changes: VersionChangeItem[] = [];
  if (input.supersededInquiryId) {
    changes = diffInquiryVersions(before, after);
    if (!changes.length) {
      changes = [
        {
          kind: 'changed',
          label: 'Inquiry',
          from: 'Previous calculation',
          to: 'Recalculated with edited data',
        },
      ];
    }
  }
  const metadata = withPortalLifecycle(current?.commercialMetadata, nextLifecycle, {
    calculatedLineFingerprint: input.fingerprint,
    calculatedAt,
    calculatedSnapshot: after,
    ...(changes.length ? { versionChangeSummary: changes } : {}),
    ...(keepAccepted ? { acceptedAt: input.acceptedAt } : {}),
  });
  await prisma.commercialInquiry.update({
    where: { id: input.inquiryId },
    data: { isCurrent: true, commercialMetadata: metadata as Prisma.InputJsonValue },
  });

  if (input.supersededInquiryId && current) {
    const previous = await prisma.commercialInquiry.findUnique({ where: { id: input.supersededInquiryId } });
    await prisma.commercialInquiry.update({
      where: { id: input.supersededInquiryId },
      data: {
        isCurrent: false,
        status: 'CANCELLED',
        commercialMetadata: withPortalLifecycle(previous?.commercialMetadata, 'CANCELED', {
          cancelReason: 'SUPERSEDED',
          supersededByVersion: current.versionNo,
          supersededByInquiryId: current.id,
          supersededAt: calculatedAt,
          supersededChangeSummary: changes,
        }) as Prisma.InputJsonValue,
      },
    });
    await appendServerAudit({
      actorName: 'System',
      entity: 'CommercialInquiry',
      entityId: previous?.inquiryNumber || input.supersededInquiryId,
      action: 'VERSION_SUPERSEDED',
      message: `V${previous?.versionNo || 1} canceled: Superseded by V${current.versionNo}`,
      newValue: { changes },
    });
  }

  await appendServerAudit({
    actorName: 'System',
    entity: 'CommercialInquiry',
    entityId: current?.inquiryNumber || input.inquiryId,
    action: input.supersededInquiryId ? 'VERSION_CREATED' : 'STATUS_CHANGE',
    message: input.supersededInquiryId
      ? `Created V${current?.versionNo || ''} (${keepAccepted ? 'Approved' : 'Submitted'})`
      : `Calculated V${current?.versionNo || 1} (${keepAccepted ? 'Approved' : 'Submitted'})`,
  });

  if (keepAccepted && input.supersededInquiryId) {
    await relinkEditableSalesOrder(input.supersededInquiryId, input.inquiryId);
  }

  return { inquiryId: input.inquiryId, inquiryNumber: current?.inquiryNumber || '' };
}

async function familyInquiryIds(inquiryId: string, groupKey: string | null) {
  const prisma = requirePrisma();
  const rows = await prisma.commercialInquiry.findMany({
    where: {
      OR: [
        { id: inquiryId },
        ...(groupKey ? [{ inquiryGroupKey: groupKey }, { inquiryNumber: groupKey }] : []),
      ],
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function acceptedOrderStillEditable(inquiryId: string, groupKey: string | null) {
  const prisma = requirePrisma();
  const ids = await familyInquiryIds(inquiryId, groupKey);
  const order = await prisma.epcSalesOrder.findFirst({
    where: { inquiryId: { in: ids }, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) return true;
  if (order.integrationStatus !== 'NOT_SENT') return false;
  return Date.now() - order.createdAt.getTime() <= EDIT_WINDOW_MS;
}

async function currentQuotation(inquiryId: string) {
  const prisma = requirePrisma();
  return prisma.commercialQuotation.findFirst({
    where: { inquiryId, isCurrent: true },
    include: { lines: { include: { pricingSnapshot: true }, orderBy: { lineNumber: 'asc' } } },
    orderBy: { versionNo: 'desc' },
  });
}

function salesOrderLineData(
  lines: NonNullable<Awaited<ReturnType<typeof currentQuotation>>>['lines']
) {
  return lines.map((line) => ({
    lineNumber: line.lineNumber,
    quotationLineId: line.id,
    materialNumber: line.materialNumber,
    itemDescription: line.itemDescription,
    customerCableCode: line.customerCableCode,
    quantity: line.quantity,
    quantityUom: line.quantityUom,
    unitPrice: line.pricingSnapshot?.unitSellingPrice ?? line.sellingPrice,
    lineAmount: line.pricingSnapshot?.finalSellingPrice ?? line.sellingPrice,
    lengthMeters: line.lengthMeters,
    cuttingLengthMeters: line.cuttingLengthMeters,
    drumType: line.drumType,
    drumQuantity: line.drumQuantity,
    costingRunId: line.costingRunId,
    costingCalculationId: line.costingCalculationId,
  }));
}

async function relinkEditableSalesOrder(previousInquiryId: string, nextInquiryId: string) {
  const prisma = requirePrisma();
  const previous = await prisma.commercialInquiry.findUnique({ where: { id: previousInquiryId } });
  if (!previous) return;
  const ids = await familyInquiryIds(previous.id, previous.inquiryGroupKey || previous.inquiryNumber);
  const order = await prisma.epcSalesOrder.findFirst({
    where: {
      inquiryId: { in: ids },
      status: { not: 'CANCELLED' },
      integrationStatus: 'NOT_SENT',
      createdAt: { gte: new Date(Date.now() - EDIT_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) return;
  const quotation = await currentQuotation(nextInquiryId);
  if (!quotation) return;
  await prisma.$transaction(async (tx) => {
    await tx.epcSalesOrderLine.deleteMany({ where: { salesOrderId: order.id } });
    await tx.epcSalesOrder.update({
      where: { id: order.id },
      data: {
        inquiryId: nextInquiryId,
        quotationId: quotation.id,
        lines: { create: salesOrderLineData(quotation.lines) },
      },
    });
  });
}

export async function copyInquiryAsNew(inquiryId: string, actor: RequestActor) {
  const current = await loadInquiry(inquiryId);
  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);
  const prisma = requirePrisma();
  const inquiryNumber = await allocatePortalInquiryNumber(actor);
  const metadata = withPortalLifecycle(current.commercialMetadata, 'OPEN', {
    displayInquiryNumber: inquiryNumber,
    calculatedLineFingerprint: null,
    acceptedAt: null,
    portalVersion: 1,
  });
  return prisma.commercialInquiry.create({
    data: {
      inquiryNumber,
      customerId: current.customerId,
      customerMasterId: current.customerMasterId,
      customerName: current.customerName,
      contactPerson: current.contactPerson,
      customerReference: null,
      inquiryDate: new Date(),
      requestedDeliveryDate: current.requestedDeliveryDate,
      currency: current.currency,
      incoterms: current.incoterms,
      paymentTerms: current.paymentTerms,
      deliveryTerms: current.deliveryTerms,
      projectName: current.projectName,
      status: 'DRAFT',
      notes: current.notes,
      salesAgent: current.salesAgent,
      quotationOwner: actor.name || actor.email || current.quotationOwner,
      commercialMetadata: metadata as Prisma.InputJsonValue,
      inquiryGroupKey: inquiryNumber,
      versionNo: 1,
      isCurrent: true,
      createdBy: actor.name || actor.email || 'user',
      modifiedBy: actor.name || actor.email || 'user',
      lines: { create: lineCreates(current.lines) },
    },
    include: inquiryInclude(),
  });
}

export async function acceptPortalInquiry(
  inquiryId: string,
  actor: RequestActor,
  fulfillmentType: 'DIRECT_ORDER' | 'SALES_AGREEMENT' = 'DIRECT_ORDER'
) {
  const current = await loadInquiry(inquiryId);
  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);
  if (portalLifecycleFromInquiry(current) === 'CANCELED' || current.status === 'CANCELLED') {
    throwCode('A canceled inquiry cannot be approved.', 'INVALID_STATE');
  }
  if (portalLifecycleFromInquiry(current) === 'ACCEPTED') {
    throwCode('This inquiry version is already approved.', 'INVALID_STATE');
  }
  const quotation = await currentQuotation(current.id);
  if (!quotation) throwCode('Calculate the inquiry before approval.', 'INVALID_STATE');
  if (quotation.status === 'ACCEPTED') {
    throwCode('This quotation version is already approved.', 'INVALID_STATE');
  }
  if (
    quotation.commercialApprovalStatus === 'APPROVED' &&
    quotation.fulfillmentType &&
    quotation.fulfillmentType !== fulfillmentType
  ) {
    throwCode(`This quotation is already approved as ${quotation.fulfillmentType}.`, 'INVALID_STATE');
  }

  const prisma = requirePrisma();
  const acceptedAt = new Date().toISOString();
  let releasedAgreementId: string | null = null;
  if (fulfillmentType === 'SALES_AGREEMENT') {
    const { approveCommercialQuotation, createSalesAgreementFromApprovedQuotation } = await import(
      './commercialCommitmentRepository'
    );
    if (quotation.commercialApprovalStatus !== 'APPROVED') {
      try {
        await approveCommercialQuotation(quotation.id, { fulfillmentType: 'SALES_AGREEMENT' }, actor);
      } catch (err) {
        const code = (err as { code?: string }).code;
        const priced =
          Number(quotation.sellingPrice) > 0 ||
          quotation.lines.some((line) => Number(line.sellingPrice) > 0);
        if (code !== 'BUSINESS_RULE_REQUIRED' || !priced) throw err;
        await prisma.commercialQuotation.update({
          where: { id: quotation.id },
          data: {
            commercialApprovalStatus: 'APPROVED',
            commercialPricingStatus: 'PRICING_APPROVED',
            fulfillmentType: 'SALES_AGREEMENT',
            commerciallyApprovedAt: new Date(),
            commerciallyApprovedBy: actor.name || actor.email || 'user',
          },
        });
      }
    }
    const agreement = await createSalesAgreementFromApprovedQuotation(quotation.id, {}, actor);
    releasedAgreementId = agreement.id;
  } else {
  const ids = await familyInquiryIds(current.id, current.inquiryGroupKey || current.inquiryNumber);
  const existing = await prisma.epcSalesOrder.findFirst({
    where: {
      inquiryId: { in: ids },
      status: { not: 'CANCELLED' },
      integrationStatus: 'NOT_SENT',
      createdAt: { gte: new Date(Date.now() - EDIT_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.epcSalesOrderLine.deleteMany({ where: { salesOrderId: existing.id } });
      await tx.epcSalesOrder.update({
        where: { id: existing.id },
        data: {
          inquiryId: current.id,
          quotationId: quotation.id,
          lines: { create: salesOrderLineData(quotation.lines) },
        },
      });
    });
  } else {
    const salesOrderNumber = await allocateSalesOrderNumber(actor);
    await prisma.epcSalesOrder.create({
      data: {
        salesOrderNumber,
        quotationId: quotation.id,
        inquiryId: current.id,
        orderOrigin: 'QUOTATION',
        orderFulfillmentMode: 'MTO',
        customerId: current.customerId,
        customerMasterId: current.customerMasterId,
        customerName: current.customerName,
        customerReference: current.customerReference,
        currency: current.currency,
        paymentTerms: current.paymentTerms,
        deliveryTerms: current.deliveryTerms,
        incoterms: current.incoterms,
        status: 'CONFIRMED',
        integrationStatus: 'NOT_SENT',
        createdBy: actor.name || actor.email || 'user',
        lines: { create: salesOrderLineData(quotation.lines) },
      },
    });
  }
  }

  await prisma.commercialQuotation.update({
    where: { id: quotation.id },
    data: { status: 'ACCEPTED', fulfillmentType },
  });

  const live = current;
  const metadata = withPortalLifecycle(live.commercialMetadata, 'ACCEPTED', {
    acceptedAt,
    requestedFulfillmentType: fulfillmentType,
    sourceQuotationId: quotation.id,
    sourceQuotationNumber: quotation.quotationNumber,
    sourceQuotationVersion: quotation.versionNo,
    ...(releasedAgreementId ? { releasedAgreementId } : {}),
  });
  const approved = await prisma.commercialInquiry.update({
    where: { id: current.id },
    data: {
      commercialMetadata: metadata as Prisma.InputJsonValue,
      modifiedBy: actor.name || actor.email || current.modifiedBy,
    },
    include: inquiryInclude(),
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: current.inquiryNumber,
    action: 'STATUS_CHANGE',
    message: `Approved V${current.versionNo || 1} (Converted to Order)`,
  });
  return approved;
}

async function allocateSalesOrderNumber(actor: RequestActor) {
  const prisma = requirePrisma();
  const code = 'SO_PORTAL';
  const existing = await prisma.numberSequence.findUnique({ where: { code } });
  if (!existing) {
    try {
      await prisma.numberSequence.create({
        data: {
          code,
          name: 'Portal sales order',
          prefix: 'SO-',
          format: '{PREFIX}{YY}-{####}',
          nextSerial: 1,
          active: true,
          description: 'Sales order numbers such as SO-26-0001.',
        },
      });
    } catch (err) {
      const known = err as { code?: string };
      if (known.code !== 'P2002') throw err;
    }
  }
  return (await allocateNextNumber(code, actor)).value;
}

/**
 * Copies the current row as a non-current version and leaves the live row in place.
 * The copy keeps the status it had, so the list shows how the inquiry evolved.
 */
export async function archiveInquirySnapshot(inquiryId: string) {
  const current = await loadInquiry(inquiryId);
  const prisma = requirePrisma();
  const display = displayInquiryNumber(current);
  const snapshotVersion = current.versionNo || 1;
  const lifecycle = portalLifecycleFromInquiry(current);
  let inquiryNumber = `${display}-V${snapshotVersion}`;
  if (inquiryNumber === current.inquiryNumber) inquiryNumber = `${display}-V${snapshotVersion}-H`;
  const taken = await prisma.commercialInquiry.findUnique({ where: { inquiryNumber } });
  if (taken) inquiryNumber = `${display}-V${snapshotVersion}-H${Date.now().toString(36)}`;
  const metadata = withPortalLifecycle(current.commercialMetadata, lifecycle, {
    displayInquiryNumber: display,
    portalSnapshot: true,
  });
  await prisma.commercialInquiry.create({
    data: {
      inquiryNumber,
      customerId: current.customerId,
      customerMasterId: current.customerMasterId,
      customerName: current.customerName,
      contactPerson: current.contactPerson,
      customerReference: current.customerReference,
      inquiryDate: current.inquiryDate,
      requestedDeliveryDate: current.requestedDeliveryDate,
      currency: current.currency,
      incoterms: current.incoterms,
      paymentTerms: current.paymentTerms,
      deliveryTerms: current.deliveryTerms,
      projectName: current.projectName,
      status: current.status,
      notes: current.notes,
      salesAgent: current.salesAgent,
      quotationOwner: current.quotationOwner,
      commercialMetadata: metadata as Prisma.InputJsonValue,
      inquiryGroupKey: current.inquiryGroupKey || current.inquiryNumber,
      versionNo: snapshotVersion,
      isCurrent: false,
      createdBy: current.createdBy,
      modifiedBy: current.modifiedBy,
      lines: { create: lineCreates(current.lines) },
    },
  });
  await prisma.commercialInquiry.update({
    where: { id: current.id },
    data: {
      versionNo: snapshotVersion + 1,
      inquiryGroupKey: current.inquiryGroupKey || current.inquiryNumber,
      commercialMetadata: withPortalLifecycle(current.commercialMetadata, lifecycle, {
        displayInquiryNumber: display,
      }) as Prisma.InputJsonValue,
    },
  });
}

/** Writes the four display statuses onto test rows that do not have one yet. */
export async function backfillPortalLifecycles() {
  const prisma = requirePrisma();
  const rows = await prisma.commercialInquiry.findMany({
    select: { id: true, status: true, commercialMetadata: true, inquiryNumber: true },
  });
  let updated = 0;
  for (const row of rows) {
    const meta = metadataOf(row.commercialMetadata);
    if (typeof meta.portalLifecycle === 'string') continue;
    const lifecycle = portalLifecycleFromInquiry(row);
    await prisma.commercialInquiry.update({
      where: { id: row.id },
      data: {
        commercialMetadata: withPortalLifecycle(row.commercialMetadata, lifecycle, {
          displayInquiryNumber: displayInquiryNumber(row),
        }) as Prisma.InputJsonValue,
      },
    });
    updated += 1;
  }
  return { scanned: rows.length, updated };
}

export async function markInquiryCanceledMetadata(
  inquiryId: string,
  actor?: { name?: string | null; email?: string | null }
) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) return;
  const existing = metadataOf(inquiry.commercialMetadata);
  if (existing.cancelReason === 'SUPERSEDED') return;
  const canceledAt = new Date().toISOString();
  await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: {
      commercialMetadata: withPortalLifecycle(inquiry.commercialMetadata, 'CANCELED', {
        cancelReason: 'USER',
        canceledAt,
        canceledBy: actor?.name || actor?.email || null,
      }) as Prisma.InputJsonValue,
    },
  });
  await appendServerAudit({
    actorId: null,
    actorName: actor?.name || actor?.email || 'User',
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'CANCELED',
    message: `Canceled V${inquiry.versionNo || 1} by user`,
  });
}
