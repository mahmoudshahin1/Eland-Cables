/**
 * Cable Constraint Engine (Validation Service)
 * 
 * Implements a reusable, rule-governed validation engine that determines whether
 * a complete cable configuration is valid.
 * 
 * CRITICAL RULE:
 * Individual valid parameters do NOT guarantee a valid cable combination.
 * The complete combination must match an approved cable record or explicitly approved
 * configuration rule.
 */

import { MasterCableCatalogItem } from '../types';
import {
  ParsedCableRecord,
  getAllParsedCables,
  parseMasterCableRecord,
} from './cableSelectionService';

export type ParameterApplicability = 'Required' | 'Optional' | 'Not Applicable';

export interface CableConfiguration {
  // 1-5: Commercial & Family Definition
  customerCode?: string;
  family?: string; // LV, MV, HV, EHV, Control, OHTL, etc.
  cableType?: string; // LV Power, MV Power, HV, EHV, Control, OHTL
  standard?: string; // IEC 60502-1, IEC 60502-2, IEC 60840, IEC 62067, IEC 61089, BS 5467, BS 6724
  voltage?: string; // 300/500 V, 0.6/1 kV, 3.6/6 kV, 6/10 kV, 12/20 kV, 18/30 kV, 64/110 kV, 76/132 kV, 127/220 kV, 230/400 kV

  // 6-10: Conductor Engineering
  conductor?: 'Copper' | 'Aluminum' | string;
  conductorClass?: 'Class 1' | 'Class 2' | 'Class 5' | 'Class 6' | string;
  conductorConstruction?: 'Solid' | 'Stranded' | 'Compact' | 'Sector' | 'Milliken' | string;
  conductorSize?: string | number; // 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000 mm²
  conductorWaterTight?: 'Yes' | 'No' | 'Swellable Powder' | 'Swellable Yarn' | 'None' | string;

  // 11-15: Core & Insulation Design
  core?: string | number; // '1 Core', '2 Core', '3 Core', '4 Core', '5 Core', 'Multi-Core'
  coreIdentification?: string; // Red/Yellow/Blue/Black, HD 308 S2, Brown/Black/Grey/Blue, Numbered, Custom
  coreConstruction?: string; // Individual Insulated Cores, Assembled Extruded Cores, Twisted Pairs, Concentric
  insulation?: 'XLPE' | 'PVC' | 'EPR' | 'HEPR' | 'LSHF' | string;
  insulationThickness?: string | number; // mm (auto calculated or conditional)

  // 16-21: Semi-Conductor & Metallic Screen
  outerSemiConductor?: 'Bonded' | 'Strippable' | 'Cold Strippable' | 'Yes' | 'No' | 'None' | string;
  outerSemiConductorType?: 'Strippable' | 'Bonded' | 'Extruded Easy-Strip' | string;
  screen?: 'Copper Wire Screen' | 'Copper Tape Screen' | 'Aluminum Screen' | 'Lead Sheath' | 'Concentric Copper' | 'No Screen' | string;
  screenCSA?: string | number; // 16 mm², 25 mm², 35 mm², 50 mm², 70 mm², 95 mm², 120 mm²
  screenWaterTight?: 'Yes' | 'No' | 'Longitudinal Water-Tight' | 'Semi-Conductive Swellable Tape' | 'None' | string;
  screenConstruction?: 'Wire + Tape' | 'Tape' | 'Wire' | 'Concentric' | string;

  // 22-28: Bedding, Filler & Armour
  fillerBinder?: 'PP Yarn' | 'Non-woven Tape' | 'Water Blocking Swellable' | 'Extruded Elastomeric' | 'None' | string;
  bedding?: 'PVC' | 'PE' | 'LSZH' | 'Taped' | 'None' | string;
  armour?: 'Steel Wire Armour' | 'Steel Tape Armour' | 'Aluminum Wire Armour' | 'Copper Wire Armour' | 'No Armour' | 'Unarmoured' | 'SWA' | 'STA' | 'AWA' | string;
  armourMaterial?: 'Galvanized Steel' | 'Aluminium' | 'None' | string;
  armourCSA?: string | number; // e.g. 0.9mm, 1.25mm, 1.6mm, 2.0mm, 2.5mm, 3.15mm
  armourWaterTight?: 'Yes' | 'No' | 'Swellable Tape' | 'None' | string;
  innerSheath?: 'PVC' | 'PE' | 'LSZH' | 'None' | string;

