import * as XLSX from 'xlsx';
import {
  TechnicalCableRequest,
  TechnicalRequestStatus,
  SelectionStateV2,
  AuditTrailEntry,
  ExcelPreImportSummary,
  ExcelRowValidationResult,
  CableRecordV2,
} from '../types';
import { MasterCableCatalogItem } from '../../../../types';
import { getStoredCableCatalog } from '../../../../services/cableCatalogService';
import { createCableViaApi, loadAuthoritativeCableCatalog, persistCableCatalogRowsViaApi } from '../../../../services/masterDataApiService';
import { estimateCablePhysicals, generateTechnicalDescriptionV2 } from '../../../../api/cableAuthorityMapping';
import { validateCableConfigurationV2 } from './iecPrototypeValidationV2';

const STORAGE_KEY_TCR = 'energya_v2_technical_requests';

// -------------------------------------------------------------------
// SAMPLE INITIAL TCR REQUESTS (SEEDED)
// -------------------------------------------------------------------
const INITIAL_SAMPLE_REQUESTS: TechnicalCableRequest[] = [
  {
    id: 'TCR-2026-000001',
    requestNumber: 'TCR-2026-000001',
    requestDate: '2026-08-14 10:30',
    requesterName: 'Tariq Al-Mansoor',
    requesterEmail: 't.mansoor@elandcables.com',
    companyName: 'Eland Cables Ltd',
    customerCode: 'N2XS(FL)2Y',
    status: 'Under Technical Review',
    assignedEngineer: 'Eng. Ahmed Al-Ghamdi',
    selections: {
      selectionMode: 'TECHNICAL',
      customerCode: 'N2XS(FL)2Y',
      family: 'UGC',
      voltageClass: 'MV',
      voltage: '18/30 kV',
      standard: 'IEC 60502-2',
      conductorMaterial: 'CU',
      conductorClass: 'Class 2 — Stranded',
      conductorSize: '240 mm²',
      conductorWaterTight: 'Yes',
      cores: '1 Core',
      coresCount: 1,
      coreColors: { 1: 'Black' },
      insulation: 'XLPE',
      outerSemiConductor: 'Strippable',
      screenType: 'Copper Wire + Tape',
      screenCSA: '35 mm²',
      screenWaterTight: 'Yes',
      armour: 'No Armour',
      sheathing: 'HDPE',
      sheathingColor: 'Black',
      specialAdditives: ['UV Resistant', 'Water Blocking'],
      cpr: 'No',
    },
    generatedDescription: 'Cu / XLPE / HDPE 18/30 kV 1X240/35 mm2 WBT IEC 60502-2',
    estimatedDiameterMm: 48.5,
    estimatedWeightKgKm: 4250,
    technicalNotes: 'Special water-tight longitudinal and radial swellable tape required under HDPE sheath.',
    revision: 1,
    temporaryTechnicalId: 'TC-2026-000001',
    auditTrail: [
      {
        id: 'aud-1',
        timestamp: '2026-08-14 10:30',
        author: 'Tariq Al-Mansoor',
        action: 'Request Submitted from Technical Parameters V2',
        newStatus: 'Submitted',
      },
      {
        id: 'aud-2',
        timestamp: '2026-08-14 11:15',
        author: 'Lead Technical Office',
        action: 'Assigned to Eng. Ahmed Al-Ghamdi',
        oldStatus: 'Submitted',
        newStatus: 'Under Technical Review',
      },
    ],
  },
  {
    id: 'TCR-2026-000002',
    requestNumber: 'TCR-2026-000002',
    requestDate: '2026-08-15 08:45',
    requesterName: 'Khaled Hassan',
    requesterEmail: 'k.hassan@aramco.com',
    companyName: 'Saudi Aramco Project Alpha',
    customerCode: 'ARAMCO-HV',
    status: 'Submitted',
    selections: {
      selectionMode: 'TECHNICAL',
      family: 'UGC',
      voltageClass: 'HV',
      voltage: '64/110 kV',
      standard: 'IEC 60840',
      conductorMaterial: 'CU',
      conductorClass: 'Class 2 — Stranded',
      conductorSize: '630 mm²',
      conductorWaterTight: 'Yes',
      cores: '1 Core',
      coresCount: 1,
      coreColors: { 1: 'Natural' },
      insulation: 'XLPE',
      outerSemiConductor: 'Non-Strippable',
      screenType: 'Metallic Screen',
      screenCSA: '95 mm²',
      screenWaterTight: 'Yes',
      armour: 'No Armour',
      sheathing: 'MDPE',
      sheathingColor: 'Black',
      specialAdditives: ['Anti-Termite', 'UV Resistant'],
      cpr: 'No',
    },
    generatedDescription: 'Cu / XLPE / MDPE 64/110 kV 1X630/95 mm2 IEC 60840',
    estimatedDiameterMm: 82.0,
    estimatedWeightKgKm: 11400,
    technicalNotes: 'Substation interconnect line with high continuous load requirements.',
    revision: 1,
    temporaryTechnicalId: 'TC-2026-000002',
    auditTrail: [
      {
        id: 'aud-3',
        timestamp: '2026-08-15 08:45',
        author: 'Khaled Hassan',
        action: 'New HV Cable Request Submitted',
        newStatus: 'Submitted',
      },
    ],
  },
];

