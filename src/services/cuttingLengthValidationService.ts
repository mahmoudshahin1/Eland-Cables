import { ResolvedCableStructure, CuttingLengthValidation, FinalCableProductionResult } from '../types';

export interface StandardDrumDefinition {
  id: string;
  name: string;
  flangeMm: number;
  barrelMm: number;
  widthMm: number;
  maxWeightKg: number;
  tareWeightKg: number;
  material: 'Wooden' | 'Steel';
}

export const STANDARD_PRODUCTION_DRUMS: StandardDrumDefinition[] = [
  { id: 'k-10', name: 'Wooden Reel K-10 (1000mm)', flangeMm: 1000, barrelMm: 500, widthMm: 700, maxWeightKg: 1200, tareWeightKg: 85, material: 'Wooden' },
  { id: 'k-12', name: 'Wooden Reel K-12 (1200mm)', flangeMm: 1200, barrelMm: 600, widthMm: 850, maxWeightKg: 1800, tareWeightKg: 110, material: 'Wooden' },
  { id: 'k-14', name: 'Wooden Reel K-14 (1400mm)', flangeMm: 1400, barrelMm: 700, widthMm: 950, maxWeightKg: 2500, tareWeightKg: 140, material: 'Wooden' },
  { id: 'k-16', name: 'Wooden Reel K-16 (1600mm)', flangeMm: 1600, barrelMm: 800, widthMm: 1050, maxWeightKg: 3200, tareWeightKg: 180, material: 'Wooden' },
  { id: 'k-18', name: 'Heavy Wooden K-18 (1800mm)', flangeMm: 1800, barrelMm: 900, widthMm: 1100, maxWeightKg: 4000, tareWeightKg: 220, material: 'Wooden' },
  { id: 's-18', name: 'Steel Reel S-18 (1800mm)', flangeMm: 1800, barrelMm: 1000, widthMm: 1150, maxWeightKg: 5500, tareWeightKg: 380, material: 'Steel' },
  { id: 's-22', name: 'Industrial Steel S-22 (2200mm)', flangeMm: 2200, barrelMm: 1200, widthMm: 1300, maxWeightKg: 7500, tareWeightKg: 520, material: 'Steel' },
  { id: 's-26', name: 'Export Heavy Steel S-26 (2600mm)', flangeMm: 2600, barrelMm: 1400, widthMm: 1500, maxWeightKg: 10000, tareWeightKg: 780, material: 'Steel' },
];

/**
 * Calculates theoretical drum holding capacity in meters for a given cable diameter
 * Formula: L = (π * (F^2 - B^2) * W * packingFactor) / (4 * D^2 * 1000)
 */
export function calculateDrumCapacityMeters(drum: StandardDrumDefinition, outerDiameterMm: number): number {
  if (!outerDiameterMm || outerDiameterMm <= 0) return 0;
  const F = drum.flangeMm;
  const B = drum.barrelMm;
  const W = drum.widthMm;
  const D = outerDiameterMm;
  const packingFactor = 0.93; // Practical layer winding packing factor

  const volumeFactor = Math.PI * (F * F - B * B) * W * packingFactor;
  const cableAreaFactor = 4 * D * D * 1000;
  const theoreticalLength = volumeFactor / cableAreaFactor;

  return Math.floor(theoreticalLength);
}

/**
 * Determines minimum production length based on cable properties, voltage, and customer
 */
export function getMinimumProductionLength(cable: ResolvedCableStructure): number {
  const isMV = cable.voltage.includes('kV') && !cable.voltage.includes('0.6/1');
  const isArmored = cable.armour && cable.armour !== 'No Armour';
  const isHeavy = (cable.totalCableWeight || 0) > 2000;

  if (isMV || isArmored || isHeavy) {
    return 100.0; // 100 meters minimum production setup for MV/Armored/Heavy
  }
  return 50.0; // 50 meters standard minimum production run for standard LV
}

