/**
 * Task 05I-DF-B1 — map CONFIRMED V2DrumPlan lines to Container Study snapshot drum inputs (pure).
 */

export type ResolvedDrumMasterPin = {
  drumMasterId: string | null;
  drumCode: string;
  flangeMm: number | null;
  barrelMm: number | null;
  outerWidthMm: number | null;
  innerWidthMm: number | null;
  emptyDrumNetWeightKg: number | null;
};

export type ResolvedPackingPin = {
  packingProfileVersionId: string | null;
  packedLengthMm: number | null;
  packedWidthMm: number | null;
  packedHeightMm: number | null;
};

export type DrumPlanLineForSnapshot = {
  id: string;
  lineNo: number;
  drumCode: string;
  drumMasterId: string | null;
  numberOfDrums: number;
  cuttingLengthM: number;
  plannedCableLengthM: number;
  grossLoadedDrumWeightKg: number | null;
  engineering: unknown;
};

export type ContainerStudyDrumLinePin = {
  v2DrumPlanLineId: string;
  lineNo: number;
  numberOfDrums: number;
  cuttingLengthM: number;
  plannedCableLengthM: number;
  inquiryId: string;
  inquiryLineId: string;
  cuttingLengthRequirementId: string;
  cuttingLengthPlanId: string;
  drumPlanId: string;
  cableMaterialNumber: string | null;
  drumMasterPin: ResolvedDrumMasterPin | null;
  packingPin: ResolvedPackingPin | null;
  engineering: unknown;
};

export type ContainerStudyDrumPlanPin = {
  inquiryLineId: string;
  cableMaterialNumber: string | null;
  configurationSnapshotId: string;
  configurationSnapshotVersionNo: number;
  configurationSnapshotIdString: string;
  cuttingLengthRequirementId: string;
  cuttingLengthPlanId: string;
  cuttingLengthPlanVersionNo: number;
  cuttingLengthPlanIdString: string;
  requestedDrumCount: number;
  physicalDrumCount: number;
  toleranceMode: string;
  tolerancePercent: number;
  positiveTolerancePercent: number;
  negativeTolerancePercent: number;
  drumPlanId: string;
  drumPlanVersionNo: number;
  drumPlanIdString: string;
  drumLinePins: ContainerStudyDrumLinePin[];
};

export type ContainerStudyPhysicalDrumPin = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
  inquiryId: string;
  inquiryLineId: string;
  cuttingLengthRequirementId: string;
  cuttingLengthPlanId: string;
  drumPlanId: string;
  drumPlanLineId: string;
  drumPlanVersionNo: number;
  drumCode: string;
};

export type ContainerStudyLineageProvenance = {
  inquiryId: string;
  inquiryLineId: string;
  configurationSnapshotId: string;
  configurationSnapshotVersionNo: number;
  configurationSnapshotIdString: string;
  cuttingLengthPlanId: string;
  cuttingLengthPlanVersionNo: number;
  cuttingLengthPlanIdString: string;
  drumPlanId: string;
  drumPlanVersionNo: number;
  drumPlanIdString: string;
  shipmentGroupId: string;
  shipmentGroupVersionNo: number;
  destinationPortCode: string | null;
  incotermCode: string | null;
  containerTypePreferenceCode: string | null;
  requestedContainerTypePreferenceCode: string | null;
  deliveryAllocationMode: string;
  /** Compatibility first-plan fields above are last-touched-shaped only. Authoritative set: */
  cuttingLengthRequirementIds: string[];
  authoritativeDrumPlanIds: string[];
  drumPlans: ContainerStudyDrumPlanPin[];
  drumLinePins: ContainerStudyDrumLinePin[];
  physicalDrumPins: ContainerStudyPhysicalDrumPin[];
};

export type SnapshotDrumFromDrumPlan = {
  sourceLineId: string;
  quantity: number;
  drumCode: string;
  drumMasterId: string | null;
  packingProfileVersionId: string | null;
  packedLengthMm: number;
  packedWidthMm: number;
  packedHeightMm: number | null;
  grossWeightKg: number;
  inquiryId?: string;
  inquiryLineId?: string;
  cuttingLengthRequirementId?: string;
  drumPlanId?: string;
  drumPlanLineId?: string;
  cableLengthM?: number;
};

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readEngineeringPacked(engineering: unknown): {
  packedLengthMm: number | null;
  packedWidthMm: number | null;
  packedHeightMm: number | null;
} {
  if (!engineering || typeof engineering !== 'object') {
    return { packedLengthMm: null, packedWidthMm: null, packedHeightMm: null };
  }
  const e = engineering as Record<string, unknown>;
  const packing = e.packing as Record<string, unknown> | undefined;
  return {
    packedLengthMm: num(packing?.packedLengthMm ?? e.packedLengthMm),
    packedWidthMm: num(packing?.packedWidthMm ?? e.packedWidthMm),
    packedHeightMm: num(packing?.packedHeightMm ?? e.packedHeightMm),
  };
}

export function resolveSnapshotDrumGeometry(input: {
  line: DrumPlanLineForSnapshot;
  master: ResolvedDrumMasterPin | null;
  packing: ResolvedPackingPin | null;
}): { packedLengthMm: number; packedWidthMm: number; packedHeightMm: number | null } | null {
  const fromEng = readEngineeringPacked(input.line.engineering);
  const packedLengthMm =
    input.packing?.packedLengthMm ??
    fromEng.packedLengthMm ??
    (input.master?.barrelMm != null ? input.master.barrelMm : null);
  const packedWidthMm =
    input.packing?.packedWidthMm ??
    fromEng.packedWidthMm ??
    (input.master?.outerWidthMm != null ? input.master.outerWidthMm : null);
  const packedHeightMm =
    input.packing?.packedHeightMm ?? fromEng.packedHeightMm ?? (input.master?.flangeMm ?? null);
  if (packedLengthMm == null || packedWidthMm == null) return null;
  if (!(packedLengthMm > 0) || !(packedWidthMm > 0)) return null;
  if (packedHeightMm != null && !(packedHeightMm > 0)) return null;
  return { packedLengthMm, packedWidthMm, packedHeightMm };
}

