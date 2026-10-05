export const UNALLOCATED_REASON_CODES = [
  'NO_FEASIBLE_CONTAINER',
  'WEIGHT_LIMIT',
  'DIMENSION_LIMIT',
  'PACKING_RULE',
  'NO_CONTAINER_TYPE',
  'CONFIGURATION_ERROR',
  'STUFFING_METHOD_NOT_IMPLEMENTED',
  'SEARCH_BOUND_REACHED',
  'VIRTUAL_LAYER_NOT_SUPPORTED',
] as const;

export type UnallocatedReasonCode = (typeof UNALLOCATED_REASON_CODES)[number];

export const ALGORITHM_VERSION_CODES = {
  LEGACY_FIRST_FIT_V1: 'LEGACY_FIRST_FIT_V1',
  LEGACY_FIRST_FIT_V1_POST_ADJUST: 'LEGACY_FIRST_FIT_V1_POST_ADJUST',
  FORKLIFTING_FIRST_FIT_V1: 'FORKLIFTING_FIRST_FIT_V1',
  BIN_PACK_OPT_V1: 'BIN_PACK_OPT_V1',
} as const;

export const ALLOCATION_KIND_PHYSICAL = 'PHYSICAL' as const;

export type ContainerStudyValidationIssue = {
  code: string;
  field?: string;
  message: string;
};

export type SnapshotDrumInput = {
  sourceLineId: string;
  quantity: number;
  packedLengthMm?: number | null;
  packedWidthMm?: number | null;
  packedHeightMm?: number | null;
  grossWeightKg?: number | null;
  packingProfileVersionId?: string | null;
};

export type PinnedContainerType = {
  code: string;
  parityLabel: string;
  versionId: string;
  versionNo: number;
  usableLengthMm: number | null;
  internalWidthMm: number | null;
  payloadCapacityKg: number | null;
  dimensionsStatus: 'PENDING_APPROVAL' | 'APPROVED';
};

export type StructuralValidationInput = {
  shipmentGroupId?: string | null;
  stuffingMethod?: string | null;
  algorithmVersionCode?: string | null;
  configurationVersion?: string | null;
  configurationStatus?: string | null;
  drums: SnapshotDrumInput[];
  pinnedContainerTypes: PinnedContainerType[];
  hasResult?: boolean;
  resultAccountsForAllDrums?: boolean;
  virtualAllocationCount?: number;
  unallocatedCount?: number;
};

