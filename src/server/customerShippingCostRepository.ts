import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAuditTx } from './serverAudit';
import { issue } from '../platform/errors/domainError';
import { dateOnlyToUtc, formatDateOnlyUtc, parseDateOnly } from '../domain/shippingCostCanonical';
import {
  CANONICAL_CONTAINER_TYPES,
  CANONICAL_DELIVERY_POINTS,
  ELAND_SHIPPING_COST_SEED,
  ELAND_SHIPPING_EFFECTIVE_FROM,
  SHIPPING_COST_APPLIED,
  SHIPPING_COST_NOT_CONFIGURED,
  attachShippingFacts,
  dayBefore,
  isCanonicalContainerType,
  isCanonicalDeliveryPoint,
  notConfiguredShippingFinancial,
  presentUnresolvedShippingAsCalculatedZero,
  proposedWindowOverlaps,
  resolveCustomerShippingCostFromRows,
  resolveShippingLookupFromContainerStudy,
  type CustomerShippingRateRow,
  type FrozenShippingFacts,
  type ShippingCostFinancialResult,
} from '../domain/customerShippingCost';
import { listDestinationPorts } from './shippingCostRepository';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorId(actor: RequestActor | { id?: string | null; name?: string | null; email?: string | null }): string | null {
  return actor.id || actor.email || actor.name || null;
}

function fail(issueCode: string, message: string, extra?: Record<string, unknown>): never {
  throw issue('VALIDATION_FAILED', message, { issueCode, ...extra });
}

type RateRecord = {
  id: string;
  customerId: string;
  deliveryPoint: string;
  incotermId: string;
  containerType: string;
  amount: Prisma.Decimal;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: 'ACTIVE' | 'SUPERSEDED';
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: { id: string; code: string; name: string };
  incoterm?: { id: string; code: string; name: string };
};