  // 29-35: Outer Sheathing, Additives & CPR
  sheathing?: 'LSHF' | 'PVC' | 'PE' | 'MDPE' | 'HDPE' | 'Lead' | string;
  sheathingColor?: 'Black' | 'Red' | 'Gray' | 'Blue' | 'Yellow' | 'Orange' | 'Custom' | string;
  specialAdditives?: 'None' | 'Yes' | 'UV Resistant' | 'Termite Resistant' | 'Anti-Rodent' | 'Low Smoke Zero Halogen' | 'Flame Retardant' | 'Fire Resistant' | 'Oil Resistant' | string;
  semiConduct?: 'Extruded Semi-Conductor' | 'Semi-Conductive Tape' | 'None' | string;
  semiConductiveSheath?: 'Yes' | 'No' | string;
  graphite?: 'Yes' | 'No' | 'Graphite Coated' | 'Conductive Layer' | 'None' | string;
  graphiteCoating?: 'Yes' | 'No' | string;
  cpr?: 'Yes' | 'No' | 'EN 50575' | 'N/A' | string;
  cprClass?: 'Aca' | 'B1ca' | 'B2ca' | 'B2ca-s1a,d0,a1' | 'Cca' | 'Cca-s1b,d1,a1' | 'Dca' | 'Dca-s2,d2,a2' | 'Eca' | 'Fca' | 'None' | string;
  edr?: 'Yes' | 'No' | 'EDR Standard' | 'EDR Verified' | 'Non-EDR' | 'Standard' | string;

  // 36-40: Auto-Calculated Physical & Electrical Performance
  cableDiameter?: number;
  totalCableWeight?: number;
  minBendingRadius?: number;
  operatingTemp?: string;
  shortCircuitRating?: string;

  // 41-45: Logistics, Packaging & Special Requirements
  cuttingLength?: number;
  lengthTolerance?: string;
  drumType?: string;
  drumCapacity?: number;
  specialCustomerRequirements?: string;
}

export interface ValidationDiagnostics {
  checkedAttributesCount: number;
  matchingCount: number;
  totalCatalogRecords: number;
  conflictingSelections: { parameter: string; value: any; reason: string }[];
  suggestedFixes: string[];
}

export interface ValidationResult {
  isValid: boolean;
  status: 'RESOLVED_SINGLE' | 'MATCHES_MULTIPLE' | 'INVALID_NO_MATCH' | 'INCOMPLETE_CONFIGURATION';
  matchingCables: ParsedCableRecord[];
  resolvedCable: ParsedCableRecord | null;
  matchCount: number;
  invalidParameters: string[];
  warnings: string[];
  requiredParameters: string[];
  optionalParameters: string[];
  notApplicableParameters: string[];
  parameterStates: Record<string, ParameterApplicability>;
  mismatchReasons: string[];
  primaryMismatchMessage?: string;
  diagnostics: ValidationDiagnostics;
}

/**
 * List of all 45 tracked cable parameters according to the specification sequence
 */
