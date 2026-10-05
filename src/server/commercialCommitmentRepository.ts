/**
 * Phase 1 quote-to-cash domain services (Spec §10–13, §24–25).
 * No live D365 — integrationStatus stays NOT_SENT; adapters remain NOT_IMPLEMENTED.
 * Commercial approval is separate from Increment 12 pricing approval.
 */

import { appendAudit } from '../platform/audit/auditLogService';
import { issue } from '../platform/errors/domainError';
import { getPrisma } from './db';
import { assertCanAccessInquiryOwnership } from './rbac';
import type { RequestActor } from './auth';
import { V2_QUOTATION_WORKFLOW_CHANNEL } from '../domain/v2QuotationService';
import { appendServerAudit } from './serverAudit';

type Actor = { id?: string; name?: string; email?: string; userType?: string };

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw issue('CONFIGURATION_REQUIRED', 'DATABASE_URL is required for commercial commitment services.');
  return prisma;
}

function actorLabel(actor: Actor): string {
  return actor.name || actor.email || actor.id || 'user';
}

function stampId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isPricingApproved(status: string | null | undefined): boolean {
  return status === 'PRICING_APPROVED';
}

function isV2IssuedQuotation(quotation: {
  workflowChannel?: string | null;
  issuedAt?: Date | null;
}): boolean {
  return quotation.workflowChannel === V2_QUOTATION_WORKFLOW_CHANNEL && quotation.issuedAt != null;
}

function isCommitmentEligibleQuotation(quotation: {
  workflowChannel?: string | null;
  issuedAt?: Date | null;
  commercialApprovalStatus?: string | null;
  fulfillmentType?: string | null;
  commercialPricingStatus?: string | null;
}): { eligible: boolean; isV2Issued: boolean; commercialApproved: boolean } {
  const isV2Issued = isV2IssuedQuotation(quotation);
  const commercialApproved =
    quotation.commercialApprovalStatus === 'APPROVED' && Boolean(quotation.fulfillmentType);
  const pricingReady = isPricingApproved(quotation.commercialPricingStatus);
  const eligible = commercialApproved || (isV2Issued && pricingReady);
  return { eligible, isV2Issued, commercialApproved };
}

function buildLineageSnapshotFromQuotationLine(line: {
  lineageSnapshot?: unknown;
  v2ConfigurationSnapshotId?: string | null;
  v2ConfigurationSnapshotIdString?: string | null;
  v2CuttingLengthPlanId?: string | null;
  v2CuttingLengthPlanIdString?: string | null;
  v2DrumPlanId?: string | null;
  v2DrumPlanIdString?: string | null;
  v2DrumPlanVersionNo?: number | null;
  costingRunId?: string | null;
  costingCalculationId?: string | null;
  configurationId?: string | null;
  workflowChannel?: string | null;
}): object | undefined {
  if (line.lineageSnapshot && typeof line.lineageSnapshot === 'object') {
    return line.lineageSnapshot as object;
  }
  const pins = {
    workflowChannel: line.workflowChannel ?? null,
    v2ConfigurationSnapshotId: line.v2ConfigurationSnapshotId ?? line.v2ConfigurationSnapshotIdString ?? null,
    v2CuttingLengthPlanId: line.v2CuttingLengthPlanId ?? line.v2CuttingLengthPlanIdString ?? null,
    v2DrumPlanId: line.v2DrumPlanId ?? line.v2DrumPlanIdString ?? null,
    v2DrumPlanVersionNo: line.v2DrumPlanVersionNo ?? null,
    costingRunId: line.costingRunId ?? null,
    costingCalculationId: line.costingCalculationId ?? null,
    configurationId: line.configurationId ?? null,
  };
  const hasPin = Object.values(pins).some((v) => v != null && v !== '');
  return hasPin ? pins : undefined;
}

/** Commercially approved revisions are immutable; create a new revision to change commercial/tech content. */
export function assertCommercialQuotationMutable(quotation: {
  commercialApprovalStatus?: string | null;
  quotationNumber?: string;
  versionNo?: number;
}): void {
  if (quotation.commercialApprovalStatus === 'APPROVED') {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      `Commercially approved quotation ${quotation.quotationNumber || ''} V${quotation.versionNo ?? ''} is immutable. Create a new revision to change content.`
    );
  }
}

function releaseQtyError(opts: {
  committed: number;
  alreadyReleased: number;
  requested: number;
  remaining: number;
  uom: string;
  context: string;
}) {
  return issue(
    'BUSINESS_RULE_REQUIRED',
    `Over-release rejected on ${opts.context}: committed=${opts.committed} ${opts.uom}, alreadyReleased=${opts.alreadyReleased} ${opts.uom}, requested=${opts.requested} ${opts.uom}, remaining=${opts.remaining} ${opts.uom}.`
  );
}

async function writeAudit(entry: {
  actorId?: string;
  actorName?: string;
  entity: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT' | 'SUBMIT' | 'CANCEL';
  oldValue?: unknown;
  newValue?: unknown;
  message: string;
}) {
  appendAudit(entry);
  await appendServerAudit({
    actorId: entry.actorId,
    actorName: entry.actorName,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    message: entry.message,
  });
}

function mapQuotationLineToSoLine(
  line: {
    id: string;
    lineNumber: number;
    materialNumber: string | null;
    itemDescription: string;
    customerCableCode: string | null;
    quantity: unknown;
    quantityUom: string;
    sellingPrice: unknown;
    configurationId: string | null;
    engineeringRevision: string | null;
    bomVersion: string | null;
    technicalSpecificationId: string | null;
    lengthMeters: unknown;
    cuttingLengthMeters: unknown;
    numberOfCuts: number | null;
    drumType: string | null;
    drumSize: string | null;
    drumQuantity: unknown;
    drumLengthMeters: unknown;
    drumWeightKg: unknown;
    costingRunId: string | null;
    costingCalculationId: string | null;
    lineageSnapshot?: unknown;
    v2ConfigurationSnapshotId?: string | null;
    v2ConfigurationSnapshotIdString?: string | null;
    v2CuttingLengthPlanId?: string | null;
    v2CuttingLengthPlanIdString?: string | null;
    v2DrumPlanId?: string | null;
    v2DrumPlanIdString?: string | null;
    v2DrumPlanVersionNo?: number | null;
    workflowChannel?: string | null;
  },
  quantity: number
) {
  const unitPrice = line.sellingPrice != null ? toNum(line.sellingPrice) : null;
  const lineAmount = unitPrice != null ? unitPrice * quantity : null;
  const lineageSnapshot = buildLineageSnapshotFromQuotationLine(line);
  return {
    lineNumber: line.lineNumber,
    quotationLineId: line.id,
    materialNumber: line.materialNumber,
    itemCode: line.materialNumber,
    itemDescription: line.itemDescription,
    customerCableCode: line.customerCableCode,
    quantity,
    quantityUom: line.quantityUom,
    unitPrice,
    netPrice: unitPrice,
    lineAmount,
    configurationId: line.configurationId,
    engineeringRevision: line.engineeringRevision,
    bomVersion: line.bomVersion,
    technicalSpecificationId: line.technicalSpecificationId,
    lengthMeters: line.lengthMeters != null ? toNum(line.lengthMeters) : null,
    cuttingLengthMeters: line.cuttingLengthMeters != null ? toNum(line.cuttingLengthMeters) : null,
    numberOfCuts: line.numberOfCuts,
    drumType: line.drumType,
    drumSize: line.drumSize,
    drumQuantity: line.drumQuantity != null ? toNum(line.drumQuantity) : null,
    drumLengthMeters: line.drumLengthMeters != null ? toNum(line.drumLengthMeters) : null,
    drumWeightKg: line.drumWeightKg != null ? toNum(line.drumWeightKg) : null,
    costingRunId: line.costingRunId,
    costingCalculationId: line.costingCalculationId,
    ...(lineageSnapshot ? { lineageSnapshot } : {}),
  };
}

