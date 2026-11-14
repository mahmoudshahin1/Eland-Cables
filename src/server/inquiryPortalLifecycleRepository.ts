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
import { canCalculateInquiry } from '../domain/inquiryProcessCommands';
import {
  commercialMetadataForCopy,
  displayInquiryNumber,
  inquiryCalculationFingerprint,
  portalCanCreateRevision,
  portalLifecycleFromInquiry,
  revisionDeadlineAtFrom,
  withPortalLifecycle,
} from '../domain/inquiryPortalLifecycle';
import {
  buildInquiryVersionSnapshot,
  diffInquiryVersions,
  parseInquiryVersionSnapshot,
} from '../domain/inquiryVersionDiff';
import { appendServerAudit } from './serverAudit';


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

function lineCreates(
  lines: Awaited<ReturnType<typeof loadInquiry>>['lines'],
  options?: { clearCosting?: boolean }
) {
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
    costingReadinessStatus: options?.clearCosting ? 'NOT_READY' : line.costingReadinessStatus,
    costingRunId: options?.clearCosting ? null : line.costingRunId,
    costingCalculationId: options?.clearCosting ? null : line.costingCalculationId,
    materialCost: options?.clearCosting ? null : line.materialCost,
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
  const lifecycle = portalLifecycleFromInquiry(current);
  if (lifecycle === 'ACCEPTED') {
    throwCode('This inquiry is approved and cannot be recalculated. Create a revision instead.', 'INVALID_STATE');
  }
  if (lifecycle === 'CANCELED' || current.status === 'CANCELLED') {
    throwCode('A canceled inquiry cannot be calculated.', 'INVALID_STATE');
  }
  return {
    inquiryId: current.id,
    inquiryNumber: current.inquiryNumber,
    supersededInquiryId: null as string | null,
    fingerprint: inquiryCalculationFingerprint(current),
    acceptedAt: null as string | null,
  };
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
    const original = await prisma.commercialInquiry.findUnique({ where: { id: input.inquiryId } });
    return { inquiryId: input.inquiryId, inquiryNumber: original?.inquiryNumber || '' };
  }

  let current = await prisma.commercialInquiry.findUnique({
    where: { id: input.inquiryId },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  const nextLifecycle = 'NOT_SUBMITTED' as const;
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
  const changes = diffInquiryVersions(before, after);
  const metadata = withPortalLifecycle(current?.commercialMetadata, nextLifecycle, {
    calculatedLineFingerprint: input.fingerprint,
    calculatedAt,
    calculatedSnapshot: after,
    ...(changes.length ? { versionChangeSummary: changes } : {}),
  });
  await prisma.commercialInquiry.update({
    where: { id: input.inquiryId },
    data: { isCurrent: true, commercialMetadata: metadata as Prisma.InputJsonValue },
  });

  await appendServerAudit({
    actorName: 'System',
    entity: 'CommercialInquiry',
    entityId: current?.inquiryNumber || input.inquiryId,
    action: 'STATUS_CHANGE',
    message: `Calculated V${current?.versionNo || 1}`,
  });

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

export async function copyInquiryAsNew(inquiryId: string, actor: RequestActor) {
  const current = await loadInquiry(inquiryId);
  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);
  const prisma = requirePrisma();
  const inquiryNumber = await allocatePortalInquiryNumber(actor);
  const metadata = withPortalLifecycle(commercialMetadataForCopy(current.commercialMetadata), 'OPEN', {
    displayInquiryNumber: inquiryNumber,
    copiedFromInquiryId: current.id,
    copiedFromInquiryNumber: displayInquiryNumber(current),
    copiedFromVersion: current.versionNo || 1,
  });
  const created = await prisma.commercialInquiry.create({
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
      lines: { create: lineCreates(current.lines, { clearCosting: true }) },
    },
    include: inquiryInclude(),
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: created.inquiryNumber,
    action: 'INQUIRY_COPIED',
    newValue: {
      copiedFromInquiryId: current.id,
      copiedFromInquiryNumber: displayInquiryNumber(current),
      copiedFromVersion: current.versionNo || 1,
    },
    message: `Copied ${displayInquiryNumber(current)} V${current.versionNo || 1} as ${created.inquiryNumber}`,
  });
  return created;
}

