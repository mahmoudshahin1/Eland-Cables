import { HttpError, httpClient } from '../api/httpClient';
import type { CreateInquiryInput, UpdateInquiryInput, UpdateInquiryLineInput, AddInquiryLineInput } from '../domain/commercialDomain';
import { InquiryLineAttachmentSummary, LINE_ATTACHMENT_KIND_TECHNICAL_OFFER } from '../domain/inquiryLineAttachments';
import { parseInquiryDrumSchedule } from '../domain/inquiryDrumSchedule';

export type InquiryLineAttachmentDto = InquiryLineAttachmentSummary;

export interface CommercialInquiryLineDto {
  id: string;
  lineNumber: number;
  materialNumber?: string | null;
  customerCode?: string | null;
  itemCode?: string | null;
  cableDescription: string;
  configurationPayload?: Record<string, unknown> | null;
  requestedQuantity: number | string;
  quantityUom?: string | null;
  requestedLengthMeters: number | string;
  cuttingLengthMeters?: number | string | null;
  drumType?: string | null;
  cableTolerancePercent?: number | string | null;
  drumSchedule?: {
    cableTolerancePercent: number;
    rows: Array<{
      drumCode: string;
      noOfDrums: number;
      cuttingLengthM: number;
      drumTolerancePercent: number;
    }>;
    lifecycleStatus?: 'DRAFT' | 'CONFIRMED' | 'SUPERSEDED';
    versionNo?: number;
    confirmedAt?: string | null;
  } | null;
  materialCost?: number | string | null;
  materialCostCurrency?: string | null;
  cableAuthorityStatus?: string;
  customerCostingStatus?: string;
  costingReadinessStatus?: string;
  costingCalculationId?: string | null;
  costingCalculated?: boolean;
  commercialPricingState?: 'UNPRICED' | 'PRICED' | 'RECALCULATION_REQUIRED';
  commercialUnitPrice?: number | null;
  commercialLineTotal?: number | null;
  status?: string;
  notes?: string | null;
  attachments?: InquiryLineAttachmentDto[];
}

export interface CommercialInquiryDto {
  id: string;
  inquiryNumber: string;
  customerId: string;
  customerName: string;
  contactPerson?: string | null;
  customerReference?: string | null;
  inquiryDate: string;
  requestedDeliveryDate?: string | null;
  currency: string;
  incoterms?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  projectName?: string | null;
  status: string;
  notes?: string | null;
  createdBy?: string | null;
  modifiedBy?: string | null;
  salesAgent?: string | null;
  quotationOwner?: string | null;
  versionNo?: number;
  isCurrent?: boolean;
  supersedesInquiryId?: string | null;
  inquiryGroupKey?: string | null;
  commercialMetadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  lines?: CommercialInquiryLineDto[];
  quotations?: { id?: string; quotationNumber?: string; versionNo?: number; status?: string; costingCalculationId?: string | null }[];
  commercialProductsTotal?: number | null;
  commercialValueState?: 'UNPRICED' | 'PRICED' | 'RECALCULATION_REQUIRED';
  attachments?: InquiryAttachmentDto[];
}

export interface InquiryAttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedBy?: string | null;
  createdAt: string;
}

export interface InquiryListResponse {
  total: number;
  page: number;
  pageSize: number;
  inquiries: CommercialInquiryDto[];
}

export interface InquiryListQuery {
  q?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'inquiryDate' | 'updatedAt' | 'customerName' | 'status';
  sortDir?: 'asc' | 'desc';
  isCurrent?: boolean;
  customerId?: string;
}

export async function fetchCommercialInquiries(
  token: string,
  query: InquiryListQuery = {}
): Promise<InquiryListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDir) params.set('sortDir', query.sortDir);
  if (query.isCurrent === false) params.set('isCurrent', 'false');
  if (query.customerId) params.set('customerId', query.customerId);
  return httpClient.get<InquiryListResponse>(`/api/inquiries?${params.toString()}`, { token });
}