export function evaluateContainerStudyStructure(
  input: StructuralValidationInput
): { ok: boolean; issues: ContainerStudyValidationIssue[] } {
  const issues: ContainerStudyValidationIssue[] = [];
  if (!input.shipmentGroupId) {
    issues.push({
      code: 'MISSING_SHIPMENT_GROUP',
      field: 'shipmentGroupId',
      message: 'Container Study requires a shipment group.',
    });
  }
  if (!input.algorithmVersionCode) {
    issues.push({
      code: 'MISSING_ALGORITHM_VERSION',
      field: 'algorithmVersionCode',
      message: 'Algorithm version must be pinned on the snapshot.',
    });
  }
  if (!input.configurationVersion) {
    issues.push({
      code: 'MISSING_CONFIGURATION_VERSION',
      field: 'configurationVersion',
      message: 'Algorithm configuration version must be pinned on the snapshot.',
    });
  }
  if (input.algorithmVersionCode && input.algorithmVersionCode !== ALGORITHM_VERSION_CODES.LEGACY_FIRST_FIT_V1) {
    issues.push({
      code: 'ALGORITHM_NOT_IMPLEMENTED',
      field: 'algorithmVersionCode',
      message: `Algorithm ${input.algorithmVersionCode} is not implemented. Only LEGACY_FIRST_FIT_V1 is supported.`,
    });
  }
  if (input.configurationStatus && input.configurationStatus !== 'ACTIVE') {
    issues.push({
      code: 'CONFIGURATION_NOT_ACTIVE',
      field: 'configurationVersion',
      message: 'Only an ACTIVE algorithm configuration may be used for VALIDATED/CONFIRMED.',
    });
  }
  if (input.stuffingMethod === 'Forklifting') {
    issues.push({
      code: 'STUFFING_METHOD_NOT_IMPLEMENTED',
      field: 'stuffingMethod',
      message: 'Forklifting placement is BLOCKED. Forklifting cannot be silently converted to Rolling.',
    });
  }
  if (!input.drums.length) {
    issues.push({
      code: 'MISSING_DRUM_INPUTS',
      field: 'drums',
      message: 'At least one logical drum input line is required.',
    });
  }
  for (const drum of input.drums) {
    if (!drum.sourceLineId) {
      issues.push({ code: 'MISSING_SOURCE_LINE', field: 'sourceLineId', message: 'sourceLineId is required.' });
    }
    if (!Number.isInteger(drum.quantity) || drum.quantity < 1) {
      issues.push({
        code: 'INVALID_QUANTITY',
        field: 'quantity',
        message: `Quantity must be >= 1 for ${drum.sourceLineId || 'drum'}.`,
      });
    }
    if (drum.packedLengthMm == null) {
      issues.push({
        code: 'MISSING_PACKED_LENGTH',
        field: 'packedLengthMm',
        message: `packedLengthMm is required for ${drum.sourceLineId}. Flange is not inferred as shipping envelope.`,
      });
    }
    if (drum.packedWidthMm == null) {
      issues.push({
        code: 'MISSING_PACKED_WIDTH',
        field: 'packedWidthMm',
        message: `packedWidthMm is required for ${drum.sourceLineId}.`,
      });
    }
    if (drum.grossWeightKg == null) {
      issues.push({
        code: 'MISSING_GROSS_WEIGHT',
        field: 'grossWeightKg',
        message: `grossWeightKg is required for ${drum.sourceLineId}.`,
      });
    }
  }
  if (!input.pinnedContainerTypes.length) {
    issues.push({
      code: 'NO_CONTAINER_TYPE',
      field: 'containerMaster',
      message: 'At least one container type version must be pinned.',
    });
  }
  for (const type of input.pinnedContainerTypes) {
    if (type.dimensionsStatus !== 'APPROVED') {
      issues.push({
        code: 'DIMENSIONS_PENDING_APPROVAL',
        field: 'dimensionsStatus',
        message: `Container type ${type.code} dimensions are pending approval.`,
      });
    }
    if (type.usableLengthMm == null) {
      issues.push({
        code: 'MISSING_CONTAINER_DIMENSIONS',
        field: 'usableLengthMm',
        message: `usableLengthMm missing for ${type.code}. Excel sample lengths are not production truth.`,
      });
    }
    if (type.internalWidthMm == null) {
      issues.push({
        code: 'MISSING_CONTAINER_DIMENSIONS',
        field: 'internalWidthMm',
        message: `internalWidthMm missing for ${type.code}.`,
      });
    }
    if (type.payloadCapacityKg == null) {
      issues.push({
        code: 'MISSING_PAYLOAD',
        field: 'payloadCapacityKg',
        message: `payloadCapacityKg missing for ${type.code}.`,
      });
    }
  }
  if (input.virtualAllocationCount && input.virtualAllocationCount > 0) {
    issues.push({
      code: 'VIRTUAL_LAYER_NOT_SUPPORTED',
      field: 'allocations',
      message: 'Virtual second-layer physical allocations are not supported.',
    });
    issues.push({
      code: 'VIRTUAL_ALLOCATION_NOT_SUPPORTED',
      field: 'allocations',
      message: 'Virtual second-layer physical allocations are not supported.',
    });
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateConfirmReadiness(
  input: StructuralValidationInput
): { ok: boolean; issues: ContainerStudyValidationIssue[] } {
  const structural = evaluateContainerStudyStructure(input);
  const issues = [...structural.issues];
  if (!input.hasResult) {
    issues.push({
      code: 'CALCULATION_RESULT_REQUIRED',
      field: 'currentResultId',
      message: 'CONFIRMED requires an immutable calculation result for the current input snapshot.',
    });
  }
  if (input.hasResult && input.resultAccountsForAllDrums === false) {
    issues.push({
      code: 'UNEXPLAINED_UNALLOCATED',
      field: 'unallocated',
      message: 'Every expanded physical drum must be allocated or explicitly unallocated.',
    });
  }
  if (input.hasResult && input.unallocatedCount && input.unallocatedCount > 0) {
    issues.push({
      code: 'UNALLOCATED_DRUMS_PRESENT',
      field: 'unallocated',
      message: 'CONFIRMED requires all drums allocated. Unallocated drums block confirmation.',
    });
  }
  return { ok: issues.length === 0, issues };
}
