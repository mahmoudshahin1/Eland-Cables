/**
 * Phase 1 commercial fulfillment API client (no business rules in UI).
 * D365 remains NOT_IMPLEMENTED — these routes only create/read EPC documents.
 */

import {
  classifyFulfillmentException,
  fulfillmentExceptionTitle,
  type FulfillmentExceptionKind,
} from './commercialFulfillmentWorkflow';

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export class FulfillmentApiError extends Error {
  code?: string;
  status: number;
  details?: unknown;
  kind: FulfillmentExceptionKind;

  constructor(message: string, opts: { code?: string; status: number; details?: unknown }) {
    super(message);
    this.name = 'FulfillmentApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
    this.kind = classifyFulfillmentException({
      message,
      code: opts.code,
      status: opts.status,
    });
  }

  get title(): string {
    return fulfillmentExceptionTitle(this.kind);
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const payload = data as { error?: string; code?: string; details?: unknown };
    throw new FulfillmentApiError(payload.error || `Request failed (${res.status})`, {
      code: payload.code,
      status: res.status,
      details: payload.details,
    });
  }
  return data as T;
}

export type FulfillmentType = 'DIRECT_ORDER' | 'SALES_AGREEMENT';

export interface QuotationFulfillmentDto {
  id: string;
  quotationNumber: string;
  versionNo: number;
  status: string;
  commercialPricingStatus?: string | null;
  commercialApprovalStatus?: string | null;
  fulfillmentType?: FulfillmentType | null;
  sellingPrice?: number | string | null;
  isCurrent?: boolean;
  inquiryId?: string | null;
}

export interface EpcSalesOrderLineDto {
  id: string;
  lineNumber: number;
  materialNumber?: string | null;
  itemDescription: string;
  customerCableCode?: string | null;
  quantity: number | string;
  quantityUom?: string | null;
  unitPrice?: number | string | null;
  lineAmount?: number | string | null;
  cuttingLengthMeters?: number | string | null;
  numberOfCuts?: number | null;
  drumType?: string | null;
  drumQuantity?: number | string | null;
  drumSize?: string | null;
  availableStockQuantity?: number | string | null;
  configurationId?: string | null;
  engineeringRevision?: string | null;
  bomVersion?: string | null;
  costingRunId?: string | null;
  costingCalculationId?: string | null;
}

export interface EpcSalesOrderDto {
  id: string;
  salesOrderNumber: string;
  status: string;
  orderOrigin: string;
  orderFulfillmentMode: string;
  customerId: string;
  customerName: string;
  customerReference?: string | null;
  shipTo?: string | null;
  currency?: string | null;
  commitmentId?: string | null;
  quotationId?: string | null;
  inquiryId?: string | null;
  agreementReleaseId?: string | null;
  integrationStatus: string;
  d365SalesOrderNumber?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  lines?: EpcSalesOrderLineDto[];
  commitment?: { id: string; commitmentNumber: string; fulfillmentType?: string } | null;
  quotation?: {
    id: string;
    quotationNumber: string;
    versionNo: number;
    inquiryId?: string | null;
  } | null;
  agreementRelease?: {
    id: string;
    releaseNumber: string;
    agreement?: { id: string; agreementNumber: string } | null;
  } | null;
}

export interface SalesAgreementLineDto {
  id: string;
  lineNumber: number;
  materialNumber?: string | null;
  itemDescription: string;
  customerCableCode?: string | null;
  committedQuantity: number | string;
  releasedQuantity: number | string;
  remainingQuantity: number | string;
  quantityUom?: string | null;
  unitPrice?: number | string | null;
  cuttingLengthMeters?: number | string | null;
  numberOfCuts?: number | null;
  drumType?: string | null;
  configurationId?: string | null;
  engineeringRevision?: string | null;
  bomVersion?: string | null;
  costingRunId?: string | null;
  costingCalculationId?: string | null;
}

export interface AgreementReleaseDto {
  id: string;
  releaseNumber: string;
  status: string;
  totalReleasedQuantity: number | string;
  quantityUom?: string | null;
  createdAt?: string;
  createdBy?: string | null;
  salesOrder?: { id: string; salesOrderNumber: string; integrationStatus?: string } | null;
  lines?: Array<{
    id: string;
    lineNumber: number;
    agreementLineId?: string | null;
    quantity: number | string;
    itemDescription?: string;
  }>;
}

