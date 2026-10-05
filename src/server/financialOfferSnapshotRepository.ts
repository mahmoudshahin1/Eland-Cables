import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit, appendServerAuditTx } from './serverAudit';
import { issue } from '../platform/errors/domainError';
import { assertCanAccessInquiryOwnership } from './rbac';
import { readInquiryProcessFromMetadata } from '../domain/inquiryProcessResolver';
import {
  SHIPPING_CHARGES_NOT_AVAILABLE,
  VIP_SHIPMENT_NOT_CONFIGURED,
  assertHomogeneousOfferCurrency,
  canonicalizeIdList,
  canonicalizePinSet,
  idListsMatch,
  isVipFastTrack,
  pinSetsEqual,
  type FinancialOfferPinSet,
  type FinancialOfferWarning,
} from '../domain/financialOfferSnapshotAggregation';
import {
  describeMissingPhysicalPackingInputs,
  projectCustomerContainerStudyGroup,
  projectCustomerContainerStudyVisibility,
  projectCustomerFinancialOffer,
  type CustomerContainerStudyGroupView,
  type CustomerFinancialOfferProjection,
} from '../domain/financialOfferCustomerProjection';

const OFFER_ENTITY = 'FinancialOfferSnapshot';

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
    issueCode === 'OFFER_NOT_FOUND' || issueCode === 'INQUIRY_NOT_FOUND'
      ? 'NOT_FOUND'
      : issueCode === 'OFFER_INPUT_MISMATCH'
        ? 'CONFLICT'
        : 'VALIDATION_FAILED';
  throw issue(code, message, { issueCode, ...extra });
}

function packingRowsFromStudyResult(result: {
  containers?: Array<{ typeCode?: string | null }>;
  summaryJson?: unknown;
} | null | undefined): Array<{ typeCode?: string | null }> {
  const table = result?.containers ?? [];
  if (table.length) return table;
  const typeCounts = (result?.summaryJson as { typeCounts?: Record<string, number> } | null)?.typeCounts;
  if (!typeCounts) return [];
  const rows: Array<{ typeCode: string }> = [];
  for (const [code, raw] of Object.entries(typeCounts)) {
    const n = Number(raw) || 0;
    for (let i = 0; i < n; i++) rows.push({ typeCode: code });
  }
  return rows;
}

export type FinancialOfferProductLineView = {
  id: string;
  inquiryLineId: string;
  commercialPricingSnapshotId: string;
  materialNumber: string;
  description: string;
  quantity: string;
  quantityUom: string;
  lengthMeters: string;
  unitPrice: string;
  lineTotal: string;
  currencyCode: string;
};

export type FinancialOfferShipmentTypeLineView = {
  id: string;
  containerTypeCode: string;
  containerQuantity: number;
  shippingCostRateId: string | null;
  rateAmount: string;
  currencyCode: string;
  lineTotal: string;
};

export type FinancialOfferShipmentLineView = {
  id: string;
  shipmentGroupId: string;
  shipmentCostSnapshotId: string | null;
  destinationPortCode: string;
  incotermCode: string;
  currencyCode: string;
  groupTotal: string;
  typeLines: FinancialOfferShipmentTypeLineView[];
};

export type FinancialOfferSnapshotView = {
  id: string;
  inquiryId: string;
  versionNo: number;
  isCurrent: boolean;
  supersedesOfferId: string | null;
  hostQuotationId: string;
  currencyCode: string;
  productsTotal: string;
  shipmentTotal: string;
  inquiryTotal: string;
  warnings: FinancialOfferWarning[];
  pricingSnapshotIds: string[];
  shipmentCostSnapshotIds: string[];
  createdBy: string | null;
  createdAt: Date;
  productLines: FinancialOfferProductLineView[];
  shipmentLines: FinancialOfferShipmentLineView[];
};