/** Customer-scoped commercial quotation list from GET /api/quotations. */
export interface CommercialQuotationListDto {
  id: string;
  quotationNumber: string;
  inquiryId: string;
  customerId?: string;
  customerName?: string;
  status: string;
  currency?: string;
  incoterms?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  issuedAt?: string | null;
  validUntil?: string | null;
  sellingPrice?: number | string | null;
  commercialOfferStatus?: string | null;
  versionNo?: number;
  createdAt?: string;
  inquiry?: {
    id?: string;
    inquiryNumber?: string;
    projectName?: string | null;
    customerReference?: string | null;
    status?: string;
  } | null;
  lines?: Array<{
    id?: string;
    lineNumber?: number;
    itemDescription?: string;
    plannedLengthM?: number | string | null;
    lengthMeters?: number | string | null;
    sellingPrice?: number | string | null;
    quantityUom?: string | null;
  }>;
}

export async function fetchCommercialQuotations(
  token: string,
  query: { q?: string; status?: string; isCurrent?: boolean } = {}
): Promise<{ quotations: CommercialQuotationListDto[] }> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.isCurrent !== undefined) params.set('isCurrent', String(query.isCurrent));
  const qs = params.toString();
  return httpClient.get<{ quotations: CommercialQuotationListDto[] }>(`/api/quotations${qs ? `?${qs}` : ''}`, {
    token,
  });
}

export type InquiryShipmentMastersDto = {
  destinationPorts: Array<{ code: string; name: string }>;
  incoterms: Array<{ code: string; name: string; active?: boolean }>;
  combinations: Array<{
    countryCode: string;
    countryLabel: string;
    incotermCode: string;
    destinationPortCode: string;
    destinationPortName: string;
  }>;
};

export async function fetchCommercialInquiryBundle(
  token: string,
  id: string
): Promise<{ inquiry: CommercialInquiryDto; shipmentMasters: InquiryShipmentMastersDto }> {
  const data = await httpClient.get<{
    inquiry?: CommercialInquiryDto;
    shipmentMasters?: InquiryShipmentMastersDto;
    id?: string;
  }>(`/api/inquiries/${encodeURIComponent(id)}`, { token });
  const inquiry = data.inquiry && data.inquiry.id ? data.inquiry : (data as CommercialInquiryDto);
  return {
    inquiry,
    shipmentMasters: data.shipmentMasters || { destinationPorts: [], incoterms: [], combinations: [] },
  };
}

export async function fetchCommercialInquiry(token: string, id: string): Promise<CommercialInquiryDto> {
  const bundle = await fetchCommercialInquiryBundle(token, id);
  return bundle.inquiry;
}

export async function fetchCommercialInquiryVersions(
  token: string,
  id: string
): Promise<CommercialInquiryDto[]> {
  const data = await httpClient.get<{ versions: CommercialInquiryDto[] }>(
    `/api/inquiries/${encodeURIComponent(id)}/versions`,
    { token }
  );
  return data.versions;
}

export async function createCommercialInquiry(
  token: string,
  input: CreateInquiryInput
): Promise<CommercialInquiryDto> {
  const data = await httpClient.post<{ inquiry: CommercialInquiryDto }>('/api/inquiries', input, { token });
  return data.inquiry;
}

export async function updateCommercialInquiry(
  token: string,
  id: string,
  input: UpdateInquiryInput
): Promise<CommercialInquiryDto> {
  const data = await httpClient.patch<{ inquiry: CommercialInquiryDto }>(
    `/api/inquiries/${encodeURIComponent(id)}`,
    input,
    { token }
  );
  return data.inquiry;
}

export async function submitCommercialInquiry(token: string, inquiryId: string): Promise<CommercialInquiryDto> {
  const data = await httpClient.post<{ inquiry: CommercialInquiryDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/submit`,
    undefined,
    { token }
  );
  return data.inquiry;
}

export async function cancelCommercialInquiry(token: string, inquiryId: string): Promise<CommercialInquiryDto> {
  const data = await httpClient.post<{ inquiry: CommercialInquiryDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/cancel`,
    undefined,
    { token }
  );
  return data.inquiry;
}

