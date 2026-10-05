const BASE = '/api/customer-service';

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

export type ComplaintCategoryDto = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  subcategories?: Array<{ id: string; code: string; name: string; sortOrder: number }>;
};

export type CustomerServiceCaseListItem = {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  priority: string;
  issueDate: string;
  createdAt: string;
  categoryName: string;
  inquiryNumber: string | null;
  inquiryId: string | null;
};

export type CustomerServiceCaseDto = {
  id: string;
  caseNumber: string;
  subject: string;
  description: string;
  status: string;
  caseType?: string | null;
  priority: string;
  issueDate: string;
  category: { id: string; code: string; name: string } | null;
  subcategory: { id: string; code: string; name: string } | null;
  inquiry: { id: string; inquiryNumber: string; projectName: string | null; status: string } | null;
  inquiryLine: {
    id: string;
    lineNumber: number;
    materialNumber: string | null;
    cableDescription: string;
    drumType: string | null;
  } | null;
  cable: { materialNumber: string; description?: string; itemCode?: string } | null;
  quotation: { id: string; quotationNumber: string; versionNo: number; status: string } | null;
  salesOrder: { id: string; salesOrderNumber: string; status: string } | null;
  shipment: { id: string; groupCode: string; status: string; destinationPortCode: string | null } | null;
  drum: { id: string; drumCode: string; drumType: string | null } | null;
  drumType: string | null;
  affectedQuantity: number | null;
  affectedQuantityUom: string | null;
  affectedLengthMeters: number | null;
  requestedResolution: string | null;
  assignedDepartment: string | null;
  assignedDepartmentLabel: string;
  assignedRepresentativeName: string | null;
  createdAt: string;
  updatedAt: string;
  comments: Array<{
    id: string;
    visibility: string;
    body: string;
    createdByName?: string | null;
    createdAt: string;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    visibility: string;
    createdAt: string;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedByName?: string | null;
    note?: string | null;
    createdAt: string;
  }>;
  resolution: {
    resolutionSummary: string;
    resolvedAt: string;
    customerConfirmed: boolean;
    customerConfirmedAt?: string | null;
    reopenRequested: boolean;
  } | null;
};

export type CustomerServiceSummary = {
  open: number;
  inProgress: number;
  resolved: number;
  awaitingCustomer: number;
  closed: number;
  all: number;
};

export type CustomerServiceMeta = {
  statuses: Array<{ code: string; label: string }>;
  priorities: Array<{ code: string; label: string }>;
  caseTypes?: Array<{ code: string; label: string }>;
  requestedResolutions: Array<{ code: string; label: string }>;
  departments: Array<{ code: string; label: string }>;
  categories: ComplaintCategoryDto[];
};

export type SupportChatMessageDto = {
  id: string;
  role: string;
  visibility: string;
  body: string;
  createdByName?: string | null;
  createdAt: string;
};

export type SupportChatSessionDto = {
  id: string;
  channel: string;
  engineerStatus: string;
  caseId: string | null;
  caseNumber: string | null;
  caseStatus: string | null;
  assignedRepresentativeName: string | null;
  inquiryId: string | null;
  messages: SupportChatMessageDto[];
  action?: string | null;
};

export type CaseReferenceInquiry = {
  id: string;
  inquiryNumber: string;
  projectName: string | null;
  status: string;
  inquiryDate: string;
  customerReference: string | null;
};

export type CaseReferenceLine = {
  id: string;
  lineNumber: number;
  materialNumber: string | null;
  cableDescription: string;
  drumType: string | null;
  requestedQuantity: number;
  quantityUom: string;
  requestedLengthMeters: number;
};

export async function fetchCustomerServiceMeta(token: string): Promise<CustomerServiceMeta> {
  const res = await fetch(`${BASE}/meta`, { headers: authHeaders(token) });
  return parseJson<CustomerServiceMeta>(res);
}

export async function fetchCustomerServiceSummary(token: string): Promise<CustomerServiceSummary> {
  const res = await fetch(`${BASE}/cases/summary`, { headers: authHeaders(token) });
  const data = await parseJson<{ summary: CustomerServiceSummary }>(res);
  return data.summary;
}

