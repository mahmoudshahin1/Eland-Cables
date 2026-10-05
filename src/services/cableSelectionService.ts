import { MasterCableCatalogItem, ResolvedCableStructure } from '../types';
import { getStoredCableCatalog } from './cableCatalogService';
import { loadAuthoritativeCableCatalog, type ResolvedMasterList } from './masterDataApiService';
import type { CableConfiguration } from './cableConstraintEngine';

export interface ParsedCableRecord {
  raw: MasterCableCatalogItem;
  id: string;
  itemCode: string;
  cableCode: string;
  customerCode: string;
  description: string;
  family: string;
  cableType: string;
  voltage: string;
  conductorMaterial: 'Copper' | 'Aluminum' | string;
  conductorSize: string;
  conductorSizeNum: number;
  conductorClass: string;
  conductorConstruction: string;
  conductorWaterTight: string;
  cores: string;
  coresCount: number;
  coreIdentification: string;
  coreConstruction: string;
  insulation: string;
  insulationThicknessMm: number;
  outerSemiConductor: string;
  outerSemiConductorType: string;
  screenType: string;
  screenWaterTight: string;
  screenCSA: string;
  screenConstruction: string;
  fillerBinder: string;
  bedding: string;
  armour: string;
  armourMaterial: string;
  armourWaterTight: string;
  armourCSA: string;
  innerSheath: string;
  sheathing: string;
  sheathingColor: string;
  specialAdditives: string;
  semiConduct: string;
  semiConductiveSheath: string;
  graphite: string;
  graphiteCoating: string;
  cpr: string;
  cprClass: string;
  edr: string;
  standard: string;
  outerDiameterMm: number;
  approxWeightKgKm: number;
  minBendingRadiusMm: number;
  operatingTempC: string;
  shortCircuitRatingKa: string;
}

export interface CableFilterSelection {
  customerCode?: string;
  family?: string;
  cableType?: string;
  standard?: string;
  voltage?: string;
  conductorMaterial?: string;
  conductorClass?: string;
  conductorConstruction?: string;
  conductorSize?: string;
  conductorWaterTight?: string;
  cores?: string;
  coreIdentification?: string;
  coreConstruction?: string;
  insulation?: string;
  insulationThickness?: string;
  outerSemiConductor?: string;
  outerSemiConductorType?: string;
  screenType?: string;
  screenCSA?: string;
  screenWaterTight?: string;
  screenConstruction?: string;
  fillerBinder?: string;
  bedding?: string;
  armour?: string;
  armourMaterial?: string;
  armourCSA?: string;
  armourWaterTight?: string;
  innerSheath?: string;
  sheathing?: string;
  sheathingColor?: string;
  specialAdditives?: string;
  semiConductiveSheath?: string;
  graphiteCoating?: string;
  cpr?: string;
  cprClass?: string;
  edr?: string;
  cuttingLength?: number;
  lengthTolerance?: string;
  drumType?: string;
  specialCustomerRequirements?: string;
}

export interface DynamicFilterOptions {
  availableCustomerCodes: string[];
  availableFamilies: string[];
  availableCableTypes: string[];
  availableStandards: string[];
  availableVoltages: string[];
  availableConductorMaterials: string[];
  availableConductorClasses: string[];
  availableConductorConstructions: string[];
  availableConductorSizes: string[];
  availableConductorWaterTights: string[];
  availableCores: string[];
  availableCoreIdentifications: string[];
  availableCoreConstructions: string[];
  availableInsulations: string[];
  availableOuterSemiConductors: string[];
  availableOuterSemiConductorTypes: string[];
  availableScreenTypes: string[];
  availableScreenCSAs: string[];
  availableScreenWaterTights: string[];
  availableScreenConstructions: string[];
  availableFillerBinders: string[];
  availableBeddings: string[];
  availableArmours: string[];
  availableArmourMaterials: string[];
  availableArmourCSAs: string[];
  availableArmourWaterTights: string[];
  availableInnerSheaths: string[];
  availableSheathings: string[];
  availableSheathingColors: string[];
  availableSpecialAdditives: string[];
  availableSemiConductiveSheaths: string[];
  availableGraphiteCoatings: string[];
  availableCPRs: string[];
  availableCPRClasses: string[];
  availableEDRs: string[];
  availableDrumTypes: string[];
  matchingCables: ParsedCableRecord[];
  hasMatches: boolean;
  emptyReason?: string;
}

/**
 * Calculates standard engineering physics and electrical performance values
 */
export function calculateCablePhysicsAndElectricals(
  family: string,
  voltage: string,
  conductorMat: string,
  sizeMm2: number,
  coresCount: number,
  insulation: string,
  isArmoured: boolean,
  outerDiameterMm: number,
  screenCSAVal: number = 0
) {
  // Insulation Thickness
  let insulationThicknessMm = 0.8;
  const voltUpper = voltage.toUpperCase();
  if (voltUpper.includes('0.6/1') || voltUpper.includes('600/1000')) {
    if (sizeMm2 <= 16) insulationThicknessMm = 0.8;
    else if (sizeMm2 <= 35) insulationThicknessMm = 0.9;
    else if (sizeMm2 <= 70) insulationThicknessMm = 1.0;
    else if (sizeMm2 <= 120) insulationThicknessMm = 1.2;
    else if (sizeMm2 <= 185) insulationThicknessMm = 1.6;
    else if (sizeMm2 <= 300) insulationThicknessMm = 1.8;
    else insulationThicknessMm = 2.2;
  } else if (voltUpper.includes('3.6/6')) {
    insulationThicknessMm = 2.5;
  } else if (voltUpper.includes('6/10') || voltUpper.includes('11')) {
    insulationThicknessMm = 3.4;
  } else if (voltUpper.includes('12/20')) {
    insulationThicknessMm = 5.5;
  } else if (voltUpper.includes('18/30') || voltUpper.includes('33')) {
    insulationThicknessMm = 8.0;
  } else if (voltUpper.includes('64/110') || voltUpper.includes('110')) {
    insulationThicknessMm = 16.0;
  } else if (voltUpper.includes('76/132') || voltUpper.includes('132')) {
    insulationThicknessMm = 18.0;
  } else if (voltUpper.includes('220')) {
    insulationThicknessMm = 24.0;
  } else if (voltUpper.includes('400')) {
    insulationThicknessMm = 30.0;
  }

  // Minimum Bending Radius
  const bendMultiplier = isArmoured ? 15 : (coresCount === 1 ? 15 : 12);
  const minBendingRadiusMm = Math.round(outerDiameterMm * bendMultiplier);

  // Operating Temperature
  const isXlpe = insulation.toUpperCase().includes('XLPE') || insulation.toUpperCase().includes('EPR');
  const operatingTempC = isXlpe ? '90°C Continuous (250°C Short-Circuit)' : '70°C Continuous (160°C Short-Circuit)';

  // Short Circuit Rating for 1s: k * S / sqrt(t)
  const isCu = !conductorMat.toUpperCase().includes('AL');
  const kFactor = isCu ? (isXlpe ? 143 : 115) : (isXlpe ? 94 : 76);
  const condKa = ((kFactor * sizeMm2) / 1000).toFixed(2);
  const screenKa = screenCSAVal > 0 ? ((143 * screenCSAVal) / 1000).toFixed(2) : undefined;
  const shortCircuitRatingKa = screenKa ? `${condKa} kA (Conductor) / ${screenKa} kA (Screen) for 1s` : `${condKa} kA for 1s`;

  return {
    insulationThicknessMm,
    minBendingRadiusMm,
    operatingTempC,
    shortCircuitRatingKa,
  };
}