/**
 * Determines maximum continuous single-run length based on manufacturing line limits
 */
export function getMaximumContinuousLength(cable: ResolvedCableStructure): number {
  const diameter = cable.cableDiameter || 15.0;
  const weightKgKm = cable.totalCableWeight || 500.0;
  const isMV = cable.voltage.includes('kV') && !cable.voltage.includes('0.6/1');

  if (diameter > 50 || weightKgKm > 4000) {
    return 1500.0; // Heavy armored/extra-large cables: max 1,500m per continuous run
  }
  if (isMV || diameter > 30 || weightKgKm > 2000) {
    return 2500.0; // MV / Medium-heavy cables: max 2,500m per continuous run
  }
  if (diameter > 18 || weightKgKm > 800) {
    return 4000.0; // Standard LV industrial: max 4,000m continuous
  }
  return 6000.0; // Small building wire/control: max 6,000m continuous
}

/**
 * Validates cutting length against Cable, Customer, Production limits, and Drum capacity
 */
export function validateCuttingLength(
  cuttingLength: number | string,
  cable: ResolvedCableStructure
): CuttingLengthValidation {
  const numLength = typeof cuttingLength === 'number' ? cuttingLength : parseFloat(String(cuttingLength).trim());
  const minProd = getMinimumProductionLength(cable);
  const maxCont = getMaximumContinuousLength(cable);

  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Numeric validation
  if (isNaN(numLength) || numLength === null || numLength === undefined) {
    return {
      cuttingLength: 0,
      unit: 'meter',
      isValid: false,
      validationStatus: 'INVALID',
      statusMessage: 'Cutting length is required and must be a valid number.',
      minProductionLengthM: minProd,
      maxContinuousLengthM: maxCont,
      totalCableWeightKg: 0,
      exceedsDrumCapacity: false,
      exceedsContinuousLimit: false,
      belowMinProductionLimit: false,
      customerCompliance: false,
      warnings: [],
      errors: ['Please specify a valid numeric cutting length in meters.'],
      readyForInquiry: false,
    };
  }

  if (numLength <= 0) {
    return {
      cuttingLength: numLength,
      unit: 'meter',
      isValid: false,
      validationStatus: 'INVALID',
      statusMessage: 'Cutting length must be greater than 0 meters.',
      minProductionLengthM: minProd,
      maxContinuousLengthM: maxCont,
      totalCableWeightKg: 0,
      exceedsDrumCapacity: false,
      exceedsContinuousLimit: false,
      belowMinProductionLimit: true,
      customerCompliance: false,
      warnings: [],
      errors: ['Cutting length must be greater than 0 meters.'],
      readyForInquiry: false,
    };
  }

  // Weight calculations
  const totalCableWeightKg = parseFloat(((numLength / 1000) * (cable.totalCableWeight || 500)).toFixed(2));

  // 2. Minimum Production Length Check
  let belowMinProductionLimit = false;
  if (numLength < minProd) {
    belowMinProductionLimit = true;
    warnings.push(
      `Length (${numLength} m) is below standard minimum production threshold (${minProd} m). Minimum batch setup surcharge or approval applies.`
    );
  }

  // 3. Maximum Continuous Length Check
  let exceedsContinuousLimit = false;
  if (numLength > maxCont) {
    exceedsContinuousLimit = true;
    errors.push(
      `Length (${numLength.toLocaleString()} m) exceeds maximum continuous single-line extrusion limit (${maxCont.toLocaleString()} m) for this cable diameter (${cable.cableDiameter.toFixed(1)} mm).`
    );
  }

  // 4. Drum Capacity Evaluation
  let recommendedDrum: StandardDrumDefinition | undefined;
  let drumCapacityM = 0;
  let exceedsDrumCapacity = false;
  let totalGrossWeightKg = totalCableWeightKg;

  // Find the most suitable standard drum
  for (const drum of STANDARD_PRODUCTION_DRUMS) {
    const cap = calculateDrumCapacityMeters(drum, cable.cableDiameter);
    const grossWt = totalCableWeightKg + drum.tareWeightKg;
    if (cap >= numLength && grossWt <= drum.maxWeightKg) {
      recommendedDrum = drum;
      drumCapacityM = cap;
      totalGrossWeightKg = grossWt;
      break;
    }
  }

  if (!recommendedDrum) {
    // Check if largest drum can hold it
    const largestDrum = STANDARD_PRODUCTION_DRUMS[STANDARD_PRODUCTION_DRUMS.length - 1];
    const maxDrumCap = calculateDrumCapacityMeters(largestDrum, cable.cableDiameter);
    drumCapacityM = maxDrumCap;
    recommendedDrum = largestDrum;
    totalGrossWeightKg = totalCableWeightKg + largestDrum.tareWeightKg;

    if (numLength > maxDrumCap) {
      exceedsDrumCapacity = true;
      const numDrumsNeeded = Math.ceil(numLength / maxDrumCap);
      warnings.push(
        `Length (${numLength.toLocaleString()} m) exceeds maximum single drum capacity (${maxDrumCap.toLocaleString()} m on ${largestDrum.name}). Packaging will be split across ${numDrumsNeeded} drums.`
      );
    }
  }

  // 5. Customer Specific Requirement / Tolerance
  let customerCompliance = true;
  if (cable.customerCode && cable.customerCode !== 'Standard') {
    // E.g. Utility customers require standard batch multiples or tolerance
    if (numLength > 10000) {
      warnings.push(`Batch delivery plan recommended for volume orders (> 10,000 m) for ${cable.customerCode}.`);
    }
  }

  // Determine overall status
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  let validationStatus: 'VALID' | 'WARNING' | 'INVALID' = 'VALID';
  let statusMessage = 'Cutting length verified against production and packaging constraints.';

  if (hasErrors) {
    validationStatus = 'INVALID';
    statusMessage = errors[0];
  } else if (hasWarnings) {
    validationStatus = 'WARNING';
    statusMessage = warnings[0];
  }

  const isValid = !hasErrors;
  const readyForInquiry = isValid && numLength > 0;

  return {
    cuttingLength: numLength,
    unit: 'meter',
    isValid,
    validationStatus,
    statusMessage,
    minProductionLengthM: minProd,
    maxContinuousLengthM: maxCont,
    recommendedDrum: recommendedDrum?.name || 'Standard Production Reel',
    drumCapacityM,
    drumWeightLimitKg: recommendedDrum?.maxWeightKg,
    totalCableWeightKg,
    totalGrossWeightKg,
    exceedsDrumCapacity,
    exceedsContinuousLimit,
    belowMinProductionLimit,
    customerCompliance,
    warnings,
    errors,
    readyForInquiry,
  };
}

/**
 * Builds the final consolidated production result record containing all 7 mandated final parameters:
 * 1. Cable Material
 * 2. Item Code
 * 3. Cable Description
 * 4. Cutting Length
 * 5. Cable Diameter
 * 6. Cable Weight
 * 7. Validation Status
 */
export function buildFinalCableProductionResult(
  cable: ResolvedCableStructure,
  cuttingLength: number | string
): FinalCableProductionResult {
  const validation = validateCuttingLength(cuttingLength, cable);

  return {
    cableMaterial: cable.cableMaterialNumber,
    itemCode: cable.itemCode,
    cableDescription: cable.cableDescription,
    cuttingLength: validation.cuttingLength,
    cableDiameter: cable.cableDiameter,
    cableWeight: cable.totalCableWeight,
    totalWeightForLengthKg: validation.totalCableWeightKg,
    validationStatus: validation.validationStatus,
    statusDetails: validation.statusMessage,
    readyForInquiry: validation.readyForInquiry,
    resolvedStructure: {
      ...cable,
      cuttingLengthM: validation.cuttingLength,
      productionValidation: validation,
    },
    validation,
  };
}