export const ALL_VALIDATION_PARAMETERS = [
  'customerCode', // 1
  'family', // 2
  'cableType', // 3
  'standard', // 4
  'voltage', // 5
  'conductor', // 6
  'conductorClass', // 7
  'conductorConstruction', // 8
  'conductorSize', // 9
  'conductorWaterTight', // 10
  'core', // 11
  'coreIdentification', // 12
  'coreConstruction', // 13
  'insulation', // 14
  'insulationThickness', // 15
  'outerSemiConductor', // 16
  'outerSemiConductorType', // 17
  'screen', // 18
  'screenCSA', // 19
  'screenWaterTight', // 20
  'screenConstruction', // 21
  'fillerBinder', // 22
  'bedding', // 23
  'armour', // 24
  'armourMaterial', // 25
  'armourCSA', // 26
  'armourWaterTight', // 27
  'innerSheath', // 28
  'sheathing', // 29
  'sheathingColor', // 30
  'specialAdditives', // 31
  'semiConductiveSheath', // 32
  'graphiteCoating', // 33
  'cprClass', // 34
  'edr', // 35
  'cableDiameter', // 36 (Auto)
  'totalCableWeight', // 37 (Auto)
  'minBendingRadius', // 38 (Auto)
  'operatingTemp', // 39 (Auto)
  'shortCircuitRating', // 40 (Auto)
  'cuttingLength', // 41
  'lengthTolerance', // 42 (Auto/Cond)
  'drumType', // 43
  'drumCapacity', // 44 (Auto)
  'specialCustomerRequirements', // 45
] as const;

/**
 * Determines whether each of the 45 parameters is 'Required', 'Optional', or 'Not Applicable'
 * based on the active cable family, voltage rating, armour, core count, and screen selections.
 */
export function getParameterApplicability(config: CableConfiguration): Record<string, ParameterApplicability> {
  const family = (config.family || '').toUpperCase();
  const voltage = (config.voltage || '').toUpperCase();
  const isLV = family === 'LV' || voltage.includes('0.6/1') || voltage.includes('600/1000') || voltage.includes('450/750') || voltage.includes('300/500');
  const isMV = family === 'MV' || voltage.includes('6/10') || voltage.includes('11') || voltage.includes('12/20') || voltage.includes('18/30') || voltage.includes('33') || voltage.includes('3.6/6');
  const isHV = family === 'HV' || family === 'EHV' || voltage.includes('64/110') || voltage.includes('132') || voltage.includes('220') || voltage.includes('400');

  const armour = (config.armour || '').toUpperCase();
  const isArmoured = armour !== '' && armour !== 'NO ARMOUR' && armour !== 'UNARMOURED' && armour !== 'NONE';

  const screen = (config.screen || '').toUpperCase();
  const hasScreen = screen !== '' && screen !== 'NO SCREEN' && screen !== 'NONE';

  const cpr = (config.cpr || '').toUpperCase();
  const hasCpr = cpr === 'YES' || cpr.includes('50575');

  const states: Record<string, ParameterApplicability> = {
    // 1-5
    customerCode: 'Required',
    family: 'Required',
    cableType: 'Required',
    standard: 'Required',
    voltage: 'Required',

    // 6-10
    conductor: 'Required',
    conductorClass: 'Optional',
    conductorConstruction: 'Optional',
    conductorSize: 'Required',
    conductorWaterTight: isMV || isHV ? 'Optional' : 'Not Applicable',

    // 11-15
    core: 'Required',
    coreIdentification: 'Optional',
    coreConstruction: 'Optional',
    insulation: 'Required',
    insulationThickness: 'Optional', // Auto-calculated

    // 16-21: Semi-Con & Screening
    outerSemiConductor: isMV || isHV ? 'Required' : 'Not Applicable',
    outerSemiConductorType: (isMV || isHV) && config.outerSemiConductor && config.outerSemiConductor !== 'No' && config.outerSemiConductor !== 'None' ? 'Optional' : 'Not Applicable',
    screen: isMV || isHV ? 'Required' : 'Optional',
    screenCSA: (isMV || isHV || hasScreen) ? 'Optional' : 'Not Applicable',
    screenWaterTight: hasScreen ? 'Optional' : 'Not Applicable',
    screenConstruction: hasScreen ? 'Optional' : 'Not Applicable',

    // 22-28: Bedding & Armour
    fillerBinder: 'Optional',
    bedding: isArmoured ? 'Optional' : 'Not Applicable',
    armour: 'Required',
    armourMaterial: isArmoured ? 'Optional' : 'Not Applicable',
    armourCSA: isArmoured ? 'Optional' : 'Not Applicable',
    armourWaterTight: isArmoured ? 'Optional' : 'Not Applicable',
    innerSheath: isArmoured ? 'Optional' : 'Not Applicable',

    // 29-35: Sheathing & Certs
    sheathing: 'Required',
    sheathingColor: 'Required',
    specialAdditives: 'Optional',
    semiConduct: isMV || isHV ? 'Optional' : 'Not Applicable',
    semiConductiveSheath: isMV || isHV ? 'Optional' : 'Not Applicable',
    graphite: isMV || isHV ? 'Optional' : 'Not Applicable',
    graphiteCoating: isMV || isHV ? 'Optional' : 'Not Applicable',
    cpr: 'Optional',
    cprClass: (hasCpr || (config.sheathing && config.sheathing.toUpperCase().includes('LSHF'))) ? 'Optional' : 'Not Applicable',
    edr: 'Optional',

    // 36-40: Auto-Calculated
    cableDiameter: 'Optional',
    totalCableWeight: 'Optional',
    minBendingRadius: 'Optional',
    operatingTemp: 'Optional',
    shortCircuitRating: 'Optional',

    // 41-45: Logistics
    cuttingLength: 'Required',
    lengthTolerance: 'Optional',
    drumType: 'Optional',
    drumCapacity: 'Optional',
    specialCustomerRequirements: 'Optional',
  };

  return states;
}

