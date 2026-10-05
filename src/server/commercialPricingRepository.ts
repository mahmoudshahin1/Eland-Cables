import {
  Prisma,
  PricingRuleScope,
  PricingRuleType,
  PriceWorkflowStatus,
} from '@prisma/client';
import { getPrisma } from './db';
import { appendAudit } from '../platform/audit/auditLogService';
import { appendServerAuditTx } from './serverAudit';
import {
  buildPricingScopeKey,
  calculateCommercialSellingPrice,
  StoredPricingRule,
} from '../domain/commercialPricingEngine';
import { resolveCommercialQuotationId } from './commercialRepository';
import { dateOnlyToUtc, dateRangesOverlap, formatDateOnlyUtc, parseDateOnly } from '../domain/shippingCostCanonical';
import { dayBefore } from '../domain/customerShippingCost';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

type PricingRuleRow = {
  id: string;
  ruleCode: string;
  ruleName: string;
  scope: PricingRuleScope;
  ruleType: PricingRuleType;
  customerId: string | null;
  customerGroupId?: string | null;
  customerTierCode: string | null;
  cableMaterialNumber: string | null;
  cableFamily?: string | null;
  percentageValue: Prisma.Decimal | number | string;
  currency: string;
  priority: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  workflowStatus: PriceWorkflowStatus;
  status?: string | null;
  isCurrent: boolean;
  revision: number;
  minMarginThreshold: Prisma.Decimal | number | string | null;
  maxDiscountAllowed: Prisma.Decimal | number | string | null;
};

export function toStoredPricingRule(r: PricingRuleRow): StoredPricingRule {
  return {
    id: r.id,
    ruleCode: r.ruleCode,
    ruleName: r.ruleName,
    scope: r.scope,
    ruleType: r.ruleType,
    customerId: r.customerId,
    customerGroupId: r.customerGroupId ?? null,
    customerTierCode: r.customerTierCode,
    cableMaterialNumber: r.cableMaterialNumber,
    cableFamily: r.cableFamily ?? null,
    percentageValue: r.percentageValue,
    currency: r.currency,
    priority: r.priority,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    workflowStatus: r.workflowStatus,
    status: r.status ?? 'ACTIVE',
    isCurrent: r.isCurrent,
    revision: r.revision,
    minMarginThreshold: r.minMarginThreshold != null ? Number(r.minMarginThreshold) : null,
    maxDiscountAllowed: r.maxDiscountAllowed != null ? Number(r.maxDiscountAllowed) : null,
  };
}

export async function loadPricingResolutionContext(
  customerId?: string | null,
  materialNumber?: string | null
): Promise<{ customerGroupId?: string; cableFamily?: string }> {
  const prisma = requirePrisma();
  const [customer, cable] = await Promise.all([
    customerId
      ? prisma.customer.findUnique({ where: { id: customerId }, select: { customerGroupId: true } })
      : null,
    materialNumber
      ? prisma.cableMaster.findUnique({
          where: { materialNumber },
          select: { family: true },
        })
      : null,
  ]);
  return {
    customerGroupId: customer?.customerGroupId || undefined,
    cableFamily: cable?.family || undefined,
  };
}

function fail(code: string, message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  throw err;
}

function parsePercentage(value: unknown, ruleType: PricingRuleType): Prisma.Decimal {
  let pct: Prisma.Decimal;
  try {
    pct = new Prisma.Decimal(value as string | number);
  } catch {
    fail('INVALID_PERCENTAGE', 'percentageValue must be a valid decimal.');
  }
  if (!pct.isFinite()) fail('INVALID_PERCENTAGE', 'percentageValue must be a valid decimal.');
  if (ruleType === 'GROSS_MARGIN' && (pct.lessThan(0) || pct.greaterThanOrEqualTo(100))) {
    fail('INVALID_MARGIN_VALUE', 'Gross margin percentage must be between 0% and less than 100%.');
  }
  if (ruleType === 'MARKUP' && pct.lessThan(0)) {
    fail('INVALID_MARKUP_VALUE', 'Markup percentage cannot be negative.');
  }
  return pct;
}

