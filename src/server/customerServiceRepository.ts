import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { RequestActor } from './auth';
import { issue } from '../platform/errors/domainError';
import { appendServerAudit } from './serverAudit';
import { allocateNextNumber, upsertNumberSequence } from './numberSequenceService';
import { decodeAttachmentContent, MAX_ATTACHMENT_BYTES } from './attachmentRepository';
import {
  assertCanAccessServiceCaseOwnership,
  assertCanAssignServiceCase,
  assertCanCreateServiceCase,
  assertCanUpdateServiceCase,
  assertCanViewServiceCase,
} from './rbac';
import { resolveCustomerScope, type CustomerScope } from './customerScope';
import {
  COMPLAINT_CATEGORY_SEED,
  CUSTOMER_SERVICE_CASE_SEQUENCE,
  REQUESTED_RESOLUTION_OPTIONS,
} from '../domain/complaintCategorySeed';
import {
  CASE_ASSIGNMENT_DEPARTMENTS,
  CUSTOMER_SERVICE_CASE_PRIORITIES,
  CUSTOMER_SERVICE_CASE_STATUSES,
  customerCanConfirmResolution,
  customerCanRequestReopen,
  departmentLabel,
  filterAttachmentsForActor,
  filterCommentsForActor,
  isCaseAssignmentDepartment,
  isCustomerServiceCasePriority,
  isCustomerServiceCaseStatus,
  nextStatusAfterCustomerComment,
  resolveCommentVisibilityForActor,
  statusForCaseTab,
} from '../domain/customerServiceCase';
import { CUSTOMER_SERVICE_CASE_TYPES, caseTypeLabel, isCustomerServiceCaseType } from '../domain/supportChat';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: RequestActor): string {
  return actor.name || actor.email || actor.id || 'unknown';
}

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function ownedByScope(
  scope: CustomerScope,
  recordCustomerId: string,
  recordMasterId?: string | null
): boolean {
  const keys = new Set([...scope.matchKeys, ...scope.masterIds]);
  if (recordMasterId && keys.has(recordMasterId)) return true;
  return keys.has(recordCustomerId);
}

export async function ensureCustomerServiceMasters(): Promise<void> {
  const prisma = requirePrisma();
  const existingSeq = await prisma.numberSequence.findUnique({
    where: { code: CUSTOMER_SERVICE_CASE_SEQUENCE.code },
  });
  if (!existingSeq) {
    await upsertNumberSequence({
      code: CUSTOMER_SERVICE_CASE_SEQUENCE.code,
      name: CUSTOMER_SERVICE_CASE_SEQUENCE.name,
      prefix: CUSTOMER_SERVICE_CASE_SEQUENCE.prefix,
      format: CUSTOMER_SERVICE_CASE_SEQUENCE.format,
      moduleId: CUSTOMER_SERVICE_CASE_SEQUENCE.moduleId,
      description: CUSTOMER_SERVICE_CASE_SEQUENCE.description,
    });
  }
  for (const row of COMPLAINT_CATEGORY_SEED) {
    await prisma.complaintCategory.upsert({
      where: { code: row.code },
      create: { code: row.code, name: row.name, sortOrder: row.sortOrder, active: true },
      update: { name: row.name, sortOrder: row.sortOrder, active: true },
    });
  }
}

export async function listComplaintCategories() {
  await ensureCustomerServiceMasters();
  const prisma = requirePrisma();
  return prisma.complaintCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      subcategories: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, name: true, sortOrder: true },
      },
    },
  });
}

export function customerServiceMeta() {
  return {
    statuses: CUSTOMER_SERVICE_CASE_STATUSES.map((code) => ({ code, label: code.replace(/_/g, ' ') })),
    priorities: CUSTOMER_SERVICE_CASE_PRIORITIES.map((code) => ({ code, label: code })),
    caseTypes: CUSTOMER_SERVICE_CASE_TYPES.map((code) => ({ code, label: caseTypeLabel(code) })),
    requestedResolutions: REQUESTED_RESOLUTION_OPTIONS.map((row) => ({ code: row.code, label: row.label })),
    departments: CASE_ASSIGNMENT_DEPARTMENTS.map((code) => ({ code, label: departmentLabel(code) })),
  };
}

async function requireCustomerMasterId(actor: RequestActor, scope: CustomerScope): Promise<string> {
  const id = scope.primaryMasterId || scope.masterIds[0];
  if (actor.userType === 'customer' && !id) {
    throw issue('CONFIGURATION_REQUIRED', 'Customer assignment is required before creating a support case.');
  }
  return id || '';
}

