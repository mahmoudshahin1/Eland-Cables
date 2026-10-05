import { CreateInquiryInput } from '../../../domain/commercialDomain';
import {
  formatInquiryStatus,
  type CommercialInquiryDto,
  type CommercialInquiryLineDto,
  type InquiryListQuery,
} from '../../../services/commercialInquiryApiService';

export const V2_CUSTOMER_INQUIRY_JOURNEY_STAGES = [
  { id: 'cable', label: 'Cable' },
  { id: 'configure', label: 'Configure' },
  { id: 'cutting', label: 'Cutting' },
  { id: 'drum', label: 'Drum' },
  { id: 'shipment', label: 'Shipment' },
  { id: 'review', label: 'Review' },
  { id: 'submit', label: 'Submit' },
  { id: 'processing', label: 'Processing' },
  { id: 'quotation', label: 'Quotation' },
] as const;

/** @deprecated Presentation journey now derives live step state; kept for source scans. */
export const V2_CUSTOMER_INQUIRY_DEFERRED_STAGES = V2_CUSTOMER_INQUIRY_JOURNEY_STAGES;

const PROCESS_CODES = new Set(['VIP_FAST_TRACK', 'STANDARD_WORKFLOW']);

const CUSTOMER_HIDDEN_FIELDS = [
  'materialCost',
  'materialCostCurrency',
  'costingReadinessStatus',
  'costingCalculationId',
  'costingCalculated',
  'costingRunId',
] as const;

export type CustomerInquiryLoadKind = 'unauthorized' | 'forbidden' | 'not_found' | 'error';

export function readInquiryProcessCode(
  inquiry: Pick<CommercialInquiryDto, 'commercialMetadata'> & { inquiryProcessCode?: unknown }
): 'VIP_FAST_TRACK' | 'STANDARD_WORKFLOW' | null {
  const fromMeta = readProcessFromMetadata(inquiry.commercialMetadata);
  if (fromMeta) return fromMeta;
  if (inquiry.inquiryProcessCode === 'VIP_FAST_TRACK' || inquiry.inquiryProcessCode === 'STANDARD_WORKFLOW') {
    return inquiry.inquiryProcessCode;
  }
  return null;
}

function readProcessFromMetadata(metadata: unknown): 'VIP_FAST_TRACK' | 'STANDARD_WORKFLOW' | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const code = (metadata as Record<string, unknown>).inquiryProcessCode;
  if (code === 'VIP_FAST_TRACK' || code === 'STANDARD_WORKFLOW') return code;
  return null;
}

export function formatInquiryProcessLabel(code: string | null | undefined): string {
  if (code === 'VIP_FAST_TRACK') return 'VIP Fast Track';
  if (code === 'STANDARD_WORKFLOW') return 'Standard';
  return 'Assigned by Energya';
}

export function buildCustomerCreateInquiryInput(args: {
  companyName?: string | null;
  fullName?: string | null;
  projectName?: string;
  customerReference?: string;
}): CreateInquiryInput {
  const projectName = args.projectName?.trim();
  const customerReference = args.customerReference?.trim();
  const input: CreateInquiryInput = {
    customerName: args.companyName?.trim() || args.fullName?.trim() || undefined,
    contactPerson: args.fullName?.trim() || undefined,
    currency: 'USD',
    commercialMetadata: { workflowChannel: 'V2_CONFIGURATION' },
  };
  if (projectName) input.projectName = projectName;
  if (customerReference) input.customerReference = customerReference;
  return input;
}

