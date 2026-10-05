/**
 * Pure presentation/workflow helpers for Phase 1 commercial fulfillment UI.
 * No business-rule enforcement — server remains authoritative.
 */

export type FulfillmentExceptionKind =
  | 'mto_bypass'
  | 'mts_eligibility'
  | 'over_release'
  | 'immutable_revision'
  | 'duplicate_idempotent'
  | 'pricing_required'
  | 'forbidden'
  | 'validation'
  | 'generic';

export interface FulfillmentApiErrorLike {
  message: string;
  code?: string | null;
  status?: number | null;
}

export function classifyFulfillmentException(err: FulfillmentApiErrorLike): FulfillmentExceptionKind {
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toUpperCase();

  if (code === 'UNAUTHORIZED' || err.status === 403) return 'forbidden';
  if (/over[- ]?release|exceeds? remaining|remaining quantity|cannot release more/.test(msg)) {
    return 'over_release';
  }
  if (/mts only|mto only|fulfillment policy|direct mts sales orders are not allowed|mts-eligible|not allowed/.test(msg) && /mts|mto/.test(msg)) {
    return 'mts_eligibility';
  }
  if (/bypass|quotation → commercial approval|use quotation/.test(msg) || (/mto/.test(msg) && /not allowed/.test(msg))) {
    return 'mto_bypass';
  }
  if (/only the current|immutable|already commercially approved|cannot change fulfillment/.test(msg)) {
    return 'immutable_revision';
  }
  if (code === 'CONFLICT' || /already exists|idempoten|duplicate/.test(msg)) {
    return 'duplicate_idempotent';
  }
  if (/pricing_approved|pricing must|pricing status/.test(msg)) return 'pricing_required';
  if (code === 'VALIDATION_FAILED') return 'validation';
  return 'generic';
}

const EXCEPTION_TITLES: Record<FulfillmentExceptionKind, string> = {
  mto_bypass: 'MTO cannot bypass quotation',
  mts_eligibility: 'Cable not eligible for Direct MTS',
  over_release: 'Over-release blocked',
  immutable_revision: 'Approved revision is immutable',
  duplicate_idempotent: 'Duplicate / idempotent create',
  pricing_required: 'Pricing approval required',
  forbidden: 'Not authorized for this action',
  validation: 'Check required fields',
  generic: 'Request could not be completed',
};

export function fulfillmentExceptionTitle(kind: FulfillmentExceptionKind): string {
  return EXCEPTION_TITLES[kind];
}

/** Map domain SO / agreement statuses to operational labels Sales expects. */
export function operationalStatusLabel(status?: string | null): string {
  const s = (status || '').toUpperCase();
  switch (s) {
    case 'DRAFT':
      return 'Draft';
    case 'CONFIRMED':
    case 'ACTIVE':
      return 'Confirmed';
    case 'COMPLETED':
      return 'Fulfilled';
    case 'CANCELLED':
    case 'CANCELED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Expired';
    default:
      return status || '—';
  }
}

export function integrationStatusLabel(status?: string | null): string {
  const s = (status || '').toUpperCase();
  if (!s || s === 'NOT_SENT') return 'D365 not sent';
  if (s === 'PENDING') return 'D365 pending (future)';
  if (s === 'SYNCED') return 'D365 synced (future)';
  if (s === 'FAILED') return 'D365 failed (future)';
  return `D365 ${status}`;
}

/** Always present integration as future-only until ERP phase. */
export function integrationIsFutureOnly(status?: string | null): boolean {
  const s = (status || 'NOT_SENT').toUpperCase();
  return s === 'NOT_SENT' || s === 'PENDING' || s === 'FAILED' || s === 'SYNCED';
}

export function orderOriginLabel(origin?: string | null): string {
  switch ((origin || '').toUpperCase()) {
    case 'QUOTATION':
      return 'From quotation';
    case 'AGREEMENT_RELEASE':
      return 'Agreement release';
    case 'DIRECT_MTS':
      return 'Direct MTS';
    default:
      return origin || '—';
  }
}

export function orderFulfillmentModeLabel(mode?: string | null): string {
  switch ((mode || '').toUpperCase()) {
    case 'MTO':
      return 'Make-to-order';
    case 'MTS':
      return 'Make-to-stock';
    default:
      return mode || '—';
  }
}

export type FulfillmentWorkspaceView = 'orders' | 'agreements' | 'direct-mts';

export function parseFulfillmentWorkspaceView(raw: string | null | undefined): FulfillmentWorkspaceView {
  if (raw === 'agreements' || raw === 'direct-mts' || raw === 'orders') return raw;
  return 'orders';
}

export interface FulfillmentActionAvailability {
  canApproveCommercial: boolean;
  canCreateSalesOrder: boolean;
  canCreateSalesAgreement: boolean;
  canCreateRelease: boolean;
  canCreateDirectMts: boolean;
}

