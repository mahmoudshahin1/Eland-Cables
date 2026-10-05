import { Prisma, InquiryStatus, InquiryLineStatus, QuotationStatus } from '@prisma/client';
import { getPrisma } from './db';
import { appendAudit } from '../platform/audit/auditLogService';
import { evaluatePersistedCable, createTechnicalOfficeRequest, listDrums } from './masterDataRepository';
import { isGovernedDrumSelection } from '../domain/drumPlanService';
import {
  canEditInquiryDrumScheduleInPlace,
  inquiryDrumScheduleRowsEquivalent,
  parseInquiryDrumSchedule,
} from '../domain/inquiryDrumSchedule';
import {
  buildConfirmedVersionADrumSchedule,
  evaluateVersionADrumScheduleConfirm,
} from '../domain/versionADrumScheduleConfirm';
import { evaluateCableCostingReadiness } from './governanceRepository';
import { executeCostingForInquiryLine } from './costingOrchestrationService';
import {
  copyCableMasterAttachmentsToLine,
  copyLineAttachmentsToLine,
  linesMissingTechnicalOffer,
} from './attachmentRepository';
import { buildCostingRequestFromInquiryLine } from '../services/costingRequestService';
import {
  collectInquirySubmitHeaderCodes,
  formatInquirySubmitHeaderMessage,
} from '../services/inquiryHeaderFormService';
import { notifyInquirySubmitted as notifyInquirySubmittedLegacy } from './notificationService';
import { notifyStandardWorkflowEvent } from './standardWorkflowNotifications';
import { assertCanAccessInquiryOwnership } from './rbac';
import { RequestActor } from './auth';
import { lookupCustomerMasterId, resolveCustomerMasterIdForActor, assertCustomerBusinessScope } from './customerScope';
import { applyMarketMetalSourceOnUpdate, applySystemMarketMetalDefaultsOnCreate } from '../domain/marketMetalPriceDefaults';
import { snapshotMissingInquiryMetalPrices } from './marketMetalPriceDefaultRepository';
import {
  AddInquiryLineInput,
  CreateInquiryInput,
  CreateQuotationInput,
  UpdateInquiryInput,
  UpdateInquiryLineInput,
} from '../domain/commercialDomain';
import {
  applyInquiryProcessToMetadata,
  commercialMetadataRecord,
  preserveImmutableInquiryProcess,
  resolveInquiryProcess,
  stripClientInquiryProcessOverrides,
} from '../domain/inquiryProcessResolver';
import { appendServerAudit } from './serverAudit';
import { assertStandardSubmitAllowed, getInquiryProcessCode } from '../domain/inquiryProcessCommands';
import { isV2InquiryMetadata } from '../domain/v2InquiryWorkflow';
import {
  inquiryLineCableIdentityChanged,
  nextInquiryLineMaterialNumber,
} from '../domain/inquiryLineCableSelection';
import {
  noteVipFastTrackWorkflowBoundary,
  startStandardInquiryWorkflow,
} from './workflowRuntimeRepository';
import { defaultNewInquiryIncoterm } from '../domain/globalIncotermMaster';

const inquiryLineAttachmentSelect = {
  id: true,
  kind: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  source: true,
  uploadedBy: true,
  createdAt: true,
} as const;

const inquiryLineAttachmentsInclude = {
  attachments: {
    orderBy: { kind: 'asc' as const },
    select: inquiryLineAttachmentSelect,
  },
} as const;

async function fetchInquiryLineWithAttachments(lineId: string) {
  const prisma = requirePrisma();
  return prisma.commercialInquiryLine.findUnique({
    where: { id: lineId },
    include: inquiryLineAttachmentsInclude,
  });
}

function assertInquirySubmitHeader(inquiry: { commercialMetadata?: unknown }) {
  const meta = commercialMetadataRecord(inquiry.commercialMetadata);
  const codes = collectInquirySubmitHeaderCodes({
    copperPriceRate: meta.copperPriceRate,
    aluminiumPriceRate: meta.aluminiumPriceRate,
  });
  if (codes.length === 0) return;
  const err = new Error(formatInquirySubmitHeaderMessage(codes)) as Error & {
    code: string;
    codes: string[];
  };
  err.code = codes.length === 1 ? codes[0] : 'METAL_PRICE_REQUIRED';
  err.codes = codes;
  throw err;
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveRequestedLengthMeters(
  input: {
    requestedQuantity?: unknown;
    requestedLengthMeters?: unknown;
    cuttingLengthMeters?: unknown;
    drumSchedule?: unknown;
  },
  fallbackLengthMeters: unknown
): number {
  const quantity = positiveNumber(input.requestedQuantity);
  const cuttingLength = positiveNumber(input.cuttingLengthMeters);

  let scheduleSum = 0;
  let distinctCuttings = 0;
  if (input.drumSchedule) {
    const parsed = parseInquiryDrumSchedule(input.drumSchedule);
    if (parsed?.rows?.length) {
      const cuttings = new Set<number>();
      scheduleSum = parsed.rows.reduce((acc, row) => {
        const drums = positiveNumber(row.noOfDrums);
        const cutting = positiveNumber(row.cuttingLengthM);
        if (drums == null || cutting == null) return acc;
        cuttings.add(cutting);
        return acc + drums * cutting;
      }, 0);
      distinctCuttings = cuttings.size;
    }
  }

  if (distinctCuttings > 1 && scheduleSum > 0) return scheduleSum;
  if (quantity != null && cuttingLength != null) return quantity * cuttingLength;
  if (scheduleSum > 0) return scheduleSum;
  return positiveNumber(input.requestedLengthMeters) ?? positiveNumber(fallbackLengthMeters) ?? 1000;
}

// ==========================================
// 1. INQUIRY DOMAIN METHODS
// ==========================================

export async function createInquiry(
  input: CreateInquiryInput,
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const inquiryNumber = `INQ-${stamp}-${rand}`;

  let customerId: string;
  let customerMasterId: string | null = null;
  let customerName: string | null;
  if (actor.userType === 'customer') {
    assertCustomerBusinessScope(actor);
    // Never honor client customerId / customerName. Bind to the authenticated CustomerUser master.
    customerMasterId = await resolveCustomerMasterIdForActor(actor);
    customerId = actor.customerCode || actor.customerId || actor.id || actor.email || 'u-cust-default';
    customerName = null;
  } else {
    customerId = input.customerId || actor.id || actor.email || 'u-cust-default';
    customerMasterId = (await lookupCustomerMasterId(customerId)) || (await resolveCustomerMasterIdForActor(actor));
    customerName = input.customerName || null;
  }
  const groupKey = input.customerReference || inquiryNumber;

  const strippedInputMetadata = stripClientInquiryProcessOverrides(
    commercialMetadataRecord(input.commercialMetadata)
  );
  const baseMetadata = applySystemMarketMetalDefaultsOnCreate(strippedInputMetadata, {
    copper: null,
    aluminium: null,
  });
  const resolvedProcess = await resolveInquiryProcess(customerMasterId);
  const commercialMetadata = applyInquiryProcessToMetadata(baseMetadata, resolvedProcess);
  // Explicit STANDARD_WORKFLOW assignments enter the V2 configuration path.
  // SYSTEM_DEFAULT Version A creates stay off that channel and keep the existing submit contract.
  if (
    resolvedProcess.processCode === 'STANDARD_WORKFLOW' &&
    resolvedProcess.source !== 'SYSTEM_DEFAULT'
  ) {
    commercialMetadata.workflowChannel = 'V2_CONFIGURATION';
  }
  const activeIncoterms = await prisma.incoterm.findMany({
    where: { active: true },
    select: { code: true, name: true, active: true },
  });
  let customerPreferenceIncoterm: string | null = null;
  let masterCurrency: string | null = null;
  let masterPaymentTerms: string | null = null;
  let masterDeliveryTerms: string | null = null;
  let masterContact: string | null = null;
  if (customerMasterId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerMasterId },
      include: { paymentTerm: true, contacts: { where: { active: true }, orderBy: { isPrimary: 'desc' } } },
    });
    if (customer) {
      customerPreferenceIncoterm = customer.defaultIncoterm ?? null;
      masterCurrency = customer.defaultCurrency || null;
      masterPaymentTerms = customer.paymentTerm?.name || customer.paymentTerms || null;
      masterDeliveryTerms = customer.deliveryTerms || null;
      if (!customerName) customerName = customer.name.trim() || customer.legalName?.trim() || null;
      const primary = customer.contacts.find((c) => c.isPrimary && c.active) || customer.contacts[0];
      masterContact = primary?.name || null;
    }
  }
  if (!customerName) customerName = actor.userType === 'customer' ? actor.name || 'Customer' : 'Energya Client';
  const incoterms = defaultNewInquiryIncoterm({
    explicitIncoterm: input.incoterms,
    customerPreferenceIncoterm,
    activeMaster: activeIncoterms,
  });

  const inquiry = await prisma.commercialInquiry.create({
    data: {
      inquiryNumber,
      customerId,
      customerMasterId,
      customerName,
      contactPerson: input.contactPerson || masterContact || actor.name || null,
      customerReference: input.customerReference || null,
      inquiryDate: input.inquiryDate ? new Date(input.inquiryDate) : new Date(),
      requestedDeliveryDate: input.requestedDeliveryDate ? new Date(input.requestedDeliveryDate) : null,
      currency: (input.currency || masterCurrency || 'USD').toUpperCase(),
      incoterms,
      paymentTerms: input.paymentTerms || masterPaymentTerms,
      deliveryTerms: input.deliveryTerms || masterDeliveryTerms,
      projectName: input.projectName || null,
      status: 'DRAFT',
      notes: input.notes || null,
      salesAgent: input.salesAgent || null,
      quotationOwner: input.quotationOwner || actor.name || actor.email || null,
      commercialMetadata: commercialMetadata as Prisma.InputJsonValue,
      inquiryGroupKey: groupKey,
      versionNo: 1,
      isCurrent: true,
      createdBy: actor.name || actor.email || 'user',
      modifiedBy: actor.name || actor.email || 'user',
    },
    include: { lines: true, quotations: true },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'CREATE',
    newValue: {
      inquiryNumber: inquiry.inquiryNumber,
      customerId,
      customerName,
      inquiryProcessCode: resolvedProcess.processCode,
      inquiryProcessSource: resolvedProcess.source,
    },
    message: `Created commercial inquiry ${inquiry.inquiryNumber} for ${customerName}`,
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'INQUIRY_PROCESS_ASSIGNED',
    newValue: {
      customerMasterId,
      inquiryProcessCode: resolvedProcess.processCode,
      inquiryProcessSource: resolvedProcess.source,
    },
    message: `Assigned inquiry process ${resolvedProcess.processCode} (${resolvedProcess.source}) on create`,
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'CommercialInquiry',
        entityId: inquiry.inquiryNumber,
        action: 'CREATE',
        newValue: { inquiryNumber: inquiry.inquiryNumber, customerId, customerName },
        message: `Created commercial inquiry ${inquiry.inquiryNumber} for ${customerName}`,
      },
    });
  }

  return inquiry;
}