/**
 * Commercial approval of a quotation revision with fulfillment choice (Spec §8).
 * Does NOT change commercialPricingStatus — pricing approval remains Increment 12.
 */
export async function approveCommercialQuotation(
  quotationId: string,
  input: {
    fulfillmentType: 'DIRECT_ORDER' | 'SALES_AGREEMENT';
    billTo?: string;
    shipTo?: string;
    requestedDeliveryDate?: string;
    comment?: string;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  if (input.fulfillmentType !== 'DIRECT_ORDER' && input.fulfillmentType !== 'SALES_AGREEMENT') {
    throw issue('VALIDATION_FAILED', 'fulfillmentType must be DIRECT_ORDER or SALES_AGREEMENT.');
  }

  const current = await prisma.commercialQuotation.findFirst({
    where: {
      OR: [{ id: quotationId }, { quotationNumber: quotationId, isCurrent: true }],
    },
    include: { lines: true },
  });
  if (!current) throw issue('NOT_FOUND', `Quotation ${quotationId} not found.`);

  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);

  if (current.commercialApprovalStatus === 'APPROVED') {
    throw issue('CONFLICT', `Quotation ${current.quotationNumber} V${current.versionNo} is already commercially approved.`);
  }
  if (!isPricingApproved(current.commercialPricingStatus)) {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      `Commercial approval requires pricing approval first (current commercialPricingStatus=${current.commercialPricingStatus}).`
    );
  }
  if (!current.isCurrent) {
    throw issue('BUSINESS_RULE_REQUIRED', 'Only the current quotation revision can be commercially approved.');
  }

  const approvedAt = new Date();
  const updated = await prisma.commercialQuotation.update({
    where: { id: current.id },
    data: {
      commercialApprovalStatus: 'APPROVED',
      fulfillmentType: input.fulfillmentType,
      commerciallyApprovedBy: actorLabel(actor),
      commerciallyApprovedAt: approvedAt,
      billTo: input.billTo ?? current.billTo,
      shipTo: input.shipTo ?? current.shipTo,
      requestedDeliveryDate: input.requestedDeliveryDate
        ? new Date(input.requestedDeliveryDate)
        : current.requestedDeliveryDate,
      // Keep QuotationStatus OPEN/ACCEPTED semantics intact for Increment 11 — do not overload ACCEPTED.
    },
    include: { lines: true },
  });

  await writeAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CommercialQuotation',
    entityId: `${current.quotationNumber}-V${current.versionNo}`,
    action: 'APPROVE',
    oldValue: { commercialApprovalStatus: current.commercialApprovalStatus },
    newValue: {
      commercialApprovalStatus: 'APPROVED',
      fulfillmentType: input.fulfillmentType,
      comment: input.comment,
    },
    message: `Commercially approved ${current.quotationNumber} V${current.versionNo} as ${input.fulfillmentType}`,
  });

  await notifyFulfillmentEvent({
    eventCode: 'QUOTATION_COMMERCIALLY_APPROVED',
    title: `Quotation approved: ${current.quotationNumber}`,
    message: `${current.quotationNumber} V${current.versionNo} commercially approved as ${input.fulfillmentType}.`,
    inquiryId: current.inquiryId,
  });

  return updated;
}

async function notifyFulfillmentEvent(input: {
  eventCode: string;
  title: string;
  message: string;
  inquiryId?: string;
}) {
  try {
    const { notifyStandardWorkflowEvent } = await import('./standardWorkflowNotifications');
    await notifyStandardWorkflowEvent({
      eventCode: input.eventCode,
      title: input.title,
      message: input.message,
      inquiryId: input.inquiryId,
      notifyRole: 'SALES_MANAGER',
    });
  } catch {
    /* notifications never roll back commercial fulfillment */
  }
}

