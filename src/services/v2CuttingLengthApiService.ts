import { httpClient } from '../api/httpClient';
import type { DrumSelectionHandoffDto } from '../domain/v2CuttingLengthService';
import type { V2InquiryDto, V2InquiryLineDto } from './v2InquiryConfigurationApiService';

export interface V2CuttingLengthPlanDto {
  id: string;
  planId: string;
  versionNo: number;
  inquiryLineId: string;
  cuttingLengthRequirementId: string | null;
  configurationSnapshotId: string;
  configurationSnapshotVersionNo: number;
  configurationSnapshotIdString: string;
  nominalLengthM: number;
  tolerancePercent: number;
  toleranceMode: string;
  positiveTolerancePercent: number;
  negativeTolerancePercent: number;
  requestedDrumCount: number;
  minLengthM: number;
  maxLengthM: number;
  validationStatus: string;
  validationMessages: unknown;
  notes: string | null;
  actorContext: {
    userId: string | null;
    email: string | null;
    role: string | null;
  };
  capturedAt: string;
}

function cuttingPath(inquiryId: string, lineId: string, suffix = '') {
  return `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/lines/${encodeURIComponent(lineId)}/cutting-plans${suffix}`;
}

export type CuttingPlanInput = {
  configurationSnapshotId?: string;
  nominalLengthM: number;
  tolerancePercent?: number;
  toleranceMode?: 'NONE' | 'POSITIVE' | 'NEGATIVE' | 'SYMMETRIC';
  positiveTolerancePercent?: number;
  negativeTolerancePercent?: number;
  requestedDrumCount?: number;
  addRequirement?: boolean;
  cuttingLengthRequirementId?: string;
  notes?: string;
};

export async function persistV2CuttingLengthPlan(
  token: string,
  inquiryId: string,
  lineId: string,
  input: CuttingPlanInput
): Promise<{
  inquiry: V2InquiryDto;
  line: V2InquiryLineDto;
  plan: V2CuttingLengthPlanDto;
  handoff: DrumSelectionHandoffDto;
}> {
  return httpClient.post(cuttingPath(inquiryId, lineId), input, { token });
}

export async function previewV2CuttingLengthPlan(
  token: string,
  inquiryId: string,
  lineId: string,
  input: CuttingPlanInput
): Promise<{ preview: true; persisted: false; validation: { validationStatus: string; validationMessages: unknown[] } }> {
  return httpClient.post(cuttingPath(inquiryId, lineId, '/preview'), input, { token });
}

export async function fetchV2CuttingPlans(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<V2CuttingLengthPlanDto[]> {
  const data = await httpClient.get<{ plans: V2CuttingLengthPlanDto[] }>(cuttingPath(inquiryId, lineId), { token });
  return data.plans;
}

export async function fetchV2CurrentCuttingPlan(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<V2CuttingLengthPlanDto | null> {
  const data = await httpClient.get<{ plan: V2CuttingLengthPlanDto | null }>(
    cuttingPath(inquiryId, lineId, '/current'),
    { token }
  );
  return data.plan;
}

export async function fetchV2CuttingPlanHandoff(
  token: string,
  inquiryId: string,
  lineId: string,
  planId: string
): Promise<DrumSelectionHandoffDto> {
  const data = await httpClient.get<{ handoff: DrumSelectionHandoffDto }>(
    cuttingPath(inquiryId, lineId, `/${encodeURIComponent(planId)}/handoff`),
    { token }
  );
  return data.handoff;
}

export type { DrumSelectionHandoffDto };