export async function listInquiries(filter?: {
  customerId?: string;
  customerIds?: string[];
  customerMasterIds?: string[];
  status?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  isCurrent?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'inquiryDate' | 'updatedAt' | 'customerName' | 'status';
  sortDir?: 'asc' | 'desc';
}) {
  const prisma = requirePrisma();
  const andList: Prisma.CommercialInquiryWhereInput[] = [];

  if (filter?.customerIds?.length || filter?.customerMasterIds?.length) {
    const or: Prisma.CommercialInquiryWhereInput[] = [];
    if (filter.customerIds?.length) or.push({ customerId: { in: filter.customerIds } });
    if (filter.customerMasterIds?.length) or.push({ customerMasterId: { in: filter.customerMasterIds } });
    andList.push({ OR: or });
  } else if (filter?.customerId) {
    andList.push({ customerId: filter.customerId });
  }
  if (filter?.status && filter.status !== 'ALL') andList.push({ status: filter.status as InquiryStatus });
  if (filter?.isCurrent !== undefined) andList.push({ isCurrent: filter.isCurrent });
  if (filter?.dateFrom) {
    const from = new Date(filter.dateFrom);
    if (!Number.isNaN(from.getTime())) andList.push({ inquiryDate: { gte: from } });
  }
  if (filter?.dateTo) {
    const to = new Date(filter.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      andList.push({ inquiryDate: { lte: to } });
    }
  }
  if (filter?.q) {
    andList.push({
      OR: [
        { inquiryNumber: { contains: filter.q, mode: 'insensitive' } },
        { customerName: { contains: filter.q, mode: 'insensitive' } },
        { customerReference: { contains: filter.q, mode: 'insensitive' } },
        { projectName: { contains: filter.q, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.CommercialInquiryWhereInput = andList.length ? { AND: andList } : {};
  const page = Math.max(1, filter?.page || 1);
  const pageSize = Math.min(100, Math.max(1, filter?.pageSize || 25));
  const sortBy = filter?.sortBy || 'updatedAt';
  const sortDir = filter?.sortDir || 'desc';

  const [total, rows] = await prisma.$transaction([
    prisma.commercialInquiry.count({ where }),
    prisma.commercialInquiry.findMany({
      where,
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        quotations: { where: { isCurrent: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, page, pageSize, inquiries: rows };
}

export async function getInquiryById(id: string) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id }, { inquiryNumber: id }] },
    include: {
      lines: {
        orderBy: { lineNumber: 'asc' },
        include: inquiryLineAttachmentsInclude,
      },
      quotations: { orderBy: [{ quotationNumber: 'asc' }, { versionNo: 'desc' }] },
      attachments: { orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, mimeType: true, byteSize: true, uploadedBy: true, createdAt: true } },
    },
  });
  if (!inquiry) return inquiry;
  const { attachInquiryCommercialPricing } = await import('./commercialLinePricingAttach');
  return attachInquiryCommercialPricing(inquiry);
}

export async function addInquiryLine(
  inquiryId: string,
  input: AddInquiryLineInput,
  actor: { id?: string; name?: string; email?: string; userType?: string; customerId?: string }
) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: true },
  });

  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);

  if (inquiry.status !== 'DRAFT' && inquiry.status !== 'UNDER_REVIEW') {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} must be in DRAFT to add lines.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const nextLineNumber = inquiry.lines.length > 0 ? Math.max(...inquiry.lines.map((l) => l.lineNumber)) + 1 : 1;
  const requestedQuantity = positiveNumber(input.requestedQuantity) ?? 1;
  const cuttingLengthMeters = positiveNumber(input.cuttingLengthMeters);
  const requestedLengthMeters = resolveRequestedLengthMeters(
    {
      requestedQuantity,
      requestedLengthMeters: input.requestedLengthMeters,
      cuttingLengthMeters,
      drumSchedule: input.drumSchedule,
    },
    1000
  );

  // Path A vs Path B Cable Authority Evaluation
  let cableAuthorityStatus = 'CONFIGURATION_REQUIRED';
  let authoritativeMaterialNumber = input.materialNumber || null;
  let cableDescription = input.cableDescription || 'Custom Cable';
  let technicalOfficeRequestId: string | null = null;
  let costingReadinessStatus = 'NOT_READY';
  let materialCost: number | null = null;
  let costingRunId: string | null = null;
  let lineStatus: InquiryLineStatus = 'DRAFT';

  // PATH A — Existing Cable Master Selection
  if (input.materialNumber) {
    const decision = await evaluatePersistedCable({ materialNumber: input.materialNumber });
    cableAuthorityStatus = decision.code;

    if (decision.code === 'EXISTING_CABLE' && decision.cable) {
      authoritativeMaterialNumber = decision.cable.materialNumber;
      cableDescription = decision.cable.description || cableDescription;
      lineStatus = 'CABLE_VALIDATED';

      // Check Costing Feasibility for Path A
      const readiness = await evaluateCableCostingReadiness(authoritativeMaterialNumber);
      if (readiness.length > 0) {
        costingReadinessStatus = readiness[0].overallStatus;
        if (readiness[0].overallStatus === 'READY_FOR_COSTING') {
          lineStatus = 'COSTING_READY';
        }
      }
    }
  } else if (input.configurationPayload) {
    // PATH B — Unmapped Configurator Payload
    const decision = await evaluatePersistedCable(input.configurationPayload);
    cableAuthorityStatus = decision.code;

    if (decision.code === 'INVALID_CONFIGURATION') {
      const err = new Error(`Cable configuration invalid: ${decision.message}`);
      (err as Error & { code: string; decision: any }).code = 'INVALID_CONFIGURATION';
      (err as Error & { code: string; decision: any }).decision = decision;
      throw err;
    }

    if (decision.code === 'TECHNICALLY_VALID_NOT_MASTER') {
      lineStatus = 'TECHNICAL_OFFICE_REQUIRED';
      // Create and link Technical Office Request without fabricating Cable Master codes
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8);
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      const reqNum = `TCR-INQ-${stamp}-${rand}`;

      const toReq = await createTechnicalOfficeRequest({
        requestNumber: reqNum,
        canonicalStatus: 'SUBMITTED',
        displayStatus: 'Submitted',
        configuration: input.configurationPayload,
        customer: inquiry.customerName,
        quantity: String(requestedQuantity),
        cuttingLength: cuttingLengthMeters ? String(cuttingLengthMeters) : undefined,
        requestedDate: inquiry.requestedDeliveryDate?.toISOString(),
        requesterId: actor.id,
        requesterName: actor.name,
        requesterEmail: actor.email,
        reason: `Generated from Inquiry Line #${nextLineNumber} for Inquiry ${inquiry.inquiryNumber}`,
      });
      technicalOfficeRequestId = toReq.requestNumber;
    }
  }

  const line = await prisma.commercialInquiryLine.create({
    data: {
      inquiryId: inquiry.id,
      lineNumber: nextLineNumber,
      materialNumber: authoritativeMaterialNumber,
      customerCode: input.customerCode || null,
      itemCode: input.itemCode || null,
      cableDescription,
      requestedQuantity,
      quantityUom: input.quantityUom || 'KM',
      requestedLengthMeters,
      cuttingLengthMeters,
      drumType: input.drumType?.trim() || null,
      cableTolerancePercent:
        input.cableTolerancePercent != null ? input.cableTolerancePercent : null,
      drumSchedule: input.drumSchedule
        ? (input.drumSchedule as unknown as Prisma.InputJsonValue)
        : null,
      configurationPayload: (input.configurationPayload as unknown as Prisma.InputJsonValue) || null,
      cableAuthorityStatus,
      technicalOfficeRequestId,
      costingReadinessStatus,
      costingRunId,
      materialCost,
      materialCostCurrency: inquiry.currency || 'USD',
      status: lineStatus,
      notes: input.notes || null,
    },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: line.id,
    action: 'CREATE',
    newValue: { inquiryNumber: inquiry.inquiryNumber, lineNumber: nextLineNumber, cableAuthorityStatus },
    message: `Added Line #${nextLineNumber} to Inquiry ${inquiry.inquiryNumber} (${cableAuthorityStatus})`,
  });

  if (authoritativeMaterialNumber) {
    await copyCableMasterAttachmentsToLine(line.id, authoritativeMaterialNumber, actor);
  }

  if (authoritativeMaterialNumber && costingReadinessStatus === 'READY_FOR_COSTING') {
    try {
      const calculated = await calculateInquiryLineCost(inquiry.id, line.id, actor, { allowSubmitted: false });
      const withAttachments = await fetchInquiryLineWithAttachments(calculated.line.id);
      return withAttachments || calculated.line;
    } catch (err) {
      const blocking = (err as Error & { blockingReasons?: string[] }).blockingReasons;
      await prisma.commercialInquiryLine.update({
        where: { id: line.id },
        data: {
          costingReadinessStatus: 'NOT_READY',
          status: blocking?.length ? 'COSTING_NOT_READY' : line.status,
        },
      });
    }
  }

  const withAttachments = await fetchInquiryLineWithAttachments(line.id);
  return withAttachments || line;
}

