import type { SelectionStateV2 } from '../components/cable-configurator/v2/types';
import { httpClient } from '../api/httpClient';

export interface V2InquiryDto {
  id: string;
  inquiryNumber: string;
  customerId: string;
  customerMasterId: string | null;
  customerName: string;
  contactPerson: string | null;
  customerReference: string | null;
  inquiryDate: string;
  requestedDeliveryDate: string | null;
  currency: string;
  status: string;
  projectName: string | null;
  notes: string | null;
  workflowChannel: string | null;
  v2EngineeringSummary: unknown;
  createdBy: string | null;
  modifiedBy: string | null;
  versionNo: number;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  lines: V2InquiryLineDto[];
}

export interface V2ConfigurationSnapshotDto {
  snapshotId: string;
  versionNo: number;
  inquiryLineId: string;
  cableMaterialNumber: string | null;
  itemCode: string | null;
  customerCode: string | null;
  validationStatus: string;
  flowState: string;
  engineeringStatus: string;
  summaryDescription: string | null;
  catalogSource: string;
  catalogAuthoritative: boolean;
  bomGovernanceBlocked: boolean;
  unresolvedBomConflictCount: number;
  capturedAt: string;
}

export interface V2InquiryLineDto {
  id: string;
  lineNumber: number;
  materialNumber: string | null;
  customerCode: string | null;
  itemCode: string | null;
  cableDescription: string;
  requestedQuantity: number;
  quantityUom: string;
  requestedLengthMeters: number;
  cableAuthorityStatus: string;
  technicalOfficeRequestId: string | null;
  status: string;
  notes: string | null;
  v2CurrentSnapshotId: string | null;
  v2CurrentCuttingPlanId: string | null;
  v2CurrentDrumPlanId: string | null;
  cuttingRequirements?: Array<{
    id: string;
    requirementId: string;
    sequenceNo: number;
    nominalLengthM: number;
    toleranceMode: string;
    requestedDrumCount: number;
    currentCuttingPlanId: string | null;
    currentDrumPlanId: string | null;
  }>;
  snapshots: V2ConfigurationSnapshotDto[];
  currentCuttingPlan: {
    planId: string;
    versionNo: number;
    validationStatus: string;
    nominalLengthM: number;
    tolerancePercent: number;
  } | null;
  currentDrumPlan: {
    planId: string;
    versionNo: number;
    lifecycleStatus: string;
    validationStatus: string;
    drumCount: number;
    totalPlannedLengthM: number;
  } | null;
}

function v2InquiryPath(suffix = '') {
  return `/api/v2/inquiries${suffix}`;
}

export async function createV2Inquiry(
  token: string,
  input: {
    projectName?: string;
    customerReference?: string;
    contactPerson?: string;
    requestedDeliveryDate?: string;
    notes?: string;
  }
): Promise<V2InquiryDto> {
  const data = await httpClient.post<{ inquiry: V2InquiryDto }>(v2InquiryPath(), input, { token });
  return data.inquiry;
}

export async function fetchV2Inquiries(
  token: string,
  query: { page?: number; pageSize?: number; status?: string } = {}
): Promise<{ total: number; page: number; pageSize: number; inquiries: V2InquiryDto[] }> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.status) params.set('status', query.status);
  const qs = params.toString();
  return httpClient.get(`${v2InquiryPath()}${qs ? `?${qs}` : ''}`, { token });
}

export async function fetchV2Inquiry(token: string, id: string): Promise<V2InquiryDto> {
  const data = await httpClient.get<{ inquiry: V2InquiryDto }>(
    `${v2InquiryPath()}/${encodeURIComponent(id)}`,
    { token }
  );
  return data.inquiry;
}

export async function addV2InquiryLine(
  token: string,
  inquiryId: string,
  input: {
    cableDescription?: string;
    requestedQuantity?: number;
    quantityUom?: string;
    requestedLengthMeters?: number;
    notes?: string;
  }
): Promise<{ inquiry: V2InquiryDto; line: V2InquiryLineDto }> {
  return httpClient.post(
    `${v2InquiryPath()}/${encodeURIComponent(inquiryId)}/lines`,
    input,
    { token }
  );
}

export async function persistV2ConfigurationSnapshot(
  token: string,
  inquiryId: string,
  lineId: string,
  input: {
    selections: SelectionStateV2;
    catalogSource: 'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK';
    catalogAuthoritative: boolean;
    requestedQuantity?: number;
    quantityUom?: string;
    requestedLengthMeters?: number;
    cableDescription?: string;
  }
): Promise<{ inquiry: V2InquiryDto; line: V2InquiryLineDto; snapshot: V2ConfigurationSnapshotDto }> {
  return httpClient.post(
    `${v2InquiryPath()}/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/snapshots`,
    input,
    { token }
  );
}

export async function submitV2Inquiry(token: string, inquiryId: string): Promise<V2InquiryDto> {
  const data = await httpClient.post<{ inquiry: V2InquiryDto }>(
    `${v2InquiryPath()}/${encodeURIComponent(inquiryId)}/submit`,
    {},
    { token }
  );
  return data.inquiry;
}

export interface VipCalculateGateDto {
  gate: string;
  status: string;
  lineNumber?: number;
  message: string;
  code?: string;
}

export interface VipOptionalComponentDto {
  code: string;
  label: string;
  value: number;
  currency: string;
  source: 'CONFIGURED' | 'NOT_CONFIGURED' | 'NOT_APPLICABLE';
  reasonCode: string;
  warningMessage?: string;
  hasWarning: boolean;
}

export interface VipCalculateResultDto {
  status: 'COMPLETED' | 'BLOCKED' | 'PARTIAL' | 'QUOTATION_BLOCKED';
  inquiryId: string;
  inquiryNumber: string;
  gates: VipCalculateGateDto[];
  blockingReasons: string[];
  optionalComponents: VipOptionalComponentDto[];
  optionalWarnings: string[];
  lines: Array<{
    lineId: string;
    lineNumber: number;
    costingStatus: string;
    persisted: boolean;
    blockingReasons: string[];
    errorCode?: string;
  }>;
  quotation?: {
    id: string;
    quotationNumber: string;
    versionNo: number;
    status: string;
    created: boolean;
  } | null;
  financialOffer?: {
    id: string;
    inquiryTotal: string;
    created: boolean;
  } | null;
  decision5Status: string;
  idempotent: boolean;
}

export async function calculateVipInquiry(
  token: string,
  inquiryId: string,
  options?: { recalculate?: boolean }
): Promise<VipCalculateResultDto> {
  /** 409 is a governed BLOCKED/PARTIAL result, not a transport failure. */
  const res = await fetch(`${v2InquiryPath()}/${encodeURIComponent(inquiryId)}/calculate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recalculate: options?.recalculate === true }),
  });
  const data = (await res.json().catch(() => ({}))) as { result?: VipCalculateResultDto; error?: string };
  if (data.result) return data.result;
  throw new Error(data.error || `Automatic processing failed (${res.status})`);
}

export async function transitionV2EngineeringStatus(
  token: string,
  inquiryId: string,
  status: string
): Promise<V2InquiryDto> {
  const data = await httpClient.post<{ inquiry: V2InquiryDto }>(
    `${v2InquiryPath()}/${encodeURIComponent(inquiryId)}/engineering-status`,
    { status },
    { token }
  );
  return data.inquiry;
}
