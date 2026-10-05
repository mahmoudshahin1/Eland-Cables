import { MasterCableCatalogItem } from '../../../../types';
import { getStoredCableCatalog } from '../../../../services/cableCatalogService';
import { loadAuthoritativeCableCatalog, type ResolvedMasterList } from '../../../../services/masterDataApiService';
import { CableRecordV2, SelectionStateV2, AvailableOptionsV2, TriState } from '../types';

/**
 * Parses any MasterCableCatalogItem into normalized V2 Master Record
 */
export function parseMasterCableRecordV2(item: MasterCableCatalogItem): CableRecordV2 {
  const desc = item.description || '';
  const descUpper = desc.toUpperCase();

  // 1. Customer Code
  let customerCode = item.customerCode || '';
  if (!customerCode) {
    if (descUpper.includes('N2XH')) customerCode = 'N2XH';
    else if (descUpper.includes('NA2XS(F)2Y') || descUpper.includes('NA2XS(FL)2Y')) customerCode = 'NA2XS(F)2Y';
    else if (descUpper.includes('N2XS(FL)2Y')) customerCode = 'N2XS(FL)2Y';
    else if (descUpper.includes('N2XS2Y')) customerCode = 'N2XS2Y';
    else if (descUpper.includes('BS 5467') || descUpper.includes('BS5467')) customerCode = 'BS5467';
    else if (descUpper.includes('BS 6724') || descUpper.includes('BS6724')) customerCode = 'BS6724';
    else customerCode = 'Standard';
  }

  // Normalize customer code naming
  if (customerCode === 'BS 5467') customerCode = 'BS5467';
  if (customerCode === 'BS 6724') customerCode = 'BS6724';

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
  if (descUpper.includes('CONTROL')) cableType = 'Control Cable';
  else if (descUpper.includes('OHTL') || descUpper.includes('OVERHEAD')) cableType = 'OHTL';
  else if (family === 'HV') cableType = 'HV Power';

  // 4. Standard
  let standard = 'IEC 60502-1';
  if (descUpper.includes('IEC 60502-2')) standard = 'IEC 60502-2';
  else if (descUpper.includes('IEC 60840')) standard = 'IEC 60840';
  else if (descUpper.includes('IEC 62067')) standard = 'IEC 62067';
  else if (descUpper.includes('BS 5467') || descUpper.includes('BS5467')) standard = 'BS 5467';
  else if (descUpper.includes('BS 6724') || descUpper.includes('BS6724')) standard = 'BS 6724';
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

  let conductorConstruction = 'Stranded Compact';
  if (conductorClass === 'Class 1') conductorConstruction = 'Solid';
  else if (conductorClass === 'Class 5') conductorConstruction = 'Flexible Stranded';
  else if (descUpper.includes('MILLIKEN') || (item.crossSectionMm2 && item.crossSectionMm2 >= 800)) conductorConstruction = 'Milliken Segmental';

  // 7. Cores & Size
  let cores = '1 Core';
  let coresCount = 1;
  let conductorSizeNum = item.crossSectionMm2 || 16;
  let conductorSize = `${conductorSizeNum} mm²`;

  const sizeMatch = descUpper.match(/(\d+)\s*X\s*(\d+(\.\d+)?)\s*MM/i) || descUpper.match(/(\d+)\s*C\s*(\d+(\.\d+)?)/i);
  if (sizeMatch) {
    coresCount = parseInt(sizeMatch[1], 10);
    conductorSizeNum = parseFloat(sizeMatch[2]);
    cores = coresCount === 1 ? '1 Core' : coresCount === 2 ? '2 Core' : coresCount === 3 ? '3 Core' : coresCount === 4 ? '4 Core' : '5 Core';
    conductorSize = `${conductorSizeNum} mm²`;
  } else if (item.cores) {
    if (item.cores === '1C' || item.cores === '1 Core') { cores = '1 Core'; coresCount = 1; }
    else if (item.cores === '3C' || item.cores === '3 Core') { cores = '3 Core'; coresCount = 3; }
    else if (item.cores === '4C' || item.cores === '4 Core') { cores = '4 Core'; coresCount = 4; }
  }

  // 8. Insulation
  let insulation = 'XLPE';
  if (descUpper.includes('PVC')) insulation = 'PVC';
  else if (descUpper.includes('EPR')) insulation = 'EPR';
  else if (descUpper.includes('PE ') || descUpper.includes('/ PE')) insulation = 'PE';

  let insulationThicknessMm = 0.8;
  if (voltage.includes('6/10')) insulationThicknessMm = 3.4;
  else if (voltage.includes('12/20')) insulationThicknessMm = 5.5;
  else if (voltage.includes('18/30')) insulationThicknessMm = 8.0;
  else if (voltage.includes('110')) insulationThicknessMm = 16.0;
  else if (voltage.includes('132')) insulationThicknessMm = 18.0;

  // 9. Semi-Conductors & Screens
  let outerSemiConductor = family === 'LV' ? 'Not Applicable' : 'Extruded Bonded Semi-Con';
  let outerSemiConductorType = family === 'LV' ? 'Not Applicable' : (descUpper.includes('STRIPPABLE') ? 'Strippable' : 'Bonded');

  let screenType = 'None';
  let screenCSA = 'None';
  let screenWaterTight = 'Not Applicable';
  let screenConstruction = 'None';

  if (family !== 'LV') {
    if (descUpper.includes('CTS') || descUpper.includes('COPPER TAPE')) {
      screenType = 'Copper Tape Screen';
      screenCSA = '0.1 mm Tape';
      screenConstruction = 'Helically Applied Copper Tape';
    } else if (descUpper.includes('CWS') || descUpper.includes('CW') || descUpper.includes('WIRE SCREEN')) {
      screenType = 'Copper Wire Screen';
      screenCSA = descUpper.includes('/35') ? '35 mm²' : descUpper.includes('/25') ? '25 mm²' : '16 mm²';
      screenConstruction = 'Helical Copper Wires + Equalising Tape';
    } else {
      screenType = 'Copper Wire Screen';
      screenCSA = '16 mm²';
      screenConstruction = 'Helical Copper Wires';
    }

    if (descUpper.includes('WBT') || descUpper.includes('(F)') || descUpper.includes('(FL)')) {
      screenWaterTight = 'Yes';
    } else {
      screenWaterTight = 'No';
    }
  }

  // 10. Armour & Bedding
  let armour = 'None';
  let armourMaterial = 'None';
  let armourCSA = 'None';
  let armourWaterTight = 'Not Applicable';
  let bedding = 'Not Applicable';

  if (descUpper.includes('SWA') || descUpper.includes('STEEL WIRE')) {
    armour = 'SWA';
    armourMaterial = 'Galvanized Steel';
    armourCSA = conductorSizeNum >= 120 ? '2.5 mm Wire' : '1.6 mm Wire';
    bedding = descUpper.includes('LSHF') ? 'Extruded LSZH ST8' : 'Extruded PVC ST2';
  } else if (descUpper.includes('AWA') || descUpper.includes('ALUMINIUM WIRE')) {
    armour = 'AWA';
    armourMaterial = 'Aluminum Alloy';
    armourCSA = '2.0 mm Wire';
    bedding = 'Extruded PVC ST2';
  } else if (descUpper.includes('STA') || descUpper.includes('STEEL TAPE')) {
    armour = 'STA';
    armourMaterial = 'Double Galvanized Steel Tape';
    armourCSA = '0.5 mm Tape';
    bedding = 'Extruded PVC ST2';
  }

  // 11. Sheath
  let sheathing = 'PVC ST2';
  if (descUpper.includes('LSHF') || descUpper.includes('LSZH')) sheathing = 'LSZH ST8';
  else if (descUpper.includes('MDPE') || descUpper.includes('2Y') || descUpper.includes('PE')) sheathing = 'MDPE ST7';
  else if (descUpper.includes('HDPE')) sheathing = 'HDPE ST7';

  let sheathingColor = 'Black';
  if (descUpper.includes('RED')) sheathingColor = 'Red';
  else if (descUpper.includes('BLUE')) sheathingColor = 'Blue';

  let semiConductiveSheath = descUpper.includes('SEMI-CON') ? 'Yes' : 'No';
  let graphiteCoating = descUpper.includes('GRAPHITE') ? 'Yes' : 'No';
  let cpr = sheathing.includes('LSZH') ? 'Yes' : 'No';
  let cprClass = sheathing.includes('LSZH') ? 'Cca-s1a,d1,a1' : 'Fca';

  // 12. Identifiers
  const materialNumber = item.cableCode || (item as any).materialNumber || item.code || item.id;
  const itemCode = item.itemCode || '';

  return {
    raw: item,
    id: item.id || `c2-${itemCode}-${materialNumber}`,
    materialNumber,
    itemCode,
    customerCode,
    description: desc,
    family,
    voltageClass: item.voltageClass || 'MV',
    voltage,
    standard,
    conductorMaterial,
    conductorClass,
    conductorConstruction,
    conductorSize,
    conductorSizeNum,
    conductorWaterTight: (descUpper.includes('(FL)') ? 'Yes' : 'No') as TriState,
    cores,
    coresCount,
    coreColors: ['Black'],
    coreIdentification: 'HD 308 S2 Color Coding',
    coreConstruction: coresCount === 1 ? 'Single Core' : 'Laid-up Circular',
    insulation,
    insulationColor: 'Natural',
    insulationThicknessMm,
    outerSemiConductor,
    outerSemiConductorType,
    screenType,
    screenMaterial: screenType.includes('Copper') ? 'Copper' : 'None',
    screenCSA,
    screenWaterTight: (descUpper.includes('(F)') || descUpper.includes('(FL)') ? 'Yes' : 'No') as TriState,
    screenConstruction,
    fillerBinder: coresCount > 1 ? 'Extruded Polypropylene' : 'Not Applicable',
    bedding,
    armour,
    armourMaterial,
    armourCSA,
    armourWaterTight: 'No' as TriState,
    innerSheath: bedding,
    sheathing,
    sheathingColor,
    specialAdditives: ['UV Resistant'],
    semiConduct: (semiConductiveSheath === 'Yes' ? 'Yes' : 'No') as TriState,
    graphite: (graphiteCoating === 'Yes' ? 'Yes' : 'No') as TriState,
    cpr: (cpr === 'Yes' ? 'Yes' : 'No') as TriState,
    cprClass,
    edr: 'No' as TriState,
    outerDiameterMm: item.outerDiameterMm || 25.0,
    approxWeightKgKm: item.approxWeightKgKm || 1500.0,
    minBendingRadiusMm: Math.round((item.outerDiameterMm || 25.0) * (armour !== 'None' ? 15 : 12)),
    operatingTempC: insulation === 'XLPE' ? '90°C (250°C Short-Circuit)' : '70°C (160°C Short-Circuit)',
    shortCircuitRatingKa: `${((143 * conductorSizeNum) / 1000).toFixed(2)} kA (1 sec)`,
    approvedStatus: 'Released',
  };
}