/** Create commercial commitment from a commercially approved quotation revision (Spec §11). */
export async function createCommitmentFromQuotation(
  quotationId: string,
  actor: RequestActor,
  options?: { fulfillmentType?: 'DIRECT_ORDER' | 'SALES_AGREEMENT' }
) {
  const prisma = requirePrisma();
  const quotation = await prisma.commercialQuotation.findFirst({
    where: {
      OR: [{ id: quotationId }, { quotationNumber: quotationId, isCurrent: true }],
    },
    include: { lines: true },
  });
  if (!quotation) throw issue('NOT_FOUND', `Quotation ${quotationId} not found.`);

  assertCanAccessInquiryOwnership(actor, quotation.customerId, quotation.customerMasterId);

  const { eligible, isV2Issued, commercialApproved } = isCommitmentEligibleQuotation(quotation);

  if (!eligible) {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      isV2Issued
        ? 'Commitment requires an issued V2 quotation with approved pricing.'
        : 'Commitment requires a commercially approved quotation with fulfillmentType, or an issued V2 quotation with approved pricing.'
    );
  }

  const fulfillmentType =
    quotation.fulfillmentType || options?.fulfillmentType || (isV2Issued ? 'DIRECT_ORDER' : undefined);
  if (!fulfillmentType) {
    throw issue('BUSINESS_RULE_REQUIRED', 'fulfillmentType is required.');
  }

  const existing = await prisma.commercialCommitment.findFirst({
    where: { quotationId: quotation.id, status: { in: ['ACTIVE', 'DRAFT', 'COMPLETED'] } },
  });
  if (existing) {
    throw issue('CONFLICT', `Commitment ${existing.commitmentNumber} already exists for this quotation revision.`);
  }

  const totalQty = quotation.lines.reduce((sum, l) => sum + toNum(l.quantity), 0);
  const totalAmount = quotation.lines.reduce((sum, l) => {
    const price = l.sellingPrice != null ? toNum(l.sellingPrice) : 0;
    return sum + price * toNum(l.quantity);
  }, 0);
  const uom = quotation.lines[0]?.quantityUom || 'KM';
  const commitmentNumber = stampId('CMT');

  const commitment = await prisma.commercialCommitment.create({
    data: {
      commitmentNumber,
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      quotationVersionNo: quotation.versionNo,
      inquiryId: quotation.inquiryId,
      workflowChannel: quotation.workflowChannel,
      customerId: quotation.customerId,
      customerMasterId: quotation.customerMasterId,
      customerName: quotation.customerName,
      fulfillmentType,
      currency: quotation.currency,
      totalCommittedQuantity: totalQty,
      totalCommittedAmount: totalAmount || null,
      quantityUom: uom,
      orderedQuantity: 0,
      remainingQuantity: totalQty,
      expirationDate: quotation.validUntil,
      status: 'ACTIVE',
      createdBy: actorLabel(actor),
      approvedAt: quotation.commerciallyApprovedAt ?? quotation.issuedAt ?? new Date(),
    },
  });

  await writeAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CommercialCommitment',
    entityId: commitment.commitmentNumber,
    action: 'CREATE',
    newValue: {
      commitmentNumber,
      quotationNumber: quotation.quotationNumber,
      versionNo: quotation.versionNo,
      inquiryId: quotation.inquiryId,
      workflowChannel: quotation.workflowChannel,
      fulfillmentType,
      totalCommittedQuantity: totalQty,
      v2Issued: isV2Issued,
      commercialApproved,
    },
    message: `Created commitment ${commitmentNumber} from ${quotation.quotationNumber} V${quotation.versionNo}`,
  });

  return commitment;
}

export async function getCommitmentById(idOrNumber: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const commitment = await prisma.commercialCommitment.findFirst({
    where: { OR: [{ id: idOrNumber }, { commitmentNumber: idOrNumber }] },
    include: {
      quotation: { include: { lines: true } },
      salesOrders: { include: { lines: true }, orderBy: { createdAt: 'desc' } },
      salesAgreements: { include: { lines: true, releases: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!commitment) throw issue('NOT_FOUND', `Commitment ${idOrNumber} not found.`);
  assertCanAccessInquiryOwnership(actor, commitment.customerId, commitment.customerMasterId);
  return commitment;
}

export async function listCommitments(
  actor: RequestActor,
  filter?: { customerIds?: string[]; customerMasterIds?: string[]; status?: string; inquiryId?: string }
) {
  const prisma = requirePrisma();
  const where: Record<string, unknown> = {};
  if (filter?.status) where.status = filter.status;
  if (filter?.inquiryId) {
    where.quotation = { inquiryId: filter.inquiryId };
  }
  if (actor.userType === 'customer' || filter?.customerIds || filter?.customerMasterIds) {
    const or: object[] = [];
    if (filter?.customerIds?.length) or.push({ customerId: { in: filter.customerIds } });
    if (filter?.customerMasterIds?.length) or.push({ customerMasterId: { in: filter.customerMasterIds } });
    if (or.length) where.OR = or;
  }
  return prisma.commercialCommitment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { salesOrders: true, salesAgreements: true },
  });
}

/**
 * Create EPC Sales Order from DIRECT_ORDER commitment (Spec §12–13).
 * Copies frozen quotation snapshot; never re-runs costing.
 * Optional line quantities support multiple partial SOs per commitment.
 */
export async function createSalesOrderFromCommitment(
  commitmentId: string,
  input: {
    lines?: Array<{ quotationLineId: string; quantity: number }>;
    shipTo?: string;
    billTo?: string;
    requestedDeliveryDate?: string;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const commitment = await prisma.commercialCommitment.findFirst({
    where: { OR: [{ id: commitmentId }, { commitmentNumber: commitmentId }] },
    include: { quotation: { include: { lines: true } } },
  });
  if (!commitment) throw issue('NOT_FOUND', `Commitment ${commitmentId} not found.`);
  assertCanAccessInquiryOwnership(actor, commitment.customerId, commitment.customerMasterId);

  if (commitment.status !== 'ACTIVE' && commitment.status !== 'COMPLETED') {
    throw issue('BUSINESS_RULE_REQUIRED', `Commitment ${commitment.commitmentNumber} is not ACTIVE.`);
  }
  if (commitment.fulfillmentType !== 'DIRECT_ORDER') {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      `Direct sales orders require fulfillmentType DIRECT_ORDER (got ${commitment.fulfillmentType}). Use agreement release instead.`
    );
  }

  const remaining = toNum(commitment.remainingQuantity);
  const committed = toNum(commitment.totalCommittedQuantity);
  const alreadyOrdered = toNum(commitment.orderedQuantity);

  // Idempotency: already fulfilled and caller asks for default/full plan → return existing SO.
  if (remaining <= 1e-9 && (!input.lines || input.lines.length === 0)) {
    const existing = await prisma.epcSalesOrder.findFirst({
      where: { commitmentId: commitment.id, agreementReleaseId: null },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
  }

  if (commitment.status !== 'ACTIVE') {
    throw issue('BUSINESS_RULE_REQUIRED', `Commitment ${commitment.commitmentNumber} is not ACTIVE.`);
  }

  const qLines = commitment.quotation.lines;
  const linePlan: Array<{ quotationLineId: string; quantity: number }> = input.lines?.length
    ? input.lines
    : qLines.map((l) => ({ quotationLineId: l.id, quantity: toNum(l.quantity) }));

  let orderQty = 0;
  const soLineCreates = [];
  for (const plan of linePlan) {
    if (!(plan.quantity > 0)) {
      throw issue('VALIDATION_FAILED', 'Sales order line quantity must be greater than zero.');
    }
    const qLine = qLines.find((l) => l.id === plan.quotationLineId);
    if (!qLine) throw issue('NOT_FOUND', `Quotation line ${plan.quotationLineId} not found on commitment quotation.`);
    orderQty += plan.quantity;
    soLineCreates.push(mapQuotationLineToSoLine(qLine, plan.quantity));
  }

  if (orderQty > remaining + 1e-9) {
    // Duplicate partial with identical line quantities → return matching SO if present.
    if (input.lines?.length) {
      const candidates = await prisma.epcSalesOrder.findMany({
        where: { commitmentId: commitment.id, agreementReleaseId: null },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
      });
      const match = candidates.find((so) => {
        if (so.lines.length !== input.lines!.length) return false;
        return input.lines!.every((plan) =>
          so.lines.some(
            (l) => l.quotationLineId === plan.quotationLineId && Math.abs(toNum(l.quantity) - plan.quantity) < 1e-9
          )
        );
      });
      if (match) return match;
    }
    throw releaseQtyError({
      committed,
      alreadyReleased: alreadyOrdered,
      requested: orderQty,
      remaining,
      uom: commitment.quantityUom,
      context: `commitment ${commitment.commitmentNumber}`,
    });
  }

  const salesOrderNumber = stampId('SO');
  const result = await prisma.$transaction(async (tx) => {
    const so = await tx.epcSalesOrder.create({
      data: {
        salesOrderNumber,
        commitmentId: commitment.id,
        quotationId: commitment.quotationId,
        inquiryId: commitment.quotation.inquiryId,
        orderOrigin: 'QUOTATION',
        orderFulfillmentMode: 'MTO',
        customerId: commitment.customerId,
        customerMasterId: commitment.customerMasterId,
        customerName: commitment.customerName,
        currency: commitment.currency,
        paymentTerms: commitment.quotation.paymentTerms,
        deliveryTerms: commitment.quotation.deliveryTerms,
        incoterms: commitment.quotation.incoterms,
        billTo: input.billTo ?? commitment.quotation.billTo,
        shipTo: input.shipTo ?? commitment.quotation.shipTo,
        requestedDeliveryDate: input.requestedDeliveryDate
          ? new Date(input.requestedDeliveryDate)
          : commitment.quotation.requestedDeliveryDate,
        status: 'CONFIRMED',
        integrationStatus: 'NOT_SENT',
        createdBy: actorLabel(actor),
        lines: { create: soLineCreates },
      },
      include: { lines: true },
    });

    const newOrdered = toNum(commitment.orderedQuantity) + orderQty;
    const newRemaining = toNum(commitment.totalCommittedQuantity) - newOrdered;
    await tx.commercialCommitment.update({
      where: { id: commitment.id },
      data: {
        orderedQuantity: newOrdered,
        remainingQuantity: newRemaining,
        status: newRemaining <= 1e-9 ? 'COMPLETED' : 'ACTIVE',
      },
    });

    return so;
  });

  await writeAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'EpcSalesOrder',
    entityId: salesOrderNumber,
    action: 'CREATE',
    newValue: { salesOrderNumber, commitmentNumber: commitment.commitmentNumber, orderQty },
    message: `Created EPC sales order ${salesOrderNumber} from commitment ${commitment.commitmentNumber}`,
  });

  return result;
}

export async function getSalesOrderById(idOrNumber: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const so = await prisma.epcSalesOrder.findFirst({
    where: { OR: [{ id: idOrNumber }, { salesOrderNumber: idOrNumber }] },
    include: {
      lines: true,
      commitment: true,
      quotation: true,
      agreementRelease: { include: { agreement: true } },
    },
  });
  if (!so) throw issue('NOT_FOUND', `Sales order ${idOrNumber} not found.`);
  assertCanAccessInquiryOwnership(actor, so.customerId, so.customerMasterId);
  return so;
}

export async function listSalesOrders(
  actor: RequestActor,
  filter?: { customerIds?: string[]; customerMasterIds?: string[]; commitmentId?: string }
) {
  const prisma = requirePrisma();
  const where: Record<string, unknown> = {};
  if (filter?.commitmentId) {
    where.AND = [
      {
        OR: [{ commitmentId: filter.commitmentId }, { commitment: { commitmentNumber: filter.commitmentId } }],
      },
    ];
  }
  if (filter?.customerIds?.length || filter?.customerMasterIds?.length) {
    const or: object[] = [];
    if (filter.customerIds?.length) or.push({ customerId: { in: filter.customerIds } });
    if (filter.customerMasterIds?.length) or.push({ customerMasterId: { in: filter.customerMasterIds } });
    where.AND = [...((where.AND as object[]) || []), { OR: or }];
  }
  return prisma.epcSalesOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { lines: true },
  });
}