export interface SalesAgreementDto {
  id: string;
  agreementNumber: string;
  status: string;
  customerId: string;
  customerName: string;
  currency?: string | null;
  totalCommittedQuantity: number | string;
  totalReleasedQuantity: number | string;
  remainingQuantity: number | string;
  quantityUom?: string | null;
  integrationStatus: string;
  d365AgreementNumber?: string | null;
  commitmentId: string;
  quotationId: string;
  createdBy?: string | null;
  createdAt?: string;
  lines?: SalesAgreementLineDto[];
  releases?: AgreementReleaseDto[];
  commitment?: { id: string; commitmentNumber: string } | null;
  quotation?: {
    id: string;
    quotationNumber: string;
    versionNo: number;
    inquiryId?: string | null;
  } | null;
}

export async function fetchQuotation(token: string, idOrNumber: string): Promise<QuotationFulfillmentDto> {
  const res = await fetch(`/api/quotations/${encodeURIComponent(idOrNumber)}`, {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ quotation: QuotationFulfillmentDto }>(res);
  return data.quotation;
}

export async function approveCommercialQuotationApi(
  token: string,
  quotationId: string,
  fulfillmentType: FulfillmentType
): Promise<QuotationFulfillmentDto> {
  const res = await fetch(`/api/quotations/${encodeURIComponent(quotationId)}/approve-commercial`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ fulfillmentType }),
  });
  const data = await parseJson<{ quotation: QuotationFulfillmentDto }>(res);
  return data.quotation;
}

export async function createSalesOrderFromQuotationApi(token: string, quotationRevisionId: string) {
  const res = await fetch(`/api/sales-orders/from-quotation/${encodeURIComponent(quotationRevisionId)}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  return parseJson<{ salesOrder: EpcSalesOrderDto; message?: string }>(res);
}

export async function createSalesAgreementFromQuotationApi(token: string, quotationRevisionId: string) {
  const res = await fetch(`/api/sales-agreements/from-quotation/${encodeURIComponent(quotationRevisionId)}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  return parseJson<{ agreement: SalesAgreementDto; message?: string }>(res);
}

export async function createAgreementReleaseApi(
  token: string,
  agreementId: string,
  lines: Array<{ agreementLineId: string; quantity: number }>
) {
  const res = await fetch(`/api/sales-agreements/${encodeURIComponent(agreementId)}/releases`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ lines }),
  });
  return parseJson<{
    release: AgreementReleaseDto;
    salesOrder: EpcSalesOrderDto;
    message?: string;
  }>(res);
}

/** Direct MTS — no quotation / commitment. Sales-authorized only. */
export async function createDirectMtsSalesOrderApi(
  token: string,
  body: {
    customerId: string;
    customerName?: string;
    customerReference?: string;
    shipTo?: string;
    idempotencyKey?: string;
    lines: Array<{
      materialNumber: string;
      quantity: number;
      unitPrice?: number;
      cuttingLengthMeters?: number;
      numberOfCuts?: number;
      drumType?: string;
      drumQuantity?: number;
      availableStockQuantity?: number;
    }>;
  }
) {
  const res = await fetch('/api/sales-orders/direct-mts', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return parseJson<{ salesOrder: EpcSalesOrderDto; message?: string }>(res);
}

export async function listSalesOrdersApi(token: string, opts?: { commitmentId?: string }) {
  const q = new URLSearchParams();
  if (opts?.commitmentId) q.set('commitmentId', opts.commitmentId);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(`/api/sales-orders${suffix}`, { headers: authHeaders(token) });
  const data = await parseJson<{ salesOrders: EpcSalesOrderDto[] }>(res);
  return data.salesOrders;
}

export async function getSalesOrderApi(token: string, idOrNumber: string) {
  const res = await fetch(`/api/sales-orders/${encodeURIComponent(idOrNumber)}`, {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ salesOrder: EpcSalesOrderDto }>(res);
  return data.salesOrder;
}

export async function listSalesAgreementsApi(token: string, opts?: { commitmentId?: string }) {
  const q = new URLSearchParams();
  if (opts?.commitmentId) q.set('commitmentId', opts.commitmentId);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(`/api/sales-agreements${suffix}`, { headers: authHeaders(token) });
  const data = await parseJson<{ agreements: SalesAgreementDto[] }>(res);
  return data.agreements;
}

export async function getSalesAgreementApi(token: string, idOrNumber: string) {
  const res = await fetch(`/api/sales-agreements/${encodeURIComponent(idOrNumber)}`, {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ agreement: SalesAgreementDto }>(res);
  return data.agreement;
}

export function formatFulfillmentError(err: unknown): { title: string; message: string; kind: FulfillmentExceptionKind } {
  if (err instanceof FulfillmentApiError) {
    return { title: err.title, message: err.message, kind: err.kind };
  }
  const message = err instanceof Error ? err.message : 'Request failed';
  const kind = classifyFulfillmentException({ message });
  return { title: fulfillmentExceptionTitle(kind), message, kind };
}
