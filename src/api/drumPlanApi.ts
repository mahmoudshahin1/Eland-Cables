import { HttpError, httpClient } from './httpClient';

/** Existing backend drum optimization route. Do not invent a second path. */
export const DRUM_PLAN_OPTIMIZE_PATH = '/api/master/drums/optimize';
export const DRUM_PLAN_VALIDATE_PATH = '/api/master/drums/validate';
export const DRUM_PLAN_CANDIDATES_PATH = '/api/master/drums/candidates';

/** Soft upper bound so the UI does not hang indefinitely. */
export const DRUM_PLAN_API_TIMEOUT_MS = 10_000;

export type DrumPlanCableDto = {
  cableDiameterMm: number;
  approxWeightKgKm: number;
  outputDiameterMm?: number | null;
};

export type DrumPlanLineDto = {
  drumId: string;
  drumCode: string;
  numberOfDrums: number;
  cuttingLengthM: number;
  nominalCuttingLengthM: number;
  cableTolerancePercent: number;
  drumTolerancePercent: number;
  minimumAllowedLengthM: number;
  maximumAllowedLengthM: number;
  maximumUsableLengthM: number | null;
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent: number | null;
  cableWeightKg: number | null;
  emptyDrumNetWeightKg: number | null;
  grossLoadedDrumWeightKg: number | null;
  validationStatus: 'VALID' | 'NOT_SUITABLE' | 'INCOMPLETE';
  validationReasons: string[];
  engineering?: {
    windingsPerLayer: number | null;
    layers: number | null;
    geometricalCapacityMeters: number | null;
    loadLimitedCapacityMeters: number | null;
    clearanceUsedMm: number | null;
    outputDiameterMm: number | null;
    capacityStatus: string;
  };
};

export type AuthoritativeDrumPlanDto = {
  method: 'MANUAL' | 'AUTOMATIC';
  selectionMethod: 'MANUAL' | 'AUTOMATIC';
  cableTolerancePercent: number;
  totalLengthM: number;
  lines: DrumPlanLineDto[];
  isValid: boolean;
  blockingReasons: string[];
  rankingNotes: string[];
  outcome?: string;
};

export type EvaluatedDrumCandidateDto = {
  drum: {
    id: string;
    drumCode: string;
    drumType?: string | null;
    description?: string | null;
    flange: number;
    barrel: number;
    innerWidth: number;
    capacity?: number | null;
    clearanceMm?: number | null;
    maxWeight?: number | null;
    emptyDrumNetWeightKg?: number | null;
    status?: string;
  };
  capacity: {
    status?: string;
    maximumUsableLengthMeters?: number | null;
    emptyDrumNetWeightKg?: number | null;
    windingsPerLayer?: number | null;
    layers?: number | null;
    geometricalCapacityMeters?: number | null;
    loadLimitedCapacityMeters?: number | null;
  };
  evaluationStatus: 'SUITABLE' | 'UNSUITABLE' | 'INCOMPLETE_ENGINEERING_DATA';
  missingFields?: string[];
  rejectionReasons?: string[];
  warnings?: string[];
  decision?: string;
  diagnostic?: {
    requiredMaximumLengthM?: number;
  };
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent: number | null;
  cableWeightKg: number | null;
  grossLoadedDrumWeightKg: number | null;
  reasons: string[];
};

export type DrumMasterEngineeringGapDto = {
  rootCause: 'MASTER_DATA_COMPLETENESS' | 'NONE';
  activeDrumCount: number;
  populated: {
    flange: number;
    barrel: number;
    innerWidth: number;
    clearanceMm: number;
    maxLoadKg: number;
    emptyDrumNetWeightKg: number;
    capacity: number;
  };
  missing: {
    clearanceMm: number;
    maxLoadKg: number;
    emptyDrumNetWeightKg: number;
  };
  capacityUomNote: string;
  minimumMasterDataUpdate: string[];
  importTemplateColumns: string[];
};

export type OptimizeDrumPlanRequest = {
  cable: DrumPlanCableDto;
  totalOrderLengthM?: number;
  requestedDrumCount?: number;
  requirements?: Array<{
    totalOrderLengthM: number;
    requestedDrumCount?: number;
  }>;
  cableTolerancePercent: number;
  drumTolerancePercent?: number;
  includeEngineering?: boolean;
};

export type ValidateDrumPlanRequest = {
  cable: DrumPlanCableDto;
  cableTolerancePercent: number;
  rows: Array<{
    drumCode: string;
    numberOfDrums: number;
    cuttingLengthM: number;
    drumTolerancePercent: number;
  }>;
  includeEngineering?: boolean;
};