/** Create sales agreement from SALES_AGREEMENT commitment (Spec §8.2 / §9). */
export async function createSalesAgreementFromCommitment(
  commitmentId: string,
  input: { validFrom?: string; validTo?: string },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const commitment = await prisma.commercialCommitment.findFirst({
    where: { OR: [{ id: commitmentId }, { commitmentNumber: commitmentId }] },
    include: { quotation: { include: { lines: true } }, salesAgreements: true },
  });
  if (!commitment) throw issue('NOT_FOUND', `Commitment ${commitmentId} not found.`);
  assertCanAccessInquiryOwnership(actor, commitment.customerId, commitment.customerMasterId);

  if (commitment.status !== 'ACTIVE') {
    throw issue('BUSINESS_RULE_REQUIRED', `Commitment ${commitment.commitmentNumber} is not ACTIVE.`);
  }
  if (commitment.fulfillmentType !== 'SALES_AGREEMENT') {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      `Sales agreement requires fulfillmentType SALES_AGREEMENT (got ${commitment.fulfillmentType}).`
    );
  }
  if (commitment.salesAgreements.some((a) => a.status === 'ACTIVE' || a.status === 'DRAFT')) {
    throw issue('CONFLICT', `An active sales agreement already exists for commitment ${commitment.commitmentNumber}.`);
  }

  const totalQty = toNum(commitment.totalCommittedQuantity);
  const agreementNumber = stampId('SA');
  const agreement = await prisma.salesAgreement.create({
    data: {
      agreementNumber,
      commitmentId: commitment.id,
      quotationId: commitment.quotationId,
      customerId: commitment.customerId,
      customerMasterId: commitment.customerMasterId,
      customerName: commitment.customerName,
      currency: commitment.currency,
      validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
      validTo: input.validTo ? new Date(input.validTo) : commitment.expirationDate,
      status: 'ACTIVE',
      totalCommittedQuantity: totalQty,
      totalReleasedQuantity: 0,
      remainingQuantity: totalQty,
      quantityUom: commitment.quantityUom,
      integrationStatus: 'NOT_SENT',
      createdBy: actorLabel(actor),
      lines: {
        create: commitment.quotation.lines.map((l) => {
          const qty = toNum(l.quantity);
          const lineageSnapshot = buildLineageSnapshotFromQuotationLine(l);
          return {
            lineNumber: l.lineNumber,
            quotationLineId: l.id,
            materialNumber: l.materialNumber,
            itemDescription: l.itemDescription,
            customerCableCode: l.customerCableCode,
            committedQuantity: qty,
            releasedQuantity: 0,
            remainingQuantity: qty,
            quantityUom: l.quantityUom,
            unitPrice: l.sellingPrice != null ? toNum(l.sellingPrice) : null,
            configurationId: l.configurationId,
            engineeringRevision: l.engineeringRevision,
            bomVersion: l.bomVersion,
            technicalSpecificationId: l.technicalSpecificationId,
            lengthMeters: l.lengthMeters != null ? toNum(l.lengthMeters) : null,
            cuttingLengthMeters: l.cuttingLengthMeters != null ? toNum(l.cuttingLengthMeters) : null,
            numberOfCuts: l.numberOfCuts,
            drumType: l.drumType,
            costingRunId: l.costingRunId,
            costingCalculationId: l.costingCalculationId,
            ...(lineageSnapshot ? { lineageSnapshot } : {}),
          };
        }),
      },
    },
    include: { lines: true },
  });

  await writeAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'SalesAgreement',
    entityId: agreementNumber,
    action: 'CREATE',
    newValue: { agreementNumber, commitmentNumber: commitment.commitmentNumber, totalQty },
    message: `Created sales agreement ${agreementNumber} from commitment ${commitment.commitmentNumber}`,
  });

  return agreement;
}