export async function fetchCustomerServiceCases(
  token: string,
  query?: {
    tab?: string;
    status?: string;
    q?: string;
    categoryId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ total: number; page: number; pageSize: number; cases: CustomerServiceCaseListItem[] }> {
  const params = new URLSearchParams();
  if (query?.tab) params.set('tab', query.tab);
  if (query?.status) params.set('status', query.status);
  if (query?.q) params.set('q', query.q);
  if (query?.categoryId) params.set('categoryId', query.categoryId);
  if (query?.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query?.dateTo) params.set('dateTo', query.dateTo);
  if (query?.page) params.set('page', String(query.page));
  if (query?.pageSize) params.set('pageSize', String(query.pageSize));
  const q = params.toString();
  const res = await fetch(`${BASE}/cases${q ? `?${q}` : ''}`, { headers: authHeaders(token) });
  return parseJson(res);
}

export async function fetchCustomerServiceCase(token: string, id: string): Promise<CustomerServiceCaseDto> {
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(id)}`, { headers: authHeaders(token) });
  const data = await parseJson<{ case: CustomerServiceCaseDto }>(res);
  return data.case;
}

export async function createCustomerServiceCase(
  token: string,
  input: Record<string, unknown>
): Promise<CustomerServiceCaseDto> {
  const res = await fetch(`${BASE}/cases`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ case: CustomerServiceCaseDto }>(res);
  return data.case;
}

export async function addCustomerServiceComment(
  token: string,
  id: string,
  body: string
): Promise<CustomerServiceCaseDto> {
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ body }),
  });
  const data = await parseJson<{ case: CustomerServiceCaseDto }>(res);
  return data.case;
}

export async function addCustomerServiceAttachment(
  token: string,
  id: string,
  input: { fileName: string; mimeType?: string; contentBase64: string }
): Promise<CustomerServiceCaseDto> {
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(id)}/attachments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ case: CustomerServiceCaseDto }>(res);
  return data.case;
}

export async function confirmCustomerServiceResolution(
  token: string,
  id: string,
  accepted: boolean
): Promise<CustomerServiceCaseDto> {
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(id)}/confirm-resolution`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ accepted }),
  });
  const data = await parseJson<{ case: CustomerServiceCaseDto }>(res);
  return data.case;
}

export async function requestCustomerServiceReopen(token: string, id: string): Promise<CustomerServiceCaseDto> {
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(id)}/request-reopen`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  const data = await parseJson<{ case: CustomerServiceCaseDto }>(res);
  return data.case;
}

export async function fetchCaseReferenceInquiries(token: string): Promise<CaseReferenceInquiry[]> {
  const res = await fetch(`${BASE}/references/inquiries`, { headers: authHeaders(token) });
  const data = await parseJson<{ inquiries: CaseReferenceInquiry[] }>(res);
  return data.inquiries || [];
}

export async function fetchCaseReferenceLines(token: string, inquiryId: string): Promise<CaseReferenceLine[]> {
  const res = await fetch(`${BASE}/references/inquiries/${encodeURIComponent(inquiryId)}/lines`, {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ lines: CaseReferenceLine[] }>(res);
  return data.lines || [];
}

export async function resolveCaseReferences(
  token: string,
  inquiryId: string,
  inquiryLineId?: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ inquiryId });
  if (inquiryLineId) params.set('inquiryLineId', inquiryLineId);
  const res = await fetch(`${BASE}/references/resolve?${params}`, { headers: authHeaders(token) });
  const data = await parseJson<{ related: Record<string, unknown> }>(res);
  return data.related;
}

export function customerServiceAttachmentUrl(caseId: string, attachmentId: string): string {
  return `${BASE}/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export async function fetchSupportChatSession(
  token: string,
  channel: 'AI_ASSISTANT' | 'ENGINEER'
): Promise<SupportChatSessionDto> {
  const res = await fetch(`${BASE}/chat?channel=${encodeURIComponent(channel)}`, { headers: authHeaders(token) });
  const data = await parseJson<{ session: SupportChatSessionDto }>(res);
  return data.session;
}

export async function postSupportChatMessage(
  token: string,
  input: { channel: 'AI_ASSISTANT' | 'ENGINEER'; body: string; chipId?: string }
): Promise<SupportChatSessionDto> {
  const res = await fetch(`${BASE}/chat/messages`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ session: SupportChatSessionDto }>(res);
  return data.session;
}

export async function requestSupportEngineer(
  token: string,
  input?: { note?: string; inquiryId?: string }
): Promise<SupportChatSessionDto> {
  const res = await fetch(`${BASE}/chat/request-engineer`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input || {}),
  });
  const data = await parseJson<{ session: SupportChatSessionDto }>(res);
  return data.session;
}