/**
 * Normalizes input value for matching
 */
function normalizeConductor(val?: string): string {
  if (!val) return '';
  const u = val.toUpperCase().trim();
  if (u === 'CU' || u === 'COPPER') return 'Copper';
  if (u === 'AL' || u === 'ALUMINUM' || u === 'ALUMINIUM') return 'Aluminum';
  return val;
}

function normalizeSizeNumber(val?: string | number): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(val.replace(/[^\d.]/g, '')) || 0;
}

function normalizeCoreNumber(val?: string | number): number {
  if (typeof val === 'number') return val;
  if (!val) return 1;
  const match = val.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

function normalizeArmour(val?: string): string {
  if (!val) return 'No Armour';
  const u = val.toUpperCase().trim();
  if (u === 'SWA' || u.includes('STEEL WIRE')) return 'Steel Wire Armour';
  if (u === 'STA' || u.includes('STEEL TAPE')) return 'Steel Tape Armour';
  if (u === 'AWA' || u.includes('ALUMINUM WIRE') || u.includes('ALUMINIUM WIRE')) return 'Aluminum Wire Armour';
  if (u === 'CWA' || u.includes('COPPER WIRE ARMOUR')) return 'Copper Wire Armour';
  if (u === 'UNARMOURED' || u === 'NO ARMOUR' || u === 'NONE') return 'No Armour';
  return val;
}

function normalizeSheathing(val?: string): string {
  if (!val) return '';
  const u = val.toUpperCase().trim();
  if (u.includes('LSHF') || u.includes('LSOH') || u.includes('LSZH')) return 'LSHF';
  if (u.includes('MDPE')) return 'MDPE';
  if (u.includes('HDPE')) return 'HDPE';
  if (u.includes('PE') || u.includes('2Y')) return 'PE';
  if (u.includes('PVC') || u.includes('Y')) return 'PVC';
  return val;
}

/**
 * Validates a complete cable configuration against approved catalog records
 * and standard engineering physics constraints.
 */
export function validateCableConfiguration(
  configuration: CableConfiguration,
  options?: {
    customCatalog?: MasterCableCatalogItem[];
    parsedCatalog?: ParsedCableRecord[];
  }
): ValidationResult {
  const allCables = options?.parsedCatalog || (options?.customCatalog ? options.customCatalog.map(parseMasterCableRecord) : getAllParsedCables());
  const applicability = getParameterApplicability(configuration);

  const requiredParameters: string[] = [];
  const optionalParameters: string[] = [];
  const notApplicableParameters: string[] = [];

  Object.entries(applicability).forEach(([param, state]) => {
    if (state === 'Required') requiredParameters.push(param);
    else if (state === 'Optional') optionalParameters.push(param);
    else notApplicableParameters.push(param);
  });

  const invalidParameters: string[] = [];
  const warnings: string[] = [];
  const mismatchReasons: string[] = [];
  const conflictingSelections: { parameter: string; value: any; reason: string }[] = [];
  const suggestedFixes: string[] = [];

  // Normalizations
  const condMat = normalizeConductor(configuration.conductor);
  const sizeNum = normalizeSizeNumber(configuration.conductorSize);
  const coreNum = normalizeCoreNumber(configuration.core);
  const armourNorm = normalizeArmour(configuration.armour);
  const sheathNorm = normalizeSheathing(configuration.sheathing);
  const custCode = (configuration.customerCode || '').trim();
  const fam = (configuration.family || '').trim();
  const volt = (configuration.voltage || '').trim();
  const insul = (configuration.insulation || '').trim();
  const screenVal = (configuration.screen || '').trim();

  // -------------------------------------------------------------
  // 1. Engineering Constraint & Standard Physics Rule Validation
  // -------------------------------------------------------------

  // Rule 1: Single Core Magnetic Armour Constraint (IEC 60502-1/2, BS 7671)
  if (coreNum === 1 && (armourNorm === 'Steel Wire Armour' || armourNorm === 'Steel Tape Armour')) {
    invalidParameters.push('armour');
    invalidParameters.push('core');
    const msg = 'Single-core AC cables cannot use magnetic armour (Steel Wire SWA / Steel Tape STA) due to high eddy-current losses. Aluminum Wire Armour (AWA) or Unarmoured is required per IEC standards.';
    mismatchReasons.push(msg);
    conflictingSelections.push({ parameter: 'armour', value: configuration.armour, reason: msg });
    suggestedFixes.push('Change armour to Aluminum Wire Armour (AWA) or No Armour for single-core construction.');
  }

  // Rule 2: Conductor Size vs Multi-Core Manufacturability
  if (coreNum >= 4 && sizeNum > 400) {
    invalidParameters.push('conductorSize');
    invalidParameters.push('core');
    const msg = `4-Core and 5-Core power cables are only manufactured up to 400 mm² due to maximum drum bending radii and weight limits. Conductor size ${sizeNum} mm² requires single-core (1C) design.`;
    mismatchReasons.push(msg);
    conflictingSelections.push({ parameter: 'conductorSize', value: configuration.conductorSize, reason: msg });
    suggestedFixes.push('Select single-core (1C) for conductor sizes > 400 mm².');
  }

  // Rule 3: High Voltage / Medium Voltage Insulation Compatibility
  const isMVorHV = fam === 'MV' || fam === 'HV' || volt.includes('6/10') || volt.includes('11') || volt.includes('12/20') || volt.includes('18/30') || volt.includes('64/110');
  if (isMVorHV && insul.toUpperCase() === 'PVC') {
    invalidParameters.push('insulation');
    invalidParameters.push('voltage');
    const msg = `PVC insulation is not permissible for Medium/High Voltage (${volt || fam}). IEC 60502-2 and IEC 60840 mandate XLPE or EPR insulation.`;
    mismatchReasons.push(msg);
    conflictingSelections.push({ parameter: 'insulation', value: configuration.insulation, reason: msg });
    suggestedFixes.push('Switch insulation to XLPE or EPR for Medium/High Voltage cables.');
  }

  // Rule 4: Customer Code Domain Integrity
  if (custCode && custCode !== 'ALL' && custCode !== 'Standard') {
    const custUpper = custCode.toUpperCase();

    // N2XH checks (Copper, XLPE, LSHF, Unarmoured, LV 0.6/1kV)
    if (custUpper === 'N2XH') {
      if (condMat === 'Aluminum') {
        invalidParameters.push('conductor');
        const msg = 'Customer Code N2XH specifies Copper conductor ("N"). For Aluminum conductor, the designated code is NA2XH.';
        mismatchReasons.push(msg);
        conflictingSelections.push({ parameter: 'conductor', value: configuration.conductor, reason: msg });
        suggestedFixes.push('Change conductor to Copper or use NA2XH.');
      }
      if (armourNorm !== 'No Armour') {
        invalidParameters.push('armour');
        const msg = 'Customer Code N2XH is strictly unarmoured. For armoured halogen-free cables, use BS 6724 or N2XRH.';
        mismatchReasons.push(msg);
        conflictingSelections.push({ parameter: 'armour', value: configuration.armour, reason: msg });
        suggestedFixes.push('Set armour to No Armour for N2XH.');
      }
      if (sheathNorm && sheathNorm !== 'LSHF') {
        invalidParameters.push('sheathing');
        const msg = `Customer Code N2XH designates Halogen-Free LSHF outer sheath ("H"). Selected sheath is ${sheathNorm}.`;
        mismatchReasons.push(msg);
        conflictingSelections.push({ parameter: 'sheathing', value: configuration.sheathing, reason: msg });
        suggestedFixes.push('Set sheathing to LSHF.');
      }
    }

    // N2XS2Y checks (Copper, XLPE, Screen, PE sheath, MV)
    if (custUpper === 'N2XS2Y') {
      if (condMat === 'Aluminum') {
        invalidParameters.push('conductor');
        const msg = 'Customer Code N2XS2Y designates Copper conductor ("N"). For Aluminum conductor, use NA2XS2Y.';
        mismatchReasons.push(msg);
        conflictingSelections.push({ parameter: 'conductor', value: configuration.conductor, reason: msg });
        suggestedFixes.push('Change conductor to Copper or switch Customer Code to NA2XS2Y.');
      }
      if (sheathNorm && sheathNorm !== 'PE' && sheathNorm !== 'MDPE' && sheathNorm !== 'HDPE') {
        invalidParameters.push('sheathing');
        const msg = `Customer Code N2XS2Y designates Polyethylene sheath ("2Y"). Selected sheath is ${sheathNorm}.`;
        mismatchReasons.push(msg);
        conflictingSelections.push({ parameter: 'sheathing', value: configuration.sheathing, reason: msg });
        suggestedFixes.push('Set sheathing to PE or MDPE.');
      }
    }

    // NA2XS(F)2Y checks (Aluminum, XLPE, Screen, Water-blocking, PE sheath)
    if (custUpper.includes('NA2XS')) {
      if (condMat === 'Copper') {
        invalidParameters.push('conductor');
        const msg = `Customer Code ${custCode} designates Aluminum conductor ("NA"). For Copper conductor, use ${custCode.replace('NA', 'N')}.`;
        mismatchReasons.push(msg);
        conflictingSelections.push({ parameter: 'conductor', value: configuration.conductor, reason: msg });
        suggestedFixes.push('Change conductor to Aluminum or select N-series customer code.');
      }
    }

    // BS 5467 vs BS 6724 checks
    if (custUpper.includes('BS5467') || custUpper.includes('BS 5467')) {
      if (sheathNorm === 'LSHF') {
        warnings.push('BS 5467 standard specifies PVC outer sheathing. For LSHF sheathing with armour, standard BS 6724 is recommended.');
      }
    }
    if (custUpper.includes('BS6724') || custUpper.includes('BS 6724')) {
      if (sheathNorm === 'PVC') {
        invalidParameters.push('sheathing');
        const msg = 'BS 6724 standard requires Halogen-Free LSHF outer sheath. For PVC outer sheath, use BS 5467 standard.';
        mismatchReasons.push(msg);
        conflictingSelections.push({ parameter: 'sheathing', value: configuration.sheathing, reason: msg });
      }
    }
  }

  // -------------------------------------------------------------
  // 2. Exact Match Filtering Against Approved Catalog Records
  // -------------------------------------------------------------
  let matchingCables = allCables;

  // Filter 1: Customer Code (if active)
  if (custCode && custCode !== 'ALL') {
    matchingCables = matchingCables.filter((c) => c.customerCode.toUpperCase() === custCode.toUpperCase());
  }

  // Filter 2: Family (if active)
  if (fam && fam !== 'ALL') {
    matchingCables = matchingCables.filter((c) => c.family.toUpperCase() === fam.toUpperCase());
  }

  // Filter 3: Voltage (if active)
  if (volt && volt !== 'ALL') {
    matchingCables = matchingCables.filter((c) => c.voltage.toUpperCase() === volt.toUpperCase() || c.voltage.includes(volt));
  }

  // Filter 4: Conductor Material
  if (condMat) {
    matchingCables = matchingCables.filter((c) => c.conductorMaterial.toUpperCase() === condMat.toUpperCase());
  }

  // Filter 5: Conductor Size
  if (sizeNum > 0) {
    matchingCables = matchingCables.filter((c) => c.conductorSizeNum === sizeNum);
  }

  // Filter 6: Core Count
  if (coreNum > 0) {
    matchingCables = matchingCables.filter((c) => c.coresCount === coreNum);
  }

  // Filter 7: Insulation
  if (insul && insul !== 'ALL') {
    matchingCables = matchingCables.filter((c) => c.insulation.toUpperCase() === insul.toUpperCase());
  }

  // Filter 8: Armour
  if (armourNorm && armourNorm !== 'ALL') {
    matchingCables = matchingCables.filter((c) => c.armour.toUpperCase() === armourNorm.toUpperCase());
  }

  // Filter 9: Sheathing
  if (sheathNorm && sheathNorm !== 'ALL') {
    matchingCables = matchingCables.filter((c) => c.sheathing.toUpperCase() === sheathNorm.toUpperCase());
  }

  // Filter 10: Screen (if applicable)
  if (applicability.screen === 'Required' && screenVal && screenVal !== 'ALL') {
    matchingCables = matchingCables.filter((c) => {
      if (screenVal === 'No Screen') return c.screenType === 'No Screen';
      return c.screenType.toUpperCase().includes(screenVal.toUpperCase());
    });
  }

  // Filter 11: Standard (if specified)
  if (configuration.standard && configuration.standard !== 'ALL') {
    const stdUpper = configuration.standard.toUpperCase();
    matchingCables = matchingCables.filter((c) => c.standard.toUpperCase().includes(stdUpper) || stdUpper.includes(c.standard.toUpperCase()));
  }

  // -------------------------------------------------------------
  // 3. Evaluate Match State & Construct Final Result
  // -------------------------------------------------------------
  const matchCount = matchingCables.length;
  let status: 'RESOLVED_SINGLE' | 'MATCHES_MULTIPLE' | 'INVALID_NO_MATCH';
  let resolvedCable: ParsedCableRecord | null = null;
  let primaryMismatchMessage: string | undefined;

  if (matchCount === 1) {
    status = 'RESOLVED_SINGLE';
    resolvedCable = matchingCables[0];
  } else if (matchCount > 1) {
    status = 'MATCHES_MULTIPLE';
    resolvedCable = null; // Do not automatically choose one when multiple matches exist
  } else {
    status = 'INVALID_NO_MATCH';
    resolvedCable = null;
    primaryMismatchMessage = 'No valid cable configuration exists for the selected parameters.';

    if (mismatchReasons.length === 0) {
      mismatchReasons.push(
        `The parameter combination [${custCode || fam || 'Cable'} • ${volt || ''} • ${coreNum}C x ${sizeNum}mm² ${condMat} • ${insul}/${armourNorm}/${sheathNorm}] is not present in the master catalog or approved engineering list.`
      );
    }
  }

  const isValid = status === 'RESOLVED_SINGLE' || status === 'MATCHES_MULTIPLE';

  return {
    isValid,
    status,
    matchingCables,
    resolvedCable,
    matchCount,
    invalidParameters: Array.from(new Set(invalidParameters)),
    warnings: Array.from(new Set(warnings)),
    requiredParameters,
    optionalParameters,
    notApplicableParameters,
    parameterStates: applicability,
    mismatchReasons,
    primaryMismatchMessage: !isValid ? primaryMismatchMessage : undefined,
    diagnostics: {
      checkedAttributesCount: ALL_VALIDATION_PARAMETERS.length,
      matchingCount: matchCount,
      totalCatalogRecords: allCables.length,
      conflictingSelections,
      suggestedFixes: Array.from(new Set(suggestedFixes)),
    },
  };
}
