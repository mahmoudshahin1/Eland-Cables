import { presentCustomerCostingFromLine } from '../domain/calculationCompleteness';
import type { RequestActor } from './auth';

type InquiryRecord = {
  lines?: Array<Record<string, unknown>>;
  quotations?: Array<Record<string, unknown>>;
  commercialMetadata?: unknown;
  [key: string]: unknown;
};

const CUSTOMER_HIDDEN_LINE_FIELDS = new Set([
  'costingRunId',
  'costingReadinessStatus',
  'costingCalculationId',
  'materialCost',
  'materialCostCurrency',
  'unitCost',
  'totalCost',
  'margin',
  'marginPercent',
  'internalComments',
]);

const CUSTOMER_VISIBLE_COMMERCIAL_METADATA_KEYS = new Set([
  'transactionType',
  'organization',
  'exchangeRate',
  'rawMaterialCurrency',
  'rawMaterialExchangeRate',
  'copperPriceRate',
  'copperPriceUom',
  'aluminiumPriceRate',
  'aluminiumPriceUom',
  'deliveryDestination',
  'destinationPortCode',
  'incoterms',
  'inquiryProcessCode',
  'inquiryProcessSource',
  'inquiryProcessAssignedAt',
  'workflowChannel',
]);

function projectCommercialMetadataForActor(metadata: unknown, actor: RequestActor): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata ?? null;
  if (canViewInternalInquiryCosts(actor)) return metadata;
  const source = metadata as Record<string, unknown>;
  const visible: Record<string, unknown> = {};
  for (const key of CUSTOMER_VISIBLE_COMMERCIAL_METADATA_KEYS) {
    if (key in source) visible[key] = source[key];
  }
  return visible;
}

export function canViewCostBreakdown(actor: RequestActor): boolean {
  if (actor.userType !== 'customer') return true;
  const perms = actor.permissions as Record<string, boolean> | undefined;
  return Boolean(perms?.costingPricing || perms?.salesQuotations);
}

export function projectLineCostingForActor<T>(payload: T, actor: RequestActor): T {
  if (canViewCostBreakdown(actor)) return payload;
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...(payload as Record<string, unknown>) };
  delete copy.materialBreakdown;
  delete copy.layers;
  delete copy.formulaTrace;
  if (copy.totals && typeof copy.totals === 'object') {
    const totals = { ...(copy.totals as Record<string, unknown>) };
    delete totals.layerTotals;
    copy.totals = totals;
  }
  return copy as T;
}

export function canViewInternalInquiryCosts(actor: RequestActor): boolean {
  if (actor.userType !== 'customer') return true;
  return false;
}

export function projectInquiryForActor<T extends InquiryRecord>(
  inquiry: T,
  actor: RequestActor
): T {
  if (canViewInternalInquiryCosts(actor)) {
    return inquiry;
  }

  const projected = { ...inquiry } as T;
  projected.commercialMetadata = projectCommercialMetadataForActor(
    inquiry.commercialMetadata,
    actor
  ) as T['commercialMetadata'];

  if (Array.isArray(inquiry.lines)) {
    projected.lines = inquiry.lines.map((line) => {
      const next = { ...line };
      const customerCosting = presentCustomerCostingFromLine({
        costingCalculationId: line.costingCalculationId,
        costingCalculated: line.costingCalculated,
        costingReadinessStatus: line.costingReadinessStatus,
        v2CurrentSnapshotId: line.v2CurrentSnapshotId,
        importedEngineeringReady: Boolean(line.importedEngineeringReady),
      });
      next.costingCalculated = customerCosting.calculated;
      next.customerCostingStatus = customerCosting.status;
      for (const field of CUSTOMER_HIDDEN_LINE_FIELDS) {
        delete next[field];
      }
      return next;
    }) as T['lines'];
  }

  if (Array.isArray(inquiry.quotations)) {
    projected.quotations = inquiry.quotations.map((q) => {
      const next = { ...q };
      delete next.materialCostTotal;
      delete next.sellingPrice;
      delete next.commercialPricingStatus;
      return next;
    }) as T['quotations'];
  }

  return projected;
}

export function projectInquiryListForActor<T extends InquiryRecord>(
  inquiries: T[],
  actor: RequestActor
): T[] {
  return inquiries.map((row) => projectInquiryForActor(row, actor));
}