export async function submitInquiry(
  inquiryId: string,
  actor: { id?: string; name?: string; email?: string; userType?: string; customerId?: string }
) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: true },
  });

  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  assertStandardSubmitAllowed(inquiry);

  // V2 configuration inquiries cannot fall through to the Version A submit contract.
  // Version A inquiries (workflowChannel is not V2_CONFIGURATION) keep that contract.
  if (isV2InquiryMetadata(inquiry.commercialMetadata)) {
    const { submitV2Inquiry } = await import('./v2InquiryConfigurationRepository');
    await submitV2Inquiry(inquiry.id, actor as RequestActor);
    return getInquiryById(inquiry.id);
  }

  if (inquiry.lines.length === 0) {
    const err = new Error('Cannot submit an inquiry with zero line items.');
    (err as Error & { code: string }).code = 'EMPTY_INQUIRY';
    throw err;
  }

  if (inquiry.status !== 'DRAFT' && inquiry.status !== 'UNDER_REVIEW') {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} cannot be submitted from status ${inquiry.status}.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  inquiry.commercialMetadata = (await snapshotMissingInquiryMetalPrices(inquiry.id)) as typeof inquiry.commercialMetadata;
  assertInquirySubmitHeader(inquiry);

  const stillMissing = inquiry.lines.filter((line) => line.materialNumber && !line.costingCalculationId);
  if (stillMissing.length > 0) {
    const lineNos = stillMissing.map((l) => l.lineNumber).join(', ');
    const err = new Error(
      `Calculation required before submit. Run Calculate Cost for line(s): ${lineNos}.`
    );
    (err as Error & { code: string; lineNumbers?: number[] }).code = 'CALCULATION_REQUIRED';
    (err as Error & { lineNumbers?: number[] }).lineNumbers = stillMissing.map((l) => l.lineNumber);
    throw err;
  }

  const missingTechnicalOffer = await linesMissingTechnicalOffer(inquiry.id);
  if (missingTechnicalOffer.length > 0) {
    const lineNos = missingTechnicalOffer.join(', ');
    const err = new Error(
      `Technical Offer attachment required before submit for line(s): ${lineNos}.`
    );
    (err as Error & { code: string; lineNumbers?: number[] }).code = 'TECHNICAL_OFFER_REQUIRED';
    (err as Error & { lineNumbers?: number[] }).lineNumbers = missingTechnicalOffer;
    throw err;
  }

  const refreshed = await prisma.commercialInquiry.findFirst({
    where: { id: inquiry.id },
    include: { lines: true },
  });

  const updated = await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { status: 'SUBMITTED', modifiedBy: actor.name || actor.email || inquiry.modifiedBy },
    include: { lines: true, quotations: true },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'SUBMIT',
    oldValue: { status: inquiry.status },
    newValue: { status: 'SUBMITTED', lineCount: refreshed?.lines.length || inquiry.lines.length },
    message: `Submitted commercial inquiry ${inquiry.inquiryNumber} with ${inquiry.lines.length} lines`,
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'CommercialInquiry',
        entityId: inquiry.inquiryNumber,
        action: 'SUBMIT',
        oldValue: { status: inquiry.status },
        newValue: { status: 'SUBMITTED' },
        message: `Submitted commercial inquiry ${inquiry.inquiryNumber}`,
      },
    });
  }

  await notifyInquirySubmittedLegacy({
    inquiryNumber: inquiry.inquiryNumber,
    customerName: inquiry.customerName,
    lineCount: inquiry.lines.length,
    submittedBy: actor.name || actor.email || 'user',
  });
  await notifyStandardWorkflowEvent({
    eventCode: 'INQUIRY_SUBMITTED',
    title: `Inquiry submitted: ${inquiry.inquiryNumber}`,
    message: `${inquiry.customerName} submitted ${inquiry.lines.length} line(s).`,
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    customerMasterId: inquiry.customerMasterId,
    notifyRole: 'SALES_MANAGER',
  });

  await startStandardInquiryWorkflow(
    {
      id: updated.id,
      inquiryNumber: updated.inquiryNumber,
      customerMasterId: updated.customerMasterId,
      commercialMetadata: updated.commercialMetadata,
    },
    actor as RequestActor
  );

  try {
    const { runStandardWorkflowAfterSubmit } = await import('./standardWorkflowOrchestrator');
    await runStandardWorkflowAfterSubmit(updated.id, actor as RequestActor);
  } catch (err) {
    console.warn('[standard-workflow] post-submit orchestrator stopped at gate', err);
  }

  return updated;
}