/**
 * Parses any MasterCableCatalogItem description and fields into normalized structural attributes covering all 45 parameters.
 */
export function parseMasterCableRecord(item: MasterCableCatalogItem): ParsedCableRecord {
  const desc = item.description || '';
  const descUpper = desc.toUpperCase();

  // 1. Customer Code
  const customerCode = item.customerCode || (descUpper.includes('N2XH') ? 'N2XH' : descUpper.includes('N2XS2Y') ? 'N2XS2Y' : descUpper.includes('NA2XS(F)2Y') ? 'NA2XS(F)2Y' : descUpper.includes('N2XS(FL)2Y') ? 'N2XS(FL)2Y' : descUpper.includes('BS5467') || descUpper.includes('BS 5467') ? 'BS5467' : 'Standard');

  // 2. Voltage
  let voltage = '0.6/1 kV';
  if (descUpper.includes('0.6/1 KV') || descUpper.includes('600/1000V') || descUpper.includes('600/1000 V') || (descUpper.includes('1X16') && item.voltageClass === 'LV')) {
    voltage = '0.6/1 kV';
  } else if (descUpper.includes('3.6/6 KV')) {
    voltage = '3.6/6 kV';
  } else if (descUpper.includes('6/10 KV')) {
    voltage = '6/10 kV';
  } else if (descUpper.includes('6.35/11 KV') || descUpper.includes('11 KV')) {
    voltage = '6.35/11 kV';
  } else if (descUpper.includes('12/20 KV') || descUpper.includes('20 KV')) {
    voltage = '12/20 kV';
  } else if (descUpper.includes('18/30 KV') || descUpper.includes('30 KV') || descUpper.includes('33 KV')) {
    voltage = '18/30 kV';
  } else if (descUpper.includes('64/110 KV') || descUpper.includes('110 KV')) {
    voltage = '64/110 kV';
  } else if (descUpper.includes('76/132 KV') || descUpper.includes('132 KV')) {
    voltage = '76/132 kV';
  } else if (descUpper.includes('220 KV')) {
    voltage = '127/220 kV';
  } else if (descUpper.includes('400 KV')) {
    voltage = '230/400 kV';
  }

  // 3. Family & Cable Type
  let family = item.voltageClass || 'LV';
  if (voltage.includes('0.6/1') || voltage.includes('600/1000') || voltage.includes('300/500') || voltage.includes('450/750')) {
    family = 'LV';
  } else if (voltage.includes('6/10') || voltage.includes('3.6/6') || voltage.includes('6.35/11') || voltage.includes('12/20') || voltage.includes('18/30')) {
    family = 'MV';
  } else if (voltage.includes('110') || voltage.includes('132') || voltage.includes('150') || voltage.includes('220') || voltage.includes('400')) {
    family = 'HV';
  }

  let cableType = `${family} Power`;
  if (descUpper.includes('CONTROL')) cableType = 'Control';
  else if (descUpper.includes('OHTL') || descUpper.includes('OVERHEAD')) cableType = 'OHTL';
  else if (family === 'HV' || (family as string) === 'EHV') cableType = 'HV Power';

  // 4. Standard
  let standard = 'IEC 60502-1';
  if (descUpper.includes('IEC 60502-2')) standard = 'IEC 60502-2';
  else if (descUpper.includes('IEC 60840')) standard = 'IEC 60840';
  else if (descUpper.includes('IEC 62067')) standard = 'IEC 62067';
  else if (descUpper.includes('BS 5467') || descUpper.includes('BS5467')) standard = 'BS 5467';
  else if (descUpper.includes('BS 6724')) standard = 'BS 6724';
  else if (descUpper.includes('IEC 60228')) standard = 'IEC 60228';
  else if (family === 'MV') standard = 'IEC 60502-2';
  else if (family === 'HV') standard = 'IEC 60840';

  // 5. Conductor Material
  let conductorMaterial: 'Copper' | 'Aluminum' | string = item.conductor || 'Copper';
  if (descUpper.startsWith('AL') || descUpper.includes(' AL ') || descUpper.includes('ALUMINUM') || descUpper.includes('ALUMINIUM') || customerCode.startsWith('NA')) {
    conductorMaterial = 'Aluminum';
  } else {
    conductorMaterial = 'Copper';
  }

  // 6. Conductor Class & Construction
  let conductorClass = 'Class 2';
  if (descUpper.includes('CLASS 1') || descUpper.includes('SOLID')) conductorClass = 'Class 1';
  else if (descUpper.includes('CLASS 5') || descUpper.includes('FLEXIBLE')) conductorClass = 'Class 5';
  else if (descUpper.includes('CLASS 6')) conductorClass = 'Class 6';

  let conductorConstruction = 'Stranded Compact';
  if (conductorClass === 'Class 1') conductorConstruction = 'Solid';
  else if (conductorClass === 'Class 5' || conductorClass === 'Class 6') conductorConstruction = 'Flexible Stranded';
  else if (descUpper.includes('MILLIKEN') || (item.crossSectionMm2 && item.crossSectionMm2 >= 1000)) conductorConstruction = 'Milliken Segmental';
  else if (descUpper.includes('SECTOR')) conductorConstruction = 'Sector Shaped';

  // 7. Cores and Conductor Size
  let cores = '1 Core';
  let coresCount = 1;
  let conductorSizeNum = item.crossSectionMm2 || 16;
  let conductorSize = `${conductorSizeNum} mm²`;

  const sizeMatch = descUpper.match(/(\d+)\s*X\s*(\d+(\.\d+)?)\s*MM/i) || descUpper.match(/(\d+)\s*C\s*(\d+(\.\d+)?)/i);
  if (sizeMatch) {
    coresCount = parseInt(sizeMatch[1], 10);
    conductorSizeNum = parseFloat(sizeMatch[2]);
    cores = coresCount === 1 ? '1 Core' : coresCount === 2 ? '2 Core' : coresCount === 3 ? '3 Core' : coresCount === 4 ? '4 Core' : coresCount === 5 ? '5 Core' : 'Multi-Core';
    conductorSize = `${conductorSizeNum} mm²`;
  } else if (item.cores) {
    const cNum = parseInt(item.cores.replace('C', ''), 10);
    coresCount = isNaN(cNum) ? 1 : cNum;
    cores = coresCount === 1 ? '1 Core' : coresCount === 2 ? '2 Core' : coresCount === 3 ? '3 Core' : coresCount === 4 ? '4 Core' : coresCount === 5 ? '5 Core' : 'Multi-Core';
  }

  // 8. Conductor Water Tightness
  let conductorWaterTight = 'None';
  if (descUpper.includes('WATER TIGHT CONDUCTOR') || descUpper.includes('SWELLABLE YARN') || descUpper.includes('(FL)')) {
    conductorWaterTight = 'Swellable Yarn & Powder';
  } else if (family === 'HV' || (family as string) === 'EHV') {
    conductorWaterTight = 'Swellable Powder';
  }

  // 9. Core Identification & Construction
  let coreIdentification = coresCount === 1 ? 'Natural / Black' : coresCount === 3 ? 'Brown, Black, Grey' : coresCount === 4 ? 'Brown, Black, Grey, Blue' : 'HD 308 S2 Color Coded';
  let coreConstruction = coresCount === 1 ? 'Single Core' : 'Extruded Assembled with Fillers';

  // 10. Insulation
  let insulation = 'XLPE';
  if (descUpper.includes('PVC') && !descUpper.includes('XLPE')) {
    insulation = 'PVC';
  } else if (descUpper.includes('EPR')) {
    insulation = 'EPR';
  } else {
    insulation = 'XLPE';
  }

  // 11. Outer Semi-Conductor & Type
  let outerSemiConductor = 'None';
  let outerSemiConductorType = 'None';
  if (family === 'MV' || family === 'HV') {
    outerSemiConductor = 'Yes';
    outerSemiConductorType = descUpper.includes('STRIPPABLE') ? 'Strippable' : 'Bonded Extruded';
  }

  // 12. Screen Type
  let screenType = 'No Screen';
  if (descUpper.includes('CWS') || descUpper.includes('COPPER WIRE SCREEN')) {
    screenType = 'Copper Wire Screen';
  } else if (descUpper.includes('CTS') || descUpper.includes('COPPER TAPE SCREEN')) {
    screenType = 'Copper Tape Screen';
  } else if (descUpper.includes('LEAD') || descUpper.includes('LEAD SHEATH')) {
    screenType = 'Lead Sheath';
  } else if (descUpper.includes('AL-POLY') || descUpper.includes('ALUMINUM SCREEN') || descUpper.includes('ALS')) {
    screenType = 'Aluminum Screen';
  } else if (family === 'MV' || family === 'HV') {
    screenType = 'Copper Tape Screen';
  }

  // 13. Screen CSA & Water-Tightness & Construction
  let screenCSA = 'None';
  const screenCSAMatch = descUpper.match(/(\d+)\s*MM2\s*(CWS|CTS|SCREEN)/i) || descUpper.match(/CWS\s*(\d+)/i) || descUpper.match(/SCREEN\s*(\d+)/i);
  if (screenCSAMatch) {
    screenCSA = `${screenCSAMatch[1]} mm²`;
  } else if (item.screenMm2) {
    screenCSA = `${item.screenMm2} mm²`;
  } else if (family === 'MV' || family === 'HV') {
    screenCSA = conductorSizeNum >= 240 ? '50 mm²' : conductorSizeNum >= 95 ? '25 mm²' : '16 mm²';
  }

  let screenWaterTight = 'None';
  if (descUpper.includes('(F)') || descUpper.includes('(FL)') || descUpper.includes('WATER TIGHT') || descUpper.includes('SWELLABLE')) {
    screenWaterTight = descUpper.includes('(FL)') ? 'Longitudinal & Radial' : 'Longitudinal Water-Tight';
  }

  let screenConstruction = screenType === 'Copper Wire Screen' ? 'Copper Wires + Equalizing Tape' : screenType === 'Copper Tape Screen' ? 'Helically Applied Copper Tape' : 'None';

  // 14. Filler / Binder & Bedding
  let fillerBinder = coresCount > 1 ? 'Polypropylene (PP) Yarn + Non-Woven Tape' : 'None';
  let bedding = 'None';

  // 15. Armour & Armour Material / CSA
  let armour = 'No Armour';
  let armourMaterial = 'None';
  if (descUpper.includes('SWA') || descUpper.includes('STEEL WIRE ARMOUR')) {
    armour = 'Steel Wire Armour';
    armourMaterial = 'Galvanized Steel';
  } else if (descUpper.includes('STA') || descUpper.includes('STEEL TAPE ARMOUR')) {
    armour = 'Steel Tape Armour';
    armourMaterial = 'Galvanized Steel';
  } else if (descUpper.includes('AWA') || descUpper.includes('ALUMINUM WIRE ARMOUR')) {
    armour = 'Aluminum Wire Armour';
    armourMaterial = 'Aluminium';
  } else if (descUpper.includes('CWA') || descUpper.includes('COPPER WIRE ARMOUR')) {
    armour = 'Copper Wire Armour';
    armourMaterial = 'Copper';
  }

  let armourCSA = 'None';
  if (armour === 'Steel Wire Armour' || armour === 'Aluminum Wire Armour') {
    armourCSA = conductorSizeNum >= 300 ? '2.5 mm' : conductorSizeNum >= 95 ? '2.0 mm' : '1.6 mm';
  } else if (armour === 'Steel Tape Armour') {
    armourCSA = '0.8 mm';
  }

  let armourWaterTight = 'None';
  if (armour !== 'No Armour' && (descUpper.includes('WATER TIGHT ARMOUR') || descUpper.includes('(FL)'))) {
    armourWaterTight = 'Water-Tight';
  }

  let innerSheath = armour !== 'No Armour' ? (descUpper.includes('PVC') ? 'PVC' : 'LSZH Extruded') : 'None';
  if (armour !== 'No Armour') {
    bedding = innerSheath;
  }

  // 16. Outer Sheathing & Color
  let sheathing = 'LSHF';
  if (descUpper.includes('LSHF') || descUpper.includes('LSOH') || descUpper.includes('LSZH')) {
    sheathing = 'LSHF';
  } else if (descUpper.includes('PE') || descUpper.includes('2Y') || descUpper.includes('HDPE')) {
    sheathing = 'PE';
  } else if (descUpper.includes('MDPE')) {
    sheathing = 'MDPE';
  } else if (descUpper.includes('PVC')) {
    sheathing = 'PVC';
  }

  let sheathingColor = 'Black';
  if (descUpper.includes('RED')) sheathingColor = 'Red';
  else if (descUpper.includes('BLUE')) sheathingColor = 'Blue';
  else if (descUpper.includes('GREEN')) sheathingColor = 'Green';
  else if (descUpper.includes('YELLOW')) sheathingColor = 'Yellow';

  // 17. Special Additives, Semi-Con Sheath, Graphite
  let specialAdditives = 'None';
  if (descUpper.includes('UV') || descUpper.includes('SUNLIGHT')) specialAdditives = 'UV Resistant';
  else if (descUpper.includes('ANTI-RODENT') || descUpper.includes('TERMITE')) specialAdditives = 'Termite / Anti-Rodent';
  else if (descUpper.includes('FIRE RESISTANT')) specialAdditives = 'Fire Resistant';
  else if (descUpper.includes('FLAME RETARDANT')) specialAdditives = 'Flame Retardant';

  let semiConduct = (family === 'MV' || family === 'HV') ? 'Extruded Semi-Conductor' : 'None';
  let semiConductiveSheath = (family === 'HV' || (family as string) === 'EHV') ? 'Yes' : 'No';
  let graphite = (descUpper.includes('GRAPHITE') || ((family === 'MV' || family === 'HV') && sheathing.includes('PE'))) ? 'Graphite Coated' : 'None';
  let graphiteCoating = graphite !== 'None' ? 'Yes' : 'No';

  // 18. CPR & CPR Class
  let cpr = 'N/A';
  let cprClass = 'None';
  if (sheathing === 'LSHF' || descUpper.includes('CPR') || descUpper.includes('BS 6724')) {
    cpr = 'Yes';
    cprClass = descUpper.includes('B2CA') ? 'B2ca-s1a,d0,a1' : 'Cca-s1b,d1,a1';
  }

  // 19. EDR (Engineering Data Record)
  let edr = 'EDR Verified';

  // 20. Outer Diameter & Weight
  const outerDiameterMm = item.outerDiameterMm || 15.0;
  const approxWeightKgKm = item.approxWeightKgKm || 500.0;

  // 21. Physics & Electrical Auto Calculations
  const screenCSANum = parseFloat(screenCSA.replace(/[^\d.]/g, '')) || 0;
  const physics = calculateCablePhysicsAndElectricals(
    family,
    voltage,
    conductorMaterial,
    conductorSizeNum,
    coresCount,
    insulation,
    armour !== 'No Armour',
    outerDiameterMm,
    screenCSANum
  );

  return {
    raw: item,
    id: item.id,
    itemCode: item.itemCode,
    cableCode: item.cableCode,
    customerCode,
    description: item.description,
    family,
    cableType,
    voltage,
    conductorMaterial,
    conductorSize,
    conductorSizeNum,
    conductorClass,
    conductorConstruction,
    conductorWaterTight,
    cores,
    coresCount,
    coreIdentification,
    coreConstruction,
    insulation,
    insulationThicknessMm: physics.insulationThicknessMm,
    outerSemiConductor,
    outerSemiConductorType,
    screenType,
    screenWaterTight,
    screenCSA,
    screenConstruction,
    fillerBinder,
    bedding,
    armour,
    armourMaterial,
    armourWaterTight,
    armourCSA,
    innerSheath,
    sheathing,
    sheathingColor,
    specialAdditives,
    semiConduct,
    semiConductiveSheath,
    graphite,
    graphiteCoating,
    cpr,
    cprClass,
    edr,
    standard,
    outerDiameterMm,
    approxWeightKgKm,
    minBendingRadiusMm: physics.minBendingRadiusMm,
    operatingTempC: physics.operatingTempC,
    shortCircuitRatingKa: physics.shortCircuitRatingKa,
  };
}