// -------------------------------------------------------------------
// LOCAL STORAGE TCR REPOSITORY
// -------------------------------------------------------------------
export function getTechnicalCableRequests(): TechnicalCableRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TCR);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load TCRs:', e);
  }
  return INITIAL_SAMPLE_REQUESTS;
}

export function saveTechnicalCableRequest(request: TechnicalCableRequest): void {
  try {
    const all = getTechnicalCableRequests();
    const idx = all.findIndex((r) => r.id === request.id);
    if (idx >= 0) {
      all[idx] = request;
    } else {
      all.unshift(request);
    }
    localStorage.setItem(STORAGE_KEY_TCR, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('tcrRequestsUpdated', { detail: all }));
  } catch (e) {
    console.error('Failed to save TCR:', e);
  }
}

/**
 * Generates next sequential request number: TCR-YYYY-000001
 */
export function generateNextRequestNumber(): string {
  const all = getTechnicalCableRequests();
  const year = new Date().getFullYear();
  const prefix = `TCR-${year}-`;
  const count = all.filter((r) => r.requestNumber.startsWith(prefix)).length + 1;
  return `${prefix}${count.toString().padStart(6, '0')}`;
}

/**
 * Generates next sequential temporary technical ID: TC-YYYY-000001
 */
export function generateNextTemporaryTechnicalId(): string {
  const all = getTechnicalCableRequests();
  const year = new Date().getFullYear();
  const prefix = `TC-${year}-`;
  const count = all.length + 1;
  return `${prefix}${count.toString().padStart(6, '0')}`;
}

/**
 * Creates and submits a new TCR from the Cable Configurator V2
 */
export function createTechnicalCableRequestFromSelections(
  selections: SelectionStateV2,
  requester: { name: string; email: string; company: string },
  technicalNotes?: string
): TechnicalCableRequest {
  const reqNumber = generateNextRequestNumber();
  const tempId = generateNextTemporaryTechnicalId();
  const physicals = estimateCablePhysicals(selections);
  const desc = generateTechnicalDescriptionV2(selections);

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now
    .getDate()
    .toString()
    .padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const newRequest: TechnicalCableRequest = {
    id: reqNumber,
    requestNumber: reqNumber,
    requestDate: dateStr,
    requesterName: requester.name || 'User Requester',
    requesterEmail: requester.email || 'requester@energya.com',
    companyName: requester.company || 'Customer Company',
    customerCode: selections.customerCode || 'Standard',
    status: 'Submitted',
    selections,
    generatedDescription: desc,
    estimatedDiameterMm: physicals.diameterMm,
    estimatedWeightKgKm: physicals.weightKgKm,
    technicalNotes: technicalNotes || 'Requested via Technical Parameters V2 (No Existing Master Cable Record)',
    revision: 1,
    temporaryTechnicalId: tempId,
    auditTrail: [
      {
        id: `aud-${Date.now()}`,
        timestamp: dateStr,
        author: requester.name || 'User Requester',
        action: 'Submitted new cable design request',
        newStatus: 'Submitted',
        comments: technicalNotes,
      },
    ],
  };

  saveTechnicalCableRequest(newRequest);
  return newRequest;
}

/**
 * Updates status of a TCR with audit trail logging
 */