export async function createCommercialInquiryVersion(
  token: string,
  inquiryId: string
): Promise<CommercialInquiryDto> {
  const data = await httpClient.post<{ inquiry: CommercialInquiryDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/new-version`,
    undefined,
    { token }
  );
  return data.inquiry;
}

export async function generateQuotationFromInquiry(token: string, inquiryId: string): Promise<unknown> {
  return httpClient.post(`/api/inquiries/${encodeURIComponent(inquiryId)}/quotation`, {}, { token });
}

export async function addCommercialInquiryLine(
  token: string,
  inquiryId: string,
  input: AddInquiryLineInput
): Promise<CommercialInquiryDto> {
  const data = await httpClient.post<{ inquiry?: CommercialInquiryDto; line: CommercialInquiryLineDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines`,
    input,
    { token }
  );
  if (data.inquiry) return data.inquiry;
  return fetchCommercialInquiry(token, inquiryId);
}

export async function confirmCommercialDrumSchedule(
  token: string,
  inquiryId: string,
  lineId: string,
  input: {
    rows?: Array<{
      drumCode: string;
      noOfDrums?: number | string;
      cuttingLengthM: number | string;
      drumTolerancePercent?: number | string;
    }>;
    cableTolerancePercent?: number | string;
  }
): Promise<{
  lifecycleStatus: 'CONFIRMED';
  line: CommercialInquiryLineDto;
  schedule: NonNullable<CommercialInquiryLineDto['drumSchedule']>;
}> {
  const data = await httpClient.post<{
    line: CommercialInquiryLineDto;
    schedule: NonNullable<CommercialInquiryLineDto['drumSchedule']>;
    lifecycleStatus?: string;
  }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-schedule/confirm`,
    input,
    { token }
  );
  return {
    lifecycleStatus: 'CONFIRMED',
    line: data.line,
    schedule: data.schedule,
  };
}

export async function updateCommercialInquiryLine(
  token: string,
  inquiryId: string,
  lineId: string,
  input: UpdateInquiryLineInput
): Promise<CommercialInquiryLineDto> {
  const data = await httpClient.patch<{ line: CommercialInquiryLineDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}`,
    input,
    { token }
  );
  return data.line;
}

