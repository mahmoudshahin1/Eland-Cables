/**
 * 05I-DF-B3 — snapshot input hardening (geometry, quantity, duplicates, lineage).
 * Pure. Complements evaluateContainerStudyStructure; does not change Rolling V1 placement.
 */

import type { ContainerStudyValidationIssue, SnapshotDrumInput } from './containerStudyValidation';
import { lineagePinForSourceLine, parseContainerStudyLineage } from './containerStudyLineage';

export function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function invalidNumeric(value: unknown): boolean {
  if (value == null || value === '') return false;
  return asFiniteNumber(value) == null;
}

function nonPositive(value: unknown): boolean {
  const n = asFiniteNumber(value);
  return n != null && n <= 0;
}

export function evaluateSnapshotInputHardening(input: {
  drums: SnapshotDrumInput[];
  lineageProvenanceJson?: unknown;
  requireLineage?: boolean;
}): { ok: boolean; issues: ContainerStudyValidationIssue[] } {
  const issues: ContainerStudyValidationIssue[] = [];
  const seen = new Set<string>();
  for (const drum of input.drums) {
    const source = drum.sourceLineId || 'drum';
    if (drum.sourceLineId && seen.has(drum.sourceLineId)) {
      issues.push({
        code: 'DUPLICATE_PHYSICAL_DRUM',
        field: 'sourceLineId',
        message: `Duplicate snapshot sourceLineId ${drum.sourceLineId}.`,
      });
    }
    if (drum.sourceLineId) seen.add(drum.sourceLineId);

    if (!Number.isInteger(drum.quantity) || drum.quantity < 1) {
      issues.push({
        code: 'INVALID_PHYSICAL_QUANTITY',
        field: 'quantity',
        message: `Physical quantity must be an integer >= 1 for ${source}.`,
      });
    }

    if (invalidNumeric(drum.packedLengthMm) || invalidNumeric(drum.packedWidthMm) || invalidNumeric(drum.packedHeightMm)) {
      issues.push({
        code: 'INVALID_DIMENSION',
        field: 'packedLengthMm',
        message: `Packed dimensions must be finite numbers for ${source}.`,
      });
    }
    if (nonPositive(drum.packedLengthMm) || nonPositive(drum.packedWidthMm)) {
      issues.push({
        code: 'INVALID_DIMENSION',
        field: 'packedLengthMm',
        message: `packedLengthMm and packedWidthMm must be > 0 for ${source}.`,
      });
    }
    if (drum.packedHeightMm != null && nonPositive(drum.packedHeightMm)) {
      issues.push({
        code: 'INVALID_DIMENSION',
        field: 'packedHeightMm',
        message: `packedHeightMm must be > 0 when present for ${source}.`,
      });
    }

    if (invalidNumeric(drum.grossWeightKg)) {
      issues.push({
        code: 'INVALID_WEIGHT',
        field: 'grossWeightKg',
        message: `grossWeightKg must be a finite number for ${source}.`,
      });
    }
    if (nonPositive(drum.grossWeightKg)) {
      issues.push({
        code: 'INVALID_WEIGHT',
        field: 'grossWeightKg',
        message: `grossWeightKg must be > 0 for ${source}.`,
      });
    }
  }

  const requireLineage = input.requireLineage !== false;
  if (requireLineage) {
    const lineage = parseContainerStudyLineage(input.lineageProvenanceJson);
    if (!lineage) {
      issues.push({
        code: 'MISSING_LINEAGE',
        field: 'lineageProvenanceJson',
        message: 'Snapshot is missing cutting-length requirement and CONFIRMED drum-plan lineage.',
      });
    } else {
      for (const drum of input.drums) {
        if (!drum.sourceLineId) continue;
        const pin = lineagePinForSourceLine(lineage, drum.sourceLineId);
        if (!pin) {
          issues.push({
            code: 'MISSING_LINEAGE',
            field: 'sourceLineId',
            message: `Snapshot drum ${drum.sourceLineId} is missing drum-plan-line provenance.`,
          });
        }
      }
      const populatedRequirements = new Set(
        input.drums
          .map((d) => lineagePinForSourceLine(lineage, d.sourceLineId)?.cuttingLengthRequirementId)
          .filter((id): id is string => Boolean(id))
      );
      for (const requirementId of lineage.cuttingLengthRequirementIds) {
        if (!populatedRequirements.has(requirementId)) {
          issues.push({
            code: 'MISSING_LINEAGE',
            field: 'cuttingLengthRequirementId',
            message: `Requirement ${requirementId} has no physical drum population in the snapshot.`,
          });
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function evaluateDrumPlanDrift(input: {
  snapshotAuthoritativeDrumPlanIds: string[];
  snapshotDrumPlanVersions: Array<{ drumPlanId: string; drumPlanVersionNo: number | null }>;
  liveEligibleDrumPlanIds: string[];
  liveDrumPlanVersions: Array<{ drumPlanId: string; versionNo: number }>;
}): { stale: boolean; issues: ContainerStudyValidationIssue[] } {
  const snapIds = [...new Set(input.snapshotAuthoritativeDrumPlanIds.filter(Boolean))].sort();
  const liveIds = [...new Set(input.liveEligibleDrumPlanIds.filter(Boolean))].sort();
  const issues: ContainerStudyValidationIssue[] = [];
  if (snapIds.join('\u0000') !== liveIds.join('\u0000')) {
    issues.push({
      code: 'STALE_DRUM_PLAN',
      field: 'authoritativeDrumPlanIds',
      message: 'Current CONFIRMED drum plans no longer match the snapshot lineage. SUPERSEDE and capture a new snapshot.',
    });
  }
  const liveVersion = new Map(input.liveDrumPlanVersions.map((p) => [p.drumPlanId, p.versionNo]));
  for (const pin of input.snapshotDrumPlanVersions) {
    if (!pin.drumPlanId) continue;
    const live = liveVersion.get(pin.drumPlanId);
    if (live == null || (pin.drumPlanVersionNo != null && live !== pin.drumPlanVersionNo)) {
      issues.push({
        code: 'STALE_DRUM_PLAN',
        field: 'drumPlanVersionNo',
        message: `Drum plan ${pin.drumPlanId} version no longer matches the snapshot lineage.`,
      });
    }
  }
  const unique = new Map(issues.map((i) => [i.message, i]));
  return { stale: unique.size > 0, issues: [...unique.values()] };
}