function toRow(row: RateRecord): CustomerShippingRateRow {
  return {
    id: row.id,
    customerId: row.customerId,
    deliveryPoint: row.deliveryPoint,
    incotermId: row.incotermId,
    containerType: row.containerType,
    amount: Number(row.amount),
    currency: row.currency,
    effectiveFrom: formatDateOnlyUtc(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? formatDateOnlyUtc(row.effectiveTo) : null,
    status: row.status,
    version: row.version,
  };
}

export function serializeCustomerShippingCostRate(row: RateRecord) {
  const match = toRow(row);
  return {
    ...match,
    amount: match.amount,
    customerCode: row.customer?.code ?? null,
    customerName: row.customer?.name ?? null,
    incotermCode: row.incoterm?.code ?? null,
    incotermName: row.incoterm?.name ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const rateInclude = { customer: true, incoterm: true } as const;

function parseAmount(value: unknown): Prisma.Decimal {
  if (value === null || value === undefined || value === '') {
    fail('INVALID_RATE_AMOUNT', 'Shipping cost is required and must be greater than zero.');
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    fail('INVALID_RATE_AMOUNT', 'Shipping cost must be greater than zero.');
  }
  return new Prisma.Decimal(Number(num).toFixed(2));
}

function parseRequiredDate(value: unknown, label: string): string {
  const iso = parseDateOnly(value);
  if (!iso) fail('INVALID_DATE_RANGE', `${label} must be a calendar date (YYYY-MM-DD).`);
  return iso;
}

function parseOptionalDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return parseRequiredDate(value, label);
}

function parseCurrency(value: unknown): string {
  const currency = String(value ?? 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail('INVALID_CURRENCY', 'Currency must be a 3-letter code.');
  return currency;
}

async function allowedDeliveryPoints(prisma: ReturnType<typeof requirePrisma>): Promise<string[]> {
  const existing = await prisma.customerShippingCostRate.findMany({
    distinct: ['deliveryPoint'],
    select: { deliveryPoint: true },
  });
  const points = new Set<string>(CANONICAL_DELIVERY_POINTS);
  for (const row of existing) points.add(row.deliveryPoint);
  return [...points];
}

export async function listCustomerShippingCostOptions() {
  const prisma = requirePrisma();
  const [customers, incoterms, deliveryPoints] = await Promise.all([
    prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.incoterm.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    allowedDeliveryPoints(prisma),
  ]);
  return {
    customers,
    incoterms,
    deliveryPoints,
    containerTypes: [...CANONICAL_CONTAINER_TYPES],
    currencies: ['USD'],
  };
}

export async function listCustomerShippingCostRates(filter?: { status?: 'ACTIVE' | 'SUPERSEDED' }) {
  const prisma = requirePrisma();
  const rows = await prisma.customerShippingCostRate.findMany({
    where: filter?.status ? { status: filter.status } : { status: 'ACTIVE' },
    include: rateInclude,
    orderBy: [{ customer: { name: 'asc' } }, { deliveryPoint: 'asc' }, { containerType: 'asc' }, { version: 'desc' }],
  });
  return rows.map(serializeCustomerShippingCostRate);
}

export async function listCustomerShippingCostHistory(key: {
  customerId: string;
  deliveryPoint: string;
  incotermId: string;
  containerType: string;
}) {
  const prisma = requirePrisma();
  const rows = await prisma.customerShippingCostRate.findMany({
    where: {
      customerId: key.customerId,
      deliveryPoint: key.deliveryPoint,
      incotermId: key.incotermId,
      containerType: key.containerType,
    },
    include: rateInclude,
    orderBy: { version: 'desc' },
  });
  return rows.map(serializeCustomerShippingCostRate);
}

/**
 * Creates version 1 or closes the current ACTIVE window and inserts version N+1.
 * Never updates the amount on an existing row.
 */
export async function createCustomerShippingCostRate(
  input: {
    customerId?: unknown;
    deliveryPoint?: unknown;
    incotermId?: unknown;
    containerType?: unknown;
    amount?: unknown;
    currency?: unknown;
    effectiveFrom?: unknown;
    effectiveTo?: unknown;
    status?: unknown;
  },
  actor: RequestActor
) {
  if (input.status != null && String(input.status).trim() && String(input.status).trim().toUpperCase() !== 'ACTIVE') {
    fail('INVALID_STATUS', 'A new shipping cost rate is saved as ACTIVE. Previous versions are superseded automatically.');
  }
  const customerId = String(input.customerId ?? '').trim();
  const deliveryPoint = String(input.deliveryPoint ?? '').trim();
  const incotermId = String(input.incotermId ?? '').trim();
  const containerType = String(input.containerType ?? '').trim();
  if (!customerId) fail('CUSTOMER_REQUIRED', 'Customer is required.');
  if (!deliveryPoint) fail('DELIVERY_POINT_REQUIRED', 'Delivery point is required.');
  if (!incotermId) fail('INCOTERM_REQUIRED', 'Incoterm is required.');
  if (!isCanonicalContainerType(containerType)) {
    fail('CONTAINER_TYPE_INVALID', `Container type must be ${CANONICAL_CONTAINER_TYPES.join(' or ')}.`);
  }
  const amount = parseAmount(input.amount);
  const currency = parseCurrency(input.currency ?? 'USD');
  const effectiveFrom = parseRequiredDate(input.effectiveFrom, 'Effective From');
  const effectiveTo = parseOptionalDate(input.effectiveTo, 'Effective To');
  if (effectiveTo && effectiveTo < effectiveFrom) {
    fail('INVALID_DATE_RANGE', 'Effective To cannot be before Effective From.');
  }

  const prisma = requirePrisma();
  const points = await allowedDeliveryPoints(prisma);
  if (!points.includes(deliveryPoint) && !isCanonicalDeliveryPoint(deliveryPoint)) {
    fail('DELIVERY_POINT_INVALID', 'Select a delivery point from the list.');
  }
  const [customer, incoterm] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
    prisma.incoterm.findUnique({ where: { id: incotermId }, select: { id: true, active: true, code: true } }),
  ]);
  if (!customer) fail('CUSTOMER_NOT_FOUND', 'Customer was not found.');
  if (!incoterm) fail('INCOTERM_NOT_FOUND', 'Incoterm was not found.');
  if (!incoterm.active) fail('INCOTERM_INACTIVE', `Incoterm ${incoterm.code} is inactive.`);

  const created = await prisma.$transaction(async (tx) => {
    const family = await tx.customerShippingCostRate.findMany({
      where: { customerId, deliveryPoint, incotermId, containerType },
      orderBy: { version: 'desc' },
    });
    const active = family.filter((row) => row.status === 'ACTIVE');
    if (active.length > 1) {
      fail('RATE_OVERLAP', 'More than one ACTIVE shipping cost rate exists for this key.');
    }
    const current = active[0] ?? null;
    let closeTo: string | null = null;
    if (current) {
      const currentFrom = formatDateOnlyUtc(current.effectiveFrom);
      if (effectiveFrom <= currentFrom) {
        fail(
          'EFFECTIVE_FROM_NOT_AFTER_CURRENT',
          'Effective From must be after the current version Effective From. Save a new version instead of changing history.'
        );
      }
      closeTo = dayBefore(effectiveFrom);
      if (closeTo < currentFrom) {
        fail('EFFECTIVE_FROM_NOT_AFTER_CURRENT', 'Effective From must leave the previous version a valid window.');
      }
    }
    const windows = family.map((row) => ({
      id: row.id,
      effectiveFrom: formatDateOnlyUtc(row.effectiveFrom),
      effectiveTo:
        current && row.id === current.id ? closeTo : row.effectiveTo ? formatDateOnlyUtc(row.effectiveTo) : null,
    }));
    if (proposedWindowOverlaps(windows, { effectiveFrom, effectiveTo })) {
      fail('RATE_OVERLAP', 'The new effective window overlaps another version of this shipping cost rate.');
    }
    const version = (family[0]?.version ?? 0) + 1;
    if (current && closeTo) {
      await tx.customerShippingCostRate.update({
        where: { id: current.id },
        data: {
          effectiveTo: dateOnlyToUtc(closeTo),
          status: 'SUPERSEDED',
          updatedBy: actorId(actor),
        },
      });
    }
    const row = await tx.customerShippingCostRate.create({
      data: {
        customerId,
        deliveryPoint,
        incotermId,
        containerType,
        amount,
        currency,
        effectiveFrom: dateOnlyToUtc(effectiveFrom),
        effectiveTo: effectiveTo ? dateOnlyToUtc(effectiveTo) : null,
        status: 'ACTIVE',
        version,
        createdBy: actorId(actor),
        updatedBy: actorId(actor),
      },
      include: rateInclude,
    });
    const action = version === 1 ? 'CREATE' : 'CREATE NEW VERSION';
    await appendServerAuditTx(tx, {
      actorId: actor.id || null,
      actorName: actor.name || actor.email || null,
      entity: 'CustomerShippingCostRate',
      entityId: row.id,
      action,
      newValue: {
        customerId,
        deliveryPoint,
        incotermId,
        incotermCode: row.incoterm.code,
        containerType,
        amount: Number(amount),
        currency,
        effectiveFrom,
        effectiveTo,
        version,
        previousVersion: version === 1 ? null : version - 1,
      },
      message:
        version === 1
          ? `Created shipping cost rate version 1 effective ${effectiveFrom}.`
          : `Created version ${version} effective ${effectiveFrom}. Previous version ${version - 1}.`,
    });
    return row;
  });
  return serializeCustomerShippingCostRate(created);
}

/** Historical rows cannot be edited. Any in-place amount or key change is rejected. */
export async function rejectInPlaceShippingCostEdit(id: string, patch: Record<string, unknown>): Promise<never> {
  const prisma = requirePrisma();
  const row = await prisma.customerShippingCostRate.findUnique({ where: { id } });
  if (!row) throw issue('NOT_FOUND', 'Shipping cost rate was not found.');
  const before = Number(row.amount);
  fail(
    'RATE_AMOUNT_IMMUTABLE',
    'Historical shipping cost rates cannot be edited in place. Save a new rate version.',
    { id, amount: before, rejectedFields: Object.keys(patch) }
  );
}

export async function resolveCustomerShippingCostRate(input: {
  customerId?: unknown;
  deliveryPoint?: unknown;
  incotermId?: unknown;
  containerType?: unknown;
  effectiveDate?: unknown;
}): Promise<ShippingCostFinancialResult> {
  const customerId = String(input.customerId ?? '').trim();
  const deliveryPoint = String(input.deliveryPoint ?? '').trim();
  const incotermId = String(input.incotermId ?? '').trim();
  const containerType = String(input.containerType ?? '').trim();
  const effectiveDate = parseDateOnly(input.effectiveDate);
  if (!customerId || !deliveryPoint || !incotermId || !containerType || !effectiveDate) {
    return notConfiguredShippingFinancial({
      deliveryPoint: deliveryPoint || null,
      incotermId: incotermId || null,
      containerType: containerType || null,
    });
  }
  const prisma = requirePrisma();
  const incoterm = await prisma.incoterm.findUnique({ where: { id: incotermId }, select: { id: true, code: true } });
  const rows = await prisma.customerShippingCostRate.findMany({
    where: { customerId, deliveryPoint, incotermId, containerType },
  });
  const resolved = resolveCustomerShippingCostFromRows(rows.map(toRow), {
    customerId,
    deliveryPoint,
    incotermId,
    containerType,
    effectiveDate,
  });
  if (resolved.resolutionCode !== SHIPPING_COST_APPLIED || !resolved.rate || resolved.amount == null || resolved.amount <= 0) {
    return notConfiguredShippingFinancial({
      deliveryPoint,
      incotermId,
      incotermCode: incoterm?.code ?? null,
      containerType,
    });
  }
  return {
    resolutionCode: SHIPPING_COST_APPLIED,
    amount: resolved.amount,
    currency: resolved.rate.currency,
    shippingCostRateId: resolved.rate.id,
    shippingRateVersion: resolved.rate.version,
    deliveryPoint,
    incotermId,
    incotermCode: incoterm?.code ?? null,
    containerType,
    appliedAt: null,
    blocksPacking: false,
  };
}

function snapshotToFinancial(row: {
  resolutionCode: string;
  amount: Prisma.Decimal | null;
  currency: string | null;
  shippingCostRateId: string | null;
  shippingRateVersion: number | null;
  deliveryPoint: string | null;
  incotermId: string | null;
  containerType: string | null;
  appliedAt: Date | null;
  incoterm?: { code: string } | null;
}): ShippingCostFinancialResult {
  const amount = row.amount == null ? 0 : Number(row.amount);
  return {
    resolutionCode: row.resolutionCode,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: row.currency,
    shippingCostRateId: row.shippingCostRateId,
    shippingRateVersion: row.shippingRateVersion,
    deliveryPoint: row.deliveryPoint,
    incotermId: row.incotermId,
    incotermCode: row.incoterm?.code ?? null,
    containerType: row.containerType,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    blocksPacking: false,
  };
}

async function lookupInputsForInquiry(inquiryId: string) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      customerMasterId: true,
      containerStudies: {
        where: { status: { in: ['DRAFT', 'VALIDATED', 'CONFIRMED'] } },
        orderBy: [{ versionNo: 'desc' }, { updatedAt: 'desc' }],
        take: 1,
        select: {
          currentResultId: true,
          currentSnapshot: { select: { lineageProvenanceJson: true } },
          currentResult: { select: { containers: { select: { typeCode: true } } } },
          shipmentGroup: {
            select: { status: true, incotermCode: true, destinationPortCode: true },
          },
        },
      },
    },
  });
  if (!inquiry) return null;
  const study = inquiry.containerStudies[0];
  const destinationPorts = await listDestinationPorts();
  const grain = resolveShippingLookupFromContainerStudy({
    lineageJson: study?.currentSnapshot?.lineageProvenanceJson ?? null,
    shipmentGroup: study?.shipmentGroup ?? null,
    resultContainers: study?.currentResult?.containers ?? [],
    destinationPorts,
  });
  return {
    inquiry,
    deliveryPoint: grain.deliveryPoint,
    containerType: grain.containerType,
    incotermCode: grain.incotermCode,
    resultId: study?.currentResultId ?? null,
    containerQuantity: grain.containerQuantity,
    typeCode: grain.typeCode,
    destinationPortCode: grain.destinationPortCode,
  };
}