/** List query for the authenticated customer — never send a client-supplied customerId. */
export function buildCustomerInquiryListQuery(args: {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): InquiryListQuery {
  const query: InquiryListQuery = {
    page: args.page && args.page > 0 ? args.page : 1,
    pageSize: args.pageSize && args.pageSize > 0 ? args.pageSize : 25,
    sortBy: 'updatedAt',
    sortDir: 'desc',
  };
  const q = args.q?.trim();
  if (q) query.q = q;
  const status = args.status?.trim();
  if (status) query.status = status;
  return query;
}

export function customerSafeLineSummary(line: CommercialInquiryLineDto): {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  lengthMeters: string;
} {
  return {
    id: line.id,
    lineNumber: line.lineNumber,
    description: line.cableDescription || line.itemCode || line.materialNumber || 'Cable line',
    quantity: String(line.requestedQuantity ?? '—'),
    lengthMeters: String(line.requestedLengthMeters ?? '—'),
  };
}

export function classifyCustomerInquiryError(err: unknown): CustomerInquiryLoadKind {
  const msg = err instanceof Error ? err.message : String(err);
  if (/sign in is required/i.test(msg)) return 'unauthorized';
  if (/access denied/i.test(msg) || /only view your own/i.test(msg)) return 'forbidden';
  if (/not found/i.test(msg)) return 'not_found';
  return 'error';
}

export function formatCustomerInquiryDate(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export function customerInquiryListRow(inquiry: CommercialInquiryDto): {
  id: string;
  inquiryNumber: string;
  date: string;
  status: string;
  statusLabel: string;
  processCode: string | null;
  processLabel: string;
  summary: string;
  lineCount: number;
  commercialState: string;
} {
  const processCode = readInquiryProcessCode(inquiry);
  const quotation = inquiry.quotations?.[0];
  return {
    id: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    date: formatCustomerInquiryDate(inquiry.inquiryDate),
    status: inquiry.status,
    statusLabel: formatInquiryStatus(inquiry.status),
    processCode,
    processLabel: formatInquiryProcessLabel(processCode),
    summary: inquiry.projectName || inquiry.customerReference || inquiry.notes || 'Cable inquiry',
    lineCount: inquiry.lines?.length ?? 0,
    commercialState: quotation?.quotationNumber
      ? `Quotation ${quotation.quotationNumber}${quotation.status ? ` · ${quotation.status}` : ''}`
      : formatInquiryStatus(inquiry.status),
  };
}

export function customerInquiryJourneySteps(inquiry: CommercialInquiryDto | null): Array<{
  id: string;
  label: string;
  state: 'not_started' | 'in_progress' | 'complete';
  hasArtifact?: boolean;
}> {
  if (!inquiry) {
    return V2_CUSTOMER_INQUIRY_JOURNEY_STAGES.map((stage) => ({
      id: stage.id,
      label: stage.label,
      state: 'not_started' as const,
    }));
  }

  const lines = inquiry.lines || [];
  const hasCable = lines.some((line) => Boolean(line.cableDescription || line.materialNumber || line.itemCode));
  const hasConfigure = lines.some((line) => Boolean(line.materialNumber || line.configurationPayload));
  const hasCutting = lines.some(
    (line) => line.cuttingLengthMeters != null || Boolean(line.drumSchedule?.rows?.length)
  );
  const hasDrum = lines.some((line) => Boolean(line.drumType || line.drumSchedule?.rows?.length));
  const meta = inquiry.commercialMetadata && typeof inquiry.commercialMetadata === 'object'
    ? (inquiry.commercialMetadata as Record<string, unknown>)
    : {};
  const hasShipment = Boolean(inquiry.incoterms || meta.deliveryDestination || meta.incoterms);
  const quotation = inquiry.quotations?.[0];
  const quotationIssued = Boolean(
    quotation &&
      (quotation.status === 'SUBMITTED' ||
        String(quotation.status || '').toUpperCase() === 'ISSUED' ||
        inquiry.status === 'QUOTED')
  );
  const hasQuotation = Boolean(quotation?.quotationNumber) || quotationIssued;
  const processed = Boolean(meta.vipLastCalculateSnapshot) || hasQuotation;
  const submitted = inquiry.status !== 'DRAFT' || processed;

  const flags = {
    cable: hasCable,
    configure: hasConfigure,
    cutting: hasCutting,
    drum: hasDrum,
    shipment: hasShipment,
    review: hasCable,
    submit: submitted,
    processing: processed,
    quotation: hasQuotation,
  } as const;

  let foundCurrent = false;
  return V2_CUSTOMER_INQUIRY_JOURNEY_STAGES.map((stage) => {
    const done = flags[stage.id as keyof typeof flags];
    let state: 'not_started' | 'in_progress' | 'complete' = 'not_started';
    if (done) {
      state = 'complete';
    } else if (!foundCurrent) {
      state = 'in_progress';
      foundCurrent = true;
    }
    return { id: stage.id, label: stage.label, state, hasArtifact: done };
  });
}

export function createInquiryInputContainsProcessChoice(input: CreateInquiryInput): boolean {
  const meta = input.commercialMetadata;
  if (meta && typeof meta === 'object') {
    for (const key of Object.keys(meta)) {
      if (key.toLowerCase().includes('inquiryprocess')) return true;
      if (PROCESS_CODES.has(String(meta[key]))) return true;
    }
  }
  return false;
}

export function htmlContainsCustomerCostingLeak(html: string): boolean {
  const hay = html.toLowerCase();
  return CUSTOMER_HIDDEN_FIELDS.some((field) => hay.includes(field.toLowerCase()))
    || /\bcosting\b/.test(hay)
    || hay.includes('raw material cost')
    || hay.includes('manufacturing cost')
    || hay.includes('g&amp;a')
    || hay.includes('g&a')
    || hay.includes('selling expense')
    || hay.includes('material margin');
}