export function updateTechnicalRequestStatus(
  requestId: string,
  newStatus: TechnicalRequestStatus,
  author: string,
  comments?: string,
  additionalData?: Partial<TechnicalCableRequest>
): TechnicalCableRequest | null {
  const all = getTechnicalCableRequests();
  const req = all.find((r) => r.id === requestId);
  if (!req) return null;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now
    .getDate()
    .toString()
    .padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const oldStatus = req.status;
  req.status = newStatus;

  if (additionalData) {
    Object.assign(req, additionalData);
  }

  const auditEntry: AuditTrailEntry = {
    id: `aud-${Date.now()}`,
    timestamp: dateStr,
    author,
    action: `Status changed to ${newStatus}`,
    oldStatus,
    newStatus,
    comments,
  };

  req.auditTrail = req.auditTrail || [];
  req.auditTrail.unshift(auditEntry);

  saveTechnicalCableRequest(req);
  return req;
}

/**
 * Technical Office Approves & Publishes a New Cable into Cable Master (PostgreSQL-authoritative).
 */
export async function approveAndPublishNewCableToMaster(
  request: TechnicalCableRequest,
  materialNumberAssigned: string,
  itemCodeAssigned: string,
  author: string,
  jwtToken?: string | null
): Promise<{ ok: true; masterItem: MasterCableCatalogItem } | { ok: false; error: string }> {
  const sel = request.selections;

  const condSizeNum = sel.conductorSize
    ? parseFloat(sel.conductorSize.toString().replace(/[^\d.]/g, '')) || 120
    : 120;
  const coresNum = sel.coresCount || (sel.cores ? parseInt(sel.cores, 10) : 1) || 1;

  const newMasterItem: MasterCableCatalogItem = {
    id: `master-${materialNumberAssigned}-${Date.now()}`,
    cableCode: materialNumberAssigned,
    itemCode: itemCodeAssigned,
    code: materialNumberAssigned,
    customerCode: request.customerCode || 'Standard',
    description: request.generatedDescription,
    voltageClass: (sel.voltageClass as any) || 'MV',
    conductor: sel.conductorMaterial === 'AL' ? 'Aluminum' : 'Copper',
    cores: `${coresNum} Core`,
    crossSectionMm2: condSizeNum,
    outerDiameterMm: request.estimatedDiameterMm,
    approxWeightKgKm: request.estimatedWeightKgKm,
    standardPriceUsdPerM: 0,
    priceConfigured: false,
    status: 'ACTIVE',
  };

  const pgResult = await createCableViaApi(newMasterItem, jwtToken);
  if (pgResult.ok === false) {
    return { ok: false, error: pgResult.error };
  }

  await loadAuthoritativeCableCatalog(jwtToken);

  updateTechnicalRequestStatus(
    request.id,
    'Released',
    author,
    `Approved and released into Cable Master as Material #${materialNumberAssigned}`,
    {
      erpMaterialNumber: materialNumberAssigned,
      approvalDate: new Date().toISOString().split('T')[0],
      approvedBy: author,
    }
  );

  return { ok: true, masterItem: pgResult.cable };
}

// -------------------------------------------------------------------
// EXCEL TEMPLATE METHOD B (DOWNLOAD & PRE-IMPORT VALIDATION)
// -------------------------------------------------------------------
export const EXCEL_TEMPLATE_COLUMNS_V2 = [
  'Customer Code',
  'Item Code',
  'Material Number',
  'Cable Family',
  'Voltage Class',
  'Voltage',
  'Standard',
  'Conductor Material',
  'Conductor Class',
  'Conductor Size',
  'Conductor Water Tight',
  'Core Count',
  'Core 1 Color',
  'Core 2 Color',
  'Core 3 Color',
  'Core 4 Color',
  'Core 5 Color',
  'Core 6 Color',
  'Core 7 Color',
  'Core 8 Color',
  'Insulation',
  'Insulation Color',
  'Outer Semi-Conductor',
  'Screen Type',
  'Screen Material',
  'Screen CSA',
  'Screen Water Tight',
  'Armour Type',
  'Armour Material',
  'Armour CSA',
  'Armour Water Tight',
  'Sheathing',
  'Sheathing Color',
  'Special Additives',
  'Semi Conduct',
  'Graphite',
  'CPR',
  'CPR Class',
  'EDR',
  'Cable Diameter',
  'Cable Weight',
  'Cable Description',
  'Applicable Standard',
  'Technical Notes',
  'Approved Status',
];