function parseOptionalDate(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const iso = parseDateOnly(value instanceof Date || typeof value === 'string' ? value : String(value));
  if (!iso) fail('INVALID_DATE_RANGE', `${label} must be a calendar date (YYYY-MM-DD).`);
  return dateOnlyToUtc(iso);
}

function validateScopeTargets(input: {
  scope: PricingRuleScope;
  customerId?: string | null;
  customerGroupId?: string | null;
  customerTierCode?: string | null;
  cableMaterialNumber?: string | null;
  cableFamily?: string | null;
}) {
  const customerId = input.customerId || null;
  const customerGroupId = input.customerGroupId || null;
  const cableMaterialNumber = input.cableMaterialNumber || null;
  const cableFamily = input.cableFamily || null;
  if (input.scope === 'CUSTOMER_CABLE_SPECIFIC' && (!customerId || !cableMaterialNumber)) {
    fail('INVALID_SCOPE_TARGET', 'Customer + Cable rules require customerId and cableMaterialNumber.');
  }
  if (input.scope === 'CUSTOMER_GROUP_CABLE' && (!customerGroupId || !cableMaterialNumber)) {
    fail('INVALID_SCOPE_TARGET', 'Customer Group + Cable rules require customerGroupId and cableMaterialNumber.');
  }
  if (input.scope === 'CUSTOMER_FAMILY' && (!customerId || !cableFamily)) {
    fail('INVALID_SCOPE_TARGET', 'Customer + Cable Family rules require customerId and cableFamily.');
  }
  if (input.scope === 'CUSTOMER_GROUP_FAMILY' && (!customerGroupId || !cableFamily)) {
    fail('INVALID_SCOPE_TARGET', 'Customer Group + Cable Family rules require customerGroupId and cableFamily.');
  }
  if (input.scope === 'CABLE_FAMILY' && !cableFamily) {
    fail('INVALID_SCOPE_TARGET', 'Cable Family rules require cableFamily from Cable Master.');
  }
  if (input.scope === 'CUSTOMER_SPECIFIC' && !customerId) {
    fail('INVALID_SCOPE_TARGET', 'Customer-specific rules require customerId.');
  }
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'user';
}

// ==========================================
// 1. PRICING RULE MANAGEMENT & WORKFLOW
// ==========================================