async function loadMutableInquiry(inquiryId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  if (inquiry.status === 'CANCELLED' || inquiry.status === 'CLOSED') {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} is ${inquiry.status} and cannot be modified.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  if (!inquiry.isCurrent) {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} is not the current version.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  if (inquiry.status !== 'DRAFT' && inquiry.status !== 'UNDER_REVIEW') {
    const err = new Error(`Inquiry ${inquiry.inquiryNumber} must be in DRAFT to edit header/lines.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  return inquiry;
}

export async function updateInquiry(
  inquiryId: string,
  input: UpdateInquiryInput,
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const inquiry = await loadMutableInquiry(inquiryId, actor);

  const nextCommercialMetadata =
    input.commercialMetadata !== undefined
      ? preserveImmutableInquiryProcess(
          commercialMetadataRecord(inquiry.commercialMetadata),
          applyMarketMetalSourceOnUpdate(
            commercialMetadataRecord(inquiry.commercialMetadata),
            stripClientInquiryProcessOverrides(commercialMetadataRecord(input.commercialMetadata))
          )
        )
      : undefined;

  const updated = await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: {
      ...(input.customerName !== undefined && actor.userType !== 'customer'
        ? { customerName: input.customerName }
        : {}),
      contactPerson: input.contactPerson ?? inquiry.contactPerson,
      customerReference: input.customerReference ?? inquiry.customerReference,
      inquiryDate: input.inquiryDate ? new Date(input.inquiryDate) : inquiry.inquiryDate,
      requestedDeliveryDate: input.requestedDeliveryDate
        ? new Date(input.requestedDeliveryDate)
        : inquiry.requestedDeliveryDate,
      currency: input.currency ? input.currency.toUpperCase() : inquiry.currency,
      incoterms: input.incoterms ?? inquiry.incoterms,
      paymentTerms: input.paymentTerms ?? inquiry.paymentTerms,
      deliveryTerms: input.deliveryTerms ?? inquiry.deliveryTerms,
      projectName: input.projectName ?? inquiry.projectName,
      notes: input.notes ?? inquiry.notes,
      salesAgent: input.salesAgent ?? inquiry.salesAgent,
      quotationOwner: input.quotationOwner ?? inquiry.quotationOwner,
      commercialMetadata:
        nextCommercialMetadata !== undefined
          ? (nextCommercialMetadata as Prisma.InputJsonValue)
          : inquiry.commercialMetadata === null
            ? Prisma.JsonNull
            : inquiry.commercialMetadata,
      modifiedBy: actor.name || actor.email || inquiry.modifiedBy,
    },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, quotations: { where: { isCurrent: true } } },
  });

  if (input.incoterms !== undefined) {
    const nextCode = String(input.incoterms || '').trim() || null;
    await prisma.containerShipmentGroup.updateMany({
      where: { inquiryId: inquiry.id, status: 'ACTIVE' },
      data: { incotermCode: nextCode },
    });
  }

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'UPDATE',
    newValue: { inquiryNumber: inquiry.inquiryNumber, status: updated.status },
    message: `Updated commercial inquiry ${inquiry.inquiryNumber}`,
  });

  return updated;
}

export async function cancelInquiry(inquiryId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  if (inquiry.status === 'CANCELLED') {
    return prisma.commercialInquiry.findFirst({
      where: { id: inquiry.id },
      include: { lines: { orderBy: { lineNumber: 'asc' } }, quotations: { where: { isCurrent: true } } },
    });
  }

  const updated = await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { status: 'CANCELLED', modifiedBy: actor.name || actor.email || inquiry.modifiedBy },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, quotations: { where: { isCurrent: true } } },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'CANCEL',
    oldValue: { status: inquiry.status },
    newValue: { status: 'CANCELLED' },
    message: `Cancelled commercial inquiry ${inquiry.inquiryNumber}`,
  });

  return updated;
}

export async function createInquiryRevision(inquiryId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const current = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!current) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, current.customerId, current.customerMasterId);
  if (current.status !== 'SUBMITTED') {
    const err = new Error('Only submitted inquiries can be revised.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  if (!current.isCurrent) {
    const err = new Error('Only the current inquiry version can be revised.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const inquiryNumber = `INQ-${stamp}-${rand}`;
  const nextVersion = (current.versionNo || 1) + 1;

  const created = await prisma.$transaction(async (tx) => {
    await tx.commercialInquiry.update({
      where: { id: current.id },
      data: { isCurrent: false },
    });

    const next = await tx.commercialInquiry.create({
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
        commercialMetadata: current.commercialMetadata ?? Prisma.JsonNull,
        inquiryGroupKey: current.inquiryGroupKey || current.customerReference || current.inquiryNumber,
        versionNo: nextVersion,
        isCurrent: true,
        supersedesInquiryId: current.id,
        createdBy: actor.name || actor.email || current.createdBy,
        modifiedBy: actor.name || actor.email || current.modifiedBy,
        lines: {
          create: current.lines.map((line) => ({
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
            configurationPayload:
              line.configurationPayload === null ? Prisma.JsonNull : line.configurationPayload,
            cableAuthorityStatus: line.cableAuthorityStatus,
            technicalOfficeRequestId: line.technicalOfficeRequestId,
            costingReadinessStatus: line.costingReadinessStatus,
            costingRunId: line.costingRunId,
            materialCost: line.materialCost,
            materialCostCurrency: line.materialCostCurrency,
            status: 'DRAFT',
            notes: line.notes,
          })),
        },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } }, quotations: true },
    });
    return next;
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: created.inquiryNumber,
    action: 'SUPERSEDE',
    oldValue: { inquiryNumber: current.inquiryNumber, versionNo: current.versionNo },
    newValue: { inquiryNumber: created.inquiryNumber, versionNo: created.versionNo },
    message: `Created inquiry revision V${created.versionNo} from ${current.inquiryNumber} V${current.versionNo}`,
  });

  return created;
}

export async function listInquiryVersions(inquiryId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  const groupKey = inquiry.inquiryGroupKey || inquiry.customerReference || inquiry.inquiryNumber;
  return prisma.commercialInquiry.findMany({
    where: { inquiryGroupKey: groupKey },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
    orderBy: [{ versionNo: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function updateInquiryLine(
  inquiryId: string,
  lineId: string,
  input: UpdateInquiryLineInput,
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const inquiry = await loadMutableInquiry(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Inquiry line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const existingSchedule = parseInquiryDrumSchedule(line.drumSchedule);
  if (
    !canEditInquiryDrumScheduleInPlace(existingSchedule) &&
    input.drumSchedule !== undefined
  ) {
    const nextSchedule = parseInquiryDrumSchedule(input.drumSchedule);
    if (
      !inquiryDrumScheduleRowsEquivalent(existingSchedule?.rows, nextSchedule?.rows) ||
      nextSchedule?.lifecycleStatus !== 'CONFIRMED'
    ) {
      const err = new Error(
        'Confirmed drum plan cannot be edited in place. Create a new version to supersede it.'
      );
      (err as Error & { code: string }).code = 'INVALID_STATE';
      throw err;
    }
  }

  const costingFieldsChanged =
    input.materialNumber !== undefined ||
    input.requestedQuantity !== undefined ||
    input.requestedLengthMeters !== undefined ||
    input.cuttingLengthMeters !== undefined ||
    input.drumType !== undefined ||
    input.cableTolerancePercent !== undefined ||
    input.drumSchedule !== undefined;
  const nextMaterialNumber = nextInquiryLineMaterialNumber(input.materialNumber, line.materialNumber);
  const cableIdentityChanged = inquiryLineCableIdentityChanged(line.materialNumber, nextMaterialNumber);
  const requestedQuantity = input.requestedQuantity ?? line.requestedQuantity;
  const cuttingLengthMeters = input.cuttingLengthMeters ?? line.cuttingLengthMeters;
  const requestedLengthMeters = resolveRequestedLengthMeters(
    {
      requestedQuantity,
      requestedLengthMeters: input.requestedLengthMeters ?? line.requestedLengthMeters,
      cuttingLengthMeters,
      drumSchedule: input.drumSchedule !== undefined ? input.drumSchedule : line.drumSchedule,
    },
    line.requestedLengthMeters
  );

  const updated = await prisma.commercialInquiryLine.update({
    where: { id: line.id },
    data: {
      materialNumber: nextMaterialNumber,
      customerCode: cableIdentityChanged && input.customerCode === undefined ? null : input.customerCode ?? line.customerCode,
      itemCode: cableIdentityChanged && input.itemCode === undefined ? null : input.itemCode ?? line.itemCode,
      cableDescription: input.cableDescription ?? line.cableDescription,
      requestedQuantity,
      quantityUom: input.quantityUom ?? line.quantityUom,
      requestedLengthMeters,
      cuttingLengthMeters,
      drumType: cableIdentityChanged && input.drumType === undefined ? null : input.drumType ?? line.drumType,
      cableTolerancePercent:
        input.cableTolerancePercent !== undefined
          ? input.cableTolerancePercent
          : line.cableTolerancePercent,
      drumSchedule:
        input.drumSchedule !== undefined
          ? input.drumSchedule
            ? (input.drumSchedule as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull
          : cableIdentityChanged
            ? Prisma.JsonNull
            : line.drumSchedule === null
              ? Prisma.JsonNull
              : line.drumSchedule,
      configurationPayload:
        input.configurationPayload !== undefined
          ? (input.configurationPayload as Prisma.InputJsonValue)
          : cableIdentityChanged
            ? Prisma.JsonNull
            : line.configurationPayload === null
              ? Prisma.JsonNull
              : line.configurationPayload,
      notes: input.notes ?? line.notes,
      lineNumber: input.lineNumber ?? line.lineNumber,
      ...(cableIdentityChanged
        ? {
            cableAuthorityStatus: 'CONFIGURATION_REQUIRED',
            v2CurrentSnapshotId: null,
            v2CurrentCuttingPlanId: null,
            v2CurrentDrumPlanId: null,
          }
        : {}),
      ...(costingFieldsChanged && inquiry.status === 'DRAFT'
        ? {
            costingReadinessStatus: 'STALE',
            materialCost: null,
            costingCalculationId: null,
            costingRunId: null,
          }
        : {}),
    },
  });

  await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { modifiedBy: actor.name || actor.email || inquiry.modifiedBy },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: updated.id,
    action: 'UPDATE',
    message: `Updated line #${updated.lineNumber} on inquiry ${inquiry.inquiryNumber}`,
  });

  return updated;
}