export const EXCEL_SAMPLE_ROWS_V2 = [
  {
    'Customer Code': 'N2XS2Y',
    'Item Code': 'ICO171X201C0UY3',
    'Material Number': '10009557',
    'Cable Family': 'UGC',
    'Voltage Class': 'MV',
    'Voltage': '6/10 kV',
    'Standard': 'IEC 60502-2',
    'Conductor Material': 'CU',
    'Conductor Class': 'Class 2 — Stranded',
    'Conductor Size': '120',
    'Conductor Water Tight': 'No',
    'Core Count': 1,
    'Core 1 Color': 'Black',
    'Core 2 Color': '',
    'Core 3 Color': '',
    'Core 4 Color': '',
    'Core 5 Color': '',
    'Core 6 Color': '',
    'Core 7 Color': '',
    'Core 8 Color': '',
    'Insulation': 'XLPE',
    'Insulation Color': 'Natural',
    'Outer Semi-Conductor': 'Strippable',
    'Screen Type': 'Copper Wire',
    'Screen Material': 'Copper',
    'Screen CSA': '16',
    'Screen Water Tight': 'No',
    'Armour Type': 'No Armour',
    'Armour Material': 'N/A',
    'Armour CSA': 'None',
    'Armour Water Tight': 'No',
    'Sheathing': 'MDPE',
    'Sheathing Color': 'Black',
    'Special Additives': 'UV Resistant',
    'Semi Conduct': 'No',
    'Graphite': 'No',
    'CPR': 'No',
    'CPR Class': '',
    'EDR': 'No',
    'Cable Diameter': 31.5,
    'Cable Weight': 1950,
    'Cable Description': 'Cu / XLPE / MDPE 6/10 kV CWs 1X120/16 mm2 RMC IEC 60502-2',
    'Applicable Standard': 'IEC 60502-2',
    'Technical Notes': 'Standard approved utility specification',
    'Approved Status': 'Released',
  },
  {
    'Customer Code': 'NA2XS(F)2Y',
    'Item Code': 'ICO181X201C0UY4',
    'Material Number': '10010190',
    'Cable Family': 'UGC',
    'Voltage Class': 'MV',
    'Voltage': '12/20 kV',
    'Standard': 'IEC 60502-2',
    'Conductor Material': 'AL',
    'Conductor Class': 'Class 2 — Stranded',
    'Conductor Size': '120',
    'Conductor Water Tight': 'No',
    'Core Count': 1,
    'Core 1 Color': 'Black',
    'Core 2 Color': '',
    'Core 3 Color': '',
    'Core 4 Color': '',
    'Core 5 Color': '',
    'Core 6 Color': '',
    'Core 7 Color': '',
    'Core 8 Color': '',
    'Insulation': 'XLPE',
    'Insulation Color': 'Natural',
    'Outer Semi-Conductor': 'Strippable',
    'Screen Type': 'Copper Wire',
    'Screen Material': 'Copper',
    'Screen CSA': '16',
    'Screen Water Tight': 'Yes',
    'Armour Type': 'No Armour',
    'Armour Material': 'N/A',
    'Armour CSA': 'None',
    'Armour Water Tight': 'No',
    'Sheathing': 'MDPE',
    'Sheathing Color': 'Black',
    'Special Additives': 'Water Blocking',
    'Semi Conduct': 'No',
    'Graphite': 'No',
    'CPR': 'No',
    'CPR Class': '',
    'EDR': 'No',
    'Cable Diameter': 35.8,
    'Cable Weight': 1480,
    'Cable Description': 'Al / XLPE / MDPE 12/20 kV CWs 1X120/16 mm2 WBT IEC 60502-2',
    'Applicable Standard': 'IEC 60502-2',
    'Technical Notes': 'Water-blocked aluminium core specification',
    'Approved Status': 'Released',
  },
];

