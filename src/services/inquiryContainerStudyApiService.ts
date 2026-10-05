export type InquiryContainerStudyWorkspaceDto = {
  inquiryId: string;
  inquiryNumber: string;
  study: {
    id: string;
    studyNumber: string;
    status: string;
    versionNo: number;
    currentResultId: string | null;
    currentSnapshotId: string | null;
  } | null;
  shipmentGroup: {
    id: string;
    status: string;
    destinationPortCode: string | null;
    incotermCode: string | null;
    containerTypePreferenceCode: string | null;
  } | null;
  shipmentIdentity?: {
    requestedDestination: string | null;
    destinationPortCode: string | null;
    destinationPortLabel: string;
    destinationConfigured: boolean;
    unresolvedDestination: string | null;
    destinationMessage: string | null;
    customerMasterDestinationConfigured?: boolean;
    shippingCostBlocked?: boolean;
    requestedIncoterm?: string | null;
    incotermCode: string | null;
    incotermLabel?: string;
    incotermConfigured: boolean;
    unresolvedIncoterm: string | null;
    incotermMessage?: string | null;
  };
  shipmentMasters?: {
    destinationPorts: Array<{ code: string; name: string }>;
    incoterms: Array<{ code: string; name: string }>;
    combinations?: Array<{
      countryCode: string;
      countryLabel: string;
      incotermCode: string;
      destinationPortCode: string;
      destinationPortName: string;
    }>;
  };
  region: 'Europe' | 'Africa' | null;
  stuffingMethod: 'Rolling';
  readiness: { ok: boolean; issues: Array<{ code: string; field?: string; message: string }> };
  incompleteContainerTypes: Array<{ code: string; description: string; dimensionsStatus?: string | null }>;
  physicalDrums: Array<{
    physicalDrumKey: string;
    drumCode: string;
    drumDescription?: string | null;
    drumLabel?: string;
    inquiryLineId?: string;
    inquiryLineNumber?: number;
    cuttingLengthM: number;
    instanceIndex: number;
    cableNetWeightKg?: number | null;
    emptyDrumNetWeightKg?: number | null;
    grossWeightKg: number | null;
  }>;
  summary: {
    totalDrums: number;
    totalCuttingLengthM?: number;
    totalNetWeightKg: number | null;
    totalVolumeLabel: string;
    estimatedContainers: number | null;
    recommendedTypeCode: string | null;
  };
  options: Array<{
    typeCode: string;
    description: string;
    internalDimensionsLabel: string;
    maxPayloadLabel: string;
    volumeLabel: string;
    requiredContainersLabel: string;
    utilizationLabel: string;
    allocationStatus: 'ALLOCATED' | 'PARTIAL' | 'UNALLOCATED' | 'NOT_READY' | 'NOT_USED';
    selectable: boolean;
    recommended: boolean;
    selected: boolean;
    costLabel: string | null;
    notReadyReason?: string;
  }>;
  unallocated: Array<{
    physicalDrumKey: string;
    sourceLineId: string;
    instanceIndex: number;
    reasonCode: string;
    detail: string;
  }>;
  algorithmVersionCode: string | null;
  configurationVersion: string | null;
  historicalResultIds: string[];
  confirmationBlocked: boolean;
  shippingCostFinancial?: {
    resolutionCode: string;
    amount: number | null;
    currency: string | null;
    shippingRateVersion: number | null;
    deliveryPoint: string | null;
    incotermCode: string | null;
    containerType: string | null;
    blocksPacking: false;
  };
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as { error?: string; code?: string };
    const raw = payload.error || `Request failed (${res.status})`;
    if (/V2 configuration workflow record/i.test(raw)) {
      throw new Error('Container Study could not resolve the drum-plan lineage. Please contact support.');
    }
    throw new Error(raw);
  }
  return data as T;
}

export async function fetchInquiryContainerStudyWorkspace(
  token: string,
  inquiryId: string,
  region?: 'Europe' | 'Africa' | null
): Promise<InquiryContainerStudyWorkspaceDto> {
  const params = region ? `?region=${encodeURIComponent(region)}` : '';
  const res = await fetch(`/api/v2/inquiries/${encodeURIComponent(inquiryId)}/container-study-workspace${params}`, {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function calculateInquiryContainerStudyWorkspace(
  token: string,
  inquiryId: string,
  region?: 'Europe' | 'Africa' | null
): Promise<InquiryContainerStudyWorkspaceDto> {
  const res = await fetch(`/api/v2/inquiries/${encodeURIComponent(inquiryId)}/container-study-workspace/calculate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(region ? { region } : {}),
  });
  return parseJson(res);
}

export async function selectInquiryContainerStudyOption(
  token: string,
  inquiryId: string,
  typeCode: string,
  region?: 'Europe' | 'Africa' | null
): Promise<InquiryContainerStudyWorkspaceDto> {
  const res = await fetch(`/api/v2/inquiries/${encodeURIComponent(inquiryId)}/container-study-workspace/select`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ typeCode, region }),
  });
  return parseJson(res);
}