export async function confirmInquiryDrumSchedule(
  inquiryId: string,
  lineId: string,
  input: {
    rows?: Array<{
      drumCode: string;
      noOfDrums?: number;
      numberOfDrums?: number;
      cuttingLengthM: number;
      drumTolerancePercent?: number;
    }>;
    cableTolerancePercent?: number;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const inquiry = await loadMutableInquiry(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Inquiry line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const stored = parseInquiryDrumSchedule(line.drumSchedule);
  const incomingRows = Array.isArray(input.rows)
    ? input.rows.map((row) => ({
        drumCode: String(row.drumCode || '').trim(),
        noOfDrums: Math.floor(Number(row.numberOfDrums ?? row.noOfDrums)),
        cuttingLengthM: Number(row.cuttingLengthM),
        drumTolerancePercent: Number(row.drumTolerancePercent ?? 0) || 0,
      }))
    : stored?.rows || [];
  const cableTolerancePercent =
    input.cableTolerancePercent != null && Number.isFinite(Number(input.cableTolerancePercent))
      ? Number(input.cableTolerancePercent)
      : stored?.cableTolerancePercent ?? Number(line.cableTolerancePercent ?? 1);

  const draftSchedule = {
    cableTolerancePercent,
    rows: incomingRows,
    lifecycleStatus: stored?.lifecycleStatus === 'CONFIRMED' ? ('CONFIRMED' as const) : ('DRAFT' as const),
    versionNo: stored?.versionNo,
    confirmedAt: stored?.confirmedAt,
  };

  if (draftSchedule.lifecycleStatus === 'CONFIRMED') {
    if (inquiryDrumScheduleRowsEquivalent(stored?.rows, incomingRows)) {
      return { line, schedule: stored, inquiry };
    }
    const err = new Error('Confirmed drum plan cannot be edited in place. Create a new version to supersede it.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }

  const masters = await prisma.drumMaster.findMany({
    where: { drumCode: { in: incomingRows.map((row) => row.drumCode).filter(Boolean) } },
    select: { drumCode: true },
  });
  const evaluation = evaluateVersionADrumScheduleConfirm({
    inquiryId: inquiry.id,
    lineId: line.id,
    customerScopeValid: true,
    schedule: { ...draftSchedule, lifecycleStatus: 'DRAFT' },
    drumMasterCodes: masters.map((row) => row.drumCode),
  });
  if (!evaluation.canConfirm) {
    const err = new Error(evaluation.issues[0]?.message || 'Drum schedule is not ready to confirm.');
    (err as Error & { code: string; details: unknown }).code = 'VALIDATION_FAILED';
    (err as Error & { code: string; details: unknown }).details = evaluation.issues;
    throw err;
  }

  const confirmed = buildConfirmedVersionADrumSchedule({
    rows: incomingRows,
    cableTolerancePercent,
    versionNo: (stored?.versionNo || 0) + 1,
    confirmedAt: new Date().toISOString(),
  });

  const updated = await prisma.commercialInquiryLine.update({
    where: { id: line.id },
    data: {
      drumSchedule: confirmed as unknown as Prisma.InputJsonValue,
      cableTolerancePercent,
    },
  });
  await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { modifiedBy: actor.name || actor.email || inquiry.modifiedBy },
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: updated.id,
    action: 'CONFIRM_DRUM_SCHEDULE',
    newValue: {
      inquiryNumber: inquiry.inquiryNumber,
      lineNumber: updated.lineNumber,
      lifecycleStatus: 'CONFIRMED',
      versionNo: confirmed.versionNo,
      physicalDrumCount: evaluation.physicalDrums.length,
    },
    message: `Confirmed Version A drum schedule on ${inquiry.inquiryNumber} line ${updated.lineNumber}`,
  });

  return { line: updated, schedule: confirmed, inquiry };
}

function inquiryLineDeleteBlocked(lineNumber: number, detail: string): Error & { code: string } {
  const err = new Error(detail) as Error & { code: string };
  err.code = 'INVALID_STATE';
  return err;
}

export async function deleteInquiryLine(inquiryId: string, lineId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await loadMutableInquiry(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Inquiry line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const issuedQuoteLine = await prisma.commercialQuotationLine.findFirst({
    where: {
      inquiryLineId: line.id,
      quotation: { status: { in: ['SUBMITTED', 'ACCEPTED', 'REJECTED'] } },
    },
    include: { quotation: { select: { quotationNumber: true, status: true } } },
  });
  if (issuedQuoteLine) {
    throw inquiryLineDeleteBlocked(
      line.lineNumber,
      `Line #${line.lineNumber} cannot be deleted because it is on quotation ${issuedQuoteLine.quotation.quotationNumber} (${issuedQuoteLine.quotation.status}).`
    );
  }

  const offerPins = await prisma.financialOfferProductLine.findMany({
    where: { inquiryLineId: line.id },
    select: { snapshotId: true, snapshot: { select: { isCurrent: true, versionNo: true } } },
  });
  const historicalOffer = offerPins.find((pin) => !pin.snapshot.isCurrent);
  if (historicalOffer) {
    throw inquiryLineDeleteBlocked(
      line.lineNumber,
      `Line #${line.lineNumber} cannot be deleted because it is recorded on financial offer snapshot v${historicalOffer.snapshot.versionNo}. Create a new inquiry version instead.`
    );
  }

  const remaining = inquiry.lines.filter((l) => l.id !== line.id).sort((a, b) => a.lineNumber - b.lineNumber);
  const currentOfferSnapshotIds = [...new Set(offerPins.map((pin) => pin.snapshotId))];

  try {
    await prisma.$transaction(async (tx) => {
      // Clear the Restrict FK first. Current draft offer snapshots are then removed so totals are not left stale.
      await tx.financialOfferProductLine.deleteMany({ where: { inquiryLineId: line.id } });
      if (currentOfferSnapshotIds.length > 0) {
        const shipmentLines = await tx.financialOfferShipmentLine.findMany({
          where: { snapshotId: { in: currentOfferSnapshotIds } },
          select: { id: true },
        });
        if (shipmentLines.length > 0) {
          await tx.financialOfferShipmentTypeLine.deleteMany({
            where: { offerShipmentLineId: { in: shipmentLines.map((row) => row.id) } },
          });
        }
        await tx.financialOfferShipmentLine.deleteMany({
          where: { snapshotId: { in: currentOfferSnapshotIds } },
        });
        await tx.financialOfferProductLine.deleteMany({
          where: { snapshotId: { in: currentOfferSnapshotIds } },
        });
        await tx.financialOfferSnapshot.deleteMany({
          where: { id: { in: currentOfferSnapshotIds } },
        });
      }

      await tx.containerShipmentGroupLine.deleteMany({ where: { inquiryLineId: line.id } });
      await tx.containerShipmentGroup.updateMany({
        where: { inquiryLineId: line.id },
        data: { inquiryLineId: null },
      });
      await tx.commercialQuotationLine.updateMany({
        where: { inquiryLineId: line.id },
        data: { inquiryLineId: null },
      });

      await tx.commercialInquiryLine.delete({ where: { id: line.id } });
      for (const [index, entry] of remaining.entries()) {
        await tx.commercialInquiryLine.update({
          where: { id: entry.id },
          data: { lineNumber: index + 1 },
        });
      }
    });
  } catch (err) {
    const prismaCode =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
    if (prismaCode === 'P2003') {
      throw inquiryLineDeleteBlocked(
        line.lineNumber,
        `Line #${line.lineNumber} cannot be deleted because it is still referenced by a commercial snapshot.`
      );
    }
    throw err;
  }

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: line.id,
    action: 'UPDATE',
    message: `Deleted line #${line.lineNumber} from inquiry ${inquiry.inquiryNumber}`,
  });

  return { deleted: true, lineId: line.id };
}

export async function duplicateInquiryLine(inquiryId: string, lineId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await loadMutableInquiry(inquiryId, actor);
  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Inquiry line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const nextLineNumber = inquiry.lines.length > 0 ? Math.max(...inquiry.lines.map((l) => l.lineNumber)) + 1 : 1;
  const copy = await prisma.commercialInquiryLine.create({
    data: {
      inquiryId: inquiry.id,
      lineNumber: nextLineNumber,
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
      materialCost: line.materialCost,
      materialCostCurrency: line.materialCostCurrency,
      status: line.status,
      notes: line.notes,
    },
  });

  await copyLineAttachmentsToLine(line.id, copy.id, actor);

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiryLine',
    entityId: copy.id,
    action: 'CREATE',
    message: `Duplicated line #${line.lineNumber} as #${copy.lineNumber} on inquiry ${inquiry.inquiryNumber}`,
  });

  const withAttachments = await fetchInquiryLineWithAttachments(copy.id);
  return withAttachments || copy;
}

