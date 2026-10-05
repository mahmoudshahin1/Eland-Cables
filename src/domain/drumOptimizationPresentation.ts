/**
 * Drum plan presentation / schedule helpers.
 * Display, parse, and apply API Drum Plan results. No ranking, allocation, or suitability engine.
 */

export type ManualCandidateListUiKind =
  | 'NEED_INPUT'
  | 'CALCULATING'
  | 'SUITABLE_FOUND'
  | 'NONE_SUITABLE'
  | 'NONE_SUITABLE_WITH_INCOMPLETE'
  | 'TIMEOUT'
  | 'FAILED'
  | 'SELECTED_VALID'
  | 'SELECTED_INVALID';

export type ManualCandidateFetchFailureKind = 'timeout' | 'error';

export interface ManualCandidateListUiState {
  kind: ManualCandidateListUiKind;
  message: string;
  reason?: string;
  suitableCount?: number;
  unsuitableCount?: number;
  incompleteCount?: number;
}

/**
 * Resolve STEP 6 candidate/status banner.
 * A NEED_INPUT · B CALCULATING · C SUITABLE_FOUND · D NONE_SUITABLE ·
 * E SELECTED_VALID · F SELECTED_INVALID · G TIMEOUT · H FAILED
 * Zero suitable ≠ timeout ≠ API failure.
 */
export function resolveManualCandidateListUiState(args: {
  hasCuttingLength: boolean;
  cableToleranceReady: boolean;
  isCalculating: boolean;
  evaluationComplete: boolean;
  suitableCount: number;
  unsuitableCount?: number;
  incompleteCount?: number;
  fetchFailureKind?: ManualCandidateFetchFailureKind | null;
  fetchFailureMessage?: string | null;
  selectedDrumCode?: string | null;
  selectedIsSuitable?: boolean | null;
  selectedReasons?: string[];
}): ManualCandidateListUiState {
  const code = (args.selectedDrumCode || '').trim();
  if (code && args.selectedIsSuitable === true) {
    return {
      kind: 'SELECTED_VALID',
      message: '✓ Drum suitable for this cutting length.',
    };
  }
  if (code && args.selectedIsSuitable === false) {
    const reason = (args.selectedReasons || []).filter(Boolean)[0];
    return {
      kind: 'SELECTED_INVALID',
      message: '✕ Drum is not suitable.',
      reason,
    };
  }
  if (!args.hasCuttingLength || !args.cableToleranceReady) {
    return {
      kind: 'NEED_INPUT',
      message: 'Enter cutting length to evaluate drums.',
    };
  }
  if (args.isCalculating || !args.evaluationComplete) {
    return {
      kind: 'CALCULATING',
      message: 'Finding suitable drums...',
    };
  }
  if (args.fetchFailureKind === 'timeout') {
    return {
      kind: 'TIMEOUT',
      message: args.fetchFailureMessage || 'Drum calculation timed out. Retry to continue.',
    };
  }
  if (args.fetchFailureKind === 'error') {
    return {
      kind: 'FAILED',
      message: args.fetchFailureMessage || 'Drum candidate evaluation failed. Retry to continue.',
    };
  }
  if (args.suitableCount > 0) {
    return {
      kind: 'SUITABLE_FOUND',
      message: `${args.suitableCount} suitable drum${args.suitableCount === 1 ? '' : 's'} available.`,
      suitableCount: args.suitableCount,
    };
  }
  const incompleteCount = args.incompleteCount ?? 0;
  const unsuitableCount = args.unsuitableCount ?? 0;
  if (incompleteCount > 0) {
    return {
      kind: 'NONE_SUITABLE_WITH_INCOMPLETE',
      message: `No technically suitable drums found. ${incompleteCount} drum${
        incompleteCount === 1 ? ' has' : 's have'
      } incomplete engineering data (clearance when Ø≤50 and/or MaxLoad).`,
      unsuitableCount,
      incompleteCount,
    };
  }
  return {
    kind: 'NONE_SUITABLE',
    message: 'No technically suitable drums found. All evaluated drums were rejected for capacity or geometry.',
    unsuitableCount,
    incompleteCount: 0,
  };
}