export async function previewInquiryShippingCost(inquiryId: string, effectiveDate: string): Promise<ShippingCostFinancialResult> {
  const looked = await lookupInputsForInquiry(inquiryId);
  if (!looked) {
    return presentUnresolvedShippingAsCalculatedZero(notConfiguredShippingFinancial());
  }
  const prisma = requirePrisma();
  if (looked.resultId) {
    const existing = await prisma.shippingCostTransactionSnapshot.findUnique({
      where: { containerStudyResultId: looked.resultId },
      include: { incoterm: true },
    });
    if (existing) return presentUnresolvedShippingAsCalculatedZero(snapshotToFinancial(existing));
  }
  if (!looked.inquiry.customerMasterId || !looked.deliveryPoint || !looked.containerType || !looked.incotermCode) {
    return presentUnresolvedShippingAsCalculatedZero(
      notConfiguredShippingFinancial({
        deliveryPoint: looked.deliveryPoint ?? null,
        containerType: looked.containerType ?? null,
        incotermCode: looked.incotermCode ?? null,
      })
    );
  }
  const incoterm = await prisma.incoterm.findUnique({ where: { code: looked.incotermCode }, select: { id: true, code: true } });
  if (!incoterm) {
    return presentUnresolvedShippingAsCalculatedZero(
      notConfiguredShippingFinancial({
        deliveryPoint: looked.deliveryPoint,
        containerType: looked.containerType,
        incotermCode: looked.incotermCode,
      })
    );
  }
  return presentUnresolvedShippingAsCalculatedZero(
    await resolveCustomerShippingCostRate({
      customerId: looked.inquiry.customerMasterId,
      deliveryPoint: looked.deliveryPoint,
      incotermId: incoterm.id,
      containerType: looked.containerType,
      effectiveDate,
    })
  );
}

