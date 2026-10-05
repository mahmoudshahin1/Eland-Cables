import { parseNumber } from '../../../../api/cableAuthorityMapping';
import {
  SelectionStateV2,
  ValidationErrorV2,
  CableFamilyCode,
} from '../types';

/**
 * Frontend prototype IEC cross-parameter notes only.
 * Not backend-authoritative. Not Cable Authority.
 */
export function validateCableConfigurationV2(
  selections: SelectionStateV2
): { isValid: boolean; errors: ValidationErrorV2[]; warnings: ValidationErrorV2[] } {
  const errors: ValidationErrorV2[] = [];
  const warnings: ValidationErrorV2[] = [];

  const family = selections.family as CableFamilyCode | undefined;
  const voltage = selections.voltage || '';
  const voltageUpper = voltage.toUpperCase();
  const conductorMat = selections.conductorMaterial;
  const conductorClass = selections.conductorClass || '';
  const conductorSizeNum = parseNumber(selections.conductorSize);
  const coresCount = selections.coresCount || (selections.cores ? parseNumber(selections.cores) : 1);
  const insulation = selections.insulation || '';
  const outerSemiCon = selections.outerSemiConductor || 'N/A';
  const screenType = selections.screenType || 'No Screen';
  const screenCSA = selections.screenCSA || 'None';
  const armour = selections.armour || 'No Armour';
  const armourCSA = selections.armourCSA || 'None';
  const cpr = selections.cpr || 'No';
  const cprClass = selections.cprClass || '';

  // Determine if Medium / High / Extra-High Voltage
  const isMV =
    voltageUpper.includes('3.6/6') ||
    voltageUpper.includes('6/10') ||
    voltageUpper.includes('6.35/11') ||
    voltageUpper.includes('8.7/15') ||
    voltageUpper.includes('12/20') ||
    voltageUpper.includes('18/30');

  const isHV =
    voltageUpper.includes('60 KV') ||
    voltageUpper.includes('66 KV') ||
    voltageUpper.includes('110 KV') ||
    voltageUpper.includes('132 KV') ||
    voltageUpper.includes('150 KV');

  const isEHV =
    voltageUpper.includes('220 KV') ||
    voltageUpper.includes('275 KV') ||
    voltageUpper.includes('400 KV') ||
    voltageUpper.includes('500 KV');

  const isHighPotential = isMV || isHV || isEHV;

  // 1. Mandatory base selections check
  if (!family) {
    errors.push({ field: 'family', message: 'Cable Family is required.', severity: 'error' });
  }
  if (!voltage) {
    errors.push({ field: 'voltage', message: 'Voltage rating is required.', severity: 'error' });
  }
  if (!conductorMat) {
    errors.push({ field: 'conductorMaterial', message: 'Conductor Material is required.', severity: 'error' });
  }
  if (!conductorSizeNum || conductorSizeNum <= 0) {
    errors.push({ field: 'conductorSize', message: 'Conductor Size is required and must be > 0.', severity: 'error' });
  }
  if (!insulation) {
    errors.push({ field: 'insulation', message: 'Insulation material is required.', severity: 'error' });
  }

  // 2. Voltage vs Insulation Compatibility
  if (isHighPotential && (insulation === 'PVC' || insulation === 'LSHF')) {
    errors.push({
      field: 'insulation',
      conflictingField: 'voltage',
      message: `Selected insulation (${insulation}) is not approved for high voltage stress (${voltage}). XLPE or EPR is required per IEC 60502-2 / IEC 60840.`,
      severity: 'error',
    });
  }

  // 3. Outer Semi-Conductor check for MV/HV/EHV
  if (isHighPotential) {
    if (outerSemiCon === 'N/A' || !outerSemiCon) {
      errors.push({
        field: 'outerSemiConductor',
        conflictingField: 'voltage',
        message: `Medium & High Voltage cables (${voltage}) strictly require an extruded outer semi-conducting layer (Strippable or Non-Strippable).`,
        severity: 'error',
      });
    }
  } else if (!isHighPotential && outerSemiCon !== 'N/A' && outerSemiCon !== '') {
    warnings.push({
      field: 'outerSemiConductor',
      conflictingField: 'voltage',
      message: `Low Voltage cables (≤ 1 kV) standardly do not require an extruded semi-conducting screen.`,
      severity: 'warning',
    });
  }

  // 4. Screening validation
  if (isHighPotential && (screenType === 'No Screen' || screenType === 'None')) {
    errors.push({
      field: 'screenType',
      conflictingField: 'voltage',
      message: `Voltage rating ${voltage} mandates metallic screening (Copper Wire, Copper Tape, or Metallic Screen) for electrical field containment.`,
      severity: 'error',
    });
  }

  if ((screenType === 'No Screen' || screenType === 'None') && screenCSA !== 'None' && screenCSA !== '') {
    errors.push({
      field: 'screenCSA',
      conflictingField: 'screenType',
      message: `Screening is set to 'No Screen' but Screen CSA contains a value (${screenCSA}).`,
      severity: 'error',
    });
  }

  // 5. Armour validation
  if ((armour === 'No Armour' || armour === 'None') && armourCSA !== 'None' && armourCSA !== '') {
    errors.push({
      field: 'armourCSA',
      conflictingField: 'armour',
      message: `Armour is set to 'No Armour' but Armour CSA contains a value (${armourCSA}).`,
      severity: 'error',
    });
  }

  // Single-Core AC Magnetic Armour Rule: Single core power cable cannot use magnetic Steel Wire Armour (SWA)
  if (coresCount === 1 && family !== 'CONTROL' && (armour.includes('SWA') || armour.includes('Steel Wire'))) {
    errors.push({
      field: 'armour',
      conflictingField: 'cores',
      message: `Single-core AC power cables cannot use magnetic Steel Wire Armour (SWA) due to excessive eddy-current circulating losses. Use Aluminium Wire Armour (AWA) or non-magnetic armour.`,
      severity: 'error',
    });
  }

  // 6. Conductor Class vs Size validation
  if (conductorClass.includes('Class 1') && conductorSizeNum > 35) {
    errors.push({
      field: 'conductorClass',
      conflictingField: 'conductorSize',
      message: `Class 1 Solid conductor is not approved for sizes above 35 mm² (selected: ${conductorSizeNum} mm²). Use Class 2 Stranded.`,
      severity: 'error',
    });
  }

  // 7. CPR Validation
  if (cpr === 'Yes') {
    if (!cprClass || cprClass === 'N/A' || cprClass.trim() === '') {
      errors.push({
        field: 'cprClass',
        conflictingField: 'cpr',
        message: `CPR is set to 'Yes' but CPR Class is required (e.g. Cca, B2ca, Eca).`,
        severity: 'error',
      });
    }
  }

  // 8. Individual Core Color validation
  if (coresCount > 0 && selections.coreColors) {
    for (let i = 1; i <= Math.min(coresCount, 8); i++) {
      const col = selections.coreColors[i];
      if (!col || col.trim() === '') {
        errors.push({
          field: `coreColors.${i}`,
          message: `Core ${i} Color is required for a ${coresCount}-core construction.`,
          severity: 'error',
        });
      }
    }
  }

  // 9. Standard vs Voltage sanity check
  const standard = selections.standard || '';
  if (isMV && standard === 'IEC 60502-1') {
    errors.push({
      field: 'standard',
      conflictingField: 'voltage',
      message: `Standard IEC 60502-1 is for 1 kV to 3 kV. Medium voltage (${voltage}) requires IEC 60502-2.`,
      severity: 'error',
    });
  }
  if (isHV && (standard === 'IEC 60502-1' || standard === 'IEC 60502-2')) {
    errors.push({
      field: 'standard',
      conflictingField: 'voltage',
      message: `High Voltage cables (${voltage}) require standard IEC 60840 or IEC 62067.`,
      severity: 'error',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
