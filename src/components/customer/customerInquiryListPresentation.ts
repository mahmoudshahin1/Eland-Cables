import type { BadgeTone } from '../ui';
import {
  resolveInquiryLineTotalLengthMeters,
  type CommercialInquiryDto,
  type CommercialInquiryLineDto,
  type CommercialQuotationListDto,
} from '../../services/commercialInquiryApiService';

export type CustomerInquiryWorkspaceTab = 'inquiries' | 'quotations';

export type CustomerInquiryKpiBucket = 'draft' | 'inProgress' | 'submitted' | 'quoted' | 'other';

export type CustomerInquiryRowAction = 'view' | 'continue' | 'view_quotation' | 'download_pdf';

export const CUSTOMER_INQUIRY_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Technical Review' },
  { value: 'ENGINEERING_REVIEW', label: 'Under Technical Review' },
  { value: 'ENGINEERING_BLOCKED', label: 'Action Required' },
  { value: 'READY_FOR_COMMERCIAL', label: 'Ready for Quotation' },
  { value: 'QUOTED', label: 'Quotation Sent' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** Unique dropdown options — UNDER_REVIEW and ENGINEERING_REVIEW share a customer label. */
export const CUSTOMER_INQUIRY_STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'ENGINEERING_REVIEW', label: 'Under Technical Review' },
  { value: 'ENGINEERING_BLOCKED', label: 'Action Required' },
  { value: 'READY_FOR_COMMERCIAL', label: 'Ready for Quotation' },
  { value: 'QUOTED', label: 'Quotation Sent' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const CUSTOMER_CABLE_TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'power', label: 'Power Cable' },
  { value: 'control', label: 'Control Cable' },
  { value: 'instrumentation', label: 'Instrumentation' },
  { value: 'lv', label: 'LV' },
  { value: 'mv', label: 'MV' },
];

export const IN_PROGRESS_INQUIRY_STATUSES = [
  'UNDER_REVIEW',
  'ENGINEERING_REVIEW',
  'ENGINEERING_BLOCKED',
  'READY_FOR_COMMERCIAL',
] as const;

export const CUSTOMER_INQUIRY_TIMELINE = [
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'review', label: 'Technical Review' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'closed', label: 'Closed' },
] as const;

const COSTING_LEAK_RE = /costing|raw material|manufacturing cost|g&a|margin|formula/i;

export function customerFacingInquiryStatusLabel(status: string): string {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT':
      return 'Draft';
    case 'SUBMITTED':
      return 'Submitted';
    case 'UNDER_REVIEW':
    case 'ENGINEERING_REVIEW':
      return 'Under Technical Review';
    case 'ENGINEERING_BLOCKED':
      return 'Action Required';
    case 'READY_FOR_COMMERCIAL':
      return 'Ready for Quotation';
    case 'QUOTED':
      return 'Quotation Sent';
    case 'CLOSED':
      return 'Closed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return (status || '—').replace(/_/g, ' ');
  }
}

export function customerFacingInquiryStatusTone(status: string): BadgeTone {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT':
      return 'neutral';
    case 'SUBMITTED':
      return 'info';
    case 'UNDER_REVIEW':
    case 'ENGINEERING_REVIEW':
      return 'warning';
    case 'ENGINEERING_BLOCKED':
      return 'error';
    case 'READY_FOR_COMMERCIAL':
      return 'brand';
    case 'QUOTED':
      return 'copper';
    case 'CLOSED':
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function customerFacingLineStatusLabel(status?: string | null): string {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT':
      return 'Draft';
    case 'CONFIGURATION_REQUIRED':
      return 'Configuration Required';
    case 'TECHNICAL_OFFICE_REQUIRED':
      return 'Under Review';
    case 'CABLE_VALIDATED':
      return 'Reviewed';
    case 'COSTING_NOT_READY':
      return 'In Progress';
    case 'COSTING_READY':
    case 'READY_FOR_QUOTATION':
      return 'Ready for Quotation';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status ? customerFacingInquiryStatusLabel(status) : 'Draft';
  }
}

export function customerInquiryKpiBucket(status: string): CustomerInquiryKpiBucket {
  const s = (status || '').toUpperCase();
  if (s === 'DRAFT') return 'draft';
  if (s === 'SUBMITTED') return 'submitted';
  if (s === 'QUOTED') return 'quoted';
  if ((IN_PROGRESS_INQUIRY_STATUSES as readonly string[]).includes(s)) return 'inProgress';
  return 'other';
}

export function formatCustomerListDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatCustomerQuantityMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '—';
  return `${Math.round(meters).toLocaleString('en-GB')} m`;
}