/** Presentation-only: which actions Sales vs Customer should see. */
export function resolveFulfillmentActions(args: {
  userType?: string | null;
  hasSalesQuotations: boolean;
}): FulfillmentActionAvailability {
  const isInternalSales = args.userType === 'internal' && args.hasSalesQuotations;
  return {
    canApproveCommercial: isInternalSales,
    canCreateSalesOrder: isInternalSales,
    canCreateSalesAgreement: isInternalSales,
    canCreateRelease: isInternalSales,
    canCreateDirectMts: isInternalSales,
  };
}

export function formatQty(value: number | string | null | undefined, uom?: string | null): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  const text = Number.isFinite(n) ? String(n) : String(value);
  return uom ? `${text} ${uom}` : text;
}

export interface TraceabilityStep {
  key: string;
  label: string;
  value: string;
  muted?: boolean;
}

export function buildSalesOrderTraceability(so: {
  orderOrigin?: string | null;
  inquiryId?: string | null;
  quotationId?: string | null;
  quotation?: { quotationNumber?: string | null; versionNo?: number | null } | null;
  commitment?: { commitmentNumber?: string | null } | null;
  commitmentId?: string | null;
  agreementRelease?: {
    releaseNumber?: string | null;
    agreement?: { agreementNumber?: string | null } | null;
  } | null;
  lines?: Array<{
    configurationId?: string | null;
    engineeringRevision?: string | null;
    bomVersion?: string | null;
    costingRunId?: string | null;
    costingCalculationId?: string | null;
  }>;
}): TraceabilityStep[] {
  const steps: TraceabilityStep[] = [];
  if (so.inquiryId) steps.push({ key: 'inquiry', label: 'Inquiry', value: so.inquiryId });
  const qn = so.quotation?.quotationNumber;
  if (qn) {
    steps.push({
      key: 'quotation',
      label: 'Quotation revision',
      value: so.quotation?.versionNo != null ? `${qn} V${so.quotation.versionNo}` : qn,
    });
  } else if (so.quotationId) {
    steps.push({ key: 'quotation', label: 'Quotation', value: so.quotationId });
  }
  const cn = so.commitment?.commitmentNumber || so.commitmentId;
  if (cn) steps.push({ key: 'commitment', label: 'Commitment', value: cn });
  else if ((so.orderOrigin || '').toUpperCase() === 'DIRECT_MTS') {
    steps.push({ key: 'commitment', label: 'Commitment', value: 'None (Direct MTS)', muted: true });
  }
  const an = so.agreementRelease?.agreement?.agreementNumber;
  if (an) steps.push({ key: 'agreement', label: 'Agreement', value: an });
  const rn = so.agreementRelease?.releaseNumber;
  if (rn) steps.push({ key: 'release', label: 'Release', value: rn });
  steps.push({
    key: 'origin',
    label: 'Order origin',
    value: orderOriginLabel(so.orderOrigin),
  });

  const line = so.lines?.[0];
  if (line?.configurationId) {
    steps.push({ key: 'config', label: 'Configuration', value: line.configurationId });
  }
  if (line?.engineeringRevision) {
    steps.push({ key: 'eng', label: 'Engineering revision', value: line.engineeringRevision });
  }
  if (line?.bomVersion) {
    steps.push({ key: 'bom', label: 'BOM version', value: line.bomVersion });
  }
  if (line?.costingRunId || line?.costingCalculationId) {
    steps.push({
      key: 'costing',
      label: 'Costing snapshot',
      value: [line.costingRunId, line.costingCalculationId].filter(Boolean).join(' · '),
      muted: true,
    });
  }
  return steps;
}

export function buildAgreementTraceability(agreement: {
  quotation?: { quotationNumber?: string | null; versionNo?: number | null } | null;
  quotationId?: string | null;
  commitment?: { commitmentNumber?: string | null } | null;
  commitmentId?: string | null;
  agreementNumber?: string | null;
  releases?: Array<{
    releaseNumber?: string | null;
    salesOrder?: { salesOrderNumber?: string | null } | null;
  }>;
}): TraceabilityStep[] {
  const steps: TraceabilityStep[] = [];
  const qn = agreement.quotation?.quotationNumber;
  if (qn) {
    steps.push({
      key: 'quotation',
      label: 'Quotation revision',
      value: agreement.quotation?.versionNo != null ? `${qn} V${agreement.quotation.versionNo}` : qn,
    });
  } else if (agreement.quotationId) {
    steps.push({ key: 'quotation', label: 'Quotation', value: agreement.quotationId });
  }
  const cn = agreement.commitment?.commitmentNumber || agreement.commitmentId;
  if (cn) steps.push({ key: 'commitment', label: 'Commitment', value: cn });
  if (agreement.agreementNumber) {
    steps.push({ key: 'agreement', label: 'Agreement', value: agreement.agreementNumber });
  }
  for (const r of agreement.releases || []) {
    const so = r.salesOrder?.salesOrderNumber;
    steps.push({
      key: `release-${r.releaseNumber}`,
      label: 'Release → SO',
      value: so ? `${r.releaseNumber} → ${so}` : String(r.releaseNumber || '—'),
    });
  }
  return steps;
}
