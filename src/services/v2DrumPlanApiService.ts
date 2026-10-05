import type { DrumPlanHandoffDto } from '../domain/v2DrumPlanService';
import type { AuthoritativeDrumPlanDto } from '../api/drumPlanApi';
import type { V2InquiryDto, V2InquiryLineDto } from './v2InquiryConfigurationApiService';

export interface V2DrumPlanLineDto {
  id: string;
  lineNo: number;
  drumCode: string;
  drumMasterId: string | null;
  numberOfDrums: number;
  cuttingLengthM: number;
  isRemainderDrum: boolean;
  clearanceMm: number | null;
  capacityM: number | null;
  maxLoadKg: number | null;
  plannedCableLengthM: number;
  cableWeightKg: number | null;
  emptyDrumNetWeightKg: number | null;
  grossLoadedDrumWeightKg: number | null;
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent: number | null;
  validationStatus: string | null;
  validationReasons: unknown;
  engineering: unknown;
}

export interface V2DrumPlanDto {
  id: string;
  planId: string;
  versionNo: number;
  inquiryLineId: string;
  cuttingLengthRequirementId?: string | null;
  cuttingLengthPlanId: string;
  cuttingLengthPlanVersionNo: number;
  cuttingLengthPlanIdString: string;
  configurationSnapshotId: string;
  configurationSnapshotIdString: string;
  lifecycleStatus: string;
  validationStatus: string;
  selectionMethod: string;
  cableTolerancePercent: number;
  totalPlannedLengthM: number;
  drumCount: number;
  remainderLengthM: number;
  quantityReconciliationStatus: string | null;
  quantityReconciliationMessages: unknown;
  notes: string | null;
  actorContext: {
    userId: string | null;
    email: string | null;
    role: string | null;
  };
  capturedAt: string;
  updatedAt: string;
  lines: V2DrumPlanLineDto[];
}

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

export async function fetchV2DrumSelectionContext(
  token: string,
  inquiryId: string,
  lineId: string
) {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-selection/context`,
    { headers: authHeaders(token) }
  );
  return parseJson(res);
}

export async function fetchV2DrumSelectionCandidates(
  token: string,
  inquiryId: string,
  lineId: string
) {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-selection/candidates`,
    { method: 'POST', headers: authHeaders(token), body: '{}' }
  );
  return parseJson(res);
}

export async function previewV2DrumPlan(
  token: string,
  inquiryId: string,
  lineId: string,
  input: {
    selectionMethod: 'AUTOMATIC' | 'MANUAL';
    totalOrderLengthM?: number;
    rows?: Array<{
      drumCode: string;
      numberOfDrums: number;
      cuttingLengthM: number;
      drumTolerancePercent?: number;
    }>;
  }
): Promise<{ plan: AuthoritativeDrumPlanDto }> {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-selection/preview`,
    { method: 'POST', headers: authHeaders(token), body: JSON.stringify(input) }
  );
  return parseJson(res);
}

export async function createDraftV2DrumPlan(
  token: string,
  inquiryId: string,
  lineId: string,
  input: {
    selectionMethod: 'AUTOMATIC' | 'MANUAL';
    cuttingLengthPlanId?: string;
    cuttingLengthRequirementId?: string;
    totalOrderLengthM?: number;
    rows?: Array<{
      drumCode: string;
      numberOfDrums: number;
      cuttingLengthM: number;
      drumTolerancePercent?: number;
    }>;
    notes?: string;
  }
): Promise<{ inquiry: V2InquiryDto; line: V2InquiryLineDto; drumPlan: V2DrumPlanDto }> {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-plans`,
    { method: 'POST', headers: authHeaders(token), body: JSON.stringify(input) }
  );
  return parseJson(res);
}

export async function validateV2DrumPlan(
  token: string,
  inquiryId: string,
  lineId: string,
  planId: string
): Promise<{ inquiry: V2InquiryDto; line: V2InquiryLineDto; drumPlan: V2DrumPlanDto }> {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-plans/${encodeURIComponent(planId)}/validate`,
    { method: 'POST', headers: authHeaders(token), body: '{}' }
  );
  return parseJson(res);
}

export async function confirmV2DrumPlan(
  token: string,
  inquiryId: string,
  lineId: string,
  planId: string
): Promise<{ inquiry: V2InquiryDto; line: V2InquiryLineDto; drumPlan: V2DrumPlanDto }> {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-plans/${encodeURIComponent(planId)}/confirm`,
    { method: 'POST', headers: authHeaders(token), body: '{}' }
  );
  return parseJson(res);
}

export async function fetchV2DrumPlans(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<V2DrumPlanDto[]> {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-plans`,
    { headers: authHeaders(token) }
  );
  const data = await parseJson<{ plans: V2DrumPlanDto[] }>(res);
  return data.plans;
}

export async function fetchV2CurrentDrumPlan(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<V2DrumPlanDto | null> {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-plans/current`,
    { headers: authHeaders(token) }
  );
  const data = await parseJson<{ plan: V2DrumPlanDto | null }>(res);
  return data.plan;
}

export async function fetchV2DrumPlanHandoff(
  token: string,
  inquiryId: string,
  lineId: string,
  planId: string
): Promise<DrumPlanHandoffDto> {
  const res = await fetch(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/drum-plans/${encodeURIComponent(planId)}/handoff`,
    { headers: authHeaders(token) }
  );
  const data = await parseJson<{ handoff: DrumPlanHandoffDto }>(res);
  return data.handoff;
}

export type { DrumPlanHandoffDto };
