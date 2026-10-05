import type { CableAuthorityDecisionDto } from '../../../../api/cableAuthorityApi';
import { estimateCablePhysicals, generateTechnicalDescriptionV2 } from '../../../../api/cableAuthorityMapping';
import { CableRecordV2, SelectionStateV2, TechnicalValidationResultV2, ValidationErrorV2 } from '../types';
import { validateCableConfigurationV2 } from './iecPrototypeValidationV2';

function prototypeWarnings(selections: SelectionStateV2): ValidationErrorV2[] {
  const { isValid, errors, warnings } = validateCableConfigurationV2(selections);
  return [
    ...warnings,
    ...(!isValid
      ? errors.map((e) => ({ ...e, severity: 'warning' as const, message: `[Prototype IEC note] ${e.message}` }))
      : []),
  ];
}

/**
 * Maps a backend Cable Authority decision onto the V2 result panel.
 * Does not execute Cable Authority.
 */
export function presentCableAuthorityDecision(
  selections: SelectionStateV2,
  decision: CableAuthorityDecisionDto,
  allMasterRecords: CableRecordV2[] = []
): TechnicalValidationResultV2 {
  const physicals = estimateCablePhysicals(selections);
  const summaryDesc = generateTechnicalDescriptionV2(selections);
  const warnings = prototypeWarnings(selections);

  const matching =
    decision.cable
      ? allMasterRecords.find((r) => r.materialNumber === decision.cable?.materialNumber) || null
      : null;

  if (decision.code === 'CONFIGURATION_REQUIRED') {
    return {
      status: 'CONFIGURATION_REQUIRED',
      isValid: false,
      errors: decision.failedRules.map((r) => ({ field: r.field, message: r.message, severity: 'error' })),
      warnings,
      matchingCable: null,
      similarCables: [],
      summaryDescription: summaryDesc,
      estimatedDiameterMm: physicals.diameterMm,
      estimatedWeightKgKm: physicals.weightKgKm,
    };
  }

  if (decision.code === 'INVALID_CONFIGURATION') {
    return {
      status: 'INVALID_CONFIGURATION',
      isValid: false,
      errors: decision.failedRules.map((r) => ({ field: r.field, message: r.message, severity: 'error' })),
      warnings,
      matchingCable: null,
      similarCables: [],
      summaryDescription: summaryDesc,
      estimatedDiameterMm: physicals.diameterMm,
      estimatedWeightKgKm: physicals.weightKgKm,
    };
  }

  if (decision.code === 'EXISTING_CABLE') {
    return {
      status: 'EXISTING_APPROVED',
      isValid: true,
      errors: [],
      warnings,
      matchingCable: matching,
      similarCables: [],
      summaryDescription: matching?.description || summaryDesc,
      estimatedDiameterMm: matching?.outerDiameterMm || physicals.diameterMm,
      estimatedWeightKgKm: matching?.approxWeightKgKm || physicals.weightKgKm,
    };
  }

  return {
    status: 'VALID_NEW_CABLE',
    isValid: true,
    errors: [],
    warnings,
    matchingCable: null,
    similarCables: allMasterRecords.slice(0, 4),
    summaryDescription: summaryDesc,
    estimatedDiameterMm: physicals.diameterMm,
    estimatedWeightKgKm: physicals.weightKgKm,
  };
}

/** IEC notes only — used before the first evaluate API response. Not an authority result. */
export function presentPendingCableValidation(selections: SelectionStateV2): TechnicalValidationResultV2 {
  const physicals = estimateCablePhysicals(selections);
  return {
    status: 'CONFIGURATION_REQUIRED',
    isValid: false,
    errors: [],
    warnings: prototypeWarnings(selections),
    matchingCable: null,
    similarCables: [],
    summaryDescription: generateTechnicalDescriptionV2(selections),
    estimatedDiameterMm: physicals.diameterMm,
    estimatedWeightKgKm: physicals.weightKgKm,
  };
}