export function buildSnapshotDrumsFromDrumPlan(
  lines: DrumPlanLineForSnapshot[],
  resolve: (line: DrumPlanLineForSnapshot) => {
    master: ResolvedDrumMasterPin | null;
    packing: ResolvedPackingPin | null;
  }
): { drums: SnapshotDrumFromDrumPlan[]; missing: string[] } {
  const drums: SnapshotDrumFromDrumPlan[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const { master, packing } = resolve(line);
    const geom = resolveSnapshotDrumGeometry({ line, master, packing });
    if (!geom) {
      missing.push(line.drumCode || line.id);
      continue;
    }
    const gross =
      line.grossLoadedDrumWeightKg != null && Number.isFinite(line.grossLoadedDrumWeightKg)
        ? line.grossLoadedDrumWeightKg
        : null;
    if (gross == null || !(gross > 0)) {
      missing.push(`${line.drumCode || line.id}:grossWeight`);
      continue;
    }
    if (!Number.isInteger(line.numberOfDrums) || line.numberOfDrums < 1) {
      missing.push(`${line.drumCode || line.id}:quantity`);
      continue;
    }
    drums.push({
      sourceLineId: line.id,
      quantity: line.numberOfDrums,
      drumCode: line.drumCode,
      drumMasterId: line.drumMasterId ?? master?.drumMasterId ?? null,
      packingProfileVersionId: packing?.packingProfileVersionId ?? null,
      packedLengthMm: geom.packedLengthMm,
      packedWidthMm: geom.packedWidthMm,
      packedHeightMm: geom.packedHeightMm,
      grossWeightKg: gross,
    });
  }
  return { drums, missing };
}

export function flattenLineageFromDrumPlans(
  inquiryId: string,
  shipment: {
    shipmentGroupId: string;
    shipmentGroupVersionNo: number;
    destinationPortCode: string | null;
    incotermCode: string | null;
    containerTypePreferenceCode: string | null;
    deliveryAllocationMode: string;
  },
  drumPlans: ContainerStudyDrumPlanPin[]
): ContainerStudyLineageProvenance {
  const primary = drumPlans[0];
  if (!primary) {
    throw new Error('At least one CONFIRMED drum plan is required for snapshot lineage.');
  }
  const drumLinePins = drumPlans.flatMap((p) => p.drumLinePins);
  const physicalDrumPins: ContainerStudyPhysicalDrumPin[] = [];
  for (const plan of drumPlans) {
    for (const line of plan.drumLinePins) {
      const count = Number.isInteger(line.numberOfDrums) && line.numberOfDrums > 0 ? line.numberOfDrums : 0;
      for (let instanceIndex = 1; instanceIndex <= count; instanceIndex += 1) {
        physicalDrumPins.push({
          physicalDrumKey: `${line.v2DrumPlanLineId}#${instanceIndex}`,
          sourceLineId: line.v2DrumPlanLineId,
          instanceIndex,
          inquiryId,
          inquiryLineId: line.inquiryLineId,
          cuttingLengthRequirementId: line.cuttingLengthRequirementId,
          cuttingLengthPlanId: line.cuttingLengthPlanId,
          drumPlanId: line.drumPlanId,
          drumPlanLineId: line.v2DrumPlanLineId,
          drumPlanVersionNo: plan.drumPlanVersionNo,
          drumCode: line.drumMasterPin?.drumCode || '',
        });
      }
    }
  }
  if (physicalDrumPins.length === 0) {
    throw new Error('Every physical drum must have traceable drum-plan provenance.');
  }
  return {
    inquiryId,
    inquiryLineId: primary.inquiryLineId,
    configurationSnapshotId: primary.configurationSnapshotId,
    configurationSnapshotVersionNo: primary.configurationSnapshotVersionNo,
    configurationSnapshotIdString: primary.configurationSnapshotIdString,
    cuttingLengthPlanId: primary.cuttingLengthPlanId,
    cuttingLengthPlanVersionNo: primary.cuttingLengthPlanVersionNo,
    cuttingLengthPlanIdString: primary.cuttingLengthPlanIdString,
    drumPlanId: primary.drumPlanId,
    drumPlanVersionNo: primary.drumPlanVersionNo,
    drumPlanIdString: primary.drumPlanIdString,
    shipmentGroupId: shipment.shipmentGroupId,
    shipmentGroupVersionNo: shipment.shipmentGroupVersionNo,
    destinationPortCode: shipment.destinationPortCode,
    incotermCode: shipment.incotermCode,
    containerTypePreferenceCode: shipment.containerTypePreferenceCode,
    requestedContainerTypePreferenceCode: shipment.containerTypePreferenceCode,
    deliveryAllocationMode: shipment.deliveryAllocationMode,
    cuttingLengthRequirementIds: drumPlans.map((p) => p.cuttingLengthRequirementId),
    authoritativeDrumPlanIds: drumPlans.map((p) => p.drumPlanId),
    drumPlans,
    drumLinePins,
    physicalDrumPins,
  };
}
