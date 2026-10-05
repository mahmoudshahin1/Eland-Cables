export interface V2CostingRunDto {
  calculationId?: string;
  costingRunId?: string;
  calculationNumber?: string;
  costingRunNumber?: string | null;
  materialCost: number;
  currency: string;
  status: 'READY' | 'NOT_READY';
  blockingReasons: string[];
  errorCode?: string;
  persisted: boolean;
  decision5Status: string;
  lineage: {
    inquiryLineId: string;
    configurationSnapshotId: string;
    cuttingLengthPlanId: string;
    drumPlanId: string;
    drumPlanVersionNo: number;
    bomVersion: number | null;
    engineeringRevision: number | null;
    workflowChannel: string;
    decision5Status: string;
  };
}

export interface V2CommercialPricingPreviewDto {
  materialCost: number;
  costingCurrency: string;
  pricingCurrency: string;
  finalSellingPrice: number | null;
  baseSellingPrice: number | null;
  unitSellingPrice: number | null;
  pricingStatus: string;
  blockingReasons: string[];
  decision5Status: string;
  boundaryNote: string;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function previewV2CostingRun(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<V2CostingRunDto> {
  const res = await fetch(`/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/preview`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'V2 costing preview failed.');
  return body;
}

export async function calculateV2CostingRun(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<V2CostingRunDto> {
  const res = await fetch(`/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/calculate`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'V2 costing calculate failed.');
  return body;
}

export async function fetchV2CurrentCostingRun(
  token: string,
  inquiryId: string,
  lineId: string
): Promise<{ run: V2CostingRunDto | null }> {
  const res = await fetch(`/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/current`, {
    headers: authHeaders(token),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to load V2 costing run.');
  return body;
}

export async function previewV2CommercialPricing(
  token: string,
  inquiryId: string,
  lineId: string,
  options?: { pricingCurrency?: string; requestedDiscountPercentage?: number }
): Promise<V2CommercialPricingPreviewDto> {
  const res = await fetch(`/api/v2/inquiries/${inquiryId}/lines/${lineId}/commercial-pricing/preview`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(options || {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'V2 commercial pricing preview failed.');
  return body;
}