/**
 * Returns all parsed V2 master cable records.
 * Prefer resolveAllMasterRecordsV2 (PostgreSQL-first) for signed-in sessions (Task 04B-6).
 * Sync LS default is non-authoritative compatibility only.
 */
export function getAllMasterRecordsV2(catalog?: MasterCableCatalogItem[]): CableRecordV2[] {
  const rawCatalog = catalog ?? getStoredCableCatalog();
  return rawCatalog.map(parseMasterCableRecordV2);
}

/** PostgreSQL-first V2 master records; LS fallback reports authoritative=false. */
export async function resolveAllMasterRecordsV2(
  jwtToken?: string | null
): Promise<ResolvedMasterList<CableRecordV2[]>> {
  const resolved = await loadAuthoritativeCableCatalog(jwtToken);
  return {
    ...resolved,
    data: resolved.data.map(parseMasterCableRecordV2),
  };
}

/** Explicit offline LS fallback — never authoritative. */
export function getAllMasterRecordsV2OfflineFallback(): ResolvedMasterList<CableRecordV2[]> {
  return {
    data: getStoredCableCatalog().map(parseMasterCableRecordV2),
    source: 'LOCALSTORAGE_FALLBACK',
    authoritative: false,
  };
}

/**
 * Core Cascading Filter Engine for V2:
 * Progressively reduces available master cable records based on user's active selections.
 */