/**
 * Returns all parsed cable records from stored master catalog.
 * Prefer resolveAllParsedCables (PostgreSQL-first) for signed-in sessions (Task 04B-6).
 * Sync LS default is non-authoritative compatibility only.
 */
export function getAllParsedCables(catalog?: MasterCableCatalogItem[]): ParsedCableRecord[] {
  const rawList = catalog ?? getStoredCableCatalog();
  return rawList.map(parseMasterCableRecord);
}

/** PostgreSQL-first parsed cable catalog; LS fallback reports authoritative=false. */
export async function resolveAllParsedCables(
  jwtToken?: string | null
): Promise<ResolvedMasterList<ParsedCableRecord[]>> {
  const resolved = await loadAuthoritativeCableCatalog(jwtToken);
  return {
    ...resolved,
    data: resolved.data.map(parseMasterCableRecord),
  };
}

/** Explicit offline LS fallback — never authoritative. */
export function getAllParsedCablesOfflineFallback(): ResolvedMasterList<ParsedCableRecord[]> {
  return {
    data: getStoredCableCatalog().map(parseMasterCableRecord),
    source: 'LOCALSTORAGE_FALLBACK',
    authoritative: false,
  };
}

/**
 * Generic helper to get distinct available options for any parameter from a filtered subset of cable records.
 */