export async function reorderInquiryLines(
  inquiryId: string,
  lineIdsInOrder: string[],
  actor: RequestActor
) {
  const inquiry = await loadMutableInquiry(inquiryId, actor);
  const existingIds = inquiry.lines.map((l) => l.id).sort().join(',');
  const requestedIds = [...lineIdsInOrder].sort().join(',');
  if (existingIds !== requestedIds) {
    const err = new Error('Line order payload must include all inquiry lines exactly once.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  const prisma = requirePrisma();
  await prisma.$transaction(
    lineIdsInOrder.map((id, index) =>
      prisma.commercialInquiryLine.update({
        where: { id },
        data: { lineNumber: index + 1 },
      })
    )
  );
  return getInquiryById(inquiry.id);
}

// ==========================================
// 2. QUOTATION DOMAIN METHODS & VERSIONING
// ==========================================

export async function createQuotationFromInquiry(
  input: CreateQuotationInput,
  actor: { id?: string; name?: string; email?: string; userType?: string; customerId?: string }
) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: input.inquiryId }, { inquiryNumber: input.inquiryId }] },
    include: { lines: true },
  });

  if (!inquiry) {
    const err = new Error(`Inquiry ${input.inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);

  if (isV2InquiryMetadata(inquiry.commercialMetadata)) {
    const err = new Error(
      'This inquiry is on the V2 configuration workflow. A legacy quotation cannot be created from commercial fields alone.'
    );
    (err as Error & { code: string }).code = 'CONFIGURATION_REQUIRED';
    throw err;
  }

  if (inquiry.lines.length === 0) {
    const err = new Error('Cannot quote an inquiry with zero lines.');
    (err as Error & { code: string }).code = 'EMPTY_INQUIRY';
    throw err;
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const quotationNumber = input.quotationNumber || `QUO-${stamp}-${rand}`;

  // Aggregate Material Cost from valid lines
  let totalMaterialCost = 0;
  inquiry.lines.forEach((l) => {
    if (l.materialCost != null) {
      totalMaterialCost += Number(l.materialCost);
    }
  });

  const quotation = await prisma.commercialQuotation.create({
    data: {
      quotationNumber,
      inquiryId: inquiry.id,
      customerId: inquiry.customerId,
      customerMasterId: inquiry.customerMasterId,
      customerName: inquiry.customerName,
      contactPerson: inquiry.contactPerson,
      versionNo: 1,
      isCurrent: true,
      status: 'OPEN',
      currency: (input.currency || inquiry.currency || 'USD').toUpperCase(),
      incoterms: input.incoterms || inquiry.incoterms || null,
      paymentTerms: input.paymentTerms || inquiry.paymentTerms || 'LC at sight',
      deliveryTerms: input.deliveryTerms || inquiry.deliveryTerms || 'CIF Alexandria',
      validUntil: input.validUntil ? new Date(input.validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      materialCostTotal: totalMaterialCost,
      commercialPricingStatus: 'NOT_CONFIGURED',
      sellingPrice: null, // Strictly Null in Increment 11 (Material Cost is NOT Selling Price)
      quotationOwner: actor.name || actor.email || 'Sales Manager',
      remarks: input.remarks || null,
      createdBy: actor.name || actor.email || 'user',
      lines: {
        create: inquiry.lines.map((l) => ({
          lineNumber: l.lineNumber,
          inquiryLineId: l.id || null,
          materialNumber: l.materialNumber,
          itemDescription: l.cableDescription,
          quantity: l.requestedQuantity,
          quantityUom: l.quantityUom,
          lengthMeters: l.requestedLengthMeters,
          customerCableCode: l.customerCode,
          cuttingLengthMeters: l.cuttingLengthMeters,
          drumType: l.drumType,
          costingRunId: l.costingRunId,
          costingCalculationId: l.costingCalculationId,
          materialCost: l.materialCost,
          materialCostCurrency: l.materialCostCurrency || 'USD',
          commercialStatus: l.materialCost != null ? 'MATERIAL_COST_AVAILABLE' : 'MATERIAL_COST_NOT_READY',
          sellingPrice: null,
          notes: l.notes,
        })),
      },
    },
    include: { lines: true, inquiry: true },
  });

  // Update inquiry status
  await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { status: 'QUOTED' },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V1`,
    action: 'CREATE',
    newValue: { quotationNumber, versionNo: 1, inquiryNumber: inquiry.inquiryNumber, totalMaterialCost },
    message: `Created Quotation ${quotationNumber} V1 from Inquiry ${inquiry.inquiryNumber}`,
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'CommercialQuotation',
        entityId: `${quotation.quotationNumber}-V1`,
        action: 'CREATE',
        newValue: { quotationNumber, versionNo: 1, inquiryNumber: inquiry.inquiryNumber, totalMaterialCost },
        message: `Created Quotation ${quotationNumber} V1 from Inquiry ${inquiry.inquiryNumber}`,
      },
    });
  }

  return quotation;
}