export type ListDrumCandidatesRequest = {
  cable: DrumPlanCableDto;
  cuttingLengthM: number;
  cableTolerancePercent: number;
};

export type OptimizeDrumPlanResponse = {
  plan: AuthoritativeDrumPlanDto;
};

export type ValidateDrumPlanResponse = {
  plan: AuthoritativeDrumPlanDto;
};

export type ListDrumCandidatesResponse = {
  suitable: EvaluatedDrumCandidateDto[];
  incomplete: EvaluatedDrumCandidateDto[];
  unsuitable: EvaluatedDrumCandidateDto[];
  summary?: {
    suitableCount: number;
    incompleteCount: number;
    unsuitableCount: number;
    drumCount: number;
  };
  engineeringGap?: DrumMasterEngineeringGapDto;
};

export type DrumPlanApiFailureKind = 'timeout' | 'http' | 'network' | 'aborted';

export class DrumPlanApiError extends Error {
  readonly kind: DrumPlanApiFailureKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: DrumPlanApiFailureKind, message: string, status?: number, code?: string) {
    super(message);
    this.name = 'DrumPlanApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function isDrumPlanApiError(err: unknown): err is DrumPlanApiError {
  return err instanceof DrumPlanApiError;
}

export function isDrumPlanApiTimeout(err: unknown): boolean {
  return isDrumPlanApiError(err) && err.kind === 'timeout';
}

export function isDrumPlanApiAborted(err: unknown): boolean {
  return isDrumPlanApiError(err) && err.kind === 'aborted';
}

function mergeAbortSignals(a: AbortSignal, b?: AbortSignal | null): AbortSignal {
  if (!b) return a;
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([a, b]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

function classifyDrumPlanError(err: unknown, timeoutSignal: AbortSignal, externalSignal?: AbortSignal | null): never {
  if (err instanceof HttpError) {
    throw new DrumPlanApiError('http', err.error || err.message, err.status, err.code);
  }
  if (externalSignal?.aborted) {
    throw new DrumPlanApiError('aborted', 'Drum API request cancelled.');
  }
  if (timeoutSignal.aborted) {
    throw new DrumPlanApiError(
      'timeout',
      `Drum calculation timed out after ${DRUM_PLAN_API_TIMEOUT_MS / 1000}s. Try again.`
    );
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    throw new DrumPlanApiError('aborted', 'Drum API request cancelled.');
  }
  throw new DrumPlanApiError('network', err instanceof Error ? err.message : 'Drum API network error.');
}

async function postDrumPlan<T>(
  path: string,
  body: unknown,
  options?: { token?: string | null; signal?: AbortSignal | null }
): Promise<T> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), DRUM_PLAN_API_TIMEOUT_MS);
  const signal = mergeAbortSignals(timeoutController.signal, options?.signal);
  try {
    return await httpClient.post<T>(path, body, {
      token: options?.token,
      signal,
    });
  } catch (err) {
    classifyDrumPlanError(err, timeoutController.signal, options?.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function optimizeDrumPlanViaApi(
  body: OptimizeDrumPlanRequest,
  options?: { token?: string | null; signal?: AbortSignal | null }
): Promise<OptimizeDrumPlanResponse> {
  return postDrumPlan<OptimizeDrumPlanResponse>(DRUM_PLAN_OPTIMIZE_PATH, body, options);
}

export function validateDrumPlanViaApi(
  body: ValidateDrumPlanRequest,
  options?: { token?: string | null; signal?: AbortSignal | null }
): Promise<ValidateDrumPlanResponse> {
  return postDrumPlan<ValidateDrumPlanResponse>(DRUM_PLAN_VALIDATE_PATH, body, options);
}

export function listDrumCandidatesViaApi(
  body: ListDrumCandidatesRequest,
  options?: { token?: string | null; signal?: AbortSignal | null }
): Promise<ListDrumCandidatesResponse> {
  return postDrumPlan<ListDrumCandidatesResponse>(DRUM_PLAN_CANDIDATES_PATH, body, options);
}

export function describeDrumPlanApiError(err: unknown): {
  status?: number;
  message: string;
  code?: string;
  kind?: DrumPlanApiFailureKind;
} {
  if (err instanceof DrumPlanApiError) {
    return {
      status: err.status,
      message: err.message,
      code: err.code,
      kind: err.kind,
    };
  }
  if (err instanceof HttpError) {
    return {
      status: err.status,
      message: err.error || err.message,
      code: err.code,
      kind: 'http',
    };
  }
  return { message: err instanceof Error ? err.message : 'Drum plan request failed.' };
}
