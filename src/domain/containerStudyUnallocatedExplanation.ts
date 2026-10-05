/**
 * 05I-DF-B3 — explain unallocated drums from immutable snapshot + lineage.
 * Pure. Does not persist extra columns.
 */

import { asFiniteNumber } from './containerStudyInputHardening';
import { lineagePinForSourceLine, parseContainerStudyLineage } from './containerStudyLineage';

export type UnallocatedExplanationDrum = {
  sourceLineId: string;
  quantity: number;
  packedLengthMm?: number | null;
  packedWidthMm?: number | null;
  packedHeightMm?: number | null;
  grossWeightKg?: number | null;
};

export type UnallocatedExplanationRow = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
  reasonCode: string;
  detail?: string | null;
};

export type ContainerStudyUnallocatedExplanation = {
  physicalDrumKey: string;
  reasonCode: string;
  detail: string | null;
  packedLengthMm: number | null;
  packedWidthMm: number | null;
  packedHeightMm: number | null;
  grossWeightKg: number | null;
  inquiryLineId: string | null;
  cuttingLengthRequirementId: string | null;
  drumPlanId: string | null;
  drumPlanLineId: string | null;
  sourceLineId: string;
  instanceIndex: number;
};

export function explainUnallocatedDrums(input: {
  drums: UnallocatedExplanationDrum[];
  lineageProvenanceJson?: unknown;
  unallocated: UnallocatedExplanationRow[];
}): ContainerStudyUnallocatedExplanation[] {
  const lineage = parseContainerStudyLineage(input.lineageProvenanceJson);
  const bySource = new Map(input.drums.map((d) => [d.sourceLineId, d]));
  return input.unallocated.map((row) => {
    const drum = bySource.get(row.sourceLineId);
    const pin = lineagePinForSourceLine(lineage, row.sourceLineId);
    return {
      physicalDrumKey: row.physicalDrumKey,
      reasonCode: row.reasonCode,
      detail: row.detail ?? null,
      packedLengthMm: asFiniteNumber(drum?.packedLengthMm) ?? asFiniteNumber(pin?.packedLengthMm),
      packedWidthMm: asFiniteNumber(drum?.packedWidthMm) ?? asFiniteNumber(pin?.packedWidthMm),
      packedHeightMm: asFiniteNumber(drum?.packedHeightMm) ?? asFiniteNumber(pin?.packedHeightMm),
      grossWeightKg: asFiniteNumber(drum?.grossWeightKg) ?? asFiniteNumber(pin?.grossWeightKg),
      inquiryLineId: pin?.inquiryLineId ?? null,
      cuttingLengthRequirementId: pin?.cuttingLengthRequirementId ?? null,
      drumPlanId: pin?.drumPlanId ?? null,
      drumPlanLineId: pin?.v2DrumPlanLineId ?? row.sourceLineId,
      sourceLineId: row.sourceLineId,
      instanceIndex: row.instanceIndex,
    };
  });
}