export function downloadCableMasterExcelTemplateV2(): void {
  const ws = XLSX.utils.json_to_sheet(EXCEL_SAMPLE_ROWS_V2, {
    header: EXCEL_TEMPLATE_COLUMNS_V2,
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cable Master V2 Template');

  XLSX.writeFile(wb, 'Energya_Cable_Master_Engineering_Template.xlsx');
}

/**
 * Pre-Import Validation for uploaded Excel files (Method B)
 */
export function preValidateExcelRowsV2(rawRows: any[]): ExcelPreImportSummary {
  const existingCatalog = getStoredCableCatalog();
  const existingMaterialNumbers = new Set(existingCatalog.map((c) => c.cableCode?.trim().toLowerCase()));

  const rowResults: ExcelRowValidationResult[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let existingCount = 0;
  let newCount = 0;

  const seenRowsInFile = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // Excel 1-based index with header
    const matNum = (row['Material Number'] || row['Cable Material Number'] || '').toString().trim();
    const itemCode = (row['Item Code'] || '').toString().trim();
    const custCode = (row['Customer Code'] || 'Standard').toString().trim();
    const family = (row['Cable Family'] || 'UGC').toString().trim();
    const volt = (row['Voltage'] || '6/10 kV').toString().trim();
    const condMat = (row['Conductor Material'] || 'CU').toString().trim().toUpperCase().startsWith('A') ? 'AL' : 'CU';
    const condSize = (row['Conductor Size'] || '120').toString().trim();
    const coreCount = parseInt((row['Core Count'] || '1').toString().trim(), 10) || 1;
    const insul = (row['Insulation'] || 'XLPE').toString().trim();
    const outerSemiCon = (row['Outer Semi-Conductor'] || 'N/A').toString().trim();
    const screenType = (row['Screen Type'] || 'No Screen').toString().trim();
    const screenCSA = (row['Screen CSA'] || 'None').toString().trim();
    const armourType = (row['Armour Type'] || 'No Armour').toString().trim();
    const armourCSA = (row['Armour CSA'] || 'None').toString().trim();
    const sheathing = (row['Sheathing'] || 'MDPE').toString().trim();
    const sheathingColor = (row['Sheathing Color'] || 'Black').toString().trim();
    const cpr = (row['CPR'] || 'No').toString().trim();
    const cprClass = (row['CPR Class'] || '').toString().trim();

    const errors: string[] = [];
    const suggestions: string[] = [];

    // Check duplicate in file
    const uniqueKey = `${matNum}|${itemCode}|${volt}|${condSize}|${coreCount}`;
    if (seenRowsInFile.has(uniqueKey)) {
      errors.push(`Duplicate row in upload file for ${matNum || itemCode}`);
      suggestions.push('Remove duplicate row before importing');
      duplicateCount++;
    } else {
      seenRowsInFile.add(uniqueKey);
    }

    // Check if already in Cable Master
    const isExisting = matNum ? existingMaterialNumbers.has(matNum.toLowerCase()) : false;
    if (isExisting) {
      existingCount++;
    } else {
      newCount++;
    }

    // Build selections representation to run engineering validator
    const coreColors: Record<number, string> = {};
    for (let c = 1; c <= Math.min(coreCount, 8); c++) {
      const colVal = (row[`Core ${c} Color`] || '').toString().trim();
      coreColors[c] = colVal || (c === 1 ? 'Black' : c === 2 ? 'Blue' : c === 3 ? 'Brown' : 'Grey');
    }

    const selections: SelectionStateV2 = {
      selectionMode: 'TECHNICAL',
      customerCode: custCode,
      family,
      voltage: volt,
      conductorMaterial: condMat as any,
      conductorSize: `${condSize} mm²`,
      cores: `${coreCount} Core`,
      coresCount: coreCount,
      coreColors,
      insulation: insul,
      outerSemiConductor: outerSemiCon,
      screenType,
      screenCSA: screenCSA ? `${screenCSA} mm²` : 'None',
      armour: armourType,
      armourCSA: armourCSA || 'None',
      sheathing,
      sheathingColor,
      cpr: (cpr.toLowerCase().startsWith('y') ? 'Yes' : 'No') as any,
      cprClass,
    };

    // Run technical validation engine
    const valResult = validateCableConfigurationV2(selections);
    if (!valResult.isValid) {
      valResult.errors.forEach((err) => {
        errors.push(err.message);
        if (err.field === 'insulation') suggestions.push('Change insulation to XLPE or EPR for high voltage');
        else if (err.field === 'outerSemiConductor') suggestions.push('Set Outer Semi-Conductor to Strippable or Non-Strippable');
        else if (err.field === 'cprClass') suggestions.push('Provide CPR Class (e.g. Cca, B2ca)');
        else if (err.field === 'screenType') suggestions.push('Add metallic screening for MV/HV voltage class');
        else suggestions.push('Review parameter according to IEC standards');
      });
    }

    const isValid = errors.length === 0;
    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
    }

    const desc = row['Cable Description'] || generateTechnicalDescriptionV2(selections);
    const diam = parseFloat(row['Cable Diameter']) || estimateCablePhysicals(selections).diameterMm;
    const wt = parseFloat(row['Cable Weight']) || estimateCablePhysicals(selections).weightKgKm;

    rowResults.push({
      rowNumber: rowNum,
      materialNumber: matNum || `TC-NEW-${rowNum}`,
      itemCode,
      customerCode: custCode,
      description: desc,
      isValid,
      isExisting,
      errors,
      suggestedCorrections: suggestions,
      parsedRecord: {
        raw: {} as any,
        id: `upl-${rowNum}`,
        materialNumber: matNum || `TC-NEW-${rowNum}`,
        itemCode: itemCode || `ICO-NEW-${rowNum}`,
        customerCode: custCode,
        description: desc,
        family,
        voltageClass: volt.includes('0.6/1') ? 'LV' : volt.includes('110') ? 'HV' : 'MV',
        voltage: volt,
        standard: row['Standard'] || 'IEC 60502-2',
        conductorMaterial: condMat === 'AL' ? 'Aluminum' : 'Copper',
        conductorClass: row['Conductor Class'] || 'Class 2 — Stranded',
        conductorConstruction: 'Stranded Compact',
        conductorSize: `${condSize} mm²`,
        conductorSizeNum: parseFloat(condSize) || 120,
        conductorWaterTight: 'No',
        cores: `${coreCount} Core`,
        coresCount: coreCount,
        coreColors: Object.values(coreColors),
        coreIdentification: 'HD 308 S2',
        coreConstruction: 'Circular Compact',
        insulation: insul,
        insulationColor: 'Natural',
        insulationThicknessMm: 3.4,
        outerSemiConductor: outerSemiCon,
        outerSemiConductorType: outerSemiCon,
        screenType,
        screenMaterial: 'Copper',
        screenCSA: screenCSA ? `${screenCSA} mm²` : 'None',
        screenWaterTight: 'No',
        screenConstruction: screenType,
        fillerBinder: 'PP',
        bedding: 'None',
        armour: armourType,
        armourMaterial: armourType.includes('Steel') ? 'Steel' : 'None',
        armourCSA: armourCSA || 'None',
        armourWaterTight: 'No',
        innerSheath: 'None',
        sheathing,
        sheathingColor,
        specialAdditives: [],
        semiConduct: 'No',
        graphite: 'No',
        cpr: (cpr.toLowerCase().startsWith('y') ? 'Yes' : 'No') as any,
        cprClass,
        edr: 'No',
        outerDiameterMm: diam,
        approxWeightKgKm: wt,
        minBendingRadiusMm: diam * 15,
        operatingTempC: '90°C',
        shortCircuitRatingKa: '15 kA',
        approvedStatus: 'Released',
      },
    });
  });

  return {
    totalRows: rawRows.length,
    validRows: validCount,
    invalidRows: invalidCount,
    duplicateRows: duplicateCount,
    existingCableRows: existingCount,
    newCableRows: newCount,
    rowResults,
  };
}

