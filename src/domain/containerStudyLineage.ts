/**
 * 05I-DF-B3 — read immutable Container Study snapshot lineage.
 * Pure. No Prisma / HTTP / clocks / randomness.
 */

export type ContainerStudyLineageDrumPin = {
  v2DrumPlanLineId: string;
  inquiryLineId: string;
  cuttingLengthRequirementId: string;
  drumPlanId: string;
  drumPlanVersionNo: number | null;
  numberOfDrums: number | null;
  packedLengthMm?: number | null;
  packedWidthMm?: number | null;
  packedHeightMm?: number | null;
  grossWeightKg?: number | null;
};

export type ContainerStudyParsedLineage = {
  cuttingLengthRequirementIds: string[];
  authoritativeDrumPlanIds: string[];
  drumPlanVersions: Array<{ drumPlanId: string; drumPlanVersionNo: number | null }>;
  drumLinePins: ContainerStudyLineageDrumPin[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readPin(raw: unknown): ContainerStudyLineageDrumPin | null {
  const row = asRecord(raw);
  if (!row) return null;
  const v2DrumPlanLineId = asString(row.v2DrumPlanLineId);
  const inquiryLineId = asString(row.inquiryLineId);
  const cuttingLengthRequirementId = asString(row.cuttingLengthRequirementId);
  const drumPlanId = asString(row.drumPlanId);
  if (!v2DrumPlanLineId || !inquiryLineId || !cuttingLengthRequirementId || !drumPlanId) return null;
  return {
    v2DrumPlanLineId,
    inquiryLineId,
    cuttingLengthRequirementId,
    drumPlanId,
    drumPlanVersionNo: asNumber(row.drumPlanVersionNo),
    numberOfDrums: asNumber(row.numberOfDrums),
    packedLengthMm: asNumber(row.packedLengthMm),
    packedWidthMm: asNumber(row.packedWidthMm),
    packedHeightMm: asNumber(row.packedHeightMm),
    grossWeightKg: asNumber(row.grossWeightKg),
  };
}

export function parseContainerStudyLineage(json: unknown): ContainerStudyParsedLineage | null {
  const root = asRecord(json);
  if (!root) return null;

  const fromPlans: ContainerStudyLineageDrumPin[] = [];
  const drumPlanVersions: Array<{ drumPlanId: string; drumPlanVersionNo: number | null }> = [];
  const plans = Array.isArray(root.drumPlans) ? root.drumPlans : [];
  for (const plan of plans) {
    const p = asRecord(plan);
    if (!p) continue;
    const drumPlanId = asString(p.drumPlanId);
    if (drumPlanId) {
      drumPlanVersions.push({ drumPlanId, drumPlanVersionNo: asNumber(p.drumPlanVersionNo) });
    }
    const nested = Array.isArray(p.drumLinePins) ? p.drumLinePins : [];
    for (const pin of nested) {
      const parsed = readPin({
        ...(asRecord(pin) || {}),
        drumPlanId: asString(asRecord(pin)?.drumPlanId) || drumPlanId,
        cuttingLengthRequirementId:
          asString(asRecord(pin)?.cuttingLengthRequirementId) || asString(p.cuttingLengthRequirementId),
        inquiryLineId: asString(asRecord(pin)?.inquiryLineId) || asString(p.inquiryLineId),
        drumPlanVersionNo: asRecord(pin)?.drumPlanVersionNo ?? p.drumPlanVersionNo,
      });
      if (parsed) fromPlans.push(parsed);
    }
  }

  const topPins = Array.isArray(root.drumLinePins) ? root.drumLinePins.map(readPin).filter((p): p is ContainerStudyLineageDrumPin => Boolean(p)) : [];
  const drumLinePins = fromPlans.length ? fromPlans : topPins;
  if (!drumLinePins.length) return null;

  const requirementIds = Array.isArray(root.cuttingLengthRequirementIds)
    ? root.cuttingLengthRequirementIds.map(asString).filter(Boolean)
    : [...new Set(drumLinePins.map((p) => p.cuttingLengthRequirementId))];
  const authoritativeDrumPlanIds = Array.isArray(root.authoritativeDrumPlanIds)
    ? root.authoritativeDrumPlanIds.map(asString).filter(Boolean)
    : [...new Set(drumLinePins.map((p) => p.drumPlanId))];

  if (!requirementIds.length || !authoritativeDrumPlanIds.length) return null;

  return {
    cuttingLengthRequirementIds: [...new Set(requirementIds)],
    authoritativeDrumPlanIds: [...new Set(authoritativeDrumPlanIds)],
    drumPlanVersions: drumPlanVersions.length
      ? drumPlanVersions
      : [...new Set(drumLinePins.map((p) => p.drumPlanId))].map((drumPlanId) => ({
          drumPlanId,
          drumPlanVersionNo: drumLinePins.find((p) => p.drumPlanId === drumPlanId)?.drumPlanVersionNo ?? null,
        })),
    drumLinePins,
  };
}

export function lineagePinForSourceLine(
  lineage: ContainerStudyParsedLineage | null,
  sourceLineId: string
): ContainerStudyLineageDrumPin | null {
  if (!lineage || !sourceLineId) return null;
  return lineage.drumLinePins.find((p) => p.v2DrumPlanLineId === sourceLineId) ?? null;
}