export async function createCommercialPricingRule(
  input: {
    ruleName: string;
    scope?: PricingRuleScope;
    ruleType?: PricingRuleType;
    customerId?: string;
    customerGroupId?: string;
    customerTierCode?: string;
    cableMaterialNumber?: string;
    cableFamily?: string;
    percentageValue: number | string;
    currency?: string;
    priority?: number;
    effectiveFrom?: string | Date;
    effectiveTo?: string | Date;
    minMarginThreshold?: number;
    maxDiscountAllowed?: number;
    comment?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const ruleCode = `PR-RULE-${stamp}-${rand}`;

  const ruleType = input.ruleType || 'GROSS_MARGIN';
  const pct = parsePercentage(input.percentageValue, ruleType);
  const scope = input.scope || 'GLOBAL';
  const customerId = input.customerId || null;
  const customerGroupId = input.customerGroupId || null;
  const customerTierCode = input.customerTierCode || null;
  const cableMaterialNumber = input.cableMaterialNumber || null;
  const cableFamily = input.cableFamily ? String(input.cableFamily).trim() : null;
  const currency = (input.currency || 'USD').toUpperCase();

  validateScopeTargets({ scope, customerId, customerGroupId, customerTierCode, cableMaterialNumber, cableFamily });
  if (customerGroupId) {
    const group = await prisma.customerGroup.findUnique({ where: { id: customerGroupId }, select: { id: true } });
    if (!group) fail('CUSTOMER_GROUP_NOT_FOUND', 'Customer Group was not found.');
  }

  const fromDate = parseOptionalDate(input.effectiveFrom, 'Effective From');
  const toDate = parseOptionalDate(input.effectiveTo, 'Effective To');
  if (fromDate && toDate && fromDate > toDate) {
    fail('INVALID_DATE_RANGE', 'Effective From date cannot be after Effective To date.');
  }

  const scopeKey = buildPricingScopeKey({
    scope,
    currency,
    customerId,
    customerGroupId,
    customerTierCode,
    cableMaterialNumber,
    cableFamily,
  });

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.commercialPricingRule.findFirst({
      where: { scopeKey },
      orderBy: { revision: 'desc' },
    });
    const revision = (latest?.revision ?? 0) + 1;
    const rule = await tx.commercialPricingRule.create({
      data: {
        ruleCode,
        ruleName: input.ruleName,
        scope,
        ruleType,
        customerId,
        customerGroupId,
        customerTierCode,
        cableMaterialNumber,
        cableFamily,
        scopeKey,
        percentageValue: pct,
        currency,
        priority: input.priority != null ? Number(input.priority) : 20,
        effectiveFrom: fromDate,
        effectiveTo: toDate,
        workflowStatus: 'DRAFT',
        status: 'ACTIVE',
        isCurrent: true,
        revision,
        minMarginThreshold: input.minMarginThreshold != null ? Number(input.minMarginThreshold) : null,
        maxDiscountAllowed: input.maxDiscountAllowed != null ? Number(input.maxDiscountAllowed) : 15.0,
        createdBy: actorLabel(actor),
        updatedBy: actorLabel(actor),
        comment: input.comment || null,
      },
    });
    await appendServerAuditTx(tx, {
      actorId: actor.id || null,
      actorName: actor.name || actor.email || null,
      entity: 'CommercialPricingRule',
      entityId: rule.ruleCode,
      action: 'CREATE',
      newValue: {
        ruleCode,
        ruleName: rule.ruleName,
        scope: rule.scope,
        ruleType: rule.ruleType,
        percentageValue: pct.toFixed(),
        revision,
        customerId,
        customerGroupId,
        cableFamily,
        cableMaterialNumber,
      },
      message: `Created pricing rule ${ruleCode} (${rule.ruleType} ${pct.toFixed()}%) version ${revision} in DRAFT status`,
    });
    return rule;
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialPricingRule',
    entityId: created.ruleCode,
    action: 'CREATE',
    newValue: { ruleCode, ruleName: created.ruleName, scope: created.scope, ruleType: created.ruleType },
    message: `Created pricing rule ${ruleCode} in DRAFT status`,
  });

  return created;
}

/**
 * Insert a new version of an existing rule. Never overwrites percentage on the prior row.
 * Closes previous Effective To, marks SUPERSEDED, and activates the successor.
 */