export async function createQuotationRevision(
  quotationNumber: string,
  updates: Partial<CreateQuotationInput> & { lines?: Array<any> },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const current = await prisma.commercialQuotation.findFirst({
    where: { quotationNumber, isCurrent: true },
    include: { lines: true, inquiry: true },
  });

  if (!current) {
    const err = new Error(`Quotation ${quotationNumber} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const nextVersionNo = current.versionNo + 1;

  const revised = await prisma.$transaction(async (tx) => {
    // 1. Mark existing version as SUPERSEDED and isCurrent = false (Immutable historical snapshot)
    await tx.commercialQuotation.update({
      where: { id: current.id },
      data: { isCurrent: false, status: 'SUPERSEDED' },
    });

    // 2. Create new Version V(N+1)
    const newQuotation = await tx.commercialQuotation.create({
      data: {
        quotationNumber: current.quotationNumber,
        inquiryId: current.inquiryId,
        customerId: current.customerId,
        customerMasterId: current.customerMasterId,
        customerName: current.customerName,
        contactPerson: current.contactPerson,
        versionNo: nextVersionNo,
        isCurrent: true,
        supersedesQuotationId: current.id,
        status: 'OPEN',
        currency: updates.currency || current.currency,
        incoterms: updates.incoterms || current.incoterms,
        paymentTerms: updates.paymentTerms || current.paymentTerms,
        deliveryTerms: updates.deliveryTerms || current.deliveryTerms,
        validUntil: updates.validUntil ? new Date(updates.validUntil) : current.validUntil,
        materialCostTotal: current.materialCostTotal,
        commercialPricingStatus: 'NOT_CONFIGURED',
        sellingPrice: null,
        commercialApprovalStatus: 'NOT_SUBMITTED',
        fulfillmentType: null,
        commerciallyApprovedBy: null,
        commerciallyApprovedAt: null,
        billTo: current.billTo,
        shipTo: current.shipTo,
        requestedDeliveryDate: current.requestedDeliveryDate,
        quotationOwner: actor.name || actor.email || current.quotationOwner,
        remarks: updates.remarks || current.remarks,
        createdBy: actor.name || actor.email || 'user',
        lines: {
          create: current.lines.map((l) => ({
            lineNumber: l.lineNumber,
            inquiryLineId: l.inquiryLineId || null,
            materialNumber: l.materialNumber,
            itemDescription: l.itemDescription,
            quantity: l.quantity,
            quantityUom: l.quantityUom,
            lengthMeters: l.lengthMeters,
            customerCableCode: l.customerCableCode,
            configurationId: l.configurationId,
            engineeringRevision: l.engineeringRevision,
            bomVersion: l.bomVersion,
            technicalSpecificationId: l.technicalSpecificationId,
            cuttingLengthMeters: l.cuttingLengthMeters,
            numberOfCuts: l.numberOfCuts,
            drumType: l.drumType,
            drumSize: l.drumSize,
            drumQuantity: l.drumQuantity,
            drumLengthMeters: l.drumLengthMeters,
            drumWeightKg: l.drumWeightKg,
            costingRunId: l.costingRunId,
            costingCalculationId: l.costingCalculationId,
            materialCost: l.materialCost,
            materialCostCurrency: l.materialCostCurrency,
            commercialStatus: l.commercialStatus,
            sellingPrice: null,
            notes: l.notes,
          })),
        },
      },
      include: { lines: true, inquiry: true },
    });

    return newQuotation;
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotationNumber}-V${nextVersionNo}`,
    action: 'UPDATE',
    oldValue: { quotationNumber, versionNo: current.versionNo, status: current.status },
    newValue: { quotationNumber, versionNo: nextVersionNo, status: 'OPEN' },
    message: `Created Quotation Revision ${quotationNumber} V${nextVersionNo} (supersedes V${current.versionNo})`,
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'CommercialQuotation',
        entityId: `${quotationNumber}-V${nextVersionNo}`,
        action: 'UPDATE',
        oldValue: { quotationNumber, versionNo: current.versionNo, status: current.status },
        newValue: { quotationNumber, versionNo: nextVersionNo, status: 'OPEN' },
        message: `Created Quotation Revision ${quotationNumber} V${nextVersionNo} (supersedes V${current.versionNo})`,
      },
    });
  }

  return revised;
}

export async function listQuotations(filter?: {
  customerId?: string;
  customerIds?: string[];
  customerMasterIds?: string[];
  status?: string;
  isCurrent?: boolean;
  q?: string;
}) {
  const prisma = requirePrisma();
  const andList: Prisma.CommercialQuotationWhereInput[] = [];

  if (filter?.isCurrent !== undefined) andList.push({ isCurrent: filter.isCurrent });
  if (filter?.customerIds?.length || filter?.customerMasterIds?.length) {
    const or: Prisma.CommercialQuotationWhereInput[] = [];
    if (filter.customerIds?.length) or.push({ customerId: { in: filter.customerIds } });
    if (filter.customerMasterIds?.length) or.push({ customerMasterId: { in: filter.customerMasterIds } });
    andList.push({ OR: or });
  } else if (filter?.customerId) {
    andList.push({ customerId: filter.customerId });
  }
  if (filter?.status && filter.status !== 'ALL') andList.push({ status: filter.status as QuotationStatus });
  if (filter?.q) {
    andList.push({
      OR: [
        { quotationNumber: { contains: filter.q, mode: 'insensitive' } },
        { customerName: { contains: filter.q, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.CommercialQuotationWhereInput = andList.length ? { AND: andList } : {};
  return prisma.commercialQuotation.findMany({
    where,
    include: {
      lines: { orderBy: { lineNumber: 'asc' } },
      inquiry: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Which CommercialQuotation row a lookup means.
 *
 * - A primary key returns that row, even when another revision shares the quotation number.
 * - `versionNo` returns that revision (by quotation number, or by the number of the row id).
 * - A quotation number with no version returns the original revision: lowest `versionNo`,
 *   then earliest `createdAt`. That is the Version A row existing number-only callers
 *   (Increment 12 pricing) price and read. A later revision is `isCurrent` but is created
 *   with a null selling price and must not hide or replace the original on a number-only read.
 *   Callers that want a later revision pass `versionNo` or that row's id.
 *   A revision with no selling price and no pricing snapshot stays null. It does not borrow
 *   another revision's price or snapshot.
 */
export async function resolveCommercialQuotationId(
  id: string,
  options?: { versionNo?: number }
): Promise<string | null> {
  const prisma = requirePrisma();
  const versionNo = options?.versionNo;

  if (versionNo == null) {
    const byId = await prisma.commercialQuotation.findUnique({ where: { id }, select: { id: true } });
    if (byId) return byId.id;
    const original = await prisma.commercialQuotation.findFirst({
      where: { quotationNumber: id },
      orderBy: [{ versionNo: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return original?.id ?? null;
  }

  const byNumberAndVersion = await prisma.commercialQuotation.findFirst({
    where: { quotationNumber: id, versionNo },
    select: { id: true },
  });
  if (byNumberAndVersion) return byNumberAndVersion.id;

  const row = await prisma.commercialQuotation.findUnique({
    where: { id },
    select: { quotationNumber: true },
  });
  if (!row) return null;
  const version = await prisma.commercialQuotation.findFirst({
    where: { quotationNumber: row.quotationNumber, versionNo },
    select: { id: true },
  });
  return version?.id ?? null;
}

export async function getQuotationById(id: string, options?: { versionNo?: number }) {
  const prisma = requirePrisma();
  const resolvedId = await resolveCommercialQuotationId(id, options);
  if (!resolvedId) return null;
  return prisma.commercialQuotation.findUnique({
    where: { id: resolvedId },
    include: {
      lines: { orderBy: { lineNumber: 'asc' }, include: { pricingSnapshot: true } },
      inquiry: { include: { lines: true } },
    },
  });
}

// ==========================================
// 3. INQUIRY LINE COSTING (Phase E)
// ==========================================

export async function calculateInquiryLineCost(
  inquiryId: string,
  lineId: string,
  actor: RequestActor,
  options?: { allowSubmitted?: boolean }
) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: true },
  });

  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);

  if (
    !options?.allowSubmitted &&
    inquiry.status !== 'DRAFT' &&
    inquiry.status !== 'UNDER_REVIEW'
  ) {
    const err = new Error(
      `Inquiry ${inquiry.inquiryNumber} is ${inquiry.status}. Create a new version to recalculate costs.`
    );
    (err as Error & { code: string }).code = 'COSTING_LOCKED';
    throw err;
  }

  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Inquiry line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const request = buildCostingRequestFromInquiryLine(
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

  if ('error' in request) {
    const err = new Error(request.error);
    (err as Error & { code: string; blockingReasons: string[] }).code = line.materialNumber
      ? 'NOT_READY'
      : 'BOM_NOT_READY';
    (err as Error & { code: string; blockingReasons: string[] }).blockingReasons = [request.error];
    throw err;
  }

  const drums = await listDrums();
  const drumOk = isGovernedDrumSelection(line.drumType, drums);

  const result = await executeCostingForInquiryLine(request, actor, {
    persist: drumOk,
    inquiryId: inquiry.id,
    inquiryLineId: line.id,
  });

  if (!drumOk) {
    await prisma.commercialInquiryLine.update({
      where: { id: line.id },
      data: { costingReadinessStatus: 'NOT_READY' },
    });
    const blockingReasons = [
      ...(result.blockingReasons || []),
      'DRUM_CONFIGURATION_REQUIRED',
    ].filter((code, index, all) => all.indexOf(code) === index);
    const err = new Error(blockingReasons.join('; ') || 'Drum configuration is required.');
    (err as Error & { code: string; blockingReasons: string[]; result: unknown }).code =
      'DRUM_CONFIGURATION_REQUIRED';
    (err as Error & { code: string; blockingReasons: string[]; result: unknown }).blockingReasons =
      blockingReasons;
    (err as Error & { code: string; blockingReasons: string[]; result: unknown }).result = {
      ...result,
      status: 'NOT_READY',
      blockingReasons,
      errorCode: 'DRUM_CONFIGURATION_REQUIRED',
      persisted: false,
    };
    throw err;
  }

  if (result.status === 'NOT_READY') {
    await prisma.commercialInquiryLine.update({
      where: { id: line.id },
      data: { costingReadinessStatus: 'NOT_READY' },
    });
    const err = new Error(result.blockingReasons.join('; ') || 'Costing is not ready.');
    (err as Error & { code: string; blockingReasons: string[]; result: unknown }).code =
      result.errorCode || 'NOT_READY';
    (err as Error & { code: string; blockingReasons: string[]; result: unknown }).blockingReasons =
      result.blockingReasons;
    (err as Error & { code: string; blockingReasons: string[]; result: unknown }).result = result;
    throw err;
  }

  const updatedLine = await prisma.commercialInquiryLine.findUnique({ where: { id: line.id } });

  return { result, line: updatedLine };
}

export type InquiryLineCalculateOutcome = {
  lineId: string;
  lineNumber: number;
  status: 'READY' | 'NOT_READY';
  code: string;
  persisted: boolean;
  blockingReasons: string[];
  result?: unknown;
};

/** Calculate every inquiry line using executeCostingForInquiryLine. Logistics NOT_CONFIGURED is non-blocking. */
export async function calculateInquiryCost(
  inquiryId: string,
  actor: RequestActor,
  options?: { allowSubmitted?: boolean }
) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });

  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);

  if (
    !options?.allowSubmitted &&
    inquiry.status !== 'DRAFT' &&
    inquiry.status !== 'UNDER_REVIEW'
  ) {
    const err = new Error(
      `Inquiry ${inquiry.inquiryNumber} is ${inquiry.status}. Create a new version to recalculate costs.`
    );
    (err as Error & { code: string }).code = 'COSTING_LOCKED';
    throw err;
  }

  const lines: InquiryLineCalculateOutcome[] = [];
  for (const line of inquiry.lines) {
    try {
      const { result } = await calculateInquiryLineCost(inquiry.id, line.id, actor, options);
      lines.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        status: 'READY',
        code: 'READY',
        persisted: Boolean(result.persisted),
        blockingReasons: [...(result.blockingReasons || [])],
        result,
      });
    } catch (err) {
      const coded = err as Error & { code?: string; blockingReasons?: string[]; result?: unknown };
      lines.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        status: 'NOT_READY',
        code: coded.code || 'COSTING_NOT_READY',
        persisted: false,
        blockingReasons: [...(coded.blockingReasons || [coded.message])],
        result: coded.result,
      });
    }
  }

  const refreshed = await getInquiryById(inquiry.id);

  if (getInquiryProcessCode(inquiry) === 'VIP_FAST_TRACK') {
    await noteVipFastTrackWorkflowBoundary(
      { id: inquiry.id, inquiryNumber: inquiry.inquiryNumber },
      actor
    );
  }

  return { inquiry: refreshed, lines };
}

export async function getInquiryLineCosting(inquiryId: string, lineId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
    include: { lines: true },
  });

  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);

  const line = inquiry.lines.find((l) => l.id === lineId);
  if (!line) {
    const err = new Error(`Inquiry line ${lineId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  if (!line.costingCalculationId) {
    return { status: 'NOT_CALCULATED', line, calculation: null };
  }

  const calculation = await prisma.costingCalculation.findUnique({
    where: { id: line.costingCalculationId },
    include: { snapshots: true },
  });

  return {
    status: calculation ? 'READY' : 'NOT_CALCULATED',
    line,
    calculation,
    breakdown: calculation?.outputSnapshot || null,
  };
}

export async function getQuotationCosting(quotationId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const resolvedId = await resolveCommercialQuotationId(quotationId);
  const quotation = resolvedId
    ? await prisma.commercialQuotation.findUnique({
        where: { id: resolvedId },
        include: {
          lines: {
            include: {
              costingCalculation: { include: { snapshots: true } },
            },
          },
        },
      })
    : null;

  if (!quotation) {
    const err = new Error(`Quotation ${quotationId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, quotation.customerId, quotation.customerMasterId);

  if (actor.userType === 'customer') {
    const err = new Error('Customers cannot access internal costing snapshots.');
    (err as Error & { code: string }).code = 'UNAUTHORIZED';
    throw err;
  }

  return {
    quotationId: quotation.id,
    quotationNumber: quotation.quotationNumber,
    versionNo: quotation.versionNo,
    lines: quotation.lines.map((line) => ({
      lineNumber: line.lineNumber,
      materialNumber: line.materialNumber,
      itemDescription: line.itemDescription,
      costingRunId: line.costingRunId,
      costingCalculationId: line.costingCalculationId,
      materialCost: line.materialCost != null ? Number(line.materialCost) : null,
      materialCostCurrency: line.materialCostCurrency,
      calculation: line.costingCalculation
        ? {
            id: line.costingCalculation.id,
            calculationNumber: line.costingCalculation.calculationNumber,
            costingDate: line.costingCalculation.costingDate,
            status: line.costingCalculation.status,
            referenceSnapshot: line.costingCalculation.referenceSnapshot,
            outputSnapshot: line.costingCalculation.outputSnapshot,
          }
        : null,
    })),
  };
}

export async function listInquiryActivity(inquiryId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });

  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);

  const lineIds = (
    await prisma.commercialInquiryLine.findMany({
      where: { inquiryId: inquiry.id },
      select: { id: true },
    })
  ).map((l) => l.id);

  const events = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { entity: 'CommercialInquiry', entityId: inquiry.inquiryNumber },
        { entity: 'CommercialInquiry', entityId: inquiry.id },
        ...(lineIds.length ? [{ entity: 'CommercialInquiryLine', entityId: { in: lineIds } }] : []),
        { entity: 'CostingCalculation', message: { contains: inquiry.inquiryNumber } },
      ],
    },
    orderBy: { at: 'desc' },
    take: 100,
  });

  return events;
}