export async function deleteCommercialInquiryLine(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<void> {
  await httpClient.del(`/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}`, { token });
}

export async function duplicateCommercialInquiryLine(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<CommercialInquiryDto> {
  await httpClient.post(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/duplicate`,
    undefined,
    { token }
  );
  return fetchCommercialInquiry(token, inquiryId);
}

export async function reorderCommercialInquiryLines(
  token: string,
  inquiryId: string,
  lineIds: string[]
): Promise<CommercialInquiryDto> {
  const data = await httpClient.post<{ inquiry: CommercialInquiryDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/reorder`,
    { lineIds },
    { token }
  );
  return data.inquiry;
}

export interface LineCostingResult {
  status: string;
  calculationId?: string;
  costingRunId?: string;
  persisted?: boolean;
  errorCode?: string;
  blockingReasons?: string[];
  materialBreakdown?: unknown[];
  layers?: unknown[];
  scrapCostStatus?: string;
  incotermChargeStatus?: string;
  extensionLayers?: {
    logistics?: { status?: string; amount?: number | null; message?: string };
    packing?: { status?: string };
    copper?: { status?: string };
    aluminium?: { status?: string };
  };
  totals?: {
    materialCost?: string;
    scrapAdjustmentCost?: string;
    manufacturingTotal?: string | null;
    lineTotal?: string;
    layerTotals?: Record<string, string>;
  };
}

export interface InquiryLineCalculateOutcome {
  lineId: string;
  lineNumber: number;
  status: string;
  code: string;
  persisted: boolean;
  blockingReasons: string[];
  result?: LineCostingResult;
}

export async function calculateInquiryLineCost(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<{ result: LineCostingResult; inquiry?: CommercialInquiryDto }> {
  const data = await httpClient.post<{
    result: LineCostingResult;
    inquiry?: CommercialInquiryDto;
    blockingReasons?: string[];
    error?: string;
  }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/calculate-cost`,
    undefined,
    { token }
  );
  return { result: data.result, inquiry: data.inquiry };
}

export async function calculateInquiryCost(
  token: string,
  inquiryId: string
): Promise<{ inquiry?: CommercialInquiryDto; lines: InquiryLineCalculateOutcome[] }> {
  return httpClient.post<{ inquiry?: CommercialInquiryDto; lines: InquiryLineCalculateOutcome[] }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/calculate-cost`,
    undefined,
    { token }
  );
}

export async function fetchInquiryLineCosting(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<{ status: string; breakdown: unknown; line: CommercialInquiryLineDto }> {
  return httpClient.get<{ status: string; breakdown: unknown; line: CommercialInquiryLineDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/costing`,
    { token }
  );
}

export interface InquiryActivityEvent {
  id: string;
  at: string;
  actorId?: string | null;
  actorName?: string | null;
  entity: string;
  entityId: string;
  action: string;
  message?: string | null;
}

export async function fetchInquiryActivity(
  token: string,
  inquiryId: string
): Promise<InquiryActivityEvent[]> {
  const data = await httpClient.get<{ events: InquiryActivityEvent[] }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/activity`,
    { token }
  );
  return data.events;
}

export function formatInquiryStatus(status: string): string {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT':
      return 'Open';
    case 'SUBMITTED':
      return 'Submitted';
    case 'UNDER_REVIEW':
      return 'Under Review';
    case 'QUOTED':
      return 'Quotation Generated';
    case 'CANCELLED':
      return 'Canceled';
    case 'CLOSED':
      return 'Closed';
    default:
      return status;
  }
}

export function inquiryDisplayRef(inquiry: CommercialInquiryDto): string {
  return inquiry.customerReference || inquiry.inquiryNumber;
}

export type InquiryLineLengthInput = Pick<
  CommercialInquiryLineDto,
  'requestedQuantity' | 'requestedLengthMeters' | 'cuttingLengthMeters'
> & {
  drumSchedule?: unknown;
};

function positiveNumber(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveInquiryLineTotalLengthMeters(line: InquiryLineLengthInput): number {
  const quantity = positiveNumber(line.requestedQuantity);
  const cuttingLength = positiveNumber(line.cuttingLengthMeters);

  let scheduleSum = 0;
  let distinctCuttings = 0;
  if (line.drumSchedule) {
    const parsed = parseInquiryDrumSchedule(line.drumSchedule);
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

  // Mixed cutting lengths stay as SUM(per-drum lengths). Never collapse to one length.
  if (distinctCuttings > 1 && scheduleSum > 0) return scheduleSum;

  // Inquiry line display: Total Length (m) = cutting length × number of drums.
  if (quantity != null && cuttingLength != null) {
    return quantity * cuttingLength;
  }

  if (scheduleSum > 0) return scheduleSum;
  return positiveNumber(line.requestedLengthMeters) ?? 0;
}

export function resolveInquiryLineDrumsQuantity(
  line: Pick<CommercialInquiryLineDto, 'requestedQuantity'> & { drumSchedule?: unknown }
): number {
  if (line.drumSchedule) {
    const parsed = parseInquiryDrumSchedule(line.drumSchedule);
    if (parsed && parsed.rows && parsed.rows.length > 0) {
      const sum = parsed.rows.reduce((acc, row) => acc + (positiveNumber(row.noOfDrums) ?? 0), 0);
      if (sum > 0) return sum;
    }
  }
  return positiveNumber(line.requestedQuantity) ?? 1;
}

export function inquiryLinePreview(inquiry: CommercialInquiryDto): {
  cable: string;
  length: string;
  drum: string;
} {
  const lines = inquiry.lines || [];
  if (!lines.length) return { cable: '—', length: '—', drum: '—' };
  const first = lines[0];
  const totalLength = lines.reduce((sum, line) => sum + resolveInquiryLineTotalLengthMeters(line), 0);
  const drums = Array.from(new Set(lines.map((l) => l.drumType).filter(Boolean)));
  return {
    cable:
      lines.length === 1
        ? first.cableDescription?.slice(0, 48) || '—'
        : `${first.cableDescription?.slice(0, 32) || 'Cable'} (+${lines.length - 1} more)`,
    length: `${totalLength.toLocaleString()} m`,
    drum: drums.length ? drums.join(', ') : '—',
  };
}

export function inquiryHasCalculatedCost(inquiry: CommercialInquiryDto): boolean {
  const lines = inquiry.lines || [];
  if (!lines.length) return false;
  return lines.some((line) => line.materialNumber && line.materialCost != null);
}

export function inquiryCalculationStatus(inquiry: CommercialInquiryDto): 'none' | 'partial' | 'complete' {
  const mapped = (inquiry.lines || []).filter((l) => l.materialNumber);
  if (!mapped.length) return 'none';
  const calculated = mapped.filter((l) => l.materialCost != null);
  if (!calculated.length) return 'none';
  if (calculated.length < mapped.length) return 'partial';
  return 'complete';
}

/** Persisted line Value (material + other configured costing params). Null/blank → em dash, never invented 0. */
export function formatInquiryLineValue(
  line: Pick<CommercialInquiryLineDto, 'materialCost'>
): string {
  if (line.materialCost == null || line.materialCost === '') return '—';
  const amount = Number(line.materialCost);
  if (!Number.isFinite(amount)) return '—';
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Inquiry header currency only — line-level currency cannot differ. */
export function resolveInquiryLineCurrency(
  _line: Pick<CommercialInquiryLineDto, 'materialCostCurrency'>,
  inquiryCurrency?: string | null
): string {
  const fromInquiry = inquiryCurrency?.trim();
  if (fromInquiry) return fromInquiry;
  return '—';
}

export function inquiryEstimatedValue(inquiry: CommercialInquiryDto): number | null {
  const lines = inquiry.lines || [];
  if (!lines.length) return null;
  let total = 0;
  let hasCost = false;
  for (const line of lines) {
    if (line.materialCost != null) {
      total += Number(line.materialCost) || 0;
      hasCost = true;
    }
  }
  return hasCost ? total : null;
}

export function inquirySummary(inquiry: CommercialInquiryDto) {
  const lines = inquiry.lines || [];
  const totalQty = lines.reduce((sum, line) => sum + (Number(line.requestedQuantity) || 0), 0);
  const totalLength = lines.reduce((sum, line) => sum + resolveInquiryLineTotalLengthMeters(line), 0);
  const estimatedValue = inquiryEstimatedValue(inquiry);
  return {
    totalLines: lines.length,
    totalQty,
    totalLength,
    currency: inquiry.currency,
    estimatedValue,
  };
}

/** Legacy adapter for ErpCustomerRequestView (deprecated path). */
export async function fetchInquiryFieldDefinitions(
  token: string
): Promise<{ fields: Array<{ fieldCode: string; label?: string; visible?: boolean; required?: boolean; customerVisible?: boolean; displayOrder?: number; entityCode?: string }>; source: string }> {
  return httpClient.get('/api/inquiries/meta/field-definitions', { token });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadInquiryAttachment(
  token: string,
  inquiryId: string,
  file: File
): Promise<InquiryAttachmentDto> {
  const contentBase64 = await fileToBase64(file);
  const data = await httpClient.post<{ attachment: InquiryAttachmentDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/attachments`,
    { fileName: file.name, mimeType: file.type, contentBase64 },
    { token }
  );
  return data.attachment;
}

export async function deleteInquiryAttachment(token: string, inquiryId: string, attachmentId: string): Promise<void> {
  await httpClient.del(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { token }
  );
}

export async function downloadInquiryAttachment(token: string, inquiryId: string, attachment: InquiryAttachmentDto): Promise<void> {
  let blob: Blob;
  try {
    ({ blob } = await httpClient.getBlob(
      `/api/inquiries/${encodeURIComponent(inquiryId)}/attachments/${encodeURIComponent(attachment.id)}`,
      { token }
    ));
  } catch (err) {
    if (err instanceof HttpError) throw new Error('Download failed');
    throw err;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function listInquiryLineAttachments(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<InquiryLineAttachmentDto[]> {
  const data = await httpClient.get<{ attachments: InquiryLineAttachmentDto[] }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/attachments`,
    { token }
  );
  return data.attachments || [];
}

export async function uploadInquiryLineAttachment(
  token: string,
  inquiryId: string,
  lineId: string,
  file: File,
  kind = LINE_ATTACHMENT_KIND_TECHNICAL_OFFER
): Promise<InquiryLineAttachmentDto> {
  const contentBase64 = await fileToBase64(file);
  const data = await httpClient.post<{ attachment: InquiryLineAttachmentDto }>(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/attachments`,
    {
      kind,
      fileName: file.name,
      mimeType: file.type,
      contentBase64,
    },
    { token }
  );
  return data.attachment;
}

export async function deleteInquiryLineAttachment(
  token: string,
  inquiryId: string,
  lineId: string,
  attachmentId: string
): Promise<void> {
  await httpClient.del(
    `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { token }
  );
}

export async function downloadInquiryLineAttachment(
  token: string,
  inquiryId: string,
  lineId: string,
  attachment: InquiryLineAttachmentDto
): Promise<void> {
  let blob: Blob;
  try {
    ({ blob } = await httpClient.getBlob(
      `/api/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/attachments/${encodeURIComponent(attachment.id)}`,
      { token }
    ));
  } catch (err) {
    if (err instanceof HttpError) throw new Error('Download failed');
    throw err;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function mapCommercialInquiryToErpHeader(
  inquiry: CommercialInquiryDto,
  currentUser?: { fullName?: string; companyName?: string; email?: string }
) {
  return {
    id: inquiry.id,
    transactionType: 'Customer Request' as const,
    trxDate: inquiry.inquiryDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    refNo: inquiry.customerReference || inquiry.inquiryNumber,
    customerName: inquiry.customerName,
    organization: inquiry.customerName,
    contactPerson: inquiry.contactPerson || currentUser?.fullName || '',
    salesAgent: inquiry.salesAgent || '',
    projectName: inquiry.projectName || '',
    currency: inquiry.currency,
    status: formatInquiryStatus(inquiry.status) as 'Opened',
    versionNo: inquiry.versionNo || 1,
    remarks: inquiry.notes || '',
    quotationOwner: inquiry.quotationOwner || inquiry.createdBy || '',
    items: (inquiry.lines || []).map((line, index) => ({
      id: line.id,
      serialNo: line.lineNumber || index + 1,
      itemCode: line.itemCode || '',
      cableCode: line.materialNumber || '',
      customerCode: line.customerCode || '',
      description: line.cableDescription,
      uom: line.quantityUom || 'KM',
      quantity: Number(line.requestedQuantity) || 0,
      drumRequired: line.drumType || '',
    })),
  };
}

export async function exportInquiryExcel(token: string, inquiryId: string): Promise<void> {
  let blob: Blob;
  let headers: Headers;
  try {
    ({ blob, headers } = await httpClient.getBlob(`/api/inquiries/${inquiryId}/export`, { token }));
  } catch (err) {
    if (err instanceof HttpError) {
      const generic = `Request failed (${err.status})`;
      throw new Error(err.error && err.error !== generic ? err.error : `Inquiry export failed (${err.status})`);
    }
    throw err;
  }
  const disposition = headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || `Inquiry_${inquiryId}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