export async function createPortalRevision(inquiryId: string, reason: string, actor: RequestActor) {
  const trimmed = String(reason || '').trim();
  if (!trimmed) throwCode('A revision reason is required.', 'VALIDATION_FAILED');
  const current = await loadInquiry(inquiryId);
  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);
  const prisma = requirePrisma();
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CommercialInquiry" WHERE id = ${current.id} FOR UPDATE`;
    const locked = await tx.commercialInquiry.findUnique({
      where: { id: current.id },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!locked) throwCode(`Inquiry ${inquiryId} not found.`, 'NOT_FOUND');
    const group = locked.inquiryGroupKey || locked.inquiryNumber;
    const family = await tx.commercialInquiry.findMany({
      where: { OR: [{ inquiryGroupKey: group }, { inquiryNumber: group }, { id: locked.id }] },
    });
    const active = family.find((row) => {
      if (row.id === locked.id || row.status === 'CANCELLED') return false;
      const lifecycle = portalLifecycleFromInquiry(row);
      return lifecycle === 'OPEN' || lifecycle === 'NOT_SUBMITTED';
    });
    if (active) throwCode(`Revision ${active.inquiryNumber} is already open.`, 'INVALID_STATE');
    const order = await tx.epcSalesOrder.findFirst({
      where: { inquiryId: { in: family.map((row) => row.id) }, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
    });
    const decision = portalCanCreateRevision({
      status: locked.status,
      commercialMetadata: locked.commercialMetadata,
      isCurrent: locked.isCurrent,
      vip: canCalculateInquiry(locked),
      salesOrderSent: Boolean(order && order.integrationStatus !== 'NOT_SENT'),
    });
    if (decision.ok === false) throwCode(decision.reason, 'INVALID_STATE');

    const nextVersion = (locked.versionNo || 1) + 1;
    const display = displayInquiryNumber(locked);
    const inquiryNumber = `${display}-V${nextVersion}`;
    const openedAt = new Date().toISOString();
    const metadata = withPortalLifecycle(locked.commercialMetadata, 'OPEN', {
      displayInquiryNumber: display,
      calculatedLineFingerprint: null,
      calculatedSnapshot: null,
      calculatedAt: null,
      acceptedAt: null,
      revisionDeadlineAt: null,
      sourceQuotationId: null,
      sourceQuotationNumber: null,
      sourceQuotationVersion: null,
      releasedSalesOrderId: null,
      releasedAgreementId: null,
      requestedFulfillmentType: null,
      productionStatus: null,
      releasedToProductionAt: null,
      supersededByVersion: null,
      supersededByInquiryId: null,
      supersededAt: null,
      revisionReason: trimmed,
      revisionOpenedAt: openedAt,
      revisionOpenedBy: actor.name || actor.email || 'user',
      revisionBaseSalesOrderId: order?.id ?? null,
      revisionOfInquiryId: locked.id,
    });
    await tx.commercialInquiry.update({ where: { id: locked.id }, data: { isCurrent: false } });
    return tx.commercialInquiry.create({
      data: {
        inquiryNumber,
        customerId: locked.customerId,
        customerMasterId: locked.customerMasterId,
        customerName: locked.customerName,
        contactPerson: locked.contactPerson,
        customerReference: locked.customerReference,
        inquiryDate: locked.inquiryDate,
        requestedDeliveryDate: locked.requestedDeliveryDate,
        currency: locked.currency,
        incoterms: locked.incoterms,
        paymentTerms: locked.paymentTerms,
        deliveryTerms: locked.deliveryTerms,
        projectName: locked.projectName,
        status: 'DRAFT',
        notes: locked.notes,
        salesAgent: locked.salesAgent,
        quotationOwner: locked.quotationOwner || actor.name || actor.email,
        commercialMetadata: metadata as Prisma.InputJsonValue,
        inquiryGroupKey: group,
        versionNo: nextVersion,
        isCurrent: true,
        supersedesInquiryId: locked.id,
        createdBy: actor.name || actor.email || locked.createdBy,
        modifiedBy: actor.name || actor.email || locked.modifiedBy,
        lines: { create: lineCreates(locked.lines) },
      },
      include: inquiryInclude(),
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: created.inquiryNumber,
    action: 'REVISION_CREATED',
    newValue: {
      reason: trimmed,
      previousInquiryId: current.id,
      previousVersion: current.versionNo || 1,
      versionNo: created.versionNo,
    },
    message: `Opened V${created.versionNo} from V${current.versionNo || 1}: ${trimmed}`,
  });
  return created;
}

export async function discardPortalRevision(inquiryId: string, actor: RequestActor) {
  const current = await loadInquiry(inquiryId);
  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);
  if (!current.supersedesInquiryId || (current.versionNo || 1) <= 1) {
    throwCode('Only a draft revision can be discarded.', 'INVALID_STATE');
  }
  const lifecycle = portalLifecycleFromInquiry(current);
  if (lifecycle !== 'OPEN' && lifecycle !== 'NOT_SUBMITTED') {
    throwCode('An approved revision cannot be discarded.', 'INVALID_STATE');
  }
  const prisma = requirePrisma();
  const discardedAt = new Date().toISOString();
  await prisma.$transaction(async (tx) => {
    await tx.commercialInquiry.update({
      where: { id: current.id },
      data: {
        isCurrent: false,
        status: 'CANCELLED',
        commercialMetadata: withPortalLifecycle(current.commercialMetadata, 'CANCELED', {
          cancelReason: 'DISCARDED',
          canceledAt: discardedAt,
        }) as Prisma.InputJsonValue,
      },
    });
    await tx.commercialQuotation.updateMany({
      where: { inquiryId: current.id, status: { notIn: ['ACCEPTED', 'SUPERSEDED'] } },
      data: { status: 'CANCELLED', isCurrent: false },
    });
    await tx.commercialInquiry.update({
      where: { id: current.supersedesInquiryId! },
      data: { isCurrent: true },
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: current.inquiryNumber,
    action: 'REVISION_DISCARDED',
    newValue: { restoredInquiryId: current.supersedesInquiryId },
    message: `Discarded V${current.versionNo || 1}`,
  });
  return loadInquiry(current.supersedesInquiryId);
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

  if (current.supersedesInquiryId && fulfillmentType === 'SALES_AGREEMENT') {
    throwCode('A released sales agreement cannot be revised. Copy the inquiry instead.', 'INVALID_STATE');
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
  } else if (current.supersedesInquiryId) {
    const baseId = metadataOf(current.commercialMetadata).revisionBaseSalesOrderId;
    if (typeof baseId !== 'string' || !baseId) {
      throwCode('The sales order captured for this revision is no longer available.', 'INVALID_STATE');
    }
    const existing = await prisma.epcSalesOrder.findUnique({ where: { id: baseId } });
    if (!existing || existing.status === 'CANCELLED' || existing.integrationStatus !== 'NOT_SENT') {
      throwCode('The sales order can no longer be updated, so this revision cannot be approved.', 'INVALID_STATE');
    }
    const previousLineCount = await prisma.epcSalesOrderLine.count({ where: { salesOrderId: existing.id } });
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
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'EpcSalesOrder',
      entityId: existing.salesOrderNumber,
      action: 'SALES_ORDER_RELINKED',
      newValue: {
        salesOrderId: existing.id,
        previousInquiryId: existing.inquiryId,
        previousQuotationId: existing.quotationId,
        nextInquiryId: current.id,
        nextQuotationId: quotation.id,
        previousLineCount,
      },
      message: `Relinked ${existing.salesOrderNumber} from the previous revision to V${current.versionNo || 1}`,
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

  const previousQuotation = current.supersedesInquiryId
    ? await prisma.commercialQuotation.findFirst({
        where: { inquiryId: current.supersedesInquiryId, status: 'ACCEPTED', supersededByQuotationId: null },
        orderBy: { versionNo: 'desc' },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.commercialQuotation.update({
      where: { id: quotation.id },
      data: {
        status: 'ACCEPTED',
        fulfillmentType,
        inquirySnapshot: {
          inquiryId: current.id,
          inquiryNumber: current.inquiryNumber,
          versionNo: current.versionNo,
          acceptedAt,
        } as Prisma.InputJsonValue,
      },
    });
    if (previousQuotation) {
      await tx.commercialQuotation.update({
        where: { id: previousQuotation.id },
        data: { status: 'SUPERSEDED', supersededByQuotationId: quotation.id },
      });
    }
    if (current.supersedesInquiryId) {
      const previous = await tx.commercialInquiry.findUnique({ where: { id: current.supersedesInquiryId } });
      if (previous) {
        await tx.commercialInquiry.update({
          where: { id: previous.id },
          data: {
            commercialMetadata: withPortalLifecycle(previous.commercialMetadata, 'ACCEPTED', {
              supersededByVersion: current.versionNo,
              supersededByInquiryId: current.id,
              supersededAt: acceptedAt,
            }) as Prisma.InputJsonValue,
          },
        });
      }
    }
  });

  const metadata = withPortalLifecycle(current.commercialMetadata, 'ACCEPTED', {
    acceptedAt,
    revisionDeadlineAt: revisionDeadlineAtFrom(acceptedAt),
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
    action: 'INQUIRY_APPROVED',
    newValue: { acceptedAt, quotationNumber: quotation.quotationNumber, quotationVersion: quotation.versionNo },
    message: `Approved V${current.versionNo || 1}`,
  });
  if (previousQuotation) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CommercialQuotation',
      entityId: `${previousQuotation.quotationNumber}-V${previousQuotation.versionNo}`,
      action: 'QUOTATION_SUPERSEDED',
      newValue: { supersededByQuotationId: quotation.id, nextVersion: quotation.versionNo },
      message: `Superseded ${previousQuotation.quotationNumber} V${previousQuotation.versionNo} with V${quotation.versionNo}`,
    });
  }
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