export async function getSalesAgreementById(idOrNumber: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const agreement = await prisma.salesAgreement.findFirst({
    where: { OR: [{ id: idOrNumber }, { agreementNumber: idOrNumber }] },
    include: {
      lines: true,
      releases: {
        orderBy: { createdAt: 'desc' },
        include: { lines: true, salesOrder: true },
      },
      commitment: true,
      quotation: true,
    },
  });
  if (!agreement) throw issue('NOT_FOUND', `Sales agreement ${idOrNumber} not found.`);
  assertCanAccessInquiryOwnership(actor, agreement.customerId, agreement.customerMasterId);
  return agreement;
}

export async function listSalesAgreements(
  actor: RequestActor,
  filter?: { customerIds?: string[]; customerMasterIds?: string[]; commitmentId?: string }
) {
  const prisma = requirePrisma();
  const where: Record<string, unknown> = {};
  if (filter?.commitmentId) {
    where.OR = [{ commitmentId: filter.commitmentId }, { commitment: { commitmentNumber: filter.commitmentId } }];
  }
  if (filter?.customerIds?.length || filter?.customerMasterIds?.length) {
    const or: object[] = [];
    if (filter.customerIds?.length) or.push({ customerId: { in: filter.customerIds } });
    if (filter.customerMasterIds?.length) or.push({ customerMasterId: { in: filter.customerMasterIds } });
    where.AND = [{ OR: or }];
  }
  return prisma.salesAgreement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { lines: true, releases: true },
  });
}

/**
 * Release quantity from sales agreement → EPC Sales Order (Spec §24–25).
 * Validates released + previous <= committed at header and line level.
 */