export function inquiryTotalQuantityMeters(inquiry: CommercialInquiryDto): number {
  const lines = inquiry.lines || [];
  if (!lines.length) return 0;
  return lines.reduce((sum, line) => sum + resolveInquiryLineTotalLengthMeters(line), 0);
}

export function lineQuantityMeters(line: CommercialInquiryLineDto): number {
  return resolveInquiryLineTotalLengthMeters(line);
}

function descriptionBlob(inquiry: CommercialInquiryDto): string {
  const lines = (inquiry.lines || [])
    .map((line) => `${line.cableDescription || ''} ${line.itemCode || ''} ${line.materialNumber || ''}`)
    .join(' ');
  return `${inquiry.projectName || ''} ${inquiry.notes || ''} ${lines}`.toLowerCase();
}

export function customerCableTypeLabel(inquiry: CommercialInquiryDto): string {
  const blob = descriptionBlob(inquiry);
  if (/\binstrument/.test(blob)) return 'Instrumentation';
  if (/\bcontrol\b/.test(blob)) return 'Control Cable';
  if (/\bpower\b/.test(blob) || /\bmv\b|\blv\b|\bxpe\b|\bxlpe\b/.test(blob)) return 'Power Cable';
  const first = inquiry.lines?.[0]?.cableDescription?.trim();
  if (first) return first.length > 28 ? `${first.slice(0, 26)}…` : first;
  return '—';
}

export function customerApplicationLabel(inquiry: CommercialInquiryDto): string {
  const blob = descriptionBlob(inquiry);
  if (/\bhv\b|\bhigh voltage\b/.test(blob)) return 'HV';
  if (/\bmv\b|\bmedium voltage\b|\b11 kv\b|\b33 kv\b|6\/10|8\.7\/15|12\/20|18\/30/.test(blob)) return 'MV';
  if (/\blv\b|\blow voltage\b|0\.6\/1|600\/1000/.test(blob)) return 'LV';
  return '—';
}

export function inquiryMatchesCableTypeFilter(inquiry: CommercialInquiryDto, filter: string): boolean {
  if (!filter) return true;
  const blob = descriptionBlob(inquiry);
  switch (filter) {
    case 'power':
      return /\bpower\b/.test(blob) || customerCableTypeLabel(inquiry) === 'Power Cable';
    case 'control':
      return /\bcontrol\b/.test(blob);
    case 'instrumentation':
      return /\binstrument/.test(blob);
    case 'lv':
      return customerApplicationLabel(inquiry) === 'LV' || /\blv\b/.test(blob);
    case 'mv':
      return customerApplicationLabel(inquiry) === 'MV' || /\bmv\b/.test(blob);
    default:
      return true;
  }
}

export function inquiryHasCustomerQuotation(inquiry: CommercialInquiryDto): boolean {
  if ((inquiry.status || '').toUpperCase() === 'QUOTED') return true;
  return (inquiry.quotations || []).some((quotation) => Boolean(quotation.quotationNumber));
}

export function customerInquiryRowActions(inquiry: CommercialInquiryDto): CustomerInquiryRowAction[] {
  const actions: CustomerInquiryRowAction[] = ['view'];
  if ((inquiry.status || '').toUpperCase() === 'DRAFT') actions.push('continue');
  if (inquiryHasCustomerQuotation(inquiry)) {
    actions.push('view_quotation');
    actions.push('download_pdf');
  }
  return actions;
}

export function customerInquiryDestination(inquiry: CommercialInquiryDto): string {
  const meta =
    inquiry.commercialMetadata && typeof inquiry.commercialMetadata === 'object'
      ? (inquiry.commercialMetadata as Record<string, unknown>)
      : {};
  const destination = String(meta.deliveryDestination || meta.destinationPortCode || '').trim();
  const incoterm = String(inquiry.incoterms || meta.incoterms || '').trim();
  if (destination && incoterm) return `${destination}, ${incoterm}`;
  return destination || incoterm || '—';
}