export function getAvailableOptions(
  cableRecords: ParsedCableRecord[],
  currentSelections: CableFilterSelection,
  parameterName: string
): string[] {
  let pool = cableRecords;

  // Filter pool based on selections provided, ignoring the parameterName itself
  if (currentSelections.customerCode && parameterName !== 'customerCode') {
    pool = pool.filter((c) => c.customerCode.toUpperCase() === currentSelections.customerCode!.toUpperCase());
  }
  if (currentSelections.family && parameterName !== 'family') {
    pool = pool.filter((c) => c.family.toUpperCase() === currentSelections.family!.toUpperCase());
  }
  if (currentSelections.voltage && parameterName !== 'voltage') {
    pool = pool.filter((c) => c.voltage.toUpperCase() === currentSelections.voltage!.toUpperCase() || c.voltage.includes(currentSelections.voltage!));
  }
  if (currentSelections.conductorMaterial && parameterName !== 'conductorMaterial' && parameterName !== 'conductor') {
    const mat = currentSelections.conductorMaterial.toUpperCase();
    pool = pool.filter((c) => 
      c.conductorMaterial.toUpperCase() === mat ||
      (mat === 'CU' && c.conductorMaterial === 'Copper') ||
      (mat === 'AL' && c.conductorMaterial === 'Aluminum')
    );
  }
  if (currentSelections.conductorClass && parameterName !== 'conductorClass') {
    pool = pool.filter((c) => c.conductorClass.toUpperCase() === currentSelections.conductorClass!.toUpperCase());
  }
  if (currentSelections.conductorSize && parameterName !== 'conductorSize') {
    const sizeNum = parseFloat(String(currentSelections.conductorSize).replace(/[^\d.]/g, '')) || 0;
    pool = pool.filter((c) => c.conductorSizeNum === sizeNum || c.conductorSize === currentSelections.conductorSize);
  }
  if (currentSelections.cores && parameterName !== 'cores' && parameterName !== 'core') {
    const coreVal = currentSelections.cores.toUpperCase();
    pool = pool.filter((c) => 
      c.cores.toUpperCase() === coreVal ||
      (coreVal === '1C' && c.cores === '1 Core') ||
      (coreVal === '2C' && c.cores === '2 Core') ||
      (coreVal === '3C' && c.cores === '3 Core') ||
      (coreVal === '4C' && c.cores === '4 Core') ||
      (coreVal === '5C' && c.cores === '5 Core')
    );
  }
  if (currentSelections.insulation && parameterName !== 'insulation') {
    pool = pool.filter((c) => c.insulation.toUpperCase().includes(currentSelections.insulation!.toUpperCase()));
  }
  if (currentSelections.screenType && parameterName !== 'screenType' && parameterName !== 'screen') {
    pool = pool.filter((c) => c.screenType.toUpperCase() === currentSelections.screenType!.toUpperCase());
  }
  if (currentSelections.armour && parameterName !== 'armour') {
    pool = pool.filter((c) => c.armour.toUpperCase().includes(currentSelections.armour!.toUpperCase()));
  }
  if (currentSelections.sheathing && parameterName !== 'sheathing') {
    pool = pool.filter((c) => c.sheathing.toUpperCase().includes(currentSelections.sheathing!.toUpperCase()));
  }
  if (currentSelections.sheathingColor && parameterName !== 'sheathingColor') {
    pool = pool.filter((c) => c.sheathingColor.toUpperCase() === currentSelections.sheathingColor!.toUpperCase());
  }
  if (currentSelections.standard && parameterName !== 'standard') {
    pool = pool.filter((c) => c.standard.toUpperCase().includes(currentSelections.standard!.toUpperCase()));
  }

  // Extract distinct values for the requested parameterName
  let values: string[] = [];
  switch (parameterName) {
    case 'customerCode':
      values = pool.map((c) => c.customerCode);
      break;
    case 'family':
      values = pool.map((c) => c.family);
      break;
    case 'voltage':
      values = pool.map((c) => c.voltage);
      break;
    case 'conductorMaterial':
    case 'conductor':
      values = pool.map((c) => c.conductorMaterial);
      break;
    case 'conductorClass':
      values = pool.map((c) => c.conductorClass);
      break;
    case 'conductorSize':
      values = pool.map((c) => c.conductorSize);
      values.sort((a, b) => {
        const numA = parseFloat(a.replace(/[^\d.]/g, '')) || 0;
        const numB = parseFloat(b.replace(/[^\d.]/g, '')) || 0;
        return numA - numB;
      });
      return Array.from(new Set(values.filter(Boolean)));
    case 'cores':
    case 'core':
      values = pool.map((c) => c.cores);
      break;
    case 'insulation':
      values = pool.map((c) => c.insulation);
      break;
    case 'screenType':
    case 'screen':
      values = pool.map((c) => c.screenType);
      break;
    case 'screenCSA':
      values = pool.map((c) => c.screenCSA);
      break;
    case 'armour':
      values = pool.map((c) => c.armour);
      break;
    case 'armourCSA':
      values = pool.map((c) => c.armourCSA);
      break;
    case 'sheathing':
      values = pool.map((c) => c.sheathing);
      break;
    case 'sheathingColor':
      values = pool.map((c) => c.sheathingColor);
      break;
    case 'standard':
      values = pool.map((c) => c.standard);
      break;
    default:
      break;
  }

  return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Evaluates dynamic filter options at every step of selection following the 45-parameter sequence.
 * At every step: Available Values = Distinct values from cable records that satisfy all previous selections.
 */
export function evaluateDynamicFilterOptions(
  selections: CableFilterSelection,
  allCables?: ParsedCableRecord[]
): DynamicFilterOptions {
  const cables = allCables || getAllParsedCables();

  // Distinct list of all available Customer Codes in the catalog (sorted, no "ALL")
  const availableCustomerCodes = Array.from(new Set(cables.map((c) => c.customerCode))).filter(Boolean).sort();

  // 1. Pool by Customer Code (if selected)
  let pool1 = cables;
  if (selections.customerCode && selections.customerCode !== 'ALL' && selections.customerCode !== '') {
    pool1 = pool1.filter((c) => c.customerCode.toUpperCase() === selections.customerCode!.toUpperCase());
  }

  // Available Families given Customer Code
  const availableFamilies = Array.from(new Set(pool1.map((c) => c.family))).filter(Boolean);

  // 2. Pool by Family
  let pool2 = pool1;
  if (selections.family && selections.family !== 'ALL' && selections.family !== '') {
    pool2 = pool2.filter((c) => c.family.toUpperCase() === selections.family!.toUpperCase());
  }

  // Available Cable Types given Family
  const availableCableTypes = Array.from(new Set(pool2.map((c) => c.cableType))).filter(Boolean);

  // 3. Pool by Cable Type
  let pool3 = pool2;
  if (selections.cableType && selections.cableType !== 'ALL' && selections.cableType !== '') {
    pool3 = pool3.filter((c) => c.cableType.toUpperCase() === selections.cableType!.toUpperCase());
  }

  // Available Standards
  const availableStandards = Array.from(new Set(pool3.map((c) => c.standard))).filter(Boolean);

  // 4. Pool by Standard
  let pool4 = pool3;
  if (selections.standard && selections.standard !== 'ALL' && selections.standard !== '') {
    pool4 = pool4.filter((c) => c.standard.toUpperCase().includes(selections.standard!.toUpperCase()));
  }

  // Available Voltages given Customer Code + Family + Type + Standard
  const availableVoltages = Array.from(new Set(pool4.map((c) => c.voltage))).filter(Boolean);

  // 5. Pool by Voltage
  let pool5 = pool4;
  if (selections.voltage && selections.voltage !== 'ALL' && selections.voltage !== '') {
    pool5 = pool5.filter((c) => c.voltage.toUpperCase() === selections.voltage!.toUpperCase() || c.voltage.includes(selections.voltage!));
  }

  // Available Conductor Materials
  const availableConductorMaterials = Array.from(new Set(pool5.map((c) => c.conductorMaterial))).filter(Boolean);

  // 6. Pool by Conductor Material
  let pool6 = pool5;
  if (selections.conductorMaterial && selections.conductorMaterial !== 'ALL' && selections.conductorMaterial !== '') {
    const mat = selections.conductorMaterial.toUpperCase();
    pool6 = pool6.filter(
      (c) =>
        c.conductorMaterial.toUpperCase() === mat ||
        (mat === 'CU' && c.conductorMaterial === 'Copper') ||
        (mat === 'AL' && c.conductorMaterial === 'Aluminum')
    );
  }

  // Available Conductor Classes
  const availableConductorClasses = Array.from(new Set(pool6.map((c) => c.conductorClass))).filter(Boolean);

  // 7. Pool by Conductor Class
  let pool7 = pool6;
  if (selections.conductorClass && selections.conductorClass !== 'ALL' && selections.conductorClass !== '') {
    pool7 = pool7.filter((c) => c.conductorClass.toUpperCase() === selections.conductorClass!.toUpperCase());
  }

  // Available Conductor Constructions
  const availableConductorConstructions = Array.from(new Set(pool7.map((c) => c.conductorConstruction))).filter(Boolean);

  // 8. Pool by Conductor Construction
  let pool8 = pool7;
  if (selections.conductorConstruction && selections.conductorConstruction !== 'ALL' && selections.conductorConstruction !== '') {
    pool8 = pool8.filter((c) => c.conductorConstruction.toUpperCase() === selections.conductorConstruction!.toUpperCase());
  }

  // Available Conductor Sizes (sorted numerically)
  const availableConductorSizes = Array.from(new Set(pool8.map((c) => c.conductorSize)))
    .filter(Boolean)
    .sort((a, b) => {
      const numA = parseFloat(a.replace(/[^\d.]/g, '')) || 0;
      const numB = parseFloat(b.replace(/[^\d.]/g, '')) || 0;
      return numA - numB;
    });

  // 9. Pool by Conductor Size
  let pool9 = pool8;
  if (selections.conductorSize && selections.conductorSize !== 'ALL' && selections.conductorSize !== '') {
    const sizeNum = parseFloat(String(selections.conductorSize).replace(/[^\d.]/g, '')) || 0;
    pool9 = pool9.filter(
      (c) =>
        c.conductorSize === selections.conductorSize ||
        c.conductorSizeNum === sizeNum
    );
  }

  // Available Conductor Water-Tightness
  const availableConductorWaterTights = Array.from(new Set(pool9.map((c) => c.conductorWaterTight))).filter(Boolean);

  // 10. Pool by Conductor Water-Tightness
  let pool10 = pool9;
  if (selections.conductorWaterTight && selections.conductorWaterTight !== 'ALL' && selections.conductorWaterTight !== '' && selections.conductorWaterTight !== 'None') {
    pool10 = pool10.filter((c) => c.conductorWaterTight === selections.conductorWaterTight);
  }

  // Available Cores
  const availableCores = Array.from(new Set(pool10.map((c) => c.cores))).filter(Boolean);

  // 11. Pool by Cores
  let pool11 = pool10;
  if (selections.cores && selections.cores !== 'ALL' && selections.cores !== '') {
    const coreVal = selections.cores.toUpperCase();
    pool11 = pool11.filter(
      (c) =>
        c.cores.toUpperCase() === coreVal ||
        (coreVal === '1C' && c.cores === '1 Core') ||
        (coreVal === '2C' && c.cores === '2 Core') ||
        (coreVal === '3C' && c.cores === '3 Core') ||
        (coreVal === '4C' && c.cores === '4 Core') ||
        (coreVal === '5C' && c.cores === '5 Core')
    );
  }

  // Available Core Identifications & Constructions
  const availableCoreIdentifications = Array.from(new Set(pool11.map((c) => c.coreIdentification))).filter(Boolean);
  const availableCoreConstructions = Array.from(new Set(pool11.map((c) => c.coreConstruction))).filter(Boolean);

  // Available Insulations
  const availableInsulations = Array.from(new Set(pool11.map((c) => c.insulation))).filter(Boolean);

  // 14. Pool by Insulation
  let pool14 = pool11;
  if (selections.insulation && selections.insulation !== 'ALL' && selections.insulation !== '') {
    pool14 = pool14.filter((c) => c.insulation.toUpperCase().includes(selections.insulation!.toUpperCase()));
  }

  // Available Outer Semi-Conductors & Types
  const availableOuterSemiConductors = Array.from(new Set(pool14.map((c) => c.outerSemiConductor))).filter(Boolean);
  const availableOuterSemiConductorTypes = Array.from(new Set(pool14.map((c) => c.outerSemiConductorType))).filter(Boolean);

  // 16. Pool by Outer Semi-Conductor
  let pool16 = pool14;
  if (selections.outerSemiConductor && selections.outerSemiConductor !== 'ALL' && selections.outerSemiConductor !== '') {
    pool16 = pool16.filter((c) => c.outerSemiConductor.toUpperCase() === selections.outerSemiConductor!.toUpperCase());
  }

  // Available Screen Types
  const availableScreenTypes = Array.from(new Set(pool16.map((c) => c.screenType))).filter(Boolean);

  // 18. Pool by Screen Type
  let pool18 = pool16;
  if (selections.screenType && selections.screenType !== 'ALL' && selections.screenType !== '') {
    pool18 = pool18.filter((c) => c.screenType.toUpperCase() === selections.screenType!.toUpperCase());
  }

  // Available Screen CSAs, Water-Tightness, Construction
  const availableScreenCSAs = Array.from(new Set(pool18.map((c) => c.screenCSA))).filter(Boolean);
  const availableScreenWaterTights = Array.from(new Set(pool18.map((c) => c.screenWaterTight))).filter(Boolean);
  const availableScreenConstructions = Array.from(new Set(pool18.map((c) => c.screenConstruction))).filter(Boolean);

  // 19. Pool by Screen CSA & Water-Tight
  let pool19 = pool18;
  if (selections.screenCSA && selections.screenCSA !== 'ALL' && selections.screenCSA !== '' && selections.screenCSA !== 'None') {
    pool19 = pool19.filter((c) => c.screenCSA === selections.screenCSA);
  }
  if (selections.screenWaterTight && selections.screenWaterTight !== 'ALL' && selections.screenWaterTight !== '' && selections.screenWaterTight !== 'None') {
    pool19 = pool19.filter((c) => c.screenWaterTight === selections.screenWaterTight);
  }

  // Available Filler / Binder & Bedding
  const availableFillerBinders = Array.from(new Set(pool19.map((c) => c.fillerBinder))).filter(Boolean);
  const availableBeddings = Array.from(new Set(pool19.map((c) => c.bedding))).filter(Boolean);

  // Available Armours
  const availableArmours = Array.from(new Set(pool19.map((c) => c.armour))).filter(Boolean);

  // 24. Pool by Armour
  let pool24 = pool19;
  if (selections.armour && selections.armour !== 'ALL' && selections.armour !== '') {
    pool24 = pool24.filter((c) => c.armour.toUpperCase().includes(selections.armour!.toUpperCase()));
  }

  // Available Armour Materials, CSAs, Water-Tightness, Inner Sheaths
  const availableArmourMaterials = Array.from(new Set(pool24.map((c) => c.armourMaterial))).filter(Boolean);
  const availableArmourCSAs = Array.from(new Set(pool24.map((c) => c.armourCSA))).filter(Boolean);
  const availableArmourWaterTights = Array.from(new Set(pool24.map((c) => c.armourWaterTight))).filter(Boolean);
  const availableInnerSheaths = Array.from(new Set(pool24.map((c) => c.innerSheath))).filter(Boolean);

  // 26. Pool by Armour CSA & Water-Tight
  let pool26 = pool24;
  if (selections.armourCSA && selections.armourCSA !== 'ALL' && selections.armourCSA !== '' && selections.armourCSA !== 'None') {
    pool26 = pool26.filter((c) => c.armourCSA === selections.armourCSA);
  }
  if (selections.armourWaterTight && selections.armourWaterTight !== 'ALL' && selections.armourWaterTight !== '' && selections.armourWaterTight !== 'None') {
    pool26 = pool26.filter((c) => c.armourWaterTight === selections.armourWaterTight);
  }

  // Available Sheathings
  const availableSheathings = Array.from(new Set(pool26.map((c) => c.sheathing))).filter(Boolean);

  // 29. Pool by Sheathing
  let pool29 = pool26;
  if (selections.sheathing && selections.sheathing !== 'ALL' && selections.sheathing !== '') {
    pool29 = pool29.filter((c) => c.sheathing.toUpperCase().includes(selections.sheathing!.toUpperCase()));
  }

  // Available Sheathing Colors, Additives, Semi-Con Sheath, Graphite, CPR
  const availableSheathingColors = Array.from(new Set(pool29.map((c) => c.sheathingColor))).filter(Boolean);
  const availableSpecialAdditives = Array.from(new Set(pool29.map((c) => c.specialAdditives))).filter(Boolean);
  const availableSemiConductiveSheaths = Array.from(new Set(pool29.map((c) => c.semiConductiveSheath))).filter(Boolean);
  const availableGraphiteCoatings = Array.from(new Set(pool29.map((c) => c.graphiteCoating))).filter(Boolean);
  const availableCPRs = Array.from(new Set(pool29.map((c) => c.cpr))).filter(Boolean);
  const availableCPRClasses = Array.from(new Set(pool29.map((c) => c.cprClass))).filter(Boolean);
  const availableEDRs = Array.from(new Set(pool29.map((c) => c.edr))).filter(Boolean);
  const availableDrumTypes = ['Wooden Drum', 'Steel Drum', 'Returnable Heavy-Duty Drum', 'Special Logistics Spool'];

  // 30. Pool by Sheathing Color & Additives
  let finalPool = pool29;
  if (selections.sheathingColor && selections.sheathingColor !== 'ALL' && selections.sheathingColor !== '') {
    finalPool = finalPool.filter((c) => c.sheathingColor.toUpperCase() === selections.sheathingColor!.toUpperCase());
  }
  if (selections.specialAdditives && selections.specialAdditives !== 'ALL' && selections.specialAdditives !== '' && selections.specialAdditives !== 'None') {
    finalPool = finalPool.filter((c) => c.specialAdditives === selections.specialAdditives);
  }
  if (selections.cpr && selections.cpr !== 'ALL' && selections.cpr !== '') {
    finalPool = finalPool.filter((c) => c.cpr === selections.cpr);
  }
  if (selections.cprClass && selections.cprClass !== 'ALL' && selections.cprClass !== '' && selections.cprClass !== 'None') {
    finalPool = finalPool.filter((c) => c.cprClass === selections.cprClass);
  }
  if (selections.edr && selections.edr !== 'ALL' && selections.edr !== '') {
    finalPool = finalPool.filter((c) => c.edr === selections.edr);
  }

  const hasMatches = finalPool.length > 0;

  return {
    availableCustomerCodes,
    availableFamilies,
    availableCableTypes,
    availableStandards,
    availableVoltages,
    availableConductorMaterials,
    availableConductorClasses,
    availableConductorConstructions,
    availableConductorSizes,
    availableConductorWaterTights,
    availableCores,
    availableCoreIdentifications,
    availableCoreConstructions,
    availableInsulations,
    availableOuterSemiConductors,
    availableOuterSemiConductorTypes,
    availableScreenTypes,
    availableScreenCSAs,
    availableScreenWaterTights,
    availableScreenConstructions,
    availableFillerBinders,
    availableBeddings,
    availableArmours,
    availableArmourMaterials,
    availableArmourCSAs,
    availableArmourWaterTights,
    availableInnerSheaths,
    availableSheathings,
    availableSheathingColors,
    availableSpecialAdditives,
    availableSemiConductiveSheaths,
    availableGraphiteCoatings,
    availableCPRs,
    availableCPRClasses,
    availableEDRs,
    availableDrumTypes,
    matchingCables: finalPool,
    hasMatches,
    emptyReason: hasMatches ? undefined : 'No valid cable configuration exists for the selected parameters.',
  };
}

/**
 * Builds a standardized ResolvedCableStructure object exposing all 45 required technical,
 * physical, electrical, and catalog properties for downstream consumption (Inquiry, Quotation, TDS, D365, etc.)
 */
export function createResolvedCableStructure(
  cable: ParsedCableRecord,
  userConfig?: Partial<CableConfiguration> | Partial<CableFilterSelection> | Record<string, any>
): ResolvedCableStructure {
  const config = (userConfig || {}) as Record<string, any>;
  const conductorCSAText =
    cable.conductorSize ||
    (config.conductorSize ? String(config.conductorSize) : `${cable.conductorSizeNum} mm²`);

  const cuttingLengthM = Number(config.cuttingLength || config.cuttingLengthM || 500);
  const drumCapacityM = Math.round(150000 / Math.max(1, cable.outerDiameterMm || 20));

  return {
    // 1-5: Commercial & Family Definition
    customerCode: cable.customerCode || config.customerCode || 'Standard',
    cableFamily: cable.family || config.family || 'LV',
    cableType: cable.cableType || config.cableType || `${cable.family} Power`,
    standard: cable.standard || config.standard || 'IEC 60502-1',
    voltage: cable.voltage || config.voltage || '0.6/1 kV',

    // 6-10: Conductor Engineering
    conductor: cable.conductorMaterial || config.conductorMaterial || 'Copper',
    conductorClass: cable.conductorClass || config.conductorClass || 'Class 2',
    conductorConstruction: cable.conductorConstruction || config.conductorConstruction || 'Stranded Compact',
    conductorCSA: conductorCSAText,
    conductorWaterTight: cable.conductorWaterTight || config.conductorWaterTight || 'None',

    // 11-15: Core & Insulation Design
    core: cable.cores || config.cores || '1 Core',
    coreIdentification: cable.coreIdentification || config.coreIdentification || 'Color Coded',
    coreConstruction: cable.coreConstruction || config.coreConstruction || 'Extruded Cores',
    insulation: cable.insulation || config.insulation || 'XLPE',
    insulationThickness: cable.insulationThicknessMm || config.insulationThickness || 1.0,

    // 16-21: Semi-Conductor & Metallic Screen
    outerSemiConductor: cable.outerSemiConductor || config.outerSemiConductor || 'None',
    outerSemiConductorType: cable.outerSemiConductorType || config.outerSemiConductorType || 'None',
    screen: cable.screenType || config.screenType || 'No Screen',
    screenCSA: cable.screenCSA || config.screenCSA || 'None',
    screenWaterTight: cable.screenWaterTight || config.screenWaterTight || 'None',
    screenConstruction: cable.screenConstruction || config.screenConstruction || 'None',

    // 22-28: Bedding, Filler & Armour
    fillerBinder: cable.fillerBinder || config.fillerBinder || 'None',
    bedding: cable.bedding || config.bedding || 'None',
    armour: cable.armour || config.armour || 'No Armour',
    armourMaterial: cable.armourMaterial || config.armourMaterial || 'None',
    armourCSA: cable.armourCSA || config.armourCSA || 'None',
    armourWaterTight: cable.armourWaterTight || config.armourWaterTight || 'None',
    innerSheath: cable.innerSheath || config.innerSheath || 'None',

    // 29-35: Outer Sheathing, Additives & CPR
    sheathing: cable.sheathing || config.sheathing || 'LSHF',
    sheathingColor: cable.sheathingColor || config.sheathingColor || 'Black',
    specialAdditives: cable.specialAdditives || config.specialAdditives || 'None',
    semiConductiveSheath: cable.semiConductiveSheath || config.semiConductiveSheath || 'No',
    graphiteCoating: cable.graphiteCoating || config.graphiteCoating || 'No',
    cpr: cable.cpr || config.cpr || 'N/A',
    cprClass: cable.cprClass || config.cprClass || 'None',
    edr: cable.edr || config.edr || 'EDR Verified',

    // 36-40: Auto-Calculated Physical & Electrical Performance
    cableDiameter: cable.outerDiameterMm || cable.raw?.outerDiameterMm || 15.0,
    totalCableWeight: cable.approxWeightKgKm || cable.raw?.approxWeightKgKm || 500.0,
    minBendingRadius: cable.minBendingRadiusMm || Math.round((cable.outerDiameterMm || 15) * 12),
    operatingTemp: cable.operatingTempC || '90°C Continuous',
    shortCircuitRating: cable.shortCircuitRatingKa || 'Standard Short Circuit',

    // 41-45: Logistics, Packaging & Special Customer Requirements
    cuttingLengthM,
    lengthTolerance: config.lengthTolerance || '±1%',
    drumType: config.drumType || (cable.outerDiameterMm > 40 ? 'Steel Drum' : 'Wooden Drum'),
    drumCapacityM,
    specialCustomerRequirements: config.specialCustomerRequirements || 'None',

    // Catalog & Tracking Identifiers
    cableMaterialNumber: cable.cableCode || cable.raw?.cableCode || cable.id,
    itemCode: cable.itemCode || cable.raw?.itemCode || 'ICO-GEN',
    cableDescription: cable.description || cable.raw?.description || '',
    rawCatalogItem: cable.raw,
    resolvedAt: new Date().toISOString(),
    d365ItemRef: cable.itemCode,
  };
}

export * from './cableConstraintEngine';