export async function createAgreementRelease(
  agreementId: string,
  input: {
    lines: Array<{ agreementLineId: string; quantity: number }>;
    requestedDeliveryDate?: string;
    shipTo?: string;
    notes?: string;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  if (!input.lines?.length) {
    throw issue('VALIDATION_FAILED', 'Agreement release requires at least one line with quantity.');
  }

  const agreement = await prisma.salesAgreement.findFirst({
    where: { OR: [{ id: agreementId }, { agreementNumber: agreementId }] },
    include: {
      lines: true,
      commitment: { include: { quotation: { include: { lines: true } } } },
    },
  });
  if (!agreement) throw issue('NOT_FOUND', `Sales agreement ${agreementId} not found.`);
  assertCanAccessInquiryOwnership(actor, agreement.customerId, agreement.customerMasterId);

  if (agreement.status !== 'ACTIVE' && agreement.status !== 'COMPLETED') {
    throw issue('BUSINESS_RULE_REQUIRED', `Sales agreement ${agreement.agreementNumber} is not ACTIVE.`);
  }

  let releaseQty = 0;
  const lineUpdates: Array<{
    id: string;
    quantity: number;
    remaining: number;
    released: number;
    aLine: (typeof agreement.lines)[number];
  }> = [];
  const soLineCreates = [];
  let overReleaseContext: {
    committed: number;
    alreadyReleased: number;
    requested: number;
    remaining: number;
    uom: string;
    context: string;
  } | null = null;

  for (const plan of input.lines) {
    if (!(plan.quantity > 0)) {
      throw issue('VALIDATION_FAILED', 'Release line quantity must be greater than zero.');
    }
    const aLine = agreement.lines.find((l) => l.id === plan.agreementLineId);
    if (!aLine) throw issue('NOT_FOUND', `Agreement line ${plan.agreementLineId} not found.`);
    const remaining = toNum(aLine.remainingQuantity);
    const alreadyReleased = toNum(aLine.releasedQuantity);
    const committed = toNum(aLine.committedQuantity);
    if (plan.quantity > remaining + 1e-9) {
      overReleaseContext = {
        committed,
        alreadyReleased,
        requested: plan.quantity,
        remaining,
        uom: aLine.quantityUom,
        context: `agreement line ${aLine.lineNumber}`,
      };
      break;
    }
    releaseQty += plan.quantity;
    lineUpdates.push({
      id: aLine.id,
      quantity: plan.quantity,
      remaining: remaining - plan.quantity,
      released: alreadyReleased + plan.quantity,
      aLine,
    });

    const qLine = agreement.commitment.quotation.lines.find((l) => l.id === aLine.quotationLineId);
    if (qLine) {
      soLineCreates.push(mapQuotationLineToSoLine(qLine, plan.quantity));
    } else {
      const unitPrice = aLine.unitPrice != null ? toNum(aLine.unitPrice) : null;
      const lineageSnapshot = buildLineageSnapshotFromQuotationLine(aLine);
      soLineCreates.push({
        lineNumber: aLine.lineNumber,
        quotationLineId: aLine.quotationLineId,
        materialNumber: aLine.materialNumber,
        itemCode: aLine.materialNumber,
        itemDescription: aLine.itemDescription,
        customerCableCode: aLine.customerCableCode,
        quantity: plan.quantity,
        quantityUom: aLine.quantityUom,
        unitPrice,
        netPrice: unitPrice,
        lineAmount: unitPrice != null ? unitPrice * plan.quantity : null,
        configurationId: aLine.configurationId,
        engineeringRevision: aLine.engineeringRevision,
        bomVersion: aLine.bomVersion,
        technicalSpecificationId: aLine.technicalSpecificationId,
        lengthMeters: aLine.lengthMeters != null ? toNum(aLine.lengthMeters) : null,
        cuttingLengthMeters: aLine.cuttingLengthMeters != null ? toNum(aLine.cuttingLengthMeters) : null,
        numberOfCuts: aLine.numberOfCuts,
        drumType: aLine.drumType,
        drumSize: null,
        drumQuantity: null,
        drumLengthMeters: null,
        drumWeightKg: null,
        costingRunId: aLine.costingRunId,
        costingCalculationId: aLine.costingCalculationId,
        ...(lineageSnapshot ? { lineageSnapshot } : {}),
      });
    }
  }

  const headerRemaining = toNum(agreement.remainingQuantity);
  const headerCommitted = toNum(agreement.totalCommittedQuantity);
  const headerReleased = toNum(agreement.totalReleasedQuantity);

  if (overReleaseContext || releaseQty > headerRemaining + 1e-9) {
    // Idempotency: identical release already posted → return it.
    const prior = await prisma.agreementRelease.findMany({
      where: { agreementId: agreement.id },
      include: { lines: true, salesOrder: { include: { lines: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const match = prior.find((rel) => {
      if (rel.lines.length !== input.lines.length) return false;
      return input.lines.every((plan) =>
        rel.lines.some(
          (l) => l.agreementLineId === plan.agreementLineId && Math.abs(toNum(l.quantity) - plan.quantity) < 1e-9
        )
      );
    });
    if (match?.salesOrder) {
      return { release: match, salesOrder: match.salesOrder };
    }
    throw releaseQtyError(
      overReleaseContext || {
        committed: headerCommitted,
        alreadyReleased: headerReleased,
        requested: releaseQty,
        remaining: headerRemaining,
        uom: agreement.quantityUom,
        context: `agreement ${agreement.agreementNumber}`,
      }
    );
  }

  const releaseNumber = stampId('REL');
  const salesOrderNumber = stampId('SO');
  const commitment = agreement.commitment;

  const releaseLineCreates = lineUpdates.map((u) => ({
    agreementLineId: u.aLine.id,
    lineNumber: u.aLine.lineNumber,
    quotationLineId: u.aLine.quotationLineId,
    materialNumber: u.aLine.materialNumber,
    itemDescription: u.aLine.itemDescription,
    quantity: u.quantity,
    quantityUom: u.aLine.quantityUom,
    unitPrice: u.aLine.unitPrice != null ? toNum(u.aLine.unitPrice) : null,
  }));

  const result = await prisma.$transaction(async (tx) => {
    const release = await tx.agreementRelease.create({
      data: {
        releaseNumber,
        agreementId: agreement.id,
        status: 'CONFIRMED',
        requestedDeliveryDate: input.requestedDeliveryDate ? new Date(input.requestedDeliveryDate) : null,
        shipTo: input.shipTo ?? null,
        totalReleasedQuantity: releaseQty,
        quantityUom: agreement.quantityUom,
        notes: input.notes ?? null,
        createdBy: actorLabel(actor),
        lines: { create: releaseLineCreates },
      },
      include: { lines: true },
    });

    const so = await tx.epcSalesOrder.create({
      data: {
        salesOrderNumber,
        commitmentId: commitment.id,
        quotationId: commitment.quotationId,
        inquiryId: commitment.quotation.inquiryId,
        agreementReleaseId: release.id,
        orderOrigin: 'AGREEMENT_RELEASE',
        orderFulfillmentMode: 'MTO',
        customerId: agreement.customerId,
        customerMasterId: agreement.customerMasterId,
        customerName: agreement.customerName,
        currency: agreement.currency,
        paymentTerms: commitment.quotation.paymentTerms,
        deliveryTerms: commitment.quotation.deliveryTerms,
        incoterms: commitment.quotation.incoterms,
        billTo: commitment.quotation.billTo,
        shipTo: input.shipTo ?? commitment.quotation.shipTo,
        requestedDeliveryDate: input.requestedDeliveryDate
          ? new Date(input.requestedDeliveryDate)
          : commitment.quotation.requestedDeliveryDate,
        status: 'CONFIRMED',
        integrationStatus: 'NOT_SENT',
        createdBy: actorLabel(actor),
        lines: { create: soLineCreates },
      },
      include: { lines: true },
    });

    for (const u of lineUpdates) {
      await tx.salesAgreementLine.update({
        where: { id: u.id },
        data: { releasedQuantity: u.released, remainingQuantity: u.remaining },
      });
    }

    const newReleased = toNum(agreement.totalReleasedQuantity) + releaseQty;
    const newRemaining = toNum(agreement.totalCommittedQuantity) - newReleased;
    await tx.salesAgreement.update({
      where: { id: agreement.id },
      data: {
        totalReleasedQuantity: newReleased,
        remainingQuantity: newRemaining,
        status: newRemaining <= 1e-9 ? 'COMPLETED' : 'ACTIVE',
      },
    });

    const newOrdered = toNum(commitment.orderedQuantity) + releaseQty;
    const commitmentRemaining = toNum(commitment.totalCommittedQuantity) - newOrdered;
    await tx.commercialCommitment.update({
      where: { id: commitment.id },
      data: {
        orderedQuantity: newOrdered,
        remainingQuantity: commitmentRemaining,
        status: commitmentRemaining <= 1e-9 ? 'COMPLETED' : 'ACTIVE',
      },
    });

    return { release, salesOrder: so };
  });

  await writeAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'AgreementRelease',
    entityId: releaseNumber,
    action: 'CREATE',
    newValue: {
      releaseNumber,
      agreementNumber: agreement.agreementNumber,
      salesOrderNumber,
      releaseQty,
    },
    message: `Released ${releaseQty} ${agreement.quantityUom} from ${agreement.agreementNumber} → ${salesOrderNumber}`,
  });

  await notifyFulfillmentEvent({
    eventCode: 'AGREEMENT_RELEASED',
    title: `Order released: ${salesOrderNumber}`,
    message: `Released ${releaseQty} ${agreement.quantityUom} from ${agreement.agreementNumber}.`,
  });

  return result;
}

/** Spec naming alias — release from sales agreement. */
export const createReleaseFromSalesAgreement = createAgreementRelease;

/**
 * Convenience: approved DIRECT_ORDER quotation → commitment (if needed) → EPC sales order.
 * Atomic when creating a new commitment + order together.
 */
export async function createSalesOrderFromApprovedQuotation(
  quotationRevisionId: string,
  input: {
    lines?: Array<{ quotationLineId: string; quantity: number }>;
    shipTo?: string;
    billTo?: string;
    requestedDeliveryDate?: string;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const quotation = await prisma.commercialQuotation.findFirst({
    where: {
      OR: [{ id: quotationRevisionId }, { quotationNumber: quotationRevisionId, isCurrent: true }],
    },
    include: { lines: true },
  });
  if (!quotation) throw issue('NOT_FOUND', `Quotation ${quotationRevisionId} not found.`);
  assertCanAccessInquiryOwnership(actor, quotation.customerId, quotation.customerMasterId);

  const { eligible, isV2Issued } = isCommitmentEligibleQuotation(quotation);
  if (!eligible) {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      'Sales order requires a commercially approved quotation revision or an issued V2 quotation with approved pricing.'
    );
  }

  const fulfillmentType =
    quotation.fulfillmentType || (isV2Issued ? 'DIRECT_ORDER' : null);
  if (fulfillmentType !== 'DIRECT_ORDER') {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      `Sales order from quotation requires fulfillmentType DIRECT_ORDER (got ${fulfillmentType || 'unset'}).`
    );
  }

  let commitment = await prisma.commercialCommitment.findFirst({
    where: { quotationId: quotation.id, status: { in: ['ACTIVE', 'COMPLETED', 'DRAFT'] } },
  });
  if (!commitment) {
    commitment = await createCommitmentFromQuotation(quotation.id, actor);
  }
  return createSalesOrderFromCommitment(commitment.id, input, actor);
}

/**
 * Convenience: approved SALES_AGREEMENT quotation → commitment (if needed) → sales agreement.
 */
export async function createSalesAgreementFromApprovedQuotation(
  quotationRevisionId: string,
  input: { validFrom?: string; validTo?: string },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const quotation = await prisma.commercialQuotation.findFirst({
    where: {
      OR: [{ id: quotationRevisionId }, { quotationNumber: quotationRevisionId, isCurrent: true }],
    },
  });
  if (!quotation) throw issue('NOT_FOUND', `Quotation ${quotationRevisionId} not found.`);
  assertCanAccessInquiryOwnership(actor, quotation.customerId, quotation.customerMasterId);

  const { eligible, isV2Issued } = isCommitmentEligibleQuotation(quotation);
  if (!eligible) {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      'Sales agreement requires a commercially approved quotation revision or an issued V2 quotation with approved pricing.'
    );
  }

  const fulfillmentType =
    quotation.fulfillmentType || (isV2Issued ? 'SALES_AGREEMENT' : null);
  if (fulfillmentType !== 'SALES_AGREEMENT') {
    throw issue(
      'BUSINESS_RULE_REQUIRED',
      `Sales agreement from quotation requires fulfillmentType SALES_AGREEMENT (got ${fulfillmentType || 'unset'}).`
    );
  }

  let commitment = await prisma.commercialCommitment.findFirst({
    where: { quotationId: quotation.id, status: { in: ['ACTIVE', 'COMPLETED', 'DRAFT'] } },
  });
  if (!commitment) {
    commitment = await createCommitmentFromQuotation(quotation.id, actor);
  }

  const existingAgreement = await prisma.salesAgreement.findFirst({
    where: { commitmentId: commitment.id, status: { in: ['ACTIVE', 'DRAFT', 'COMPLETED'] } },
    include: { lines: true, releases: true },
  });
  if (existingAgreement) return existingAgreement;

  return createSalesAgreementFromCommitment(commitment.id, input, actor);
}

function isMtsEligiblePolicy(policy: string | null | undefined): boolean {
  return policy === 'MTS' || policy === 'MTO_MTS';
}

export type DirectMtsSalesOrderLineInput = {
  materialNumber: string;
  quantity: number;
  quantityUom?: string;
  unitPrice?: number;
  discountPercent?: number;
  itemDescription?: string;
  customerCableCode?: string;
  itemCode?: string;
  lengthMeters?: number;
  cuttingLengthMeters?: number;
  numberOfCuts?: number;
  drumType?: string;
  drumSize?: string;
  drumQuantity?: number;
  drumLengthMeters?: number;
  drumWeightKg?: number;
  availableStockQuantity?: number;
  configurationId?: string;
  engineeringRevision?: string;
  bomVersion?: string;
  technicalSpecificationId?: string;
};

/**
 * Direct MTS Sales Order — no quotation, no Commercial Commitment.
 * Order Origin = DIRECT_MTS, Order Fulfillment Mode = MTS.
 * Cable must be MTS-eligible (CableFulfillmentPolicy MTS or MTO_MTS).
 */
export async function createDirectMtsSalesOrder(
  input: {
    customerId: string;
    customerMasterId?: string | null;
    customerName?: string;
    customerReference?: string;
    currency?: string;
    paymentTerms?: string;
    deliveryTerms?: string;
    incoterms?: string;
    billTo?: string;
    shipTo?: string;
    requestedDeliveryDate?: string;
    idempotencyKey?: string;
    lines: DirectMtsSalesOrderLineInput[];
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();

  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create direct MTS sales orders.');
  }

  if (!input.customerId?.trim()) {
    throw issue('VALIDATION_FAILED', 'customerId is required for Direct MTS sales orders.');
  }
  if (!input.lines?.length) {
    throw issue('VALIDATION_FAILED', 'Direct MTS sales orders require at least one line.');
  }

  assertCanAccessInquiryOwnership(actor, input.customerId, input.customerMasterId);

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await prisma.epcSalesOrder.findUnique({
      where: { idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      if (existing.orderOrigin !== 'DIRECT_MTS') {
        throw issue('CONFLICT', `Idempotency key ${idempotencyKey} is already used by a non-Direct-MTS sales order.`);
      }
      assertCanAccessInquiryOwnership(actor, existing.customerId, existing.customerMasterId);
      return existing;
    }
  }

  let customerName = input.customerName?.trim() || '';
  let customerMasterId = input.customerMasterId ?? null;
  let currency = input.currency || 'USD';
  let paymentTerms = input.paymentTerms ?? null;
  let deliveryTerms = input.deliveryTerms ?? null;
  let incoterms = input.incoterms ?? null;

  if (customerMasterId) {
    const master = await prisma.customer.findUnique({ where: { id: customerMasterId } });
    if (!master) throw issue('NOT_FOUND', `Customer master ${customerMasterId} not found.`);
    if (!customerName) customerName = master.name;
    currency = input.currency || master.defaultCurrency || currency;
    paymentTerms = input.paymentTerms ?? master.paymentTerms ?? null;
    deliveryTerms = input.deliveryTerms ?? master.deliveryTerms ?? null;
    incoterms = input.incoterms ?? master.defaultIncoterm ?? null;
  } else {
    const byCode = await prisma.customer.findUnique({ where: { code: input.customerId } });
    if (byCode) {
      customerMasterId = byCode.id;
      if (!customerName) customerName = byCode.name;
      currency = input.currency || byCode.defaultCurrency || currency;
      paymentTerms = input.paymentTerms ?? byCode.paymentTerms ?? null;
      deliveryTerms = input.deliveryTerms ?? byCode.deliveryTerms ?? null;
      incoterms = input.incoterms ?? byCode.defaultIncoterm ?? null;
    }
  }
  if (!customerName) customerName = input.customerId;

  const materialNumbers = [...new Set(input.lines.map((l) => String(l.materialNumber || '').trim()).filter(Boolean))];
  if (materialNumbers.length !== input.lines.length) {
    throw issue('VALIDATION_FAILED', 'Each Direct MTS line requires a materialNumber.');
  }

  const cables = await prisma.cableMaster.findMany({
    where: { materialNumber: { in: materialNumbers } },
  });
  const cableByMat = new Map(cables.map((c) => [c.materialNumber, c]));

  const soLineCreates = [];
  for (let i = 0; i < input.lines.length; i++) {
    const plan = input.lines[i];
    const materialNumber = String(plan.materialNumber).trim();
    if (!(plan.quantity > 0)) {
      throw issue('VALIDATION_FAILED', 'Direct MTS line quantity must be greater than zero.');
    }
    const cable = cableByMat.get(materialNumber);
    if (!cable) {
      throw issue('NOT_FOUND', `Cable ${materialNumber} not found in Cable Master.`);
    }
    if (cable.status !== 'ACTIVE') {
      throw issue('BUSINESS_RULE_REQUIRED', `Cable ${materialNumber} is not ACTIVE.`);
    }
    if (!isMtsEligiblePolicy(cable.fulfillmentPolicy)) {
      throw issue(
        'BUSINESS_RULE_REQUIRED',
        `Cable ${materialNumber} has fulfillment policy ${cable.fulfillmentPolicy} (MTO only). Direct MTS sales orders are not allowed. Use Quotation → Commercial Approval → Sales Order.`
      );
    }

    const unitPrice = plan.unitPrice != null ? Number(plan.unitPrice) : null;
    const discountPercent = plan.discountPercent != null ? Number(plan.discountPercent) : null;
    const netPrice =
      unitPrice != null
        ? discountPercent != null
          ? unitPrice * (1 - discountPercent / 100)
          : unitPrice
        : null;
    const lineAmount = netPrice != null ? netPrice * plan.quantity : null;

    soLineCreates.push({
      lineNumber: i + 1,
      quotationLineId: null,
      materialNumber,
      itemCode: plan.itemCode ?? cable.itemCode ?? materialNumber,
      itemDescription: plan.itemDescription?.trim() || cable.description,
      customerCableCode: plan.customerCableCode ?? cable.customerCode ?? null,
      quantity: plan.quantity,
      quantityUom: plan.quantityUom || cable.uom || 'KM',
      unitPrice,
      discountPercent,
      netPrice,
      lineAmount,
      configurationId: plan.configurationId ?? null,
      engineeringRevision: plan.engineeringRevision ?? null,
      bomVersion: plan.bomVersion ?? null,
      technicalSpecificationId: plan.technicalSpecificationId ?? null,
      lengthMeters: plan.lengthMeters != null ? plan.lengthMeters : null,
      cuttingLengthMeters: plan.cuttingLengthMeters != null ? plan.cuttingLengthMeters : null,
      numberOfCuts: plan.numberOfCuts ?? null,
      drumType: plan.drumType ?? null,
      drumSize: plan.drumSize ?? null,
      drumQuantity: plan.drumQuantity != null ? plan.drumQuantity : null,
      drumLengthMeters: plan.drumLengthMeters != null ? plan.drumLengthMeters : null,
      drumWeightKg: plan.drumWeightKg != null ? plan.drumWeightKg : null,
      availableStockQuantity: plan.availableStockQuantity != null ? plan.availableStockQuantity : null,
      costingRunId: null,
      costingCalculationId: null,
    });
  }

  // Fingerprint idempotency when no explicit key: same customer + reference + line set.
  if (!idempotencyKey && input.customerReference?.trim()) {
    const candidates = await prisma.epcSalesOrder.findMany({
      where: {
        orderOrigin: 'DIRECT_MTS',
        customerId: input.customerId,
        customerReference: input.customerReference.trim(),
      },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const match = candidates.find((so) => {
      if (so.lines.length !== soLineCreates.length) return false;
      return soLineCreates.every((plan) =>
        so.lines.some(
          (l) =>
            l.materialNumber === plan.materialNumber &&
            Math.abs(toNum(l.quantity) - toNum(plan.quantity)) < 1e-9 &&
            Math.abs(toNum(l.cuttingLengthMeters) - toNum(plan.cuttingLengthMeters)) < 1e-9 &&
            (l.drumType || null) === (plan.drumType || null)
        )
      );
    });
    if (match) return match;
  }

  const salesOrderNumber = stampId('SO');
  const result = await prisma.$transaction(async (tx) => {
    return tx.epcSalesOrder.create({
      data: {
        salesOrderNumber,
        commitmentId: null,
        quotationId: null,
        inquiryId: null,
        agreementReleaseId: null,
        orderOrigin: 'DIRECT_MTS',
        orderFulfillmentMode: 'MTS',
        customerId: input.customerId,
        customerMasterId,
        customerName,
        customerReference: input.customerReference?.trim() || null,
        currency,
        paymentTerms,
        deliveryTerms,
        incoterms,
        billTo: input.billTo ?? null,
        shipTo: input.shipTo ?? null,
        requestedDeliveryDate: input.requestedDeliveryDate ? new Date(input.requestedDeliveryDate) : null,
        status: 'CONFIRMED',
        integrationStatus: 'NOT_SENT',
        idempotencyKey,
        createdBy: actorLabel(actor),
        lines: { create: soLineCreates },
      },
      include: { lines: true },
    });
  });

  await writeAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'EpcSalesOrder',
    entityId: salesOrderNumber,
    action: 'CREATE',
    newValue: {
      salesOrderNumber,
      orderOrigin: 'DIRECT_MTS',
      orderFulfillmentMode: 'MTS',
      customerId: input.customerId,
      lineCount: soLineCreates.length,
      idempotencyKey,
    },
    message: `Created Direct MTS sales order ${salesOrderNumber} (no Commercial Commitment)`,
  });

  return result;
}

export async function getAgreementReleaseById(idOrNumber: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const release = await prisma.agreementRelease.findFirst({
    where: { OR: [{ id: idOrNumber }, { releaseNumber: idOrNumber }] },
    include: {
      lines: true,
      salesOrder: { include: { lines: true } },
      agreement: true,
    },
  });
  if (!release) throw issue('NOT_FOUND', `Agreement release ${idOrNumber} not found.`);
  assertCanAccessInquiryOwnership(actor, release.agreement.customerId, release.agreement.customerMasterId);
  return release;
}

export async function listAgreementReleases(
  agreementId: string,
  actor: RequestActor
) {
  const agreement = await getSalesAgreementById(agreementId, actor);
  const prisma = requirePrisma();
  return prisma.agreementRelease.findMany({
    where: { agreementId: agreement.id },
    include: { lines: true, salesOrder: true },
    orderBy: { createdAt: 'desc' },
  });
}