/** Aggregate rejection / incomplete reasons for the “Why isn’t my drum available?” panel. */
export function summarizeUnsuitableReasons(
  candidates: Array<{
    evaluationStatus?: string;
    capacity?: { status?: string };
    reasons: string[];
    missingFields?: string[];
  }>
): Array<{ reason: string; count: number }> {
  const statusLabel: Record<string, string> = {
    MISSING_CLEARANCE: 'Missing drum clearance for cable diameter ≤50 mm.',
    MISSING_MAX_LOAD: 'Missing drum MaxLoad.',
    MISSING_CABLE_DATA: 'Missing cable diameter / weight data',
    INVALID_DIMENSIONS: 'Invalid drum flange / barrel / inner width',
    UNSUITABLE_GEOMETRY: 'Insufficient windings or layers for this cable diameter',
    OK: 'Usable length below required maximum (tolerance band)',
  };
  const counts = new Map<string, number>();
  for (const c of candidates) {
    const status = c.capacity?.status;
    let key: string;
    if (status && statusLabel[status]) {
      key = statusLabel[status];
    } else {
      key = (c.reasons.filter(Boolean)[0] || 'Unsuitable (no detailed reason).').trim();
      key = key.replace(/\bDrum\s+[A-Z0-9._-]+\s+/gi, 'Drum ');
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export interface CuttingLengthToleranceBand {
  nominalCuttingLengthM: number;
  cableTolerancePercent: number;
  minimumAllowedLengthM: number;
  maximumAllowedLengthM: number;
}

/** Preserve nominal cutting length; tolerance defines allowed production/logistics range. */
export function computeCuttingLengthToleranceBand(
  nominalCuttingLengthM: number,
  cableTolerancePercent: number,
  directed?: {
    minLengthM?: number;
    maxLengthM?: number;
  }
): CuttingLengthToleranceBand {
  const nominal = Math.max(0, Number(nominalCuttingLengthM) || 0);
  const tol = Math.max(0, Number(cableTolerancePercent) || 0);
  if (
    directed?.minLengthM != null &&
    directed?.maxLengthM != null &&
    Number.isFinite(directed.minLengthM) &&
    Number.isFinite(directed.maxLengthM)
  ) {
    return {
      nominalCuttingLengthM: nominal,
      cableTolerancePercent: tol,
      minimumAllowedLengthM: directed.minLengthM,
      maximumAllowedLengthM: directed.maxLengthM,
    };
  }
  return {
    nominalCuttingLengthM: nominal,
    cableTolerancePercent: tol,
    minimumAllowedLengthM: Math.round(nominal * (1 - tol / 100)),
    maximumAllowedLengthM: Math.round(nominal * (1 + tol / 100)),
  };
}

/** Format suitable candidate for dropdown / list (code, type, metrics). */
export function formatSuitableDrumOptionLabel(args: {
  drumCode: string;
  drumType?: string | null;
  maximumUsableLengthM: number | null;
  requestedLengthM: number;
  lengthUtilizationPercent: number | null;
  loadUtilizationPercent: number | null;
}): string {
  const typePart = args.drumType ? ` · ${args.drumType}` : '';
  const max =
    args.maximumUsableLengthM != null && Number.isFinite(args.maximumUsableLengthM)
      ? `${Math.round(args.maximumUsableLengthM)} m max`
      : 'max n/a';
  const req = Number.isFinite(args.requestedLengthM)
    ? `${Math.round(args.requestedLengthM)} m req`
    : 'req n/a';
  const len =
    args.lengthUtilizationPercent != null && Number.isFinite(args.lengthUtilizationPercent)
      ? `${args.lengthUtilizationPercent.toFixed(0)}% len`
      : 'len n/a';
  const load =
    args.loadUtilizationPercent != null && Number.isFinite(args.loadUtilizationPercent)
      ? `${args.loadUtilizationPercent.toFixed(0)}% load`
      : 'load n/a';
  return `${args.drumCode}${typePart} · ${max} · ${req} · ${len} · ${load} · Suitable`;
}

export type DrumScheduleLengthInput = {
  noOfDrums?: number | string;
  numberOfDrums?: number | string;
  cuttingLengthM?: number | string;
};

export function positiveScheduleNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Display / commercial total only: SUM(number of drums × per-drum cutting length). */
export function totalCableLengthFromDrumSchedule(rows: DrumScheduleLengthInput[]): number {
  return rows.reduce((acc, row) => {
    const drums = positiveScheduleNumber(row.numberOfDrums ?? row.noOfDrums);
    const cutting = positiveScheduleNumber(row.cuttingLengthM);
    if (!drums || !cutting) return acc;
    return acc + drums * cutting;
  }, 0);
}

export type AutomaticDrumRequirement = {
  perDrumCuttingLengthM: number;
  requestedDrumCount: number;
};

/**
 * One automatic requirement per distinct per-drum cutting length, in first-seen order.
 * Identical lengths on later lines add to requestedDrumCount — they are never summed
 * into a single cutting length.
 */
export function resolveAutomaticDrumRequirements(rows: DrumScheduleLengthInput[]): AutomaticDrumRequirement[] {
  const ordered: number[] = [];
  const counts = new Map<number, number>();
  for (const row of rows) {
    const cutting = positiveScheduleNumber(row.cuttingLengthM);
    const drums = Math.floor(positiveScheduleNumber(row.numberOfDrums ?? row.noOfDrums));
    if (!cutting || !drums) continue;
    if (!counts.has(cutting)) ordered.push(cutting);
    counts.set(cutting, (counts.get(cutting) || 0) + drums);
  }
  return ordered.map((perDrumCuttingLengthM) => ({
    perDrumCuttingLengthM,
    requestedDrumCount: counts.get(perDrumCuttingLengthM) || 1,
  }));
}

export function resolveAutomaticDrumRequirement(rows: DrumScheduleLengthInput[]): {
  perDrumCuttingLengthM: number;
  requestedDrumCount: number;
  totalCableLengthM: number;
} {
  const totalCableLengthM = totalCableLengthFromDrumSchedule(rows);
  const first = resolveAutomaticDrumRequirements(rows)[0];
  return {
    perDrumCuttingLengthM: first?.perDrumCuttingLengthM ?? 0,
    requestedDrumCount: Math.max(1, first?.requestedDrumCount ?? 0),
    totalCableLengthM,
  };
}

export function distinctPositiveCuttingLengths(rows: DrumScheduleLengthInput[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const row of rows) {
    const cutting = positiveScheduleNumber(row.cuttingLengthM);
    if (!cutting || seen.has(cutting)) continue;
    seen.add(cutting);
    out.push(cutting);
  }
  return out;
}

/** Next line to fill: empty drum with its own cutting length, else first row that has a length. */
export function resolveManualFocusRow<T extends { drumCode?: string; cuttingLengthM?: number | string }>(
  rows: T[]
): T | undefined {
  const emptyWithCutting = rows.find(
    (row) => !String(row.drumCode || '').trim() && positiveScheduleNumber(row.cuttingLengthM) > 0
  );
  if (emptyWithCutting) return emptyWithCutting;
  return rows.find((row) => positiveScheduleNumber(row.cuttingLengthM) > 0) || rows[0];
}

/** One entry per physical drum. Cutting length is never aggregated. */
export function expandPhysicalDrumRequirements(
  rows: DrumScheduleLengthInput[]
): Array<{ cuttingLengthM: number }> {
  const out: Array<{ cuttingLengthM: number }> = [];
  for (const row of rows) {
    const drums = Math.floor(positiveScheduleNumber(row.numberOfDrums ?? row.noOfDrums));
    const cutting = positiveScheduleNumber(row.cuttingLengthM);
    if (!drums || !cutting) continue;
    for (let i = 0; i < drums; i += 1) {
      out.push({ cuttingLengthM: cutting });
    }
  }
  return out;
}

/** Level 1: one cutting-length requirement per schedule row. Rows are never grouped or dropped. */
export function cuttingLengthRequirementsFromSchedule(rows: DrumScheduleLengthInput[]): Array<{
  sourceIndex: number;
  cuttingLengthM: number;
  requestedDrumCount: number;
}> {
  const out: Array<{ sourceIndex: number; cuttingLengthM: number; requestedDrumCount: number }> = [];
  rows.forEach((row, sourceIndex) => {
    const cuttingLengthM = positiveScheduleNumber(row.cuttingLengthM);
    const requestedDrumCount = Math.floor(positiveScheduleNumber(row.numberOfDrums ?? row.noOfDrums));
    if (!cuttingLengthM || !requestedDrumCount) return;
    out.push({ sourceIndex, cuttingLengthM, requestedDrumCount });
  });
  return out;
}

export function planCoversCuttingLengthRequirements(
  plan: { lines: Array<{ cuttingLengthM: number }> },
  rows: DrumScheduleLengthInput[]
): boolean {
  const requirements = cuttingLengthRequirementsFromSchedule(rows);
  if (!requirements.length) return false;
  const unused = plan.lines.map((line) => line.cuttingLengthM);
  return requirements.every((requirement) => {
    const idx = unused.findIndex((cuttingLengthM) => cuttingLengthM === requirement.cuttingLengthM);
    if (idx < 0) return false;
    unused.splice(idx, 1);
    return true;
  });
}

/**
 * Fill drum codes onto existing cutting-length rows.
 * Never deletes a requirement, never changes cuttingLengthM or requested drum count.
 * Matches by cutting length so a first-only plan cannot drop later requirements.
 */
export function applyAutomaticPlanToCuttingRequirements<
  T extends {
    id: string;
    drumCode: string;
    noOfDrums: number | string;
    cuttingLengthM: number | string;
    drumTolerancePercent: number | string;
  },
>(
  rows: T[],
  plan: {
    lines: Array<{ drumCode: string; cuttingLengthM: number; drumTolerancePercent?: number | string }>;
  }
): T[] {
  const unused = [...plan.lines];
  return rows.map((row) => {
    const cuttingLengthM = positiveScheduleNumber(row.cuttingLengthM);
    const requestedDrumCount = Math.floor(positiveScheduleNumber(row.noOfDrums));
    if (!cuttingLengthM || !requestedDrumCount) return row;
    const lineIndex = unused.findIndex((line) => line.cuttingLengthM === cuttingLengthM);
    if (lineIndex < 0) return row;
    const line = unused.splice(lineIndex, 1)[0];
    return {
      ...row,
      drumCode: line.drumCode || row.drumCode,
      noOfDrums: row.noOfDrums,
      cuttingLengthM: row.cuttingLengthM,
      drumTolerancePercent:
        row.drumTolerancePercent === '' || row.drumTolerancePercent == null
          ? line.drumTolerancePercent
          : row.drumTolerancePercent,
    };
  });
}

/** Patch one schedule row without mutating sibling cutting lengths or drum counts. */
export function patchDrumScheduleRow<T extends { id: string }>(
  rows: T[],
  id: string,
  patch: Partial<T>
): T[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}
