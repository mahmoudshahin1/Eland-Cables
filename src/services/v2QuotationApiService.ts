const API_BASE = '/api/v2/inquiries';

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export interface V2QuotationReadinessDto {
  ready: boolean;
  stage: string;
  blockingReasons: string[];
  warnings: string[];
  decision5Status: string;
}

export interface V2QuotationDto {
  id: string;
  quotationNumber: string;
  versionNo: number;
  status: string;
  issuedAt?: string | null;
  validUntil?: string | null;
  validityDays?: number | null;
  commercialPricingStatus: string;
  technicalOfferStatus: string;
  commercialOfferStatus: string;
  sellingPrice?: number | null;
  quotationApprovedAt?: string | null;
  quotationReturnReason?: string | null;
  customerDecision?: string | null;
  customerDecisionReason?: string | null;
  customerDecisionAt?: string | null;
  lines: Array<{
    id: string;
    lineNumber: number;
    itemDescription: string;
    plannedLengthM?: number | null;
    v2DrumPlanId?: string | null;
    costingCalculationId?: string | null;
    sellingPrice?: number | null;
  }>;
}

export async function fetchV2QuotationReadiness(
  token: string,
  inquiryId: string,
  stage = 'ISSUE'
): Promise<V2QuotationReadinessDto> {
  return request(token, `/${inquiryId}/quotation/readiness?stage=${encodeURIComponent(stage)}`);
}

export async function fetchV2Quotation(
  token: string,
  inquiryId: string
): Promise<{ quotation: V2QuotationDto | null }> {
  return request(token, `/${inquiryId}/quotation`);
}

export async function createV2QuotationDraft(
  token: string,
  inquiryId: string,
  body?: { validityDays?: number }
): Promise<{ quotation: V2QuotationDto }> {
  return request(token, `/${inquiryId}/quotation`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

export async function priceV2Quotation(
  token: string,
  inquiryId: string,
  body?: { requestedDiscountPercentage?: number }
): Promise<{ quotation: V2QuotationDto }> {
  return request(token, `/${inquiryId}/quotation/price`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

export async function approveV2Quotation(
  token: string,
  inquiryId: string
): Promise<{ quotation: V2QuotationDto }> {
  return request(token, `/${inquiryId}/quotation/approve`, { method: 'POST', body: '{}' });
}

export async function issueV2Quotation(
  token: string,
  inquiryId: string
): Promise<{ quotation: V2QuotationDto }> {
  return request(token, `/${inquiryId}/quotation/issue`, { method: 'POST', body: '{}' });
}

export async function reviseV2Quotation(
  token: string,
  inquiryId: string
): Promise<{ quotation: V2QuotationDto }> {
  return request(token, `/${inquiryId}/quotation/revise`, { method: 'POST', body: '{}' });
}

export async function recordCustomerQuotationDecision(
  token: string,
  inquiryId: string,
  body: { decision: 'ACCEPT' | 'REJECT' | 'CLARIFICATION'; reason?: string }
): Promise<{ quotation: V2QuotationDto }> {
  return request(token, `/${inquiryId}/quotation/customer-decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function returnV2Quotation(
  token: string,
  inquiryId: string,
  reason: string
): Promise<{ quotation: V2QuotationDto }> {
  return request(token, `/${inquiryId}/quotation/return`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function v2QuotationPdfUrl(
  inquiryId: string,
  formatOrOptions?: 'html' | { format?: 'html'; draft?: boolean; print?: boolean }
): string {
  const options =
    typeof formatOrOptions === 'string' ? { format: formatOrOptions } : formatOrOptions || {};
  const params = new URLSearchParams();
  if (options.format) params.set('format', options.format);
  if (options.draft) params.set('draft', '1');
  if (options.print) params.set('print', '1');
  const q = params.toString();
  return `${API_BASE}/${inquiryId}/quotation/pdf${q ? `?${q}` : ''}`;
}

export async function fetchV2QuotationDocument(
  token: string,
  inquiryId: string,
  options?: { format?: 'html'; draft?: boolean; print?: boolean }
): Promise<Blob> {
  const res = await fetch(v2QuotationPdfUrl(inquiryId, options), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.blob();
}
