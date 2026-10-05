const COMMITMENTS_BASE = '/api/commercial-commitments';

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as { error?: string; code?: string };
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface CustomerCommitmentDto {
  id: string;
  commitmentNumber: string;
  status: string;
  quotationId: string;
  quotationNumber: string;
  quotationVersionNo: number;
  fulfillmentType: string;
  currency: string;
  totalCommittedQuantity: number | string;
  totalCommittedAmount?: number | string | null;
  quantityUom?: string | null;
  remainingQuantity?: number | string | null;
  expirationDate?: string | null;
  createdAt?: string;
}

export async function listCustomerCommitments(
  token: string,
  opts?: { status?: string; inquiryId?: string }
): Promise<CustomerCommitmentDto[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.inquiryId) params.set('inquiryId', opts.inquiryId);
  const q = params.toString();
  const res = await fetch(`${COMMITMENTS_BASE}${q ? `?${q}` : ''}`, {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ commitments: CustomerCommitmentDto[] }>(res);
  return data.commitments;
}

export async function fetchCustomerCommitment(
  token: string,
  idOrNumber: string
): Promise<CustomerCommitmentDto> {
  const res = await fetch(`${COMMITMENTS_BASE}/${encodeURIComponent(idOrNumber)}`, {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ commitment: CustomerCommitmentDto }>(res);
  return data.commitment;
}

export async function createCustomerCommitmentFromQuotation(
  token: string,
  quotationId: string,
  fulfillmentType?: 'DIRECT_ORDER' | 'SALES_AGREEMENT'
): Promise<CustomerCommitmentDto> {
  const res = await fetch(COMMITMENTS_BASE, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ quotationId, fulfillmentType }),
  });
  const data = await parseJson<{ commitment: CustomerCommitmentDto }>(res);
  return data.commitment;
}

export interface CustomerSalesOrderDto {
  id: string;
  salesOrderNumber: string;
  status: string;
  orderOrigin: string;
  orderFulfillmentMode: string;
  integrationStatus: string;
  commitmentId?: string | null;
  createdAt?: string;
  lines?: Array<{ lineNumber: number; itemDescription: string; quantity: number | string; quantityUom?: string | null }>;
}

export interface CustomerSalesAgreementDto {
  id: string;
  agreementNumber: string;
  status: string;
  integrationStatus: string;
  totalCommittedQuantity: number | string;
  totalReleasedQuantity: number | string;
  remainingQuantity: number | string;
  quantityUom?: string | null;
  releases?: Array<{
    id: string;
    releaseNumber: string;
    status: string;
    totalReleasedQuantity: number | string;
    salesOrder?: { salesOrderNumber: string; status: string; integrationStatus?: string } | null;
  }>;
}

export interface CustomerCommitmentFulfillmentDto {
  commitment: CustomerCommitmentDto & {
    salesOrders?: CustomerSalesOrderDto[];
    salesAgreements?: CustomerSalesAgreementDto[];
  };
}

export async function fetchCustomerCommitmentFulfillment(
  token: string,
  commitmentId: string
): Promise<CustomerCommitmentFulfillmentDto> {
  const res = await fetch(`${COMMITMENTS_BASE}/${encodeURIComponent(commitmentId)}`, {
    headers: authHeaders(token),
  });
  return parseJson<CustomerCommitmentFulfillmentDto>(res);
}

export async function listCustomerSalesOrders(
  token: string,
  opts?: { commitmentId?: string }
): Promise<CustomerSalesOrderDto[]> {
  const params = new URLSearchParams();
  if (opts?.commitmentId) params.set('commitmentId', opts.commitmentId);
  const q = params.toString();
  const res = await fetch(`/api/sales-orders${q ? `?${q}` : ''}`, { headers: authHeaders(token) });
  const data = await parseJson<{ salesOrders: CustomerSalesOrderDto[] }>(res);
  return data.salesOrders;
}