const MAX_INQUIRY_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export async function listInquiryAttachments(inquiryId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  return prisma.commercialInquiryAttachment.findMany({
    where: { inquiryId: inquiry.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, mimeType: true, byteSize: true, uploadedBy: true, createdAt: true },
  });
}

export async function addInquiryAttachment(
  inquiryId: string,
  input: { fileName: string; mimeType?: string; contentBase64: string },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  const fileName = (input.fileName || '').trim();
  if (!fileName) {
    const err = new Error('fileName is required.');
    (err as Error & { code: string }).code = 'INVALID_REQUEST_INPUTS';
    throw err;
  }
  const raw = (input.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const content = Buffer.from(raw, 'base64');
  if (!content.length) {
    const err = new Error('Attachment content is empty.');
    (err as Error & { code: string }).code = 'INVALID_REQUEST_INPUTS';
    throw err;
  }
  if (content.length > MAX_INQUIRY_ATTACHMENT_BYTES) {
    const err = new Error('Attachment exceeds 8 MB.');
    (err as Error & { code: string }).code = 'INVALID_REQUEST_INPUTS';
    throw err;
  }
  const row = await prisma.commercialInquiryAttachment.create({
    data: {
      inquiryId: inquiry.id,
      fileName,
      mimeType: input.mimeType?.trim() || 'application/octet-stream',
      byteSize: content.length,
      content,
      uploadedBy: actor.name || actor.email || actor.id,
    },
  });
  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialInquiry',
    entityId: inquiry.inquiryNumber,
    action: 'CREATE',
    message: `Attached ${fileName} to ${inquiry.inquiryNumber}`,
  });
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

export async function getInquiryAttachmentContent(inquiryId: string, attachmentId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  const row = await prisma.commercialInquiryAttachment.findFirst({
    where: { id: attachmentId, inquiryId: inquiry.id },
  });
  if (!row) {
    const err = new Error('Attachment not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  return row;
}

export async function deleteInquiryAttachment(inquiryId: string, attachmentId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!inquiry) {
    const err = new Error(`Inquiry ${inquiryId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  if (inquiry.status !== 'DRAFT' && inquiry.status !== 'UNDER_REVIEW') {
    const err = new Error('Attachments can only be deleted while the inquiry is editable.');
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
  const existing = await prisma.commercialInquiryAttachment.findFirst({
    where: { id: attachmentId, inquiryId: inquiry.id },
  });
  if (!existing) {
    const err = new Error('Attachment not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  await prisma.commercialInquiryAttachment.delete({ where: { id: attachmentId } });
  return { deleted: true, id: attachmentId };
}