/**
 * Imports valid rows into Cable Master via PostgreSQL API (LS mirror after PG success only).
 */
export async function importValidRowsToCableMaster(
  validRowResults: ExcelRowValidationResult[],
  jwtToken?: string | null
): Promise<{ ok: true; importedCount: number } | { ok: false; error: string; importedCount: number }> {
  const currentCatalog = getStoredCableCatalog();
  const existingMaterialNumbers = new Set(
    currentCatalog.map((c) => c.cableCode?.trim().toLowerCase()).filter(Boolean) as string[]
  );
  const items: MasterCableCatalogItem[] = [];

  validRowResults.forEach((res) => {
    if (!res.isValid || !res.parsedRecord) return;
    const r = res.parsedRecord;

    items.push({
      id: `imp-${r.materialNumber}-${Date.now()}`,
      cableCode: r.materialNumber,
      itemCode: r.itemCode,
      code: r.materialNumber,
      customerCode: r.customerCode || 'Standard',
      description: r.description,
      voltageClass: (r.voltageClass as any) || 'MV',
      conductor: r.conductorMaterial === 'AL' ? 'Aluminum' : 'Copper',
      cores: r.cores,
      crossSectionMm2: r.conductorSizeNum,
      outerDiameterMm: r.outerDiameterMm,
      approxWeightKgKm: r.approxWeightKgKm,
      standardPriceUsdPerM: Math.round((r.conductorSizeNum * 0.12 + 15) * 100) / 100,
      status: 'ACTIVE',
    });
  });

  if (items.length === 0) {
    return { ok: false, error: 'No valid rows to import.', importedCount: 0 };
  }

  const result = await persistCableCatalogRowsViaApi(items, jwtToken, { existingMaterialNumbers });
  if (!result.ok) {
    return {
      ok: false,
      error: result.errors[0] || 'PostgreSQL import failed.',
      importedCount: result.created + result.updated,
    };
  }

  return { ok: true, importedCount: result.created + result.updated };
}