export function customerInquiryTimelineState(status: string): Array<{
  id: string;
  label: string;
  state: 'complete' | 'current' | 'upcoming';
}> {
  const s = (status || '').toUpperCase();
  let currentIndex = 0;
  if (s === 'DRAFT') currentIndex = 0;
  else if (s === 'SUBMITTED') currentIndex = 1;
  else if (s === 'UNDER_REVIEW' || s === 'ENGINEERING_REVIEW' || s === 'ENGINEERING_BLOCKED') currentIndex = 2;
  else if (s === 'READY_FOR_COMMERCIAL' || s === 'QUOTED') currentIndex = 3;
  else if (s === 'CLOSED' || s === 'CANCELLED') currentIndex = 4;
  else currentIndex = 1;

  return CUSTOMER_INQUIRY_TIMELINE.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

export type CustomerInquiryListRow = {
  id: string;
  inquiryNumber: string;
  createdDate: string;
  projectName: string;
  cableType: string;
  application: string;
  quantityLabel: string;
  status: string;
  statusLabel: string;
  statusTone: BadgeTone;
  lastUpdated: string;
  lineCount: number;
  actions: CustomerInquiryRowAction[];
};

export function buildCustomerInquiryListRow(inquiry: CommercialInquiryDto): CustomerInquiryListRow {
  return {
    id: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    createdDate: formatCustomerListDate(inquiry.inquiryDate || inquiry.createdAt),
    projectName: inquiry.projectName || inquiry.customerReference || '—',
    cableType: customerCableTypeLabel(inquiry),
    application: customerApplicationLabel(inquiry),
    quantityLabel: formatCustomerQuantityMeters(inquiryTotalQuantityMeters(inquiry)),
    status: inquiry.status,
    statusLabel: customerFacingInquiryStatusLabel(inquiry.status),
    statusTone: customerFacingInquiryStatusTone(inquiry.status),
    lastUpdated: formatCustomerListDate(inquiry.updatedAt || inquiry.inquiryDate),
    lineCount: inquiry.lines?.length || 0,
    actions: customerInquiryRowActions(inquiry),
  };
}

export function customerFacingQuotationStatusLabel(quotation: {
  status?: string | null;
  commercialOfferStatus?: string | null;
  issuedAt?: string | null;
}): string {
  if (quotation.issuedAt || String(quotation.commercialOfferStatus || '').toUpperCase() === 'ISSUED') {
    return 'Quotation Sent';
  }
  switch ((quotation.status || '').toUpperCase()) {
    case 'SUBMITTED':
      return 'Quotation Sent';
    case 'ACCEPTED':
      return 'Quotation Accepted';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    case 'SUPERSEDED':
      return 'Superseded';
    case 'OPEN':
    case 'DRAFT':
    default:
      return quotation.commercialOfferStatus === 'ISSUED' ? 'Quotation Sent' : 'In Preparation';
  }
}

export type CustomerQuotationListRow = {
  id: string;
  inquiryId: string;
  quotationNumber: string;
  inquiryNumber: string;
  projectName: string;
  issuedDate: string;
  validUntil: string;
  statusLabel: string;
  statusTone: BadgeTone;
  totalLabel: string;
  currency: string;
};

function quotationTone(label: string): BadgeTone {
  if (label === 'Quotation Sent' || label === 'Quotation Accepted') return 'copper';
  if (label === 'Rejected' || label === 'Cancelled') return 'error';
  return 'neutral';
}

export function sanitizeCustomerQuotationListItem(
  quotation: CommercialQuotationListDto
): CustomerQuotationListRow {
  const selling = quotation.sellingPrice != null ? Number(quotation.sellingPrice) : NaN;
  const currency = quotation.currency || 'USD';
  return {
    id: quotation.id,
    inquiryId: quotation.inquiryId,
    quotationNumber: quotation.quotationNumber,
    inquiryNumber: quotation.inquiry?.inquiryNumber || '—',
    projectName: quotation.inquiry?.projectName || quotation.inquiry?.customerReference || '—',
    issuedDate: formatCustomerListDate(quotation.issuedAt || quotation.createdAt),
    validUntil: formatCustomerListDate(quotation.validUntil),
    statusLabel: customerFacingQuotationStatusLabel(quotation),
    statusTone: quotationTone(customerFacingQuotationStatusLabel(quotation)),
    totalLabel:
      Number.isFinite(selling) && selling > 0
        ? `${currency} ${selling.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : '—',
    currency,
  };
}

export function exportInquiryListCsv(rows: CustomerInquiryListRow[]): string {
  const header = [
    'Inquiry No.',
    'Created Date',
    'Project Name/Reference',
    'Cable Type',
    'Application',
    'Quantity',
    'Status',
    'Last Updated',
  ];
  const body = rows.map((row) =>
    [
      row.inquiryNumber,
      row.createdDate,
      row.projectName,
      row.cableType,
      row.application,
      row.quantityLabel,
      row.statusLabel,
      row.lastUpdated,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(',')
  );
  return `${header.join(',')}\n${body.join('\n')}`;
}

export function presentationContainsCostingLeak(text: string): boolean {
  return COSTING_LEAK_RE.test(text);
}