/**
 * Persist the financial shipping result for one container-study result.
 * A later master version does not rewrite an existing snapshot. Packing is never blocked.
 */
export async function recordContainerStudyShippingSnapshot(input: {
  containerStudyResultId: string;
  inquiryId: string;
  effectiveDate: string;
  actor: RequestActor;
}): Promise<ShippingCostFinancialResult> {
  const prisma = requirePrisma();
  const existing = await prisma.shippingCostTransactionSnapshot.findUnique({
    where: { containerStudyResultId: input.containerStudyResultId },
    include: { incoterm: true },
  });
  if (existing) return snapshotToFinancial(existing);

  const looked = await lookupInputsForInquiry(input.inquiryId);
  const incoterm = looked?.incotermCode
    ? await prisma.incoterm.findUnique({ where: { code: looked.incotermCode }, select: { id: true, code: true } })
    : null;
  const resolved =
    looked?.inquiry.customerMasterId && looked.deliveryPoint && looked.containerType && incoterm
      ? await resolveCustomerShippingCostRate({
          customerId: looked.inquiry.customerMasterId,
          deliveryPoint: looked.deliveryPoint,
          incotermId: incoterm.id,
          containerType: looked.containerType,
          effectiveDate: input.effectiveDate,
        })
      : notConfiguredShippingFinancial({
          deliveryPoint: looked?.deliveryPoint ?? null,
          containerType: looked?.containerType ?? null,
          incotermCode: looked?.incotermCode ?? null,
        });

  const applied = resolved.resolutionCode === SHIPPING_COST_APPLIED && resolved.amount != null && resolved.amount > 0;
  const row = await prisma.shippingCostTransactionSnapshot.create({
    data: {
      resolutionCode: applied ? SHIPPING_COST_APPLIED : SHIPPING_COST_NOT_CONFIGURED,
      customerId: looked?.inquiry.customerMasterId ?? null,
      deliveryPoint: resolved.deliveryPoint,
      incotermId: applied ? resolved.incotermId : incoterm?.id ?? null,
      containerType: resolved.containerType,
      shippingCostRateId: applied ? resolved.shippingCostRateId : null,
      shippingRateVersion: applied ? resolved.shippingRateVersion : null,
      amount: applied ? new Prisma.Decimal(resolved.amount!.toFixed(2)) : new Prisma.Decimal(0),
      currency: applied ? resolved.currency : null,
      blocksPacking: false,
      containerStudyResultId: input.containerStudyResultId,
      appliedAt: new Date(),
    },
    include: { incoterm: true },
  });
  return snapshotToFinancial(row);
}

