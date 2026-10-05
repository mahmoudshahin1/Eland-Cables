import { HttpError, httpClient } from './httpClient';

/** Existing backend Cable Authority evaluate route. Do not invent a second path. */
export const CABLE_AUTHORITY_EVALUATE_PATH = '/api/cables/evaluate';

export type CableAuthorityConfigDto = {
  customerCode?: string;
  itemCode?: string;
  materialNumber?: string;
  family?: string;
  voltage?: string;
  conductor?: string;
  conductorSize?: string | number;
  cores?: string | number;
  insulation?: string;
  screen?: string;
  armour?: string;
  sheath?: string;
  coreColour?: string;
  diameter?: number;
};

export type CableAuthorityFailedRuleDto = {
  field: string;
  message: string;
};

export type CableAuthorityMatchDto = {
  id: string;
  materialNumber: string;
  itemCode: string;
  customerCode: string;
  description: string;
  family?: string | null;
  voltage?: string | null;
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  coreColour?: string | null;
  diameter?: number | null;
  status?: string | null;
  approvalStatus?: string | null;
};

export type CableAuthorityDecisionCode =
  | 'EXISTING_CABLE'
  | 'TECHNICALLY_VALID_NOT_MASTER'
  | 'INVALID_CONFIGURATION'
  | 'CONFIGURATION_REQUIRED';

export type CableAuthorityDecisionDto = {
  code: CableAuthorityDecisionCode;
  message: string;
  technicalOfficeEligible: boolean;
  quotationAllowed: boolean;
  cable?: CableAuthorityMatchDto;
  matches: CableAuthorityMatchDto[];
  failedRules: CableAuthorityFailedRuleDto[];
  matchAttributesUsed: string[];
};

export type EvaluateCableAuthorityRequest = {
  config: CableAuthorityConfigDto;
};

export type EvaluateCableAuthorityResponse = {
  decision: CableAuthorityDecisionDto;
  evaluationMode?: string;
  customerScopeApplied?: string | null;
};

export type CableEvaluateHttpStatus = 400 | 401 | 403 | 409 | 500;

export function evaluateCableViaApi(
  body: EvaluateCableAuthorityRequest,
  options?: { token?: string | null }
): Promise<EvaluateCableAuthorityResponse> {
  return httpClient.post<EvaluateCableAuthorityResponse>(CABLE_AUTHORITY_EVALUATE_PATH, body, options);
}

export function describeCableEvaluateError(err: unknown): {
  status?: number;
  message: string;
  code?: string;
} {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      message: err.error || err.message,
      code: err.code,
    };
  }
  return { message: err instanceof Error ? err.message : 'Cable evaluation failed.' };
}