type OfferRow = {
  id: string;
  inquiryId: string;
  versionNo: number;
  isCurrent: boolean;
  supersedesOfferId: string | null;
  hostQuotationId: string;
  currencyCode: string;
  productsTotal: Prisma.Decimal;
  shipmentTotal: Prisma.Decimal;
  inquiryTotal: Prisma.Decimal;
  warningsJson: Prisma.JsonValue | null;
  pricingSnapshotIdsJson: Prisma.JsonValue;
  shipmentCostSnapshotIdsJson: Prisma.JsonValue;
  createdBy: string | null;
  createdAt: Date;
  productLines: Array<{
    id: string;
    inquiryLineId: string;
    commercialPricingSnapshotId: string;
    materialNumber: string;
    description: string;
    quantity: Prisma.Decimal;
    quantityUom: string;
    lengthMeters: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    currencyCode: string;
  }>;
  shipmentLines: Array<{
    id: string;
    shipmentGroupId: string;
    shipmentCostSnapshotId: string | null;
    destinationPortCode: string;
    incotermCode: string;
    currencyCode: string;
    groupTotal: Prisma.Decimal;
    typeLines: Array<{
      id: string;
      containerTypeCode: string;
      containerQuantity: number;
      shippingCostRateId: string | null;
      rateAmount: Prisma.Decimal;
      currencyCode: string;
      lineTotal: Prisma.Decimal;
    }>;
  }>;
};

const offerInclude = {
  productLines: true,
  shipmentLines: { include: { typeLines: true } },
} as const;

function asIdList(value: Prisma.JsonValue): string[] {
  return canonicalizeIdList(value);
}

function asWarnings(value: Prisma.JsonValue | null): FinancialOfferWarning[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const rec = row as Record<string, unknown>;
      if (rec.code !== VIP_SHIPMENT_NOT_CONFIGURED && rec.code !== SHIPPING_CHARGES_NOT_AVAILABLE) return null;
      const warning: FinancialOfferWarning = {
        code: rec.code === VIP_SHIPMENT_NOT_CONFIGURED ? VIP_SHIPMENT_NOT_CONFIGURED : SHIPPING_CHARGES_NOT_AVAILABLE,
      };
      if (typeof rec.shipmentGroupId === 'string' && rec.shipmentGroupId.trim()) {
        warning.shipmentGroupId = rec.shipmentGroupId.trim();
      }
      return warning;
    })
    .filter((row): row is FinancialOfferWarning => Boolean(row));
}

function serializeOffer(row: OfferRow): FinancialOfferSnapshotView {
  const productLines = [...row.productLines]
    .sort((a, b) => a.inquiryLineId.localeCompare(b.inquiryLineId))
    .map((line) => ({
      id: line.id,
      inquiryLineId: line.inquiryLineId,
      commercialPricingSnapshotId: line.commercialPricingSnapshotId,
      materialNumber: line.materialNumber,
      description: line.description,
      quantity: line.quantity.toString(),
      quantityUom: line.quantityUom,
      lengthMeters: line.lengthMeters.toString(),
      unitPrice: line.unitPrice.toString(),
      lineTotal: line.lineTotal.toString(),
      currencyCode: line.currencyCode,
    }));
  const shipmentLines = [...row.shipmentLines]
    .sort((a, b) => a.shipmentGroupId.localeCompare(b.shipmentGroupId))
    .map((line) => ({
      id: line.id,
      shipmentGroupId: line.shipmentGroupId,
      shipmentCostSnapshotId: line.shipmentCostSnapshotId,
      destinationPortCode: line.destinationPortCode,
      incotermCode: line.incotermCode,
      currencyCode: line.currencyCode,
      groupTotal: line.groupTotal.toString(),
      typeLines: [...line.typeLines]
        .sort((a, b) => a.containerTypeCode.localeCompare(b.containerTypeCode))
        .map((typeLine) => ({
          id: typeLine.id,
          containerTypeCode: typeLine.containerTypeCode,
          containerQuantity: typeLine.containerQuantity,
          shippingCostRateId: typeLine.shippingCostRateId,
          rateAmount: typeLine.rateAmount.toString(),
          currencyCode: typeLine.currencyCode,
          lineTotal: typeLine.lineTotal.toString(),
        })),
    }));
  return {
    id: row.id,
    inquiryId: row.inquiryId,
    versionNo: row.versionNo,
    isCurrent: row.isCurrent,
    supersedesOfferId: row.supersedesOfferId,
    hostQuotationId: row.hostQuotationId,
    currencyCode: row.currencyCode,
    productsTotal: row.productsTotal.toString(),
    shipmentTotal: row.shipmentTotal.toString(),
    inquiryTotal: row.inquiryTotal.toString(),
    warnings: asWarnings(row.warningsJson),
    pricingSnapshotIds: asIdList(row.pricingSnapshotIdsJson),
    shipmentCostSnapshotIds: asIdList(row.shipmentCostSnapshotIdsJson),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    productLines,
    shipmentLines,
  };
}