export async function findAppliedShippingForInquiry(inquiryId: string): Promise<FrozenShippingFacts | null> {
  const prisma = requirePrisma();
  const row = await prisma.shippingCostTransactionSnapshot.findFirst({
    where: {
      resolutionCode: SHIPPING_COST_APPLIED,
      amount: { not: null },
      containerStudyResult: { study: { inquiryId } },
    },
    include: { incoterm: true },
    orderBy: { appliedAt: 'desc' },
  });
  if (!row || row.amount == null || !row.shippingCostRateId || row.shippingRateVersion == null) return null;
  if (!row.deliveryPoint || !row.incotermId || !row.containerType || !row.currency) return null;
  return {
    amount: Number(row.amount),
    currency: row.currency,
    shippingCostRateId: row.shippingCostRateId,
    shippingRateVersion: row.shippingRateVersion,
    deliveryPoint: row.deliveryPoint,
    incotermId: row.incotermId,
    incotermCode: row.incoterm?.code ?? null,
    containerType: row.containerType,
    appliedAt: row.appliedAt.toISOString(),
  };
}

/**
 * Freeze shipping facts on a quotation commercial-offer snapshot.
 * Copies the stored amount. Does not re-read the master and does not change selling totals.
 */
export async function freezeQuotationShippingSnapshot(input: {
  quotationId: string;
  facts: FrozenShippingFacts;
}): Promise<{ commercialOfferSnapshot: unknown; amount: number }> {
  const prisma = requirePrisma();
  const quotation = await prisma.commercialQuotation.findUnique({
    where: { id: input.quotationId },
    select: { id: true, commercialOfferSnapshot: true, shippingCostSnapshot: true },
  });
  if (!quotation) throw issue('NOT_FOUND', 'Quotation was not found.');
  if (quotation.shippingCostSnapshot) {
    const stored = quotation.shippingCostSnapshot;
    const amount = stored.amount == null ? null : Number(stored.amount);
    return { commercialOfferSnapshot: quotation.commercialOfferSnapshot, amount: amount ?? input.facts.amount };
  }
  const rate = await prisma.customerShippingCostRate.findUnique({
    where: { id: input.facts.shippingCostRateId },
    select: { customerId: true },
  });
  const base =
    quotation.commercialOfferSnapshot && typeof quotation.commercialOfferSnapshot === 'object'
      ? (quotation.commercialOfferSnapshot as Record<string, unknown>)
      : {};
  const merged = attachShippingFacts(base, input.facts);
  const appliedAt = new Date(input.facts.appliedAt);
  await prisma.$transaction(async (tx) => {
    await tx.shippingCostTransactionSnapshot.create({
      data: {
        resolutionCode: SHIPPING_COST_APPLIED,
        customerId: rate?.customerId ?? null,
        deliveryPoint: input.facts.deliveryPoint,
        incotermId: input.facts.incotermId,
        containerType: input.facts.containerType,
        shippingCostRateId: input.facts.shippingCostRateId,
        shippingRateVersion: input.facts.shippingRateVersion,
        amount: new Prisma.Decimal(input.facts.amount.toFixed(2)),
        currency: input.facts.currency,
        appliedAt: Number.isNaN(appliedAt.getTime()) ? new Date() : appliedAt,
        blocksPacking: false,
        quotationId: input.quotationId,
      },
    });
    await tx.commercialQuotation.update({
      where: { id: input.quotationId },
      data: { commercialOfferSnapshot: merged as Prisma.InputJsonValue },
    });
  });
  return { commercialOfferSnapshot: merged, amount: input.facts.amount };
}