export async function createCommercialPricingRuleVersion(
  ruleId: string,
  input: {
    percentageValue: number | string;
    ruleType?: PricingRuleType;
    effectiveFrom: string | Date;
    effectiveTo?: string | Date | null;
    comment?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const current = await prisma.commercialPricingRule.findFirst({
    where: { OR: [{ id: ruleId }, { ruleCode: ruleId }] },
  });
  if (!current) fail('NOT_FOUND', `Pricing rule ${ruleId} not found.`);

  const ruleType = input.ruleType || current.ruleType;
  const pct = parsePercentage(input.percentageValue, ruleType);
  const effectiveFromIso = parseDateOnly(input.effectiveFrom);
  if (!effectiveFromIso) fail('INVALID_DATE_RANGE', 'Effective From must be a calendar date (YYYY-MM-DD).');
  const effectiveToIso = input.effectiveTo ? parseDateOnly(input.effectiveTo) : null;
  if (input.effectiveTo && !effectiveToIso) fail('INVALID_DATE_RANGE', 'Effective To must be a calendar date (YYYY-MM-DD).');
  if (effectiveToIso && effectiveToIso < effectiveFromIso) {
    fail('INVALID_DATE_RANGE', 'Effective To cannot be before Effective From.');
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();

  const created = await prisma.$transaction(async (tx) => {
    const family = await tx.commercialPricingRule.findMany({
      where: { scopeKey: current.scopeKey },
      orderBy: { revision: 'desc' },
    });
    const active = family.filter((row) => row.status === 'ACTIVE' && row.workflowStatus === 'APPROVED');
    const predecessor = active.find((row) => row.id === current.id) || active[0] || current;
    const currentFrom = predecessor.effectiveFrom ? formatDateOnlyUtc(predecessor.effectiveFrom) : null;
    if (currentFrom && effectiveFromIso <= currentFrom) {
      fail(
        'EFFECTIVE_FROM_NOT_AFTER_CURRENT',
        'Effective From must be after the current version Effective From. Save a new version instead of changing history.'
      );
    }
    let closeTo: string | null = null;
    if (predecessor.status === 'ACTIVE') {
      closeTo = dayBefore(effectiveFromIso);
      if (currentFrom && closeTo < currentFrom) {
        fail('EFFECTIVE_FROM_NOT_AFTER_CURRENT', 'Effective From must leave the previous version a valid window.');
      }
    }
    const windows = family
      .filter((row) => row.effectiveFrom)
      .map((row) => ({
        id: row.id,
        effectiveFrom: formatDateOnlyUtc(row.effectiveFrom!),
        effectiveTo:
          predecessor && row.id === predecessor.id && closeTo
            ? closeTo
            : row.effectiveTo
              ? formatDateOnlyUtc(row.effectiveTo)
              : null,
      }));
    const overlaps = windows.some((w) =>
      dateRangesOverlap(w.effectiveFrom, w.effectiveTo, effectiveFromIso, effectiveToIso)
    );
    if (overlaps) {
      fail('PRICING_RULE_PERIOD_OVERLAP', 'The new effective window overlaps another version of this pricing rule.');
    }

    if (predecessor.status === 'ACTIVE' && closeTo) {
      await tx.commercialPricingRule.update({
        where: { id: predecessor.id },
        data: {
          effectiveTo: dateOnlyToUtc(closeTo),
          status: 'SUPERSEDED',
          isCurrent: false,
          updatedBy: actorLabel(actor),
        },
      });
    }

    const revision = (family[0]?.revision ?? predecessor.revision) + 1;
    const row = await tx.commercialPricingRule.create({
      data: {
        ruleCode: `PR-RULE-${stamp}-${rand}`,
        ruleName: current.ruleName,
        scope: current.scope,
        ruleType,
        customerId: current.customerId,
        customerGroupId: current.customerGroupId,
        customerTierCode: current.customerTierCode,
        cableMaterialNumber: current.cableMaterialNumber,
        cableFamily: current.cableFamily,
        scopeKey: current.scopeKey,
        percentageValue: pct,
        currency: current.currency,
        priority: current.priority,
        effectiveFrom: dateOnlyToUtc(effectiveFromIso),
        effectiveTo: effectiveToIso ? dateOnlyToUtc(effectiveToIso) : null,
        workflowStatus: current.workflowStatus === 'APPROVED' ? 'APPROVED' : 'DRAFT',
        status: 'ACTIVE',
        isCurrent: true,
        revision,
        minMarginThreshold: current.minMarginThreshold,
        maxDiscountAllowed: current.maxDiscountAllowed,
        approvedBy: current.workflowStatus === 'APPROVED' ? actorLabel(actor) : null,
        approvedAt: current.workflowStatus === 'APPROVED' ? new Date() : null,
        createdBy: actorLabel(actor),
        updatedBy: actorLabel(actor),
        comment: input.comment || `Version ${revision} of ${current.ruleCode}`,
      },
    });
    await appendServerAuditTx(tx, {
      actorId: actor.id || null,
      actorName: actor.name || actor.email || null,
      entity: 'CommercialPricingRule',
      entityId: row.ruleCode,
      action: 'CREATE NEW VERSION',
      oldValue: {
        id: predecessor.id,
        ruleCode: predecessor.ruleCode,
        revision: predecessor.revision,
        percentageValue: Number(predecessor.percentageValue),
      },
      newValue: {
        id: row.id,
        ruleCode: row.ruleCode,
        revision,
        percentageValue: pct.toFixed(),
        effectiveFrom: effectiveFromIso,
        supersededId: predecessor.id,
      },
      message: `Created pricing rule version ${revision} effective ${effectiveFromIso}. Previous version ${predecessor.revision} superseded.`,
    });
    return row;
  });

  return created;
}

export async function listCommercialPricingRuleHistory(ruleId: string) {
  const prisma = requirePrisma();
  const current = await prisma.commercialPricingRule.findFirst({
    where: { OR: [{ id: ruleId }, { ruleCode: ruleId }] },
  });
  if (!current) fail('NOT_FOUND', `Pricing rule ${ruleId} not found.`);
  return prisma.commercialPricingRule.findMany({
    where: { scopeKey: current.scopeKey },
    orderBy: { revision: 'desc' },
  });
}

export async function listCommercialPricingRuleOptions() {
  const prisma = requirePrisma();
  const [customers, groups, familyRows] = await Promise.all([
    prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true, customerGroupId: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.customerGroup.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.cableMaster.findMany({
      where: { status: 'ACTIVE', NOT: { family: null } },
      distinct: ['family'],
      select: { family: true },
      orderBy: { family: 'asc' },
    }),
  ]);
  const families = familyRows.map((row) => String(row.family || '').trim()).filter(Boolean);
  return { customers, groups, families };
}

export async function listCommercialPricingRules(filter?: {
  scope?: string;
  workflowStatus?: string;
  currency?: string;
  isCurrent?: boolean;
  q?: string;
}) {
  const prisma = requirePrisma();
  const andList: Prisma.CommercialPricingRuleWhereInput[] = [];

  if (filter?.isCurrent !== undefined) andList.push({ isCurrent: filter.isCurrent });
  if (filter?.scope) andList.push({ scope: filter.scope as PricingRuleScope });
  if (filter?.workflowStatus && filter.workflowStatus !== 'ALL') {
    andList.push({ workflowStatus: filter.workflowStatus as PriceWorkflowStatus });
  }
  if (filter?.currency && filter.currency !== 'ALL') andList.push({ currency: filter.currency.toUpperCase() });
  if (filter?.q) {
    andList.push({
      OR: [
        { ruleCode: { contains: filter.q, mode: 'insensitive' } },
        { ruleName: { contains: filter.q, mode: 'insensitive' } },
        { customerId: { contains: filter.q, mode: 'insensitive' } },
        { customerGroupId: { contains: filter.q, mode: 'insensitive' } },
        { customerTierCode: { contains: filter.q, mode: 'insensitive' } },
        { cableMaterialNumber: { contains: filter.q, mode: 'insensitive' } },
        { cableFamily: { contains: filter.q, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.CommercialPricingRuleWhereInput = andList.length ? { AND: andList } : {};
  return prisma.commercialPricingRule.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function processPricingRuleWorkflowAction(
  ruleId: string,
  action: 'SUBMIT' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'EXPIRE' | 'CANCEL',
  options: { comment?: string },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const current = await prisma.commercialPricingRule.findFirst({
    where: { OR: [{ id: ruleId }, { ruleCode: ruleId }] },
  });

  if (!current) {
    const err = new Error(`Pricing rule ${ruleId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  let targetStatus: PriceWorkflowStatus = current.workflowStatus;
  const updates: Prisma.CommercialPricingRuleUpdateInput = {
    comment: options.comment !== undefined ? options.comment : current.comment,
  };

  if (action === 'SUBMIT') {
    targetStatus = 'SUBMITTED';
  } else if (action === 'REVIEW') {
    targetStatus = 'UNDER_REVIEW';
  } else if (action === 'APPROVE') {
    targetStatus = 'APPROVED';
    // Check overlapping periods with existing approved rules sharing exact same scope & priority
    const allApproved = await prisma.commercialPricingRule.findMany({
      where: {
        id: { not: current.id },
        workflowStatus: 'APPROVED',
        status: { not: 'INACTIVE' },
        scopeKey: current.scopeKey,
      },
    });

    const from = current.effectiveFrom ? current.effectiveFrom.getTime() : -Infinity;
    const to = current.effectiveTo ? current.effectiveTo.getTime() : Infinity;

    for (const ap of allApproved) {
      const apFrom = ap.effectiveFrom ? ap.effectiveFrom.getTime() : -Infinity;
      const apTo = ap.effectiveTo ? ap.effectiveTo.getTime() : Infinity;
      if (from <= apTo && to >= apFrom) {
        const err = new Error(
          `Cannot approve pricing rule: period overlaps with existing approved rule ${ap.ruleCode}.`
        );
        (err as Error & { code: string }).code = 'PRICING_RULE_PERIOD_OVERLAP';
        throw err;
      }
    }

    updates.approvedBy = actor.name || actor.email || 'pricing-manager';
    updates.approvedAt = new Date();
  } else if (action === 'REJECT') {
    targetStatus = 'REJECTED';
  } else if (action === 'EXPIRE') {
    targetStatus = 'EXPIRED';
  } else if (action === 'CANCEL') {
    targetStatus = 'CANCELLED';
  }

  updates.workflowStatus = targetStatus;

  const updated = await prisma.commercialPricingRule.update({
    where: { id: current.id },
    data: updates,
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialPricingRule',
    entityId: current.ruleCode,
    action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : 'UPDATE',
    oldValue: { status: current.workflowStatus },
    newValue: { status: targetStatus, comment: options.comment },
    message: `Pricing rule ${action} on ${current.ruleCode} -> ${targetStatus}`,
  });

  await appendServerAuditTx(prisma, {
    actorId: actor.id || null,
    actorName: actor.name || actor.email || null,
    entity: 'CommercialPricingRule',
    entityId: current.ruleCode,
    action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : action,
    oldValue: { workflowStatus: current.workflowStatus, status: current.status },
    newValue: { workflowStatus: targetStatus, status: updated.status, comment: options.comment },
    message: `Pricing rule ${action} on ${current.ruleCode} -> ${targetStatus}`,
  });

  return updated;
}

// ==========================================
// 2. QUOTATION PRICING CALCULATION & FREEZING
// ==========================================

export async function priceQuotation(
  quotationId: string,
  options: {
    requestedDiscountPercentage?: number;
    pricingDate?: Date | string;
    overridePricingRuleId?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const resolvedQuotationId = await resolveCommercialQuotationId(quotationId);
  const quotation = resolvedQuotationId
    ? await prisma.commercialQuotation.findUnique({
        where: { id: resolvedQuotationId },
        include: {
          lines: { include: { inquiryLine: true } },
          inquiry: true,
        },
      })
    : null;

  if (!quotation) {
    const err = new Error(`Quotation ${quotationId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  if ((quotation as { commercialApprovalStatus?: string }).commercialApprovalStatus === 'APPROVED') {
    const err = new Error(
      `Commercially approved quotation ${quotation.quotationNumber} V${quotation.versionNo} is immutable. Create a new revision to reprice.`
    );
    (err as Error & { code: string }).code = 'BUSINESS_RULE_REQUIRED';
    throw err;
  }

  const approvedRules = await prisma.commercialPricingRule.findMany({
    where: { workflowStatus: 'APPROVED' },
  });
  const storedRules: StoredPricingRule[] = approvedRules.map(toStoredPricingRule);

  const pDate = options.pricingDate ? new Date(options.pricingDate) : new Date();

  let totalQuotationSellingPrice = 0;
  let hasApprovalRequired = false;
  const pricedLinesOutput: any[] = [];

  for (const line of quotation.lines) {
    const matCost = line.materialCost != null ? Number(line.materialCost) : 0;

    if (matCost <= 0) {
      const err = new Error(`Quotation line #${line.lineNumber} has no valid material cost (PRICE_NOT_READY).`);
      (err as Error & { code: string }).code = 'PRICE_NOT_READY';
      throw err;
    }

    const customerId = quotation.customerId;
    const context = await loadPricingResolutionContext(
      quotation.customerMasterId || quotation.customerId,
      line.materialNumber
    );
    const calcResult = calculateCommercialSellingPrice(
      {
        materialCost: line.materialCost ?? matCost,
        currency: quotation.currency,
        materialNumber: line.materialNumber || undefined,
        customerId,
        customerGroupId: context.customerGroupId,
        cableFamily: context.cableFamily,
        pricingDate: pDate,
        quantity: Number(line.quantity),
        lengthMeters: Number(line.lengthMeters),
        requestedDiscountPercentage: options.requestedDiscountPercentage || 0,
      },
      { approvedPricingRules: storedRules }
    );

    if (!calcResult.success) {
      const err = new Error(`Pricing calculation blocked for line #${line.lineNumber}: ${calcResult.blockingReasons.join('; ')}`);
      (err as Error & { code: string; blockingReasons: string[] }).code = calcResult.errorCode || 'PRICING_NOT_CONFIGURED';
      (err as Error & { code: string; blockingReasons: string[] }).blockingReasons = calcResult.blockingReasons;
      throw err;
    }

    if (calcResult.approvalRequired) {
      hasApprovalRequired = true;
    }

    if (calcResult.finalSellingPrice == null || calcResult.baseSellingPrice == null) {
      const err = new Error(`Pricing calculation produced no selling price for line #${line.lineNumber}.`);
      (err as Error & { code: string }).code = 'PRICING_NOT_CONFIGURED';
      throw err;
    }

    totalQuotationSellingPrice += calcResult.finalSellingPrice;

    const snapshot = await prisma.commercialPricingSnapshot.upsert({
      where: { quotationLineId: line.id },
      create: {
        quotationId: quotation.id,
        quotationLineId: line.id,
        quotationNumber: quotation.quotationNumber,
        versionNo: quotation.versionNo,
        materialNumber: line.materialNumber || 'UNMAPPED',
        costingRunId: line.costingRunId,
        materialCost: line.materialCost ?? matCost,
        currency: calcResult.currency,
        pricingRuleId: calcResult.pricingRuleId || null,
        pricingRuleRevision: calcResult.pricingRuleRevision || 1,
        pricingRuleType: calcResult.pricingRuleType || 'GROSS_MARGIN',
        pricingRuleScope: (calcResult.pricingRuleScope as PricingRuleScope | undefined) || null,
        percentageValue: calcResult.percentageValueExact || calcResult.percentageValue || 0,
        resolutionReason: calcResult.resolutionReason || null,
        baseSellingPrice: calcResult.baseSellingPriceExact || calcResult.baseSellingPrice,
        discountPercentage: calcResult.discountPercentage,
        discountAmount: calcResult.discountAmount ?? 0,
        finalSellingPrice: calcResult.finalSellingPriceExact || calcResult.finalSellingPrice,
        unitSellingPrice: calcResult.unitSellingPrice ?? calcResult.finalSellingPrice,
        pricingStatus: calcResult.pricingStatus,
        approvalRequired: calcResult.approvalRequired,
        approvalReason: calcResult.approvalReason || null,
      },
      update: {
        pricingRuleId: calcResult.pricingRuleId || null,
        pricingRuleRevision: calcResult.pricingRuleRevision || 1,
        pricingRuleType: calcResult.pricingRuleType || 'GROSS_MARGIN',
        pricingRuleScope: (calcResult.pricingRuleScope as PricingRuleScope | undefined) || null,
        percentageValue: calcResult.percentageValueExact || calcResult.percentageValue || 0,
        resolutionReason: calcResult.resolutionReason || null,
        baseSellingPrice: calcResult.baseSellingPriceExact || calcResult.baseSellingPrice,
        discountPercentage: calcResult.discountPercentage,
        discountAmount: calcResult.discountAmount ?? 0,
        finalSellingPrice: calcResult.finalSellingPriceExact || calcResult.finalSellingPrice,
        unitSellingPrice: calcResult.unitSellingPrice ?? calcResult.finalSellingPrice,
        pricingStatus: calcResult.pricingStatus,
        approvalRequired: calcResult.approvalRequired,
        approvalReason: calcResult.approvalReason || null,
      },
    });

    // Update Quotation Line with snapshot reference and calculated selling price
    await prisma.commercialQuotationLine.update({
      where: { id: line.id },
      data: {
        sellingPrice: calcResult.finalSellingPrice,
        pricingSnapshotId: snapshot.id,
        commercialStatus: calcResult.approvalRequired ? 'PRICING_APPROVAL_REQUIRED' : 'PRICING_CALCULATED',
      },
    });

    pricedLinesOutput.push({ lineId: line.id, lineNumber: line.lineNumber, snapshot, calcResult });
  }

  // Update Quotation Header with selling price and commercial status
  const finalQuoStatus = hasApprovalRequired ? 'PRICING_APPROVAL_REQUIRED' : 'PRICING_CALCULATED';
  const updatedQuotation = await prisma.commercialQuotation.update({
    where: { id: quotation.id },
    data: {
      sellingPrice: totalQuotationSellingPrice,
      commercialPricingStatus: finalQuoStatus,
    },
    include: {
      lines: { include: { pricingSnapshot: true } },
      inquiry: true,
    },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${quotation.quotationNumber}-V${quotation.versionNo}`,
    action: 'UPDATE',
    newValue: {
      quotationNumber: quotation.quotationNumber,
      versionNo: quotation.versionNo,
      sellingPrice: totalQuotationSellingPrice,
      commercialPricingStatus: finalQuoStatus,
      hasApprovalRequired,
    },
    message: `Priced Quotation ${quotation.quotationNumber} V${quotation.versionNo} -> Total Selling Price: ${totalQuotationSellingPrice} ${quotation.currency}`,
  });

  return {
    quotation: updatedQuotation,
    pricedLines: pricedLinesOutput,
    totalSellingPrice: totalQuotationSellingPrice,
    commercialPricingStatus: finalQuoStatus,
  };
}

export async function submitQuotationForApproval(
  quotationId: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const resolvedSubmitId = await resolveCommercialQuotationId(quotationId);
  const current = resolvedSubmitId
    ? await prisma.commercialQuotation.findUnique({ where: { id: resolvedSubmitId } })
    : null;
  if (!current) throw Object.assign(new Error('Quotation not found'), { code: 'NOT_FOUND' });

  if ((current as { commercialApprovalStatus?: string }).commercialApprovalStatus === 'APPROVED') {
    throw Object.assign(
      new Error(
        `Commercially approved quotation ${current.quotationNumber} V${current.versionNo} is immutable. Create a new revision to change pricing workflow.`
      ),
      { code: 'BUSINESS_RULE_REQUIRED' }
    );
  }

  const updated = await prisma.commercialQuotation.update({
    where: { id: current.id },
    data: { commercialPricingStatus: 'PRICING_APPROVAL_REQUIRED' },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${current.quotationNumber}-V${current.versionNo}`,
    action: 'SUBMIT',
    message: `Submitted commercial quotation ${current.quotationNumber} V${current.versionNo} for management pricing approval`,
  });

  return updated;
}

export async function approveQuotationPricing(
  quotationId: string,
  options: { comment?: string },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const resolvedApproveId = await resolveCommercialQuotationId(quotationId);
  const current = resolvedApproveId
    ? await prisma.commercialQuotation.findUnique({
        where: { id: resolvedApproveId },
        include: { lines: { include: { pricingSnapshot: true } } },
      })
    : null;
  if (!current) throw Object.assign(new Error('Quotation not found'), { code: 'NOT_FOUND' });

  // Update all lines & snapshots as APPROVED
  for (const l of current.lines) {
    if (l.pricingSnapshot) {
      await prisma.commercialPricingSnapshot.update({
        where: { id: l.pricingSnapshot.id },
        data: {
          pricingStatus: 'PRICING_APPROVED',
          approvalRequired: false,
          approvedBy: actor.name || actor.email || 'manager',
          approvedAt: new Date(),
        },
      });
    }
    await prisma.commercialQuotationLine.update({
      where: { id: l.id },
      data: { commercialStatus: 'PRICING_APPROVED' },
    });
  }

  const updated = await prisma.commercialQuotation.update({
    where: { id: current.id },
    data: { commercialPricingStatus: 'PRICING_APPROVED' },
    include: { lines: { include: { pricingSnapshot: true } } },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CommercialQuotation',
    entityId: `${current.quotationNumber}-V${current.versionNo}`,
    action: 'APPROVE',
    message: `Formally approved commercial selling price for ${current.quotationNumber} V${current.versionNo}`,
  });

  return updated;
}
