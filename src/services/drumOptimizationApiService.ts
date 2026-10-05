/**
 * Client API for STEP 6 drum capacity validation / automatic optimization.
 * Engineering math stays on the server (domain service); UI must not reimplement formulas.
 */

import type { AuthoritativeDrumPlan } from '../domain/drumOptimizationService';
import type {
  DrumMasterEngineeringGapReport,
  EvaluatedDrumCandidate,
} from '../domain/drumOptimizationService';

export interface DrumOptimizeCableInput {
  cableDiameterMm: number;
  approxWeightKgKm: number;
  outputDiameterMm?: number | null;
}

/** Soft upper bound for drum engineering API calls (UI must not hang indefinitely). */
export const DRUM_API_TIMEOUT_MS = 10_000;

export type DrumApiFailureKind = 'timeout' | 'http' | 'network' | 'aborted';

export class DrumApiError extends Error {
  readonly kind: DrumApiFailureKind;
  readonly status?: number;

  constructor(kind: DrumApiFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'DrumApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function isDrumApiError(err: unknown): err is DrumApiError {
  return err instanceof DrumApiError;
}

export function isDrumApiTimeout(err: unknown): boolean {
  return isDrumApiError(err) && err.kind === 'timeout';
}

export function isDrumApiAborted(err: unknown): boolean {
  return isDrumApiError(err) && err.kind === 'aborted';
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

async function postJson<T>(
  path: string,
  body: unknown,
  jwtToken?: string | null,
  externalSignal?: AbortSignal | null
): Promise<T> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), DRUM_API_TIMEOUT_MS);
  const signal = mergeAbortSignals(timeoutController.signal, externalSignal);

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new DrumApiError(
        'http',
        typeof data?.error === 'string' ? data.error : `Drum API request failed (${res.status}).`,
        res.status
      );
    }
    return data as T;
  } catch (err) {
    if (isDrumApiError(err)) throw err;
    if (externalSignal?.aborted) {
      throw new DrumApiError('aborted', 'Drum API request cancelled.');
    }
    if (timeoutController.signal.aborted) {
      throw new DrumApiError(
        'timeout',
        `Drum calculation timed out after ${DRUM_API_TIMEOUT_MS / 1000}s. Try again.`
      );
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new DrumApiError('aborted', 'Drum API request cancelled.');
    }
    throw new DrumApiError(
      'network',
      err instanceof Error ? err.message : 'Drum API network error.'
    );
  } finally {
    clearTimeout(timer);
  }
}

export function validateDrumPlanApi(
  input: {
    cable: DrumOptimizeCableInput;
    cableTolerancePercent: number;
    rows: Array<{
      drumCode: string;
      numberOfDrums: number;
      cuttingLengthM: number;
      drumTolerancePercent: number;
    }>;
    includeEngineering?: boolean;
  },
  jwtToken?: string | null,
  signal?: AbortSignal | null
): Promise<{ plan: AuthoritativeDrumPlan }> {
  return postJson('/api/master/drums/validate', input, jwtToken, signal);
}

export function optimizeDrumPlanApi(
  input: {
    cable: DrumOptimizeCableInput;
    /** Per-drum cutting length. Never pass length × requestedDrumCount. */
    totalOrderLengthM: number;
    /** Repetitions of the per-drum requirement. Does not change type selection. */
    requestedDrumCount?: number;
    /** Multi-line schedule: each entry is one per-drum cutting length. Never pass summed lengths. */
    requirements?: Array<{
      totalOrderLengthM: number;
      requestedDrumCount?: number;
    }>;
    cableTolerancePercent: number;
    drumTolerancePercent?: number;
    includeEngineering?: boolean;
  },
  jwtToken?: string | null,
  signal?: AbortSignal | null
): Promise<{ plan: AuthoritativeDrumPlan }> {
  return postJson('/api/master/drums/optimize', input, jwtToken, signal);
}

export function listDrumCandidatesApi(
  input: {
    cable: DrumOptimizeCableInput;
    cuttingLengthM: number;
    cableTolerancePercent: number;
  },
  jwtToken?: string | null,
  signal?: AbortSignal | null
): Promise<{
  suitable: EvaluatedDrumCandidate[];
  incomplete: EvaluatedDrumCandidate[];
  unsuitable: EvaluatedDrumCandidate[];
  summary?: {
    suitableCount: number;
    incompleteCount: number;
    unsuitableCount: number;
    drumCount: number;
  };
  engineeringGap?: DrumMasterEngineeringGapReport;
}> {
  return postJson('/api/master/drums/candidates', input, jwtToken, signal);
}