export function filterCableRecordsV2(
  allRecords: CableRecordV2[],
  selections: SelectionStateV2
): CableRecordV2[] {
  return allRecords.filter((record) => {
    // Mode 1: Customer Code filter
    if (selections.selectionMode === 'CUSTOMER' && selections.customerCode) {
      if (record.customerCode !== selections.customerCode) return false;
    }

    // Cable Family
    if (selections.family && record.family !== selections.family) return false;

    // Voltage Class
    if (selections.voltageClass && record.voltageClass !== selections.voltageClass) return false;

    // Voltage
    if (selections.voltage && record.voltage !== selections.voltage) return false;

    // Applicable Standard
    if (selections.standard && record.standard !== selections.standard) return false;

    // Conductor Material
    if (selections.conductorMaterial && record.conductorMaterial !== selections.conductorMaterial) return false;

    // Conductor Class
    if (selections.conductorClass && record.conductorClass !== selections.conductorClass) return false;

    // Conductor Size
    if (selections.conductorSize && record.conductorSize !== selections.conductorSize) return false;

    // Cores
    if (selections.cores && record.cores !== selections.cores) return false;

    // Insulation
    if (selections.insulation && record.insulation !== selections.insulation) return false;

    // Outer Semi-Conductor
    if (selections.outerSemiConductor && record.outerSemiConductor !== selections.outerSemiConductor) return false;

    // Screen Type
    if (selections.screenType && record.screenType !== selections.screenType) return false;

    // Screen CSA
    if (selections.screenCSA && record.screenCSA !== selections.screenCSA) return false;

    // Screen Water Tight
    if (selections.screenWaterTight && record.screenWaterTight !== selections.screenWaterTight) return false;

    // Armour
    if (selections.armour && record.armour !== selections.armour) return false;

    // Armour Material
    if (selections.armourMaterial && record.armourMaterial !== selections.armourMaterial) return false;

    // Sheathing Material
    if (selections.sheathing && record.sheathing !== selections.sheathing) return false;

    // Sheathing Color
    if (selections.sheathingColor && record.sheathingColor !== selections.sheathingColor) return false;

    return true;
  });
}