function auditNewValue(view: FinancialOfferSnapshotView) {
  return {
    inquiryId: view.inquiryId,
    hostQuotationId: view.hostQuotationId,
    versionNo: view.versionNo,
    currencyCode: view.currencyCode,
    productsTotal: view.productsTotal,
    shipmentTotal: view.shipmentTotal,
    inquiryTotal: view.inquiryTotal,
    pricingSnapshotIds: view.pricingSnapshotIds,
    shipmentCostSnapshotIds: view.shipmentCostSnapshotIds,
    warnings: view.warnings,
    productLines: view.productLines.map((line) => ({
      inquiryLineId: line.inquiryLineId,
      commercialPricingSnapshotId: line.commercialPricingSnapshotId,
      lineTotal: line.lineTotal,
      currencyCode: line.currencyCode,
    })),
    shipmentLines: view.shipmentLines.map((line) => ({
      shipmentGroupId: line.shipmentGroupId,
      shipmentCostSnapshotId: line.shipmentCostSnapshotId,
      groupTotal: line.groupTotal,
      currencyCode: line.currencyCode,
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
    entity: OFFER_ENTITY,
    entityId: input.entityId,
    action: 'FINANCIAL_OFFER_SNAPSHOT_CREATE_FAILED',
    newValue: { issueCode: input.issueCode, ...(input.details || {}) },
    message: input.message,
  });
}

function storedPinSet(view: FinancialOfferSnapshotView): FinancialOfferPinSet {
  return canonicalizePinSet({
    pricingSnapshotIds: view.pricingSnapshotIds,
    shipmentCostSnapshotIds: view.shipmentCostSnapshotIds,
    currencyCode: view.currencyCode,
  });
}

type ResolvedProductLine = {
  inquiryLineId: string;
  commercialPricingSnapshotId: string;
  materialNumber: string;
  description: string;
  quantity: Prisma.Decimal;
  quantityUom: string;
  lengthMeters: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  currencyCode: string;
};

type ResolvedShipmentLine = {
  shipmentGroupId: string;
  shipmentCostSnapshotId: string | null;
  destinationPortCode: string;
  incotermCode: string;
  currencyCode: string;
  groupTotal: Prisma.Decimal;
  warning?: FinancialOfferWarning;
  typeLines: Array<{
    containerTypeCode: string;
    containerQuantity: number;
    shippingCostRateId: string | null;
    rateAmount: Prisma.Decimal;
    currencyCode: string;
    lineTotal: Prisma.Decimal;
  }>;
};

type GroupGraph = {
  id: string;
  status: string;
  destinationPortCode: string | null;
  incotermCode: string | null;
  studies: Array<{
    status: string;
    createdAt: Date;
    currentResultId: string | null;
    currentResult: {
      id: string;
      unallocated: Array<{ id: string }>;
      shipmentCostSnapshot: {
        id: string;
        inquiryId: string;
        shipmentGroupId: string;
        totalAmount: Prisma.Decimal;
        currencyCode: string;
        destinationPortCode: string;
        incotermCode: string;
        containerStudyResult: { study: { status: string } };
        lines: Array<{
          containerTypeCode: string;
          containerQuantity: number;
          shippingCostRateId: string;
          rateAmount: Prisma.Decimal;
          currencyCode: string;
          lineTotal: Prisma.Decimal;
        }>;
      } | null;
    } | null;
  }>;
};

function pickConfirmedSnapshot(group: GroupGraph) {
  const ranked = [...group.studies].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const confirmed = ranked.find((study) => study.status === 'CONFIRMED' && study.currentResult?.shipmentCostSnapshot);
  if (confirmed?.currentResult?.shipmentCostSnapshot) {
    return { study: confirmed, result: confirmed.currentResult, snapshot: confirmed.currentResult.shipmentCostSnapshot };
  }
  const superseded = ranked.find(
    (study) => study.status === 'SUPERSEDED' && study.currentResult?.shipmentCostSnapshot
  );
  if (superseded?.currentResult?.shipmentCostSnapshot) {
    return { study: superseded, result: superseded.currentResult, snapshot: superseded.currentResult.shipmentCostSnapshot };
  }
  return null;
}

export async function createFinancialOfferSnapshot(
  input: {
    inquiryId?: unknown;
    commercialPricingSnapshotIds?: unknown;
    shipmentCostSnapshotIds?: unknown;
    customerId?: unknown;
  },
  actor: RequestActor
): Promise<{ snapshot: FinancialOfferSnapshotView; created: boolean }> {
  const prisma = requirePrisma();
  const inquiryId = String(input.inquiryId ?? '').trim();
  if (!inquiryId) fail('INQUIRY_NOT_FOUND', 'inquiryId is required.');

  try {
    return await prisma.$transaction(async (tx) => {
      const inquiry = await tx.commercialInquiry.findUnique({
        where: { id: inquiryId },
        include: { lines: true },
      });
      if (!inquiry) fail('INQUIRY_NOT_FOUND', 'Inquiry was not found.');
      assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);

      const process = readInquiryProcessFromMetadata(inquiry.commercialMetadata);
      const vip = isVipFastTrack(process?.processCode);

      const quotation = await tx.commercialQuotation.findFirst({
        where: { inquiryId, isCurrent: true, status: { in: ['DRAFT', 'OPEN'] } },
        include: {
          lines: { include: { pricingSnapshot: true } },
        },
      });
      if (!quotation) {
        fail(
          'PRICING_SNAPSHOT_REQUIRED',
          'Financial offer requires a current unissued quotation (DRAFT or OPEN) hosting CommercialPricingSnapshot rows.'
        );
      }

      const inquiryLines = [...inquiry.lines].sort((a, b) => a.lineNumber - b.lineNumber || a.id.localeCompare(b.id));
      if (!inquiryLines.length) {
        fail('PRICING_SNAPSHOT_REQUIRED', 'Inquiry has no cable lines to price.');
      }

      const productLines: ResolvedProductLine[] = [];
      for (const inquiryLine of inquiryLines) {
        const quotationLine = quotation.lines.find((line) => line.inquiryLineId === inquiryLine.id);
        const snapshot = quotationLine?.pricingSnapshot;
        if (!quotationLine || !snapshot) {
          fail('PRICING_SNAPSHOT_REQUIRED', `Inquiry line ${inquiryLine.id} has no CommercialPricingSnapshot on the DRAFT quotation.`, {
            inquiryLineId: inquiryLine.id,
          });
        }
        if (snapshot.quotationId !== quotation.id) {
          fail('PRICING_SNAPSHOT_STALE', 'Pricing snapshot is not hosted by the current DRAFT quotation.', {
            commercialPricingSnapshotId: snapshot.id,
          });
        }
        productLines.push({
          inquiryLineId: inquiryLine.id,
          commercialPricingSnapshotId: snapshot.id,
          materialNumber: snapshot.materialNumber,
          description: quotationLine.itemDescription,
          quantity: quotationLine.quantity,
          quantityUom: quotationLine.quantityUom,
          lengthMeters: quotationLine.lengthMeters,
          unitPrice: snapshot.unitSellingPrice,
          lineTotal: snapshot.finalSellingPrice,
          currencyCode: snapshot.currency,
        });
      }

      const resolvedPricingIds = productLines.map((line) => line.commercialPricingSnapshotId);
      if (!idListsMatch(resolvedPricingIds, input.commercialPricingSnapshotIds)) {
        const supplied = canonicalizeIdList(input.commercialPricingSnapshotIds);
        const foreign = await tx.commercialPricingSnapshot.findMany({
          where: { id: { in: supplied } },
          include: { quotationLine: { include: { quotation: { select: { inquiryId: true } } } } },
        });
        const wrongInquiry = foreign.find((row) => row.quotationLine.quotation.inquiryId !== inquiryId);
        if (wrongInquiry) {
          fail('PRICING_SNAPSHOT_STALE', 'Cannot aggregate a pricing snapshot from another inquiry.', {
            commercialPricingSnapshotId: wrongInquiry.id,
            snapshotInquiryId: wrongInquiry.quotationLine.quotation.inquiryId,
          });
        }
        fail('PRICING_SNAPSHOT_STALE', 'Pinned pricing snapshot ids do not match the current DRAFT quotation lines.', {
          expected: canonicalizeIdList(resolvedPricingIds),
          supplied,
        });
      }

      const groups = await tx.containerShipmentGroup.findMany({
        where: { inquiryId },
        include: {
          studies: {
            include: {
              currentResult: {
                include: {
                  unallocated: { select: { id: true } },
                  shipmentCostSnapshot: {
                    include: {
                      lines: true,
                      containerStudyResult: { include: { study: { select: { status: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const includedGroups = groups.filter((group) => group.status !== 'SUPERSEDED');
      const shipmentLines: ResolvedShipmentLine[] = [];
      const warnings: FinancialOfferWarning[] = [];

      for (const group of includedGroups) {
        const picked = pickConfirmedSnapshot(group);
        if (picked) {
          const snapshot = picked.snapshot;
          if (snapshot.inquiryId !== inquiryId) {
            fail('SHIPMENT_SNAPSHOT_STALE', 'Cannot aggregate a shipment cost snapshot from another inquiry.', {
              shipmentCostSnapshotId: snapshot.id,
              snapshotInquiryId: snapshot.inquiryId,
            });
          }
          if (snapshot.shipmentGroupId !== group.id) {
            fail('INVALID_SHIPMENT_GROUP', 'Shipment cost snapshot is not bound to the included group.', {
              shipmentCostSnapshotId: snapshot.id,
              shipmentGroupId: group.id,
            });
          }
          if (picked.result.unallocated.length > 0) {
            fail('UNALLOCATED_CONTAINERS', 'Pinned shipment snapshot result has unallocated drums.', {
              shipmentCostSnapshotId: snapshot.id,
            });
          }
          if (picked.study.status !== 'CONFIRMED' && picked.study.status !== 'SUPERSEDED') {
            fail('RESULT_NOT_CONFIRMED', 'Shipment snapshot must bind to a CONFIRMED packing result.', {
              shipmentCostSnapshotId: snapshot.id,
            });
          }
          shipmentLines.push({
            shipmentGroupId: group.id,
            shipmentCostSnapshotId: snapshot.id,
            destinationPortCode: snapshot.destinationPortCode,
            incotermCode: snapshot.incotermCode,
            currencyCode: snapshot.currencyCode,
            groupTotal: snapshot.totalAmount,
            typeLines: snapshot.lines.map((line) => ({
              containerTypeCode: line.containerTypeCode,
              containerQuantity: line.containerQuantity,
              shippingCostRateId: line.shippingCostRateId,
              rateAmount: line.rateAmount,
              currencyCode: line.currencyCode,
              lineTotal: line.lineTotal,
            })),
          });
          continue;
        }

        if (!vip) {
          const warning: FinancialOfferWarning = {
            code: SHIPPING_CHARGES_NOT_AVAILABLE,
            shipmentGroupId: group.id,
          };
          warnings.push(warning);
          shipmentLines.push({
            shipmentGroupId: group.id,
            shipmentCostSnapshotId: null,
            destinationPortCode: String(group.destinationPortCode ?? '').trim() || 'UNSET',
            incotermCode: String(group.incotermCode ?? '').trim() || 'UNSET',
            currencyCode: inquiry.currency,
            groupTotal: new Prisma.Decimal(0),
            warning,
            typeLines: [],
          });
          continue;
        }
        const warning: FinancialOfferWarning = {
          code: VIP_SHIPMENT_NOT_CONFIGURED,
          shipmentGroupId: group.id,
        };
        warnings.push(warning);
        shipmentLines.push({
          shipmentGroupId: group.id,
          shipmentCostSnapshotId: null,
          destinationPortCode: String(group.destinationPortCode ?? '').trim() || 'UNSET',
          incotermCode: String(group.incotermCode ?? '').trim() || 'UNSET',
          currencyCode: inquiry.currency,
          groupTotal: new Prisma.Decimal(0),
          warning,
          typeLines: [],
        });
      }

      // STANDARD with zero included groups is the approved DF-E no-shipment path: products only, no ShipmentCostSnapshot.
      if (vip && !includedGroups.length) {
        warnings.push({ code: VIP_SHIPMENT_NOT_CONFIGURED });
      }

      const resolvedShipmentIds = shipmentLines
        .map((line) => line.shipmentCostSnapshotId)
        .filter((id): id is string => Boolean(id));
      if (!idListsMatch(resolvedShipmentIds, input.shipmentCostSnapshotIds)) {
        const supplied = canonicalizeIdList(input.shipmentCostSnapshotIds);
        const foreign = await tx.shipmentCostSnapshot.findMany({
          where: { id: { in: supplied } },
          select: { id: true, inquiryId: true, shipmentGroupId: true, shipmentGroup: { select: { status: true } } },
        });
        const wrongInquiry = foreign.find((row) => row.inquiryId !== inquiryId);
        if (wrongInquiry) {
          fail('SHIPMENT_SNAPSHOT_STALE', 'Cannot aggregate a shipment cost snapshot from another inquiry.', {
            shipmentCostSnapshotId: wrongInquiry.id,
            snapshotInquiryId: wrongInquiry.inquiryId,
          });
        }
        const superseded = foreign.find((row) => row.shipmentGroup.status === 'SUPERSEDED');
        if (superseded) {
          fail('INVALID_SHIPMENT_GROUP', 'Cannot aggregate a SUPERSEDED shipment group.', {
            shipmentGroupId: superseded.shipmentGroupId,
            shipmentCostSnapshotId: superseded.id,
          });
        }
        fail('SHIPMENT_SNAPSHOT_STALE', 'Pinned shipment cost snapshot ids do not match the current included groups.', {
          expected: canonicalizeIdList(resolvedShipmentIds),
          supplied,
        });
      }

      const currencyCodes = [
        inquiry.currency,
        ...productLines.map((line) => line.currencyCode),
        ...shipmentLines.filter((line) => line.shipmentCostSnapshotId).map((line) => line.currencyCode),
      ];
      const currency = assertHomogeneousOfferCurrency(currencyCodes);
      if (currency.ok === false) {
        fail('CURRENCY_INCOMPATIBLE', 'Product, shipment, and inquiry currencies must match. No FX is performed.');
      }

      const productsTotal = productLines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));
      const shipmentTotal = shipmentLines.reduce((sum, line) => sum.add(line.groupTotal), new Prisma.Decimal(0));
      const inquiryTotal = productsTotal.add(shipmentTotal);
      const pinSet = canonicalizePinSet({
        pricingSnapshotIds: resolvedPricingIds,
        shipmentCostSnapshotIds: resolvedShipmentIds,
        currencyCode: currency.currencyCode,
      });

      const current = await tx.financialOfferSnapshot.findFirst({
        where: { inquiryId, isCurrent: true },
        include: offerInclude,
      });
      if (current) {
        const currentView = serializeOffer(current);
        if (pinSetsEqual(storedPinSet(currentView), pinSet)) {
          return { snapshot: currentView, created: false };
        }
      }

      if (current) {
        await tx.financialOfferSnapshot.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
      }

      const created = await tx.financialOfferSnapshot.create({
        data: {
          inquiryId,
          versionNo: current ? current.versionNo + 1 : 1,
          isCurrent: true,
          supersedesOfferId: current?.id ?? null,
          hostQuotationId: quotation.id,
          currencyCode: currency.currencyCode,
          productsTotal,
          shipmentTotal,
          inquiryTotal,
          warningsJson: warnings.length ? (warnings as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          pricingSnapshotIdsJson: pinSet.pricingSnapshotIds,
          shipmentCostSnapshotIdsJson: pinSet.shipmentCostSnapshotIds,
          createdBy: actorId(actor),
          productLines: {
            create: productLines.map((line) => ({
              inquiryLineId: line.inquiryLineId,
              commercialPricingSnapshotId: line.commercialPricingSnapshotId,
              materialNumber: line.materialNumber,
              description: line.description,
              quantity: line.quantity,
              quantityUom: line.quantityUom,
              lengthMeters: line.lengthMeters,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              currencyCode: line.currencyCode,
            })),
          },
          shipmentLines: {
            create: shipmentLines.map((line) => ({
              shipmentGroupId: line.shipmentGroupId,
              shipmentCostSnapshotId: line.shipmentCostSnapshotId,
              destinationPortCode: line.destinationPortCode,
              incotermCode: line.incotermCode,
              currencyCode: line.currencyCode,
              groupTotal: line.groupTotal,
              typeLines: {
                create: line.typeLines.map((typeLine) => ({
                  containerTypeCode: typeLine.containerTypeCode,
                  containerQuantity: typeLine.containerQuantity,
                  shippingCostRateId: typeLine.shippingCostRateId,
                  rateAmount: typeLine.rateAmount,
                  currencyCode: typeLine.currencyCode,
                  lineTotal: typeLine.lineTotal,
                })),
              },
            })),
          },
        },
        include: offerInclude,
      });
      const view = serializeOffer(created);
      await appendServerAuditTx(tx, {
        actorId: actorId(actor),
        actorName: actor.name || actor.email || null,
        entity: OFFER_ENTITY,
        entityId: view.id,
        action: 'FINANCIAL_OFFER_SNAPSHOT_CREATED',
        newValue: auditNewValue(view),
        message: `Financial offer snapshot v${view.versionNo} created for inquiry ${view.inquiryId}`,
      });
      return { snapshot: view, created: true };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.financialOfferSnapshot.findFirst({
        where: { inquiryId, isCurrent: true },
        include: offerInclude,
      });
      if (!winner) throw err;
      return { snapshot: serializeOffer(winner), created: false };
    }
    if (err && typeof err === 'object' && 'details' in err) {
      const details = (err as { details?: { issueCode?: string } }).details;
      const issueCode = details?.issueCode;
      if (issueCode && issueCode !== 'INQUIRY_NOT_FOUND' && issueCode !== 'OFFER_NOT_FOUND') {
        await recordCreateFailed({
          actor,
          entityId: inquiryId,
          issueCode,
          message: err instanceof Error ? err.message : 'Financial offer snapshot create failed',
          details: details as Record<string, unknown>,
        });
      }
    }
    throw err;
  }
}

export async function getFinancialOfferSnapshot(id: string, actor: RequestActor): Promise<FinancialOfferSnapshotView> {
  const prisma = requirePrisma();
  const row = await prisma.financialOfferSnapshot.findUnique({
    where: { id },
    include: {
      ...offerInclude,
      inquiry: { select: { customerId: true, customerMasterId: true } },
    },
  });
  if (!row) fail('OFFER_NOT_FOUND', 'Financial offer snapshot was not found.');
  assertCanAccessInquiryOwnership(actor, row.inquiry.customerId, row.inquiry.customerMasterId);
  return serializeOffer(row);
}

export async function getCurrentFinancialOfferSnapshot(
  inquiryId: string,
  actor: RequestActor
): Promise<FinancialOfferSnapshotView> {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({
    where: { id: inquiryId },
    select: { customerId: true, customerMasterId: true },
  });
  if (!inquiry) fail('INQUIRY_NOT_FOUND', 'Inquiry was not found.');
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  const row = await prisma.financialOfferSnapshot.findFirst({
    where: { inquiryId, isCurrent: true },
    include: offerInclude,
  });
  if (!row) fail('OFFER_NOT_FOUND', 'No current financial offer snapshot exists for this inquiry.');
  return serializeOffer(row);
}

async function drumsByPinnedPricing(view: FinancialOfferSnapshotView): Promise<Record<string, string>> {
  const prisma = requirePrisma();
  if (!view.pricingSnapshotIds.length) return {};
  const snapshots = await prisma.commercialPricingSnapshot.findMany({
    where: { id: { in: view.pricingSnapshotIds } },
    select: {
      drumPlanId: true,
      quotationLine: { select: { inquiryLineId: true } },
    },
  });
  const planIds = snapshots.map((row) => row.drumPlanId).filter((id): id is string => Boolean(id));
  const plans = planIds.length
    ? await prisma.v2DrumPlan.findMany({
        where: { id: { in: planIds } },
        include: { lines: { orderBy: { lineNo: 'asc' }, select: { drumCode: true } } },
      })
    : [];
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const drums: Record<string, string> = {};
  for (const snapshot of snapshots) {
    const inquiryLineId = snapshot.quotationLine.inquiryLineId;
    if (!snapshot.drumPlanId) continue;
    const plan = planById.get(snapshot.drumPlanId);
    if (!plan) continue;
    const codes = [...new Set(plan.lines.map((line) => line.drumCode).filter(Boolean))];
    if (codes.length) drums[inquiryLineId] = codes.join(', ');
  }
  return drums;
}

export async function getCustomerFinancialOfferSnapshot(
  id: string,
  actor: RequestActor
): Promise<CustomerFinancialOfferProjection> {
  const view = await getFinancialOfferSnapshot(id, actor);
  return projectCustomerFinancialOffer(view, await drumsByPinnedPricing(view));
}

export async function getCurrentCustomerFinancialOfferSnapshot(
  inquiryId: string,
  actor: RequestActor
): Promise<CustomerFinancialOfferProjection> {
  const view = await getCurrentFinancialOfferSnapshot(inquiryId, actor);
  return projectCustomerFinancialOffer(view, await drumsByPinnedPricing(view));
}

export async function getCustomerContainerStudyVisibility(
  inquiryId: string,
  actor: RequestActor
): Promise<ReturnType<typeof projectCustomerContainerStudyVisibility>> {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      customerId: true,
      customerMasterId: true,
      commercialMetadata: true,
      currency: true,
    },
  });
  if (!inquiry) fail('INQUIRY_NOT_FOUND', 'Inquiry was not found.');
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  const process = readInquiryProcessFromMetadata(inquiry.commercialMetadata);
  const inquiryCurrency = String(inquiry.currency || '').trim() || null;

  const groups = await prisma.containerShipmentGroup.findMany({
    where: { inquiryId },
    include: {
      memberLines: true,
      studies: {
        include: {
          currentSnapshot: {
            select: { id: true, containerMasterPinJson: true },
          },
          currentResult: {
            include: {
              shipmentCostSnapshot: { include: { lines: true } },
              containers: { select: { typeCode: true } },
            },
          },
        },
      },
    },
  });

  const inquiryLines = await prisma.commercialInquiryLine.findMany({
    where: { inquiryId },
    select: {
      id: true,
      v2CurrentDrumPlanId: true,
      v2CurrentCuttingPlanId: true,
      cuttingLengthMeters: true,
      requestedQuantity: true,
    },
  });
  const drumIds = inquiryLines
    .map((line) => line.v2CurrentDrumPlanId)
    .filter((id): id is string => Boolean(id));
  const drums = drumIds.length
    ? await prisma.v2DrumPlan.findMany({
        where: { id: { in: drumIds } },
        select: { id: true, lifecycleStatus: true },
      })
    : [];
  const drumById = new Map(drums.map((row) => [row.id, row]));

  const views: CustomerContainerStudyGroupView[] = [];
  for (const group of groups.filter((row) => row.status !== 'SUPERSEDED')) {
    const ranked = [...group.studies].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const pickedStudy =
      ranked.find((study) => study.status === 'CONFIRMED' && study.currentResult?.shipmentCostSnapshot) ||
      ranked.find((study) => packingRowsFromStudyResult(study.currentResult).length > 0) ||
      ranked.find((study) => study.status === 'SUPERSEDED' && study.currentResult?.shipmentCostSnapshot) ||
      ranked.find((study) => study.status === 'CONFIRMED') ||
      ranked[0] ||
      null;
    const snapshot = pickedStudy?.currentResult?.shipmentCostSnapshot ?? null;
    const studyStatus = pickedStudy?.status ?? null;
    const memberIds = new Set(group.memberLines.map((row) => row.inquiryLineId));
    const scopedLines = memberIds.size
      ? inquiryLines.filter((line) => memberIds.has(line.id))
      : inquiryLines;
    const inputDrumCount = pickedStudy?.currentSnapshot?.id
      ? await prisma.containerStudyInputDrum.count({
          where: { snapshotId: pickedStudy.currentSnapshot.id },
        })
      : 0;
    const hasConfirmedDrum =
      inputDrumCount > 0 ||
      scopedLines.some(
        (line) =>
          Boolean(line.v2CurrentDrumPlanId) &&
          drumById.get(line.v2CurrentDrumPlanId!)?.lifecycleStatus === 'CONFIRMED'
      );
    const hasCuttingLength = scopedLines.some(
      (line) => Boolean(line.v2CurrentCuttingPlanId) || Number(line.cuttingLengthMeters) > 0
    );
    const hasQuantity = scopedLines.some((line) => Number(line.requestedQuantity) > 0);
    const pin = pickedStudy?.currentSnapshot?.containerMasterPinJson;
    const hasContainerType =
      Boolean(group.containerTypePreferenceCode) || (Array.isArray(pin) && pin.length > 0);
    const hasDestination = Boolean(group.destinationPortCode);
    const missingPhysicalPackingInputs = describeMissingPhysicalPackingInputs({
      hasConfirmedDrum,
      hasCuttingLength,
      hasQuantity,
      hasContainerType,
      hasDestination,
    });
    views.push(
      projectCustomerContainerStudyGroup({
        shipmentGroupId: group.id,
        groupStatus: group.status,
        studyStatus,
        destinationPortCode: snapshot?.destinationPortCode || group.destinationPortCode || null,
        incotermCode: snapshot?.incotermCode || group.incotermCode || null,
        currencyCode: snapshot?.currencyCode || inquiryCurrency,
        packingContainers: packingRowsFromStudyResult(pickedStudy?.currentResult),
        missingPhysicalPackingInputs,
        snapshot: snapshot
          ? {
              destinationPortCode: snapshot.destinationPortCode,
              incotermCode: snapshot.incotermCode,
              totalAmount: snapshot.totalAmount.toString(),
              currencyCode: snapshot.currencyCode,
              lines: snapshot.lines.map((line) => ({
                containerTypeCode: line.containerTypeCode,
                containerQuantity: line.containerQuantity,
                rateAmount: line.rateAmount.toString(),
                lineTotal: line.lineTotal.toString(),
              })),
            }
          : null,
      })
    );
  }

  return projectCustomerContainerStudyVisibility({
    inquiryId: inquiry.id,
    processCode: process?.processCode ?? null,
    shipmentGroupCount: groups.filter((row) => row.status !== 'SUPERSEDED').length,
    containerStudyCount: groups.reduce(
      (sum, row) => sum + row.studies.filter((study) => study.status !== 'SUPERSEDED').length,
      0
    ),
    groups: views,
  });
}