export async function seedElandCustomerShippingCostRates(actor?: RequestActor): Promise<{
  customerId: string;
  incotermIds: { DAP: string; CIF: string };
  created: number;
  skipped: number;
}> {
  const prisma = requirePrisma();
  const customer = await prisma.customer.findFirst({
    where: {
      OR: [{ code: 'C-ELAND' }, { name: { equals: 'ELAND Cables', mode: 'insensitive' } }],
    },
    select: { id: true, code: true },
  });
  if (!customer) {
    throw new Error('ELAND customer (code C-ELAND) was not found. Shipping cost seed was not applied.');
  }
  const [dap, cif] = await Promise.all([
    prisma.incoterm.findUnique({ where: { code: 'DAP' }, select: { id: true, code: true } }),
    prisma.incoterm.findUnique({ where: { code: 'CIF' }, select: { id: true, code: true } }),
  ]);
  if (!dap || !cif) {
    throw new Error('DAP and CIF incoterms must already exist. Shipping cost seed was not applied.');
  }
  const seedActor: RequestActor = actor ?? { id: 'seed', name: 'seed', userType: 'internal' };
  let created = 0;
  let skipped = 0;
  const incotermByCode: Record<string, string> = { DAP: dap.id, CIF: cif.id };
  for (const row of ELAND_SHIPPING_COST_SEED) {
    const incotermId = incotermByCode[row.incotermCode];
    const existing = await prisma.customerShippingCostRate.findFirst({
      where: {
        customerId: customer.id,
        deliveryPoint: row.deliveryPoint,
        incotermId,
        containerType: row.containerType,
        version: 1,
      },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await createCustomerShippingCostRate(
      {
        customerId: customer.id,
        deliveryPoint: row.deliveryPoint,
        incotermId,
        containerType: row.containerType,
        amount: row.amount,
        currency: 'USD',
        effectiveFrom: ELAND_SHIPPING_EFFECTIVE_FROM,
        effectiveTo: null,
        status: 'ACTIVE',
      },
      seedActor
    );
    created += 1;
  }
  return { customerId: customer.id, incotermIds: { DAP: dap.id, CIF: cif.id }, created, skipped };
}

export async function insertFrozenQuotationShippingSnapshot(
  tx: Prisma.TransactionClient,
  quotationId: string,
  facts: FrozenShippingFacts
) {
  const existing = await tx.shippingCostTransactionSnapshot.findUnique({ where: { quotationId } });
  if (existing) return existing;
  const rate = await tx.customerShippingCostRate.findUnique({
    where: { id: facts.shippingCostRateId },
    select: { customerId: true },
  });
  const appliedAt = new Date(facts.appliedAt);
  return tx.shippingCostTransactionSnapshot.create({
    data: {
      resolutionCode: SHIPPING_COST_APPLIED,
      customerId: rate?.customerId ?? null,
      deliveryPoint: facts.deliveryPoint,
      incotermId: facts.incotermId,
      containerType: facts.containerType,
      shippingCostRateId: facts.shippingCostRateId,
      shippingRateVersion: facts.shippingRateVersion,
      amount: new Prisma.Decimal(facts.amount.toFixed(2)),
      currency: facts.currency,
      appliedAt: Number.isNaN(appliedAt.getTime()) ? new Date() : appliedAt,
      blocksPacking: false,
      quotationId,
    },
  });
}

/** Facts to copy onto an issued commercial offer. Does not invent a zero amount. */
export async function shippingFactsToFreezeOnIssue(inquiryId: string, effectiveDate: string): Promise<FrozenShippingFacts | null> {
  const applied = await findAppliedShippingForInquiry(inquiryId);
  if (applied) return applied;
  const preview = await previewInquiryShippingCost(inquiryId, effectiveDate);
  if (
    preview.resolutionCode !== SHIPPING_COST_APPLIED ||
    preview.amount == null ||
    preview.amount <= 0 ||
    !preview.shippingCostRateId ||
    preview.shippingRateVersion == null ||
    !preview.deliveryPoint ||
    !preview.incotermId ||
    !preview.containerType ||
    !preview.currency
  ) {
    return null;
  }
  return {
    amount: preview.amount,
    currency: preview.currency,
    shippingCostRateId: preview.shippingCostRateId,
    shippingRateVersion: preview.shippingRateVersion,
    deliveryPoint: preview.deliveryPoint,
    incotermId: preview.incotermId,
    incotermCode: preview.incotermCode,
    containerType: preview.containerType,
    appliedAt: new Date().toISOString(),
  };
}

export async function loadQuotationShippingSnapshot(quotationId: string) {
  const prisma = requirePrisma();
  return prisma.shippingCostTransactionSnapshot.findUnique({
    where: { quotationId },
    include: { incoterm: true, shippingCostRate: true },
  });
}