/**
 * Extracts distinct available options for each parameter directly from the current filtered dataset.
 */
export function getAvailableOptionsV2(filteredRecords: CableRecordV2[]): AvailableOptionsV2 {
  const getDistinct = (accessor: (r: CableRecordV2) => string | undefined): string[] => {
    const set = new Set<string>();
    for (const r of filteredRecords) {
      const val = accessor(r);
      if (val && val.trim() !== '') {
        set.add(val);
      }
    }
    return Array.from(set).sort((a, b) => {
      // Natural number sort for conductor sizes
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  };

  const getDistinctTriState = (accessor: (r: CableRecordV2) => TriState | undefined): TriState[] => {
    const set = new Set<TriState>();
    for (const r of filteredRecords) {
      const val = accessor(r);
      if (val) set.add(val);
    }
    return Array.from(set);
  };

  return {
    customerCodes: getDistinct((r) => r.customerCode).filter((c) => c !== 'Standard'),
    families: getDistinct((r) => r.family),
    voltageClasses: getDistinct((r) => r.voltageClass),
    standards: getDistinct((r) => r.standard),
    voltages: getDistinct((r) => r.voltage),
    conductorMaterials: getDistinct((r) => r.conductorMaterial),
    conductorClasses: getDistinct((r) => r.conductorClass),
    conductorSizes: getDistinct((r) => r.conductorSize),
    conductorWaterTights: getDistinctTriState((r) => r.conductorWaterTight),
    cores: getDistinct((r) => r.cores),
    coreColors: ['Brown', 'Black', 'Grey', 'Blue', 'Green/Yellow', 'Red', 'Yellow'],
    insulations: getDistinct((r) => r.insulation),
    insulationColors: getDistinct((r) => r.insulationColor),
    outerSemiConductors: getDistinct((r) => r.outerSemiConductor),
    screenTypes: getDistinct((r) => r.screenType),
    screenMaterials: getDistinct((r) => r.screenMaterial),
    screenCSAs: getDistinct((r) => r.screenCSA),
    screenWaterTights: getDistinctTriState((r) => r.screenWaterTight),
    armours: getDistinct((r) => r.armour),
    armourMaterials: getDistinct((r) => r.armourMaterial),
    armourCSAs: getDistinct((r) => r.armourCSA),
    armourWaterTights: getDistinctTriState((r) => r.armourWaterTight),
    sheathings: getDistinct((r) => r.sheathing),
    sheathingColors: getDistinct((r) => r.sheathingColor),
    specialAdditives: ['UV Resistant', 'Flame Retardant', 'Anti-Termite', 'Oil Resistant', 'Water Blocking'],
    semiConducts: getDistinctTriState((r) => r.semiConduct),
    graphites: getDistinctTriState((r) => r.graphite),
    cprs: getDistinctTriState((r) => r.cpr),
    cprClasses: getDistinct((r) => r.cprClass),
    edrs: getDistinctTriState((r) => r.edr),
  };
}

/**
 * Validates whether downstream parameters remain valid after an upstream change.
 * Automatically clears any downstream values that no longer exist in the new filtered dataset.
 */
export function sanitizeDownstreamSelectionsV2(
  allRecords: CableRecordV2[],
  newSelections: SelectionStateV2,
  changedField: keyof SelectionStateV2
): SelectionStateV2 {
  // Cascading hierarchy order
  const order: (keyof SelectionStateV2)[] = [
    'customerCode',
    'family',
    'voltage',
    'standard',
    'conductorMaterial',
    'conductorClass',
    'conductorSize',
    'cores',
    'insulation',
    'outerSemiConductor',
    'screenType',
    'screenCSA',
    'screenWaterTight',
    'armour',
    'armourMaterial',
    'sheathing',
    'sheathingColor',
  ];

  const changedIndex = order.indexOf(changedField);
  if (changedIndex === -1) return newSelections;

  // Clone selections
  const sanitized: SelectionStateV2 = { ...newSelections };

  // Iteratively filter step-by-step and verify downstream fields
  let currentFilterState: SelectionStateV2 = {
    selectionMode: sanitized.selectionMode,
  };

  for (let i = 0; i <= order.length - 1; i++) {
    const field = order[i];
    const val = sanitized[field] as string | undefined;

    if (!val) continue;

    // Apply current filter state so far
    const currentRecords = filterCableRecordsV2(allRecords, currentFilterState);
    const available = getAvailableOptionsV2(currentRecords);

    // Map field to available options key
    let isValid = true;
    if (field === 'customerCode') isValid = available.customerCodes.includes(val);
    else if (field === 'family') isValid = available.families.includes(val);
    else if (field === 'voltage') isValid = available.voltages.includes(val);
    else if (field === 'standard') isValid = available.standards.includes(val);
    else if (field === 'conductorMaterial') isValid = available.conductorMaterials.includes(val);
    else if (field === 'conductorClass') isValid = available.conductorClasses.includes(val);
    else if (field === 'conductorSize') isValid = available.conductorSizes.includes(val);
    else if (field === 'cores') isValid = available.cores.includes(val);
    else if (field === 'insulation') isValid = available.insulations.includes(val);
    else if (field === 'outerSemiConductor') isValid = available.outerSemiConductors.includes(val);
    else if (field === 'screenType') isValid = available.screenTypes.includes(val);
    else if (field === 'screenCSA') isValid = available.screenCSAs.includes(val);
    else if (field === 'screenWaterTight') isValid = available.screenWaterTights.includes(val as TriState);
    else if (field === 'armour') isValid = available.armours.includes(val);
    else if (field === 'armourMaterial') isValid = available.armourMaterials.includes(val);
    else if (field === 'sheathing') isValid = available.sheathings.includes(val);
    else if (field === 'sheathingColor') isValid = available.sheathingColors.includes(val);

    if (isValid) {
      (currentFilterState as any)[field] = val;
    } else {
      // Clear invalid downstream field and everything below it
      delete (sanitized as any)[field];
      for (let j = i + 1; j < order.length; j++) {
        delete (sanitized as any)[order[j]];
      }
      break;
    }
  }

  return sanitized;
}