async function loadOwnedInquiry(inquiryId: string, actor: RequestActor, scope: CustomerScope) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      inquiryNumber: true,
      customerId: true,
      customerMasterId: true,
      projectName: true,
      status: true,
    },
  });
  if (!inquiry) throw issue('NOT_FOUND', 'Related inquiry was not found.');
  if (actor.userType === 'customer' && !ownedByScope(scope, inquiry.customerId, inquiry.customerMasterId)) {
    throw issue('UNAUTHORIZED', 'Related inquiry does not belong to your customer account.');
  }
  return inquiry;
}

async function resolveRelatedRefs(
  input: {
    inquiryId: string;
    inquiryLineId?: string | null;
    quotationId?: string | null;
    salesOrderId?: string | null;
    shipmentGroupId?: string | null;
    drumMasterId?: string | null;
  },
  actor: RequestActor,
  scope: CustomerScope
) {
  const prisma = requirePrisma();
  const inquiry = await loadOwnedInquiry(input.inquiryId, actor, scope);

  let inquiryLineId: string | null = null;
  let cableMaterialNumber: string | null = null;
  let drumType: string | null = null;
  let drumPlanId: string | null = null;
  let drumMasterId: string | null = null;

  if (input.inquiryLineId) {
    const line = await prisma.commercialInquiryLine.findUnique({
      where: { id: input.inquiryLineId },
      select: {
        id: true,
        inquiryId: true,
        materialNumber: true,
        drumType: true,
        v2CurrentDrumPlanId: true,
        cableDescription: true,
        lineNumber: true,
      },
    });
    if (!line || line.inquiryId !== inquiry.id) {
      throw issue('UNAUTHORIZED', 'Inquiry line does not belong to the selected inquiry.');
    }
    inquiryLineId = line.id;
    cableMaterialNumber = line.materialNumber || null;
    drumType = line.drumType || null;
    drumPlanId = line.v2CurrentDrumPlanId || null;
  }

  let quotationId: string | null = null;
  if (input.quotationId) {
    const quotation = await prisma.commercialQuotation.findUnique({
      where: { id: input.quotationId },
      select: { id: true, inquiryId: true, customerId: true, customerMasterId: true },
    });
    if (
      !quotation ||
      quotation.inquiryId !== inquiry.id ||
      (actor.userType === 'customer' && !ownedByScope(scope, quotation.customerId, quotation.customerMasterId))
    ) {
      throw issue('UNAUTHORIZED', 'Related quotation does not belong to the selected inquiry.');
    }
    quotationId = quotation.id;
  } else {
    const quotation = await prisma.commercialQuotation.findFirst({
      where: { inquiryId: inquiry.id, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    quotationId = quotation?.id || null;
  }

  let salesOrderId: string | null = null;
  if (input.salesOrderId) {
    const order = await prisma.epcSalesOrder.findUnique({
      where: { id: input.salesOrderId },
      select: { id: true, inquiryId: true, quotationId: true, customerId: true, customerMasterId: true },
    });
    if (
      !order ||
      (order.inquiryId && order.inquiryId !== inquiry.id) ||
      (actor.userType === 'customer' && !ownedByScope(scope, order.customerId, order.customerMasterId))
    ) {
      throw issue('UNAUTHORIZED', 'Related sales order does not belong to your customer account.');
    }
    salesOrderId = order.id;
  } else {
    const order = await prisma.epcSalesOrder.findFirst({
      where: {
        OR: [{ inquiryId: inquiry.id }, ...(quotationId ? [{ quotationId }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    salesOrderId = order?.id || null;
  }

  let shipmentGroupId: string | null = null;
  if (input.shipmentGroupId) {
    const group = await prisma.containerShipmentGroup.findUnique({
      where: { id: input.shipmentGroupId },
      select: { id: true, inquiryId: true },
    });
    if (!group || group.inquiryId !== inquiry.id) {
      throw issue('UNAUTHORIZED', 'Related shipment does not belong to the selected inquiry.');
    }
    shipmentGroupId = group.id;
  } else {
    const group = await prisma.containerShipmentGroup.findFirst({
      where: { inquiryId: inquiry.id, ...(inquiryLineId ? { OR: [{ inquiryLineId }, { inquiryLineId: null }] } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    shipmentGroupId = group?.id || null;
  }

  if (input.drumMasterId) {
    const drum = await prisma.drumMaster.findUnique({
      where: { id: input.drumMasterId },
      select: { id: true, drumCode: true, drumType: true },
    });
    if (!drum) throw issue('NOT_FOUND', 'Related drum was not found.');
    drumMasterId = drum.id;
    drumType = drum.drumType || drum.drumCode || drumType;
  } else if (drumType) {
    const drum = await prisma.drumMaster.findFirst({
      where: { OR: [{ drumCode: drumType }, { drumType }] },
      select: { id: true },
    });
    drumMasterId = drum?.id || null;
  }

  const customerId = inquiry.customerMasterId || scope.primaryMasterId || scope.masterIds[0];
  if (!customerId) {
    throw issue('CONFIGURATION_REQUIRED', 'The selected inquiry is not linked to a customer master record.');
  }
  if (actor.userType === 'customer' && !scope.masterIds.includes(customerId) && !scope.matchKeys.includes(customerId)) {
    throw issue('UNAUTHORIZED', 'Related inquiry does not belong to your customer account.');
  }

  return {
    inquiry,
    customerId,
    inquiryLineId,
    cableMaterialNumber,
    quotationId,
    salesOrderId,
    shipmentGroupId,
    drumMasterId,
    drumType,
    drumPlanId,
  };
}

export async function listCaseReferenceInquiries(actor: RequestActor) {
  assertCanViewServiceCase(actor);
  const scope = await resolveCustomerScope(actor);
  const prisma = requirePrisma();
  const where: Prisma.CommercialInquiryWhereInput =
    actor.userType === 'customer'
      ? {
          OR: [
            ...(scope.masterIds.length ? [{ customerMasterId: { in: scope.masterIds } }] : []),
            ...(scope.matchKeys.length ? [{ customerId: { in: scope.matchKeys } }] : []),
          ],
        }
      : {};
  if (actor.userType === 'customer' && (!where.OR || (where.OR as unknown[]).length === 0)) {
    return [];
  }
  return prisma.commercialInquiry.findMany({
    where,
    orderBy: { inquiryDate: 'desc' },
    take: 100,
    select: {
      id: true,
      inquiryNumber: true,
      projectName: true,
      status: true,
      inquiryDate: true,
      customerReference: true,
    },
  });
}

export async function listCaseReferenceLines(inquiryId: string, actor: RequestActor) {
  assertCanViewServiceCase(actor);
  const scope = await resolveCustomerScope(actor);
  await loadOwnedInquiry(inquiryId, actor, scope);
  const prisma = requirePrisma();
  return prisma.commercialInquiryLine.findMany({
    where: { inquiryId },
    orderBy: { lineNumber: 'asc' },
    select: {
      id: true,
      lineNumber: true,
      materialNumber: true,
      cableDescription: true,
      drumType: true,
      requestedQuantity: true,
      quantityUom: true,
      requestedLengthMeters: true,
    },
  });
}

export async function resolveCaseReferences(
  input: { inquiryId: string; inquiryLineId?: string | null },
  actor: RequestActor
) {
  assertCanViewServiceCase(actor);
  const scope = await resolveCustomerScope(actor);
  const refs = await resolveRelatedRefs(input, actor, scope);
  const prisma = requirePrisma();
  const [line, quotation, order, shipment, drum, cable] = await Promise.all([
    refs.inquiryLineId
      ? prisma.commercialInquiryLine.findUnique({
          where: { id: refs.inquiryLineId },
          select: { id: true, lineNumber: true, materialNumber: true, cableDescription: true, drumType: true },
        })
      : null,
    refs.quotationId
      ? prisma.commercialQuotation.findUnique({
          where: { id: refs.quotationId },
          select: { id: true, quotationNumber: true, versionNo: true, status: true },
        })
      : null,
    refs.salesOrderId
      ? prisma.epcSalesOrder.findUnique({
          where: { id: refs.salesOrderId },
          select: { id: true, salesOrderNumber: true, status: true },
        })
      : null,
    refs.shipmentGroupId
      ? prisma.containerShipmentGroup.findUnique({
          where: { id: refs.shipmentGroupId },
          select: { id: true, groupCode: true, status: true, destinationPortCode: true },
        })
      : null,
    refs.drumMasterId
      ? prisma.drumMaster.findUnique({
          where: { id: refs.drumMasterId },
          select: { id: true, drumCode: true, drumType: true },
        })
      : null,
    refs.cableMaterialNumber
      ? prisma.cableMaster.findUnique({
          where: { materialNumber: refs.cableMaterialNumber },
          select: { materialNumber: true, description: true, itemCode: true },
        })
      : null,
  ]);
  return {
    inquiry: refs.inquiry,
    line,
    cable,
    quotation,
    salesOrder: order,
    shipment,
    drum,
    drumType: refs.drumType,
    drumPlanId: refs.drumPlanId,
  };
}

const caseInclude = {
  category: { select: { id: true, code: true, name: true } },
  subcategory: { select: { id: true, code: true, name: true } },
  inquiry: { select: { id: true, inquiryNumber: true, projectName: true, status: true } },
  inquiryLine: {
    select: { id: true, lineNumber: true, materialNumber: true, cableDescription: true, drumType: true },
  },
  cable: { select: { materialNumber: true, description: true, itemCode: true } },
  quotation: { select: { id: true, quotationNumber: true, versionNo: true, status: true } },
  salesOrder: { select: { id: true, salesOrderNumber: true, status: true } },
  shipmentGroup: { select: { id: true, groupCode: true, status: true, destinationPortCode: true } },
  drumMaster: { select: { id: true, drumCode: true, drumType: true } },
  comments: { orderBy: { createdAt: 'asc' as const } },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      visibility: true,
      uploadedBy: true,
      createdAt: true,
    },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  resolution: true,
} as const;

function projectCase(row: any, actor: RequestActor) {
  const comments = filterCommentsForActor(row.comments || [], actor.userType).map((c: any) => ({
    id: c.id,
    visibility: c.visibility,
    body: c.body,
    createdByName: c.createdByName,
    createdAt: c.createdAt.toISOString(),
  }));
  const attachments = filterAttachmentsForActor(row.attachments || [], actor.userType).map((a: any) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    byteSize: a.byteSize,
    visibility: a.visibility,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt.toISOString(),
  }));
  const resolution = row.resolution
    ? {
        resolutionSummary: row.resolution.resolutionSummary,
        resolvedAt: row.resolution.resolvedAt.toISOString(),
        customerConfirmed: row.resolution.customerConfirmed,
        customerConfirmedAt: row.resolution.customerConfirmedAt?.toISOString() || null,
        reopenRequested: row.resolution.reopenRequested,
        ...(actor.userType === 'customer'
          ? {}
          : { internalNotes: row.resolution.internalNotes, resolvedBy: row.resolution.resolvedBy }),
      }
    : null;

  return {
    id: row.id,
    caseNumber: row.caseNumber,
    subject: row.subject,
    description: row.description,
    status: row.status,
    caseType: row.caseType || null,
    priority: row.priority,
    issueDate: row.issueDate.toISOString(),
    category: row.category,
    subcategory: row.subcategory,
    inquiry: row.inquiry,
    inquiryLine: row.inquiryLine,
    cable: row.cable || (row.cableMaterialNumber ? { materialNumber: row.cableMaterialNumber } : null),
    quotation: row.quotation,
    salesOrder: row.salesOrder,
    shipment: row.shipmentGroup,
    drum: row.drumMaster,
    drumType: row.drumType,
    drumPlanId: row.drumPlanId,
    affectedQuantity: decimalToNumber(row.affectedQuantity),
    affectedQuantityUom: row.affectedQuantityUom,
    affectedLengthMeters: decimalToNumber(row.affectedLengthMeters),
    requestedResolution: row.requestedResolution,
    assignedDepartment: row.assignedDepartment,
    assignedDepartmentLabel: departmentLabel(row.assignedDepartment),
    assignedRepresentativeName: row.assignedRepresentativeName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    comments,
    attachments,
    statusHistory: (row.statusHistory || []).map((h: any) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedByName: h.changedByName,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    resolution,
  };
}

function projectCaseListItem(row: any) {
  return {
    id: row.id,
    caseNumber: row.caseNumber,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    issueDate: row.issueDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
    categoryName: row.category?.name || '',
    inquiryNumber: row.inquiry?.inquiryNumber || null,
    inquiryId: row.inquiry?.id || null,
  };
}

function customerWhere(scope: CustomerScope): Prisma.CustomerServiceCaseWhereInput {
  if (scope.masterIds.length === 0 && scope.matchKeys.length === 0) {
    return { id: '__none__' };
  }
  return {
    OR: [
      ...(scope.masterIds.length ? [{ customerId: { in: scope.masterIds } }] : []),
      ...(scope.matchKeys.length ? [{ customerId: { in: scope.matchKeys } }] : []),
    ],
  };
}

export async function listCustomerServiceCases(
  actor: RequestActor,
  query: {
    tab?: string;
    status?: string;
    q?: string;
    categoryId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }
) {
  assertCanViewServiceCase(actor);
  const scope = await resolveCustomerScope(actor);
  const prisma = requirePrisma();
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize || 5));
  const status = query.status && isCustomerServiceCaseStatus(query.status) ? query.status : statusForCaseTab(query.tab);
  const where: Prisma.CustomerServiceCaseWhereInput = {
    ...(actor.userType === 'customer' ? customerWhere(scope) : {}),
    ...(status ? { status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          issueDate: {
            ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
            ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { caseNumber: { contains: query.q, mode: 'insensitive' } },
            { subject: { contains: query.q, mode: 'insensitive' } },
            { inquiry: { inquiryNumber: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.customerServiceCase.count({ where }),
    prisma.customerServiceCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { id: true, code: true, name: true } },
        inquiry: { select: { id: true, inquiryNumber: true } },
      },
    }),
  ]);
  return { total, page, pageSize, cases: rows.map(projectCaseListItem) };
}

export async function summarizeCustomerServiceCases(actor: RequestActor) {
  assertCanViewServiceCase(actor);
  const scope = await resolveCustomerScope(actor);
  const prisma = requirePrisma();
  const base = actor.userType === 'customer' ? customerWhere(scope) : {};
  const [open, inProgress, resolved, awaitingCustomer, closed] = await Promise.all([
    prisma.customerServiceCase.count({ where: { ...base, status: 'OPEN' } }),
    prisma.customerServiceCase.count({ where: { ...base, status: 'IN_PROGRESS' } }),
    prisma.customerServiceCase.count({ where: { ...base, status: 'RESOLVED' } }),
    prisma.customerServiceCase.count({ where: { ...base, status: 'AWAITING_CUSTOMER' } }),
    prisma.customerServiceCase.count({ where: { ...base, status: 'CLOSED' } }),
  ]);
  return {
    open,
    inProgress,
    resolved,
    awaitingCustomer,
    closed,
    all: open + inProgress + resolved + awaitingCustomer + closed,
  };
}

async function loadCaseOrThrow(idOrNumber: string) {
  const prisma = requirePrisma();
  const row = await prisma.customerServiceCase.findFirst({
    where: { OR: [{ id: idOrNumber }, { caseNumber: idOrNumber }] },
    include: caseInclude,
  });
  if (!row) throw issue('NOT_FOUND', 'Customer service case was not found.');
  return row;
}

export async function getCustomerServiceCase(idOrNumber: string, actor: RequestActor) {
  assertCanViewServiceCase(actor);
  const row = await loadCaseOrThrow(idOrNumber);
  assertCanAccessServiceCaseOwnership(actor, row.customerId);
  return projectCase(row, actor);
}

export async function createCustomerServiceCase(
  input: {
    subject?: string;
    description?: string;
    categoryId?: string;
    subcategoryId?: string | null;
    priority?: string;
    caseType?: string | null;
    issueDate?: string;
    inquiryId?: string;
    inquiryLineId?: string | null;
    quotationId?: string | null;
    salesOrderId?: string | null;
    shipmentGroupId?: string | null;
    drumMasterId?: string | null;
    affectedQuantity?: number | string | null;
    affectedQuantityUom?: string | null;
    affectedLengthMeters?: number | string | null;
    requestedResolution?: string | null;
    attachment?: { fileName: string; mimeType?: string; contentBase64: string } | null;
    origin?: string | null;
  },
  actor: RequestActor
) {
  assertCanCreateServiceCase(actor);
  await ensureCustomerServiceMasters();
  const scope = await resolveCustomerScope(actor);
  if (!input.subject?.trim()) throw issue('VALIDATION_FAILED', 'Subject is required.');
  if (!input.description?.trim()) throw issue('VALIDATION_FAILED', 'Description is required.');
  if (!input.categoryId) throw issue('VALIDATION_FAILED', 'Category is required.');
  if (!input.inquiryId && input.origin !== 'SUPPORT_CHAT') {
    throw issue('VALIDATION_FAILED', 'A related inquiry is required.');
  }
  const priority = input.priority && isCustomerServiceCasePriority(input.priority) ? input.priority : 'MEDIUM';
  const caseType = input.caseType && isCustomerServiceCaseType(input.caseType) ? input.caseType : null;

  const prisma = requirePrisma();
  const category = await prisma.complaintCategory.findFirst({
    where: { id: input.categoryId, active: true },
  });
  if (!category) throw issue('VALIDATION_FAILED', 'Category is not a controlled master value.');
  if (input.subcategoryId) {
    const sub = await prisma.complaintSubcategory.findFirst({
      where: { id: input.subcategoryId, categoryId: category.id, active: true },
    });
    if (!sub) throw issue('VALIDATION_FAILED', 'Subcategory does not belong to the selected category.');
  }

  const refs = input.inquiryId
    ? await resolveRelatedRefs(
        {
          inquiryId: input.inquiryId,
          inquiryLineId: input.inquiryLineId,
          quotationId: input.quotationId,
          salesOrderId: input.salesOrderId,
          shipmentGroupId: input.shipmentGroupId,
          drumMasterId: input.drumMasterId,
        },
        actor,
        scope
      )
    : {
        inquiry: { id: null as string | null },
        customerId: await requireCustomerMasterId(actor, scope),
        inquiryLineId: null,
        cableMaterialNumber: null,
        quotationId: null,
        salesOrderId: null,
        shipmentGroupId: null,
        drumMasterId: null,
        drumType: null,
        drumPlanId: null,
      };
  await requireCustomerMasterId(actor, scope);

  const allocated = await allocateNextNumber(CUSTOMER_SERVICE_CASE_SEQUENCE.code, actor);
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.customerServiceCase.create({
      data: {
        caseNumber: allocated.value,
        customerId: refs.customerId,
        subject: input.subject!.trim(),
        description: input.description!.trim(),
        status: 'OPEN',
        caseType,
        priority,
        issueDate: input.issueDate ? new Date(input.issueDate) : new Date(),
        categoryId: category.id,
        subcategoryId: input.subcategoryId || null,
        inquiryId: refs.inquiry.id || null,
        inquiryLineId: refs.inquiryLineId,
        cableMaterialNumber: refs.cableMaterialNumber,
        quotationId: refs.quotationId,
        salesOrderId: refs.salesOrderId,
        shipmentGroupId: refs.shipmentGroupId,
        drumMasterId: refs.drumMasterId,
        drumType: refs.drumType,
        drumPlanId: refs.drumPlanId,
        affectedQuantity: input.affectedQuantity != null && input.affectedQuantity !== '' ? input.affectedQuantity : null,
        affectedQuantityUom: input.affectedQuantityUom || null,
        affectedLengthMeters:
          input.affectedLengthMeters != null && input.affectedLengthMeters !== '' ? input.affectedLengthMeters : null,
        requestedResolution: input.requestedResolution || null,
        assignedDepartment: 'CUSTOMER_SERVICE',
        createdBy: actorLabel(actor),
      },
    });
    await tx.caseStatusHistory.create({
      data: {
        caseId: row.id,
        fromStatus: null,
        toStatus: 'OPEN',
        changedBy: actor.id || actor.email,
        changedByName: actorLabel(actor),
        note: 'Case created',
      },
    });
    await tx.caseAssignment.create({
      data: {
        caseId: row.id,
        department: 'CUSTOMER_SERVICE',
        assignedBy: actorLabel(actor),
      },
    });
    if (input.attachment?.contentBase64) {
      const content = decodeAttachmentContent(input.attachment.contentBase64);
      await tx.caseAttachment.create({
        data: {
          caseId: row.id,
          fileName: input.attachment.fileName || 'attachment',
          mimeType: input.attachment.mimeType || 'application/octet-stream',
          byteSize: content.length,
          content,
          visibility: 'CUSTOMER',
          uploadedBy: actorLabel(actor),
        },
      });
    }
    return row.id;
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: created,
    action: 'CASE_CREATED',
    newValue: { caseNumber: allocated.value, inquiryId: refs.inquiry.id, categoryId: category.id },
    message: `Customer service case ${allocated.value} created`,
  });

  return getCustomerServiceCase(created, actor);
}

async function appendStatusHistory(
  tx: Prisma.TransactionClient,
  caseId: string,
  fromStatus: string | null,
  toStatus: string,
  actor: RequestActor,
  note?: string
) {
  await tx.caseStatusHistory.create({
    data: {
      caseId,
      fromStatus: fromStatus as never,
      toStatus: toStatus as never,
      changedBy: actor.id || actor.email,
      changedByName: actorLabel(actor),
      note: note || null,
    },
  });
}

export async function addCaseComment(
  idOrNumber: string,
  input: { body?: string; visibility?: string },
  actor: RequestActor
) {
  assertCanUpdateServiceCase(actor);
  const existing = await loadCaseOrThrow(idOrNumber);
  assertCanAccessServiceCaseOwnership(actor, existing.customerId);
  if (!input.body?.trim()) throw issue('VALIDATION_FAILED', 'Comment text is required.');
  const visibility = resolveCommentVisibilityForActor(actor.userType, input.visibility);
  const prisma = requirePrisma();
  const nextStatus = actor.userType === 'customer' ? nextStatusAfterCustomerComment(existing.status) : null;
  await prisma.$transaction(async (tx) => {
    await tx.caseComment.create({
      data: {
        caseId: existing.id,
        visibility,
        body: input.body!.trim(),
        createdBy: actor.id || actor.email,
        createdByName: actorLabel(actor),
      },
    });
    if (nextStatus && nextStatus !== existing.status) {
      await tx.customerServiceCase.update({ where: { id: existing.id }, data: { status: nextStatus } });
      await appendStatusHistory(tx, existing.id, existing.status, nextStatus, actor, 'Customer reply received');
    }
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: existing.id,
    action: 'CASE_COMMENT',
    newValue: { visibility },
    message: `Comment added on ${existing.caseNumber}`,
  });
  if (nextStatus) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actorLabel(actor),
      entity: 'CustomerServiceCase',
      entityId: existing.id,
      action: 'CASE_STATUS',
      oldValue: { status: existing.status },
      newValue: { status: nextStatus },
      message: `${existing.caseNumber} status ${existing.status} → ${nextStatus}`,
    });
  }
  return getCustomerServiceCase(existing.id, actor);
}

export async function addCaseAttachment(
  idOrNumber: string,
  input: { fileName?: string; mimeType?: string; contentBase64?: string; visibility?: string },
  actor: RequestActor
) {
  assertCanUpdateServiceCase(actor);
  const existing = await loadCaseOrThrow(idOrNumber);
  assertCanAccessServiceCaseOwnership(actor, existing.customerId);
  if (!input.contentBase64) throw issue('VALIDATION_FAILED', 'Attachment content is required.');
  const content = decodeAttachmentContent(input.contentBase64);
  if (content.length > MAX_ATTACHMENT_BYTES) {
    throw issue('VALIDATION_FAILED', 'Attachment exceeds 8 MB.');
  }
  const visibility = resolveCommentVisibilityForActor(actor.userType, input.visibility);
  const prisma = requirePrisma();
  await prisma.caseAttachment.create({
    data: {
      caseId: existing.id,
      fileName: input.fileName || 'attachment',
      mimeType: input.mimeType || 'application/octet-stream',
      byteSize: content.length,
      content,
      visibility,
      uploadedBy: actorLabel(actor),
    },
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: existing.id,
    action: 'CASE_ATTACHMENT',
    newValue: { fileName: input.fileName, visibility },
    message: `Attachment added on ${existing.caseNumber}`,
  });
  return getCustomerServiceCase(existing.id, actor);
}

export async function getCaseAttachmentContent(idOrNumber: string, attachmentId: string, actor: RequestActor) {
  assertCanViewServiceCase(actor);
  const existing = await loadCaseOrThrow(idOrNumber);
  assertCanAccessServiceCaseOwnership(actor, existing.customerId);
  const prisma = requirePrisma();
  const attachment = await prisma.caseAttachment.findFirst({
    where: { id: attachmentId, caseId: existing.id },
  });
  if (!attachment) throw issue('NOT_FOUND', 'Attachment was not found.');
  if (actor.userType === 'customer' && attachment.visibility !== 'CUSTOMER') {
    throw issue('UNAUTHORIZED', 'This attachment is not visible to customer users.');
  }
  return attachment;
}

export async function changeCaseStatus(
  idOrNumber: string,
  input: { status?: string; note?: string },
  actor: RequestActor
) {
  assertCanUpdateServiceCase(actor);
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot set arbitrary case status.');
  }
  const existing = await loadCaseOrThrow(idOrNumber);
  if (!input.status || !isCustomerServiceCaseStatus(input.status)) {
    throw issue('VALIDATION_FAILED', 'A valid status is required.');
  }
  if (input.status === existing.status) return projectCase(existing, actor);
  const prisma = requirePrisma();
  await prisma.$transaction(async (tx) => {
    await tx.customerServiceCase.update({ where: { id: existing.id }, data: { status: input.status as never } });
    await appendStatusHistory(tx, existing.id, existing.status, input.status!, actor, input.note);
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: existing.id,
    action: input.status === 'CLOSED' ? 'CASE_CLOSED' : 'CASE_STATUS',
    oldValue: { status: existing.status },
    newValue: { status: input.status },
    message: `${existing.caseNumber} status ${existing.status} → ${input.status}`,
  });
  return getCustomerServiceCase(existing.id, actor);
}

export async function assignCase(
  idOrNumber: string,
  input: { department?: string; assignedToName?: string; assignedToUserId?: string; note?: string },
  actor: RequestActor
) {
  assertCanAssignServiceCase(actor);
  const existing = await loadCaseOrThrow(idOrNumber);
  if (!input.department || !isCaseAssignmentDepartment(input.department)) {
    throw issue('VALIDATION_FAILED', 'A valid assignment department is required.');
  }
  const prisma = requirePrisma();
  await prisma.$transaction(async (tx) => {
    await tx.caseAssignment.create({
      data: {
        caseId: existing.id,
        department: input.department as never,
        assignedToUserId: input.assignedToUserId || null,
        assignedToName: input.assignedToName || null,
        assignedBy: actorLabel(actor),
        note: input.note || null,
      },
    });
    await tx.customerServiceCase.update({
      where: { id: existing.id },
      data: {
        assignedDepartment: input.department as never,
        assignedRepresentativeName: input.assignedToName || existing.assignedRepresentativeName,
      },
    });
    if (input.department === 'TECHNICAL_OFFICE') {
      await tx.supportChatSession.updateMany({
        where: { caseId: existing.id, channel: 'ENGINEER' },
        data: { engineerStatus: 'ASSIGNED' },
      });
    }
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: existing.id,
    action: 'CASE_ASSIGNED',
    newValue: { department: input.department, assignedToName: input.assignedToName },
    message: `${existing.caseNumber} assigned to ${input.department}`,
  });
  return getCustomerServiceCase(existing.id, actor);
}

export async function resolveCase(
  idOrNumber: string,
  input: { resolutionSummary?: string; internalNotes?: string },
  actor: RequestActor
) {
  assertCanUpdateServiceCase(actor);
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot post internal resolutions.');
  }
  if (!input.resolutionSummary?.trim()) throw issue('VALIDATION_FAILED', 'A customer-facing resolution summary is required.');
  const existing = await loadCaseOrThrow(idOrNumber);
  const prisma = requirePrisma();
  await prisma.$transaction(async (tx) => {
    await tx.caseResolution.upsert({
      where: { caseId: existing.id },
      create: {
        caseId: existing.id,
        resolutionSummary: input.resolutionSummary!.trim(),
        internalNotes: input.internalNotes?.trim() || null,
        resolvedBy: actorLabel(actor),
      },
      update: {
        resolutionSummary: input.resolutionSummary!.trim(),
        internalNotes: input.internalNotes?.trim() || null,
        resolvedBy: actorLabel(actor),
        resolvedAt: new Date(),
        customerConfirmed: false,
        customerConfirmedAt: null,
        reopenRequested: false,
      },
    });
    await tx.customerServiceCase.update({ where: { id: existing.id }, data: { status: 'RESOLVED' } });
    await appendStatusHistory(tx, existing.id, existing.status, 'RESOLVED', actor, 'Resolution recorded');
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: existing.id,
    action: 'CASE_RESOLUTION',
    newValue: { status: 'RESOLVED' },
    message: `${existing.caseNumber} resolved`,
  });
  return getCustomerServiceCase(existing.id, actor);
}

export async function confirmCaseResolution(idOrNumber: string, accepted: boolean, actor: RequestActor) {
  assertCanUpdateServiceCase(actor);
  const existing = await loadCaseOrThrow(idOrNumber);
  assertCanAccessServiceCaseOwnership(actor, existing.customerId);
  if (!customerCanConfirmResolution(existing.status)) {
    throw issue('BUSINESS_RULE_REQUIRED', 'Only a resolved case can be confirmed.');
  }
  if (!existing.resolution) {
    throw issue('BUSINESS_RULE_REQUIRED', 'No customer-facing resolution is available to confirm.');
  }
  const prisma = requirePrisma();
  if (accepted) {
    await prisma.$transaction(async (tx) => {
      await tx.caseResolution.update({
        where: { caseId: existing.id },
        data: {
          customerConfirmed: true,
          customerConfirmedAt: new Date(),
          customerConfirmedBy: actorLabel(actor),
        },
      });
      await tx.customerServiceCase.update({ where: { id: existing.id }, data: { status: 'CLOSED' } });
      await appendStatusHistory(tx, existing.id, existing.status, 'CLOSED', actor, 'Customer confirmed resolution');
    });
    await appendServerAudit({
      actorId: actor.id,
      actorName: actorLabel(actor),
      entity: 'CustomerServiceCase',
      entityId: existing.id,
      action: 'CASE_CONFIRM',
      newValue: { status: 'CLOSED' },
      message: `${existing.caseNumber} resolution confirmed`,
    });
    await appendServerAudit({
      actorId: actor.id,
      actorName: actorLabel(actor),
      entity: 'CustomerServiceCase',
      entityId: existing.id,
      action: 'CASE_CLOSED',
      oldValue: { status: existing.status },
      newValue: { status: 'CLOSED' },
      message: `${existing.caseNumber} closed`,
    });
  } else {
    await requestCaseReopen(existing.id, actor, 'Customer did not accept the resolution');
    return getCustomerServiceCase(existing.id, actor);
  }
  return getCustomerServiceCase(existing.id, actor);
}

export async function requestCaseReopen(idOrNumber: string, actor: RequestActor, note?: string) {
  assertCanUpdateServiceCase(actor);
  const existing = typeof idOrNumber === 'string' && idOrNumber.length < 40 && idOrNumber.startsWith('CS-')
    ? await loadCaseOrThrow(idOrNumber)
    : await loadCaseOrThrow(idOrNumber);
  assertCanAccessServiceCaseOwnership(actor, existing.customerId);
  if (!customerCanRequestReopen(existing.status)) {
    throw issue('BUSINESS_RULE_REQUIRED', 'Only a resolved or closed case can be reopened.');
  }
  const prisma = requirePrisma();
  await prisma.$transaction(async (tx) => {
    if (existing.resolution) {
      await tx.caseResolution.update({
        where: { caseId: existing.id },
        data: {
          reopenRequested: true,
          reopenRequestedAt: new Date(),
          reopenRequestedBy: actorLabel(actor),
          customerConfirmed: false,
        },
      });
    }
    await tx.customerServiceCase.update({ where: { id: existing.id }, data: { status: 'OPEN' } });
    await appendStatusHistory(tx, existing.id, existing.status, 'OPEN', actor, note || 'Customer requested reopen');
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CustomerServiceCase',
    entityId: existing.id,
    action: 'CASE_REOPEN',
    oldValue: { status: existing.status },
    newValue: { status: 'OPEN' },
    message: `${existing.caseNumber} reopen requested`,
  });
  return getCustomerServiceCase(existing.id, actor);
}
