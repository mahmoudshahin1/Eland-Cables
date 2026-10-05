import * as XLSX from 'xlsx';
import {
  CableBomRawMaterial,
  DrumMasterRecord,
  ImportBatchRecord,
  ImportRowError,
  MasterCableCatalogItem,
  MasterImportKind,
  RawMaterialMasterRecord,
} from '../types';
import { asTrimmedString, getExcelVal, nextBatchNumber, parseOptionalNumber, parseRequiredNumber, sheetHasColumn } from './excelFieldUtils';
import { findConflictingBomWeightGroups } from './bomDuplicateForensics';
import type { BomDuplicateGroup } from './bomDuplicateForensics';
import { getStoredCableCatalog, parseCableDescription, saveCableCatalog } from './cableCatalogService';
import { getStoredCableBoms, RAW_MATERIAL_DICTIONARY, saveCableBoms } from './cableBomService';
import { getStoredDrumMaster, saveDrumMaster, resolveDrumEngineeringFields } from './drumMasterService';
import { classifyDrumExcelRows } from '../domain/drumMasterExcelImport';
import { getStoredRawMaterials, saveRawMaterials } from './rawMaterialMasterService';
import { saveImportBatch } from './importBatchService';
import { appendAudit } from '../platform/audit/auditLogService';
import {
  normalizeMetalType,
  normalizePricingCategoryInput,
  validateRawMaterialClassification,
} from '../domain/rawMaterialClassification';

function normalizeImportCurrency(raw?: string): string | undefined {
  if (!raw) return undefined;
  const c = raw.trim().toUpperCase();
  if (!c) return undefined;
  if (c === 'EGP') return 'LE';
  return c;
}

export interface ImportCommitResult {
  batch: ImportBatchRecord;
  previewRows: Record<string, unknown>[];
  cables?: MasterCableCatalogItem[];
  boms?: CableBomRawMaterial[];
  drums?: DrumMasterRecord[];
  rawMaterials?: RawMaterialMasterRecord[];
  duplicateObservations?: BomDuplicateGroup[];
}

export interface ImportStores {
  getCables(): MasterCableCatalogItem[];
  saveCables(items: MasterCableCatalogItem[]): void;
  getBoms(): CableBomRawMaterial[];
  saveBoms(items: CableBomRawMaterial[]): void;
  getDrums(): DrumMasterRecord[];
  saveDrums(items: DrumMasterRecord[]): void;
  getRawMaterials(): RawMaterialMasterRecord[];
  saveRawMaterials(items: RawMaterialMasterRecord[]): void;
  saveBatch(batch: ImportBatchRecord): void;
}

export function defaultImportStores(): ImportStores {
  return {
    getCables: getStoredCableCatalog,
    saveCables: (items) => saveCableCatalog(items, { mirrorAfterPgSuccess: true }),
    getBoms: getStoredCableBoms,
    saveBoms: (items) => saveCableBoms(items, { mirrorAfterPgSuccess: true }),
    getDrums: getStoredDrumMaster,
    saveDrums: (items) => saveDrumMaster(items, { mirrorAfterPgSuccess: true }),
    getRawMaterials: getStoredRawMaterials,
    saveRawMaterials: saveRawMaterials,
    saveBatch: (batch) => saveImportBatch(batch, { mirrorAfterPgSuccess: true }),
  };
}

export function memoryImportStores(seed?: Partial<{
  cables: MasterCableCatalogItem[];
  boms: CableBomRawMaterial[];
  drums: DrumMasterRecord[];
  rawMaterials: RawMaterialMasterRecord[];
  batches: ImportBatchRecord[];
}>): ImportStores & { snapshot: () => typeof seed } {
  const state = {
    cables: [...(seed?.cables || [])],
    boms: [...(seed?.boms || [])],
    drums: [...(seed?.drums || [])],
    rawMaterials: [...(seed?.rawMaterials || [])],
    batches: [...(seed?.batches || [])],
  };
  return {
    getCables: () => state.cables,
    saveCables: (items) => {
      state.cables = items;
    },
    getBoms: () => state.boms,
    saveBoms: (items) => {
      state.boms = items;
    },
    getDrums: () => state.drums,
    saveDrums: (items) => {
      state.drums = items;
    },
    getRawMaterials: () => state.rawMaterials,
    saveRawMaterials: (items) => {
      state.rawMaterials = items;
    },
    saveBatch: (batch) => {
      state.batches.unshift(batch);
    },
    snapshot: () => state,
  };
}

export function workbookFromArrayBuffer(data: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array' });
}

export function sheetToObjects(wb: XLSX.WorkBook, sheetName?: string): Record<string, unknown>[] {
  const name = sheetName || resolveImportSheetName(wb, 'cables') || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
}

const IMPORT_SHEET_ALIASES: Record<MasterImportKind, string[]> = {
  cables: ['Cable_Master', 'Cable List', 'CableList'],
  boms: ['Cable_BOM', 'Cable Materials', 'CableMaterials'],
  drums: ['Drum Master Template', 'Drums', 'Drum List'],
  raw_materials: ['Raw Materials', 'Raw Material List'],
};

export function resolveImportSheetName(wb: XLSX.WorkBook, kind: MasterImportKind): string | undefined {
  for (const alias of IMPORT_SHEET_ALIASES[kind]) {
    const hit = wb.SheetNames.find((n) => n.trim().toLowerCase() === alias.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

export function resolveWorkbookImportRows(
  wb: XLSX.WorkBook,
  hint: MasterImportKind = 'cables'
): { kind: MasterImportKind; sheetName: string; rows: Record<string, unknown>[] } {
  const preferred = resolveImportSheetName(wb, hint);
  if (preferred) {
    const rows = sheetToObjects(wb, preferred);
    if (rows.length > 0) {
      return { kind: detectImportKind(rows, hint), sheetName: preferred, rows };
    }
  }
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' }) as Record<string, unknown>[];
    if (rows.length === 0) continue;
    const kind = detectImportKind(rows, hint);
    if (kind === hint || sheetName.toLowerCase().includes('cable')) {
      return { kind, sheetName, rows };
    }
  }
  const fallback = wb.SheetNames[0];
  const rows = sheetToObjects(wb, fallback);
  return { kind: detectImportKind(rows, hint), sheetName: fallback, rows };
}

function metalColumnToConductor(value: string): string | null {
  const token = value.trim().toUpperCase();
  if (!token) return null;
  if (token === 'CU' || token === 'COPPER') return 'Copper';
  if (token === 'AL' || token === 'ALUMINIUM' || token === 'ALUMINUM') return 'Aluminium';
  return value.trim();
}

export function detectImportKind(rows: Record<string, unknown>[], fallback: MasterImportKind): MasterImportKind {
  if (!rows.length) return fallback;
  const keys = Object.keys(rows[0]).map((k) => k.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (keys.includes('drumcode') && keys.includes('flange')) return 'drums';
  if (keys.includes('rawmaterialcode') && keys.includes('price')) return 'raw_materials';
  if (keys.includes('specificationcode') || (keys.includes('cabledesc') && keys.includes('totalcableweight'))) {
    return 'cables';
  }
  if (keys.includes('rawmaterial') && (keys.includes('unitkm') || keys.includes('weight'))) return 'boms';
  return fallback;
}

function numberFailCode(parsed: ReturnType<typeof parseRequiredNumber>): string {
  if (parsed.ok === false) {
    return parsed.reason === 'BLANK' ? 'REQUIRED' : 'INVALID_NUMBER';
  }
  return 'INVALID_NUMBER';
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface ImportCommitOptions {
  persist?: boolean;
  stores?: ImportStores;
  actorId?: string;
  referenceParameters?: Array<{ kind: string; code: string; name?: string }>;
  sourceWorksheet?: string;
  enforceForeignKeys?: boolean;
  /** When true, mirror ImportBatch to LS after PG success (never authoritative alone). */
  mirrorBatchToLocalStorage?: boolean;
}

function referenceMatches(
  parameters: Array<{ kind: string; code: string; name?: string }>,
  kind: string,
  value: string
): boolean {
  const v = value.trim();
  if (!v) return false;
  const upper = v.toUpperCase();
  const conductorSynonym =
    kind === 'CONDUCTOR' &&
    (upper === 'CU' || upper === 'COPPER' || upper === 'AL' || upper === 'ALUMINUM' || upper === 'ALUMINIUM');
  return parameters.some((p) => {
    if (p.kind !== kind) return false;
    if (p.code.trim().toLowerCase() === v.toLowerCase()) return true;
    if (p.name && p.name.trim().toLowerCase() === v.toLowerCase()) return true;
    if (conductorSynonym) {
      const code = p.code.toUpperCase();
      if ((upper === 'CU' || upper === 'COPPER') && (code === 'CU' || code.includes('COPPER'))) return true;
      if ((upper === 'AL' || upper.startsWith('ALUM')) && (code === 'AL' || code.includes('ALUM'))) return true;
    }
    return false;
  });
}

export function commitCables(
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string,
  options: ImportCommitOptions = {}
): ImportCommitResult {
  const stores = options.stores || defaultImportStores();
  const errors: ImportRowError[] = [];
  const warnings: ImportRowError[] = [];
  const information: ImportRowError[] = [];
  const valid: MasterCableCatalogItem[] = [];
  const seenMaterial = new Set<string>();
  const existing = stores.getCables();
  const byMaterial = new Map(existing.map((c) => [c.cableCode.toLowerCase(), c]));
  const itemCounts = new Map<string, number>();
  const customerCounts = new Map<string, number>();
  const batchNumber = nextBatchNumber();
  const parameters = options.referenceParameters || [];

  const familyKeys = ['Cable Family', 'Family'];
  const voltageKeys = ['Voltage', 'Voltage Class'];
  const conductorKeys = ['Conductor', 'Conductor Material'];
  const sizeKeys = ['Conductor Size', 'Cross Section', 'Size'];
  const coreKeys = ['Core Count', 'Cores', 'Core'];
  const insulationKeys = ['Insulation'];
  const screenKeys = ['Screen', 'Screen Type'];
  const armourKeys = ['Armour', 'Armor'];
  const sheathKeys = ['Sheath', 'Sheathing'];
  const sheathColourKeys = ['Sheath Colour', 'Sheath Color'];
  const coreColourKeys = ['Core Colour', 'Core Color'];
  const standardKeys = ['Standard'];
  const uomKeys = ['UOM', 'Unit of Measure', 'Unit'];
  const statusKeys = ['Status'];

  const missingEngineering = [
    ['Cable Family', familyKeys, 'FAMILY'],
    ['Voltage', voltageKeys, 'VOLTAGE'],
    ['Conductor', conductorKeys, 'CONDUCTOR'],
    ['Conductor Size', sizeKeys, ''],
    ['Core Count', coreKeys, ''],
    ['Insulation', insulationKeys, 'INSULATION'],
    ['Screen', screenKeys, 'SCREEN'],
    ['Armour', armourKeys, 'ARMOUR'],
    ['Sheath', sheathKeys, 'SHEATH'],
    ['Sheath Colour', sheathColourKeys, 'CORE_COLOUR'],
    ['Core Colour', coreColourKeys, 'CORE_COLOUR'],
    ['Standard', standardKeys, 'STANDARD'],
    ['UOM', uomKeys, ''],
    ['Status', statusKeys, ''],
  ] as const;
  missingEngineering.forEach(([label, keys]) => {
    if (!sheetHasColumn(rows, [...keys])) {
      information.push({
        rowNumber: 1,
        field: label,
        code: 'CONFIGURATION_REQUIRED',
        message: `${label} is not a column in this workbook. The value is not invented. Cable Master stores null for this authority field.`,
      });
    }
  });

  rows.forEach((row) => {
    const itemCode = asTrimmedString(getExcelVal(row, ['Item Code', 'ItemCode']));
    if (itemCode) itemCounts.set(itemCode.toLowerCase(), (itemCounts.get(itemCode.toLowerCase()) || 0) + 1);
    const spec = asTrimmedString(getExcelVal(row, ['Specification Code', 'Customer Code', 'CustCode']));
    if (spec) customerCounts.set(spec.toLowerCase(), (customerCounts.get(spec.toLowerCase()) || 0) + 1);
  });

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const spec = asTrimmedString(getExcelVal(row, ['Specification Code', 'Customer Code', 'CustCode']));
    const itemCode = asTrimmedString(getExcelVal(row, ['Item Code', 'ItemCode']));
    const material = asTrimmedString(
      getExcelVal(row, ['Cable Material Number', 'Cable Code', 'MaterialNo'])
    );
    const eland = asTrimmedString(getExcelVal(row, ['Eland Item Number', 'ElandItemNumber']));
    const desc = asTrimmedString(getExcelVal(row, ['Cable Desc', 'Cable Description', 'Description']));
    const wt = parseRequiredNumber(getExcelVal(row, ['Total Cable Weight', 'Weight']));
    const dia = parseRequiredNumber(getExcelVal(row, ['Cable Diameter', 'Diameter']));

    if (!spec) errors.push({ rowNumber, field: 'Specification Code', code: 'REQUIRED', message: 'Specification Code / Customer Code is required.' });
    if (!itemCode) errors.push({ rowNumber, field: 'Item Code', code: 'REQUIRED', message: 'Item Code is required.' });
    if (!material) errors.push({ rowNumber, field: 'Cable Material Number', code: 'REQUIRED', message: 'Cable Material Number is required.' });
    if (!desc) errors.push({ rowNumber, field: 'Cable Desc', code: 'REQUIRED', message: 'Cable description is required.' });
    if (!wt.ok) {
      errors.push({
        rowNumber,
        field: 'Total Cable Weight',
        code: numberFailCode(wt),
        message: 'Total Cable Weight is required and must be numeric. Blank is not stored as zero.',
      });
    } else if (wt.value <= 0) {
      errors.push({ rowNumber, field: 'Total Cable Weight', code: 'INVALID_NUMBER', message: 'Weight must be greater than zero.' });
    }
    if (!dia.ok) {
      errors.push({
        rowNumber,
        field: 'Cable Diameter',
        code: numberFailCode(dia),
        message: 'Cable Diameter is required and must be numeric. Blank is not stored as zero.',
      });
    } else if (dia.value <= 0) {
      errors.push({ rowNumber, field: 'Cable Diameter', code: 'INVALID_NUMBER', message: 'Diameter must be greater than zero.' });
    }
    if (material && seenMaterial.has(material.toLowerCase())) {
      errors.push({ rowNumber, field: 'Cable Material Number', code: 'DUPLICATE', message: `Duplicate Cable Material Number ${material} in this file.` });
    }
    if (material) seenMaterial.add(material.toLowerCase());
    if (itemCode && (itemCounts.get(itemCode.toLowerCase()) || 0) > 1) {
      information.push({
        rowNumber,
        field: 'Item Code',
        code: 'ITEM_CODE_NOT_UNIQUE',
        message: `Item Code ${itemCode} is not unique in ENERGYA source data. Material number remains the natural key.`,
      });
    }
    if (spec && (customerCounts.get(spec.toLowerCase()) || 0) > 1) {
      information.push({
        rowNumber,
        field: 'Specification Code',
        code: 'CUSTOMER_CODE_NOT_UNIQUE',
        message: `Customer/Specification Code ${spec} is not globally unique. Material number remains the natural key.`,
      });
    }

    const extraRefs: Array<{ field: string; keys: string[]; kind: string }> = [
      { field: 'Cable Family', keys: familyKeys, kind: 'FAMILY' },
      { field: 'Voltage', keys: voltageKeys, kind: 'VOLTAGE' },
      { field: 'Conductor', keys: conductorKeys, kind: 'CONDUCTOR' },
      { field: 'Insulation', keys: insulationKeys, kind: 'INSULATION' },
      { field: 'Screen', keys: screenKeys, kind: 'SCREEN' },
      { field: 'Armour', keys: armourKeys, kind: 'ARMOUR' },
      { field: 'Sheath', keys: sheathKeys, kind: 'SHEATH' },
      { field: 'Sheath Colour', keys: sheathColourKeys, kind: 'CORE_COLOUR' },
      { field: 'Core Colour', keys: coreColourKeys, kind: 'CORE_COLOUR' },
      { field: 'Standard', keys: standardKeys, kind: 'STANDARD' },
    ];
    extraRefs.forEach(({ field, keys, kind }) => {
      if (!sheetHasColumn(rows, keys)) return;
      const value = asTrimmedString(getExcelVal(row, keys));
      if (!value) {
        errors.push({ rowNumber, field, code: 'REQUIRED', message: `${field} is present as a column and must not be blank.` });
        return;
      }
      if (!parameters.length) {
        warnings.push({
          rowNumber,
          field,
          code: 'CONFIGURATION_REQUIRED',
          message: `${field} value ${value} cannot be checked because CableParameter masters are not loaded.`,
        });
        return;
      }
      if (!referenceMatches(parameters, kind, value)) {
        errors.push({
          rowNumber,
          field,
          code: 'INVALID_REFERENCE',
          message: `${field} value ${value} is not in the ${kind} parameter master. The reference is not invented.`,
        });
      }
    });

    if (sheetHasColumn(rows, sizeKeys) && !asTrimmedString(getExcelVal(row, sizeKeys))) {
      errors.push({ rowNumber, field: 'Conductor Size', code: 'REQUIRED', message: 'Conductor Size is present as a column and must not be blank.' });
    }
    if (sheetHasColumn(rows, coreKeys) && !asTrimmedString(getExcelVal(row, coreKeys))) {
      errors.push({ rowNumber, field: 'Core Count', code: 'REQUIRED', message: 'Core Count is present as a column and must not be blank.' });
    }
    if (sheetHasColumn(rows, uomKeys) && !asTrimmedString(getExcelVal(row, uomKeys))) {
      errors.push({ rowNumber, field: 'UOM', code: 'REQUIRED', message: 'UOM is present as a column and must not be blank.' });
    }
    if (sheetHasColumn(rows, statusKeys)) {
      const statusVal = asTrimmedString(getExcelVal(row, statusKeys)).toUpperCase();
      if (!statusVal) {
        errors.push({ rowNumber, field: 'Status', code: 'REQUIRED', message: 'Status is present as a column and must not be blank.' });
      } else if (!['ACTIVE', 'INACTIVE', 'SUPERSEDED'].includes(statusVal)) {
        errors.push({ rowNumber, field: 'Status', code: 'INVALID', message: 'Status must be ACTIVE, INACTIVE, or SUPERSEDED.' });
      }
    }

    const rowHasError = errors.some((e) => e.rowNumber === rowNumber);
    if (rowHasError || !wt.ok || !dia.ok || !material || !spec || !itemCode || !desc) return;

    const parsed = parseCableDescription(desc);
    const prev = byMaterial.get(material.toLowerCase());
    if (prev && prev.description && prev.description !== desc) {
      warnings.push({
        rowNumber,
        field: 'Cable Desc',
        code: 'CONFLICTING_DESCRIPTION',
        message: `Material ${material} already has a different description. Import will not auto-merge text.`,
      });
    }
    const familyVal = sheetHasColumn(rows, familyKeys) ? asTrimmedString(getExcelVal(row, familyKeys)) || null : null;
    const voltageVal = sheetHasColumn(rows, voltageKeys) ? asTrimmedString(getExcelVal(row, voltageKeys)) || null : null;
    const conductorFromMetal = metalColumnToConductor(
      asTrimmedString(getExcelVal(row, ['Metal', 'Conductor Metal']))
    );
    const conductorVal = sheetHasColumn(rows, conductorKeys)
      ? asTrimmedString(getExcelVal(row, conductorKeys)) || null
      : conductorFromMetal;
    const sizeVal = sheetHasColumn(rows, sizeKeys) ? asTrimmedString(getExcelVal(row, sizeKeys)) || null : null;
    const coresVal = sheetHasColumn(rows, coreKeys) ? asTrimmedString(getExcelVal(row, coreKeys)) || null : null;
    const insulationVal = sheetHasColumn(rows, insulationKeys)
      ? asTrimmedString(getExcelVal(row, insulationKeys)) || null
      : null;
    const screenVal = sheetHasColumn(rows, screenKeys) ? asTrimmedString(getExcelVal(row, screenKeys)) || null : null;
    const armourVal = sheetHasColumn(rows, armourKeys) ? asTrimmedString(getExcelVal(row, armourKeys)) || null : null;
    const sheathVal = sheetHasColumn(rows, sheathKeys) ? asTrimmedString(getExcelVal(row, sheathKeys)) || null : null;
    const sheathColourVal = sheetHasColumn(rows, sheathColourKeys)
      ? asTrimmedString(getExcelVal(row, sheathColourKeys)) || null
      : null;
    const coreColourVal = sheetHasColumn(rows, coreColourKeys)
      ? asTrimmedString(getExcelVal(row, coreColourKeys)) || null
      : null;
    const standardVal = sheetHasColumn(rows, standardKeys)
      ? asTrimmedString(getExcelVal(row, standardKeys)) || null
      : null;
    const uomVal = sheetHasColumn(rows, uomKeys)
      ? asTrimmedString(getExcelVal(row, uomKeys)) || null
      : 'CONFIGURATION_REQUIRED';
    const statusVal = sheetHasColumn(rows, statusKeys)
      ? (asTrimmedString(getExcelVal(row, statusKeys)).toUpperCase() as 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED')
      : 'ACTIVE';
    valid.push({
      id: prev?.id || `mc-${material}`,
      itemCode,
      cableCode: material,
      customerCode: spec,
      code: `${spec} ${material}`,
      description: desc,
      voltageClass: parsed.voltageClass,
      conductor: conductorVal === 'Aluminum' || conductorVal === 'AL' ? 'Aluminum' : parsed.conductor,
      cores: coresVal || parsed.cores,
      crossSectionMm2: sizeVal && Number.isFinite(Number(sizeVal)) ? Number(sizeVal) : parsed.crossSectionMm2,
      outerDiameterMm: dia.value,
      approxWeightKgKm: wt.value,
      standardPriceUsdPerM: prev?.standardPriceUsdPerM ?? 0,
      priceConfigured: prev?.priceConfigured ?? false,
      elandItemNumber: eland || undefined,
      sourceBatch: batchNumber,
      status: statusVal === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      family: familyVal,
      insulation: insulationVal,
      screen: screenVal,
      armour: armourVal,
      sheath: sheathVal,
      sheathColour: sheathColourVal,
      coreColour: coreColourVal,
      standard: standardVal,
      uom: uomVal || 'CONFIGURATION_REQUIRED',
      authorityFields: {
        family: familyVal,
        voltage: voltageVal,
        conductor: conductorVal,
        conductorSize: sizeVal,
        cores: coresVal,
        insulation: insulationVal,
        screen: screenVal,
        armour: armourVal,
        sheath: sheathVal,
        sheathColour: sheathColourVal,
        coreColour: coreColourVal,
        standard: standardVal,
        uom: uomVal,
      },
      bomRawMaterials: prev?.bomRawMaterials,
      bomDetails: prev?.bomDetails,
    });
    if (!eland) {
      warnings.push({
        rowNumber,
        field: 'Eland Item Number',
        code: 'EMPTY',
        message: 'Eland Item Number is empty (allowed). No ELAND SKU mapping stored.',
      });
    }
  });

  return finishCommit({
    stores,
    persist: options.persist !== false,
    mirrorBatchToLocalStorage: options.mirrorBatchToLocalStorage,
    actorId: options.actorId,
    importedBy,
    kind: 'cables',
    rows,
    sourceFile,
    batchNumber,
    errors,
    warnings,
    information,
    validCount: valid.length,
    apply: () => {
      const keep = existing.filter((c) => !valid.some((v) => v.cableCode.toLowerCase() === c.cableCode.toLowerCase()));
      stores.saveCables([...valid, ...keep]);
    },
    extra: { cables: valid },
  });
}

export function commitBoms(
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string,
  options: ImportCommitOptions = {}
): ImportCommitResult {
  const stores = options.stores || defaultImportStores();
  const errors: ImportRowError[] = [];
  const warnings: ImportRowError[] = [];
  const parsedLines: Array<CableBomRawMaterial & { rowNumber: number }> = [];
  const catalog = stores.getCables();
  const rms = stores.getRawMaterials();
  const rmCodes = new Set(rms.map((r) => r.rawMaterialCode.toUpperCase()));
  const cableCodes = new Set(catalog.map((c) => c.cableCode.toLowerCase()));
  const batchNumber = nextBatchNumber();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const itemCode = asTrimmedString(getExcelVal(row, ['Item Code', 'ItemCode']));
    const material = asTrimmedString(getExcelVal(row, ['Cable Material Number', 'Cable Code', 'MaterialNo']));
    const catalogCable = material
      ? catalog.find((c) => String(c.cableCode || '').toLowerCase() === material.toLowerCase())
      : undefined;
    const customerCode =
      asTrimmedString(getExcelVal(row, ['Customer Code', 'Specification Code', 'CustCode'])) ||
      asTrimmedString(catalogCable?.customerCode);
    const rawMaterial = asTrimmedString(
      getExcelVal(row, ['Raw Material', 'Raw Material Code', 'RawMaterial', 'Material Code', 'RM'])
    );
    const unitKm = asTrimmedString(getExcelVal(row, ['Unit/Km', 'UnitKm', 'Unit', 'UOM']));
    const wt = parseRequiredNumber(getExcelVal(row, ['Weight', 'Qty', 'Consumption']));

    if (!customerCode) errors.push({ rowNumber, field: 'Customer Code', code: 'REQUIRED', message: 'Customer Code is required. No default N2XH is applied.' });
    if (!material) errors.push({ rowNumber, field: 'Cable Material Number', code: 'REQUIRED', message: 'Cable Material Number is required. No default 10009487 is applied.' });
    if (!rawMaterial) errors.push({ rowNumber, field: 'Raw Material', code: 'REQUIRED', message: 'Raw Material code is required. No default CR01 is applied.' });
    if (!unitKm) errors.push({ rowNumber, field: 'Unit/Km', code: 'REQUIRED', message: 'Consumption UOM is required.' });
    if (!wt.ok) {
      errors.push({
        rowNumber,
        field: 'Weight',
        code: numberFailCode(wt),
        message: 'Weight/consumption is required. Blank is not stored as zero.',
      });
    } else if (wt.value < 0) {
      errors.push({ rowNumber, field: 'Weight', code: 'INVALID_NUMBER', message: 'Consumption cannot be negative.' });
    }
    if ((options.enforceForeignKeys || cableCodes.size) && material && !cableCodes.has(material.toLowerCase())) {
      errors.push({ rowNumber, field: 'Cable Material Number', code: 'INVALID_REFERENCE', message: `Cable Material Number ${material} is not in Cable Master.` });
    }
    if ((options.enforceForeignKeys || rmCodes.size) && rawMaterial && !rmCodes.has(rawMaterial.toUpperCase())) {
      errors.push({
        rowNumber,
        field: 'Raw Material',
        code: 'INVALID_REFERENCE',
        message: `Raw Material ${rawMaterial} is not in Raw Material Master. Import raw materials first, or this row is rejected.`,
      });
    }
    if (unitKm.toUpperCase() === 'PCS' && rmCodes.size) {
      const rm = rms.find((r) => r.rawMaterialCode.toUpperCase() === rawMaterial.toUpperCase());
      if (rm && rm.uom.toLowerCase() === 'kg') {
        warnings.push({
          rowNumber,
          field: 'Unit/Km',
          code: 'UOM_CONFLICT',
          message: `BOM UOM is PCS but Raw Material Master UOM is ${rm.uom}. PCS is not converted to kg.`,
        });
      }
    }

    const rowHasError = errors.some((e) => e.rowNumber === rowNumber);
    if (rowHasError || !wt.ok) return;

    const dict = RAW_MATERIAL_DICTIONARY[rawMaterial.toUpperCase()];
    const rm = rms.find((r) => r.rawMaterialCode.toUpperCase() === rawMaterial.toUpperCase());
    parsedLines.push({
      rowNumber,
      id: `bom-${material}-${rawMaterial}-${rowNumber}`,
      customerCode,
      itemCode: itemCode || undefined,
      cableMaterialNumber: material,
      rawMaterial,
      rawMaterialName: dict?.name || rm?.description || rawMaterial,
      weight: wt.value,
      unitKm,
      sourceBatch: batchNumber,
      status: 'ACTIVE',
    });
  });

  const skipped: ImportRowError[] = [];
  const conflicting = findConflictingBomWeightGroups(
    parsedLines.map((l) => ({
      rowNumber: l.rowNumber,
      cableMaterialNumber: l.cableMaterialNumber,
      rawMaterial: l.rawMaterial,
      weight: l.weight,
    })),
    { sourceWorksheet: options.sourceWorksheet || 'Cable Materials', sourceFile }
  );
  const rejectedKeys = new Set(
    conflicting.map((g) => `${g.cableMaterialNumber.toLowerCase()}::${g.rawMaterialCode.toUpperCase()}`)
  );
  conflicting.forEach((g) => {
    g.sourceRowNumbers.forEach((rowNumber) => {
      skipped.push({
        rowNumber,
        field: 'Raw Material',
        code: 'BUSINESS_DECISION_REQUIRED',
        message: `Skipped Cable ${g.cableMaterialNumber} / RM ${g.rawMaterialCode}: conflicting weights ${g.weightA} vs ${g.weightB} (${g.occurrenceCount} rows, ${g.classification}). No weight was chosen, averaged, or versioned.`,
      });
    });
  });

  const valid = parsedLines.filter(
    (l) => !rejectedKeys.has(`${l.cableMaterialNumber.toLowerCase()}::${l.rawMaterial.toUpperCase()}`)
  );
  const uniqueValid: CableBomRawMaterial[] = [];
  const seen = new Set<string>();
  valid.forEach((v) => {
    const k = `${v.cableMaterialNumber.toLowerCase()}::${v.rawMaterial.toUpperCase()}`;
    if (seen.has(k)) {
      skipped.push({
        rowNumber: v.rowNumber,
        field: 'Raw Material',
        code: 'DUPLICATE_IDENTICAL',
        message: `Identical Cable + Raw Material row skipped after the first occurrence. Weight was not overwritten.`,
      });
      return;
    }
    seen.add(k);
    uniqueValid.push(v);
  });

  return finishCommit({
    stores,
    persist: options.persist !== false,
    mirrorBatchToLocalStorage: options.mirrorBatchToLocalStorage,
    actorId: options.actorId,
    importedBy,
    kind: 'boms',
    rows,
    sourceFile,
    batchNumber,
    errors,
    warnings,
    information: [],
    skipped,
    validCount: uniqueValid.length,
    apply: () => {
      const touched = new Set(uniqueValid.map((v) => v.cableMaterialNumber.toLowerCase()));
      const remaining = stores.getBoms().filter((b) => !touched.has(b.cableMaterialNumber.toLowerCase()));
      stores.saveBoms([...remaining, ...uniqueValid]);
    },
    extra: { boms: uniqueValid, duplicateObservations: conflicting },
  });
}

export function commitDrums(
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string,
  options: ImportCommitOptions = {}
): ImportCommitResult {
  const stores = options.stores || defaultImportStores();
  const errors: ImportRowError[] = [];
  const warnings: ImportRowError[] = [];
  const valid: DrumMasterRecord[] = [];
  const existing = stores.getDrums();
  const batchNumber = nextBatchNumber();
  const classified = classifyDrumExcelRows({ rows, existing, batchNumber, nowIso: nowIso() });

  classified.forEach((row, idx) => {
    if (row.status === 'ERROR') {
      row.errors.forEach((issue) => {
        errors.push({
          rowNumber: row.rowNumber,
          field: issue.field,
          code: issue.code,
          message: issue.message,
        });
      });
      return;
    }
    if ((row.status === 'NEW' || row.status === 'UPDATE') && row.uploaded) {
      valid.push(row.uploaded);
    }
    if (row.status === 'NEW' && row.uploaded) {
      const source = rows[idx] || {};
      const clearanceRaw = parseOptionalNumber(getExcelVal(source, ['Clearance Mm', 'Clearance', 'ClearanceMm']));
      const maxLoadRaw = parseOptionalNumber(getExcelVal(source, ['Max Load Kg', 'Max Load', 'MaxLoad', 'MaxLoadKg']));
      const emptyWeightRaw = parseOptionalNumber(
        getExcelVal(source, ['Empty Drum Net Weight Kg', 'Empty Drum Net Weight', 'EmptyDrumNetWeightKg'])
      );
      const engineering = resolveDrumEngineeringFields(row.uploaded.capacity, {
        clearanceMm: clearanceRaw.value,
        maxLoadKg: maxLoadRaw.value,
        emptyDrumNetWeightKg: emptyWeightRaw.value,
      });
      engineering.warnings.forEach((warning) => {
        warnings.push({ rowNumber: row.rowNumber, ...warning });
      });
      warnings.push({
        rowNumber: row.rowNumber,
        field: 'drumType',
        code: 'CONFIGURATION_REQUIRED',
        message: `Drum ${row.uploaded.drumCode} has no drum type / usable width in the source file. Automatic EWD optimization remains CONFIGURATION_REQUIRED.`,
      });
    }
  });

  return finishCommit({
    stores,
    persist: options.persist !== false,
    mirrorBatchToLocalStorage: options.mirrorBatchToLocalStorage,
    actorId: options.actorId,
    importedBy,
    kind: 'drums',
    rows,
    sourceFile,
    batchNumber,
    errors,
    warnings: warnings.slice(0, 30),
    information: [],
    validCount: valid.length,
    apply: () => {
      const keep = existing.filter((d) => !valid.some((v) => v.drumCode.toUpperCase() === d.drumCode.toUpperCase()));
      stores.saveDrums([...valid, ...keep]);
    },
    extra: { drums: valid },
  });
}

export function commitRawMaterials(
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string,
  options: ImportCommitOptions = {}
): ImportCommitResult {
  const stores = options.stores || defaultImportStores();
  const errors: ImportRowError[] = [];
  const warnings: ImportRowError[] = [];
  const valid: RawMaterialMasterRecord[] = [];
  const seen = new Set<string>();
  const existing = stores.getRawMaterials();
  const byCode = new Map(existing.map((r) => [r.rawMaterialCode.toUpperCase(), r]));
  const batchNumber = nextBatchNumber();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const code = asTrimmedString(getExcelVal(row, ['Raw Material Code', 'RawMaterialCode', 'Code']));
    const description = asTrimmedString(getExcelVal(row, ['Description', 'Name']));
    const uom = asTrimmedString(getExcelVal(row, ['Unit of Measurement', 'UofM', 'UOM', 'Unit']));
    const shortDescription = asTrimmedString(
      getExcelVal(row, ['Short Description', 'ShortDescription', 'Short Desc'])
    );
    const category = asTrimmedString(getExcelVal(row, ['Category', 'Material Type', 'Material Type ']));
    const pricingCategory = normalizePricingCategoryInput(
      asTrimmedString(getExcelVal(row, ['Pricing Category', 'PricingCategory'])) || 'STANDARD_RAW_MATERIAL'
    );
    const metalType = normalizeMetalType(
      asTrimmedString(getExcelVal(row, ['Metal Type', 'MetalType', 'Metal']))
    );
    const classification = validateRawMaterialClassification({ pricingCategory, metalType });
    if (classification.ok === false) {
      errors.push({
        rowNumber,
        field: 'Pricing Category',
        code: classification.code,
        message: classification.message,
      });
      return;
    }
    const supplier = asTrimmedString(getExcelVal(row, ['Supplier']));
    const notes = asTrimmedString(getExcelVal(row, ['Notes', 'Note']));
    const currency = normalizeImportCurrency(asTrimmedString(getExcelVal(row, ['Currency'])));
    const statusRaw = asTrimmedString(getExcelVal(row, ['Status']));
    const effectiveFromRaw = asTrimmedString(getExcelVal(row, ['Effective From', 'Price Date', 'From']));
    const effectiveToRaw = asTrimmedString(getExcelVal(row, ['Effective To', 'To']));
    const priceRaw = getExcelVal(row, ['Price']);
    const priceParsed =
      priceRaw === null || priceRaw === undefined || priceRaw === ''
        ? null
        : parseRequiredNumber(priceRaw);

    if (!code) errors.push({ rowNumber, field: 'Raw Material Code', code: 'REQUIRED', message: 'Raw Material Code is required.' });
    if (!description) errors.push({ rowNumber, field: 'Description', code: 'REQUIRED', message: 'Description is required.' });
    if (!uom) errors.push({ rowNumber, field: 'Unit of Measurement', code: 'REQUIRED', message: 'UOM is required.' });
    if (code && seen.has(code.toUpperCase())) {
      errors.push({ rowNumber, field: 'Raw Material Code', code: 'DUPLICATE', message: `Duplicate code ${code}.` });
    }
    if (code) seen.add(code.toUpperCase());
    if (priceParsed && !priceParsed.ok) {
      errors.push({
        rowNumber,
        field: 'Price',
        code: 'INVALID_NUMBER',
        message: 'Price is not numeric. Blank prices stay PRICE_NOT_CONFIGURED (not zero).',
      });
    }

    const rowHasError = errors.some((e) => e.rowNumber === rowNumber);
    if (rowHasError || !code || !description || !uom) return;

    if (statusRaw && !['ACTIVE', 'INACTIVE', 'SUPERSEDED'].includes(statusRaw.toUpperCase())) {
      errors.push({ rowNumber, field: 'Status', code: 'INVALID', message: 'Status must be ACTIVE, INACTIVE, or SUPERSEDED.' });
      return;
    }

    const price = priceParsed && priceParsed.ok ? priceParsed.value : null;
    if (price === null) {
      warnings.push({
        rowNumber,
        field: 'Price',
        code: 'PRICE_NOT_CONFIGURED',
        message: `${code} has no price. Blank is not stored as zero. Costing must treat this as PRICE_NOT_CONFIGURED.`,
      });
    }

    const hasDates = Boolean(effectiveFromRaw);
    if (price != null && !hasDates) {
      warnings.push({
        rowNumber,
        field: 'Effective From',
        code: 'DATA_REQUIRED',
        message: `${code} has a numeric price but no effective date in the source. The date is not invented.`,
      });
    }

    const prev = byCode.get(code.toUpperCase());
    valid.push({
      id: prev?.id || `rm-${code}`,
      rawMaterialCode: code,
      description,
      shortDescription: shortDescription || undefined,
      uom,
      category: category || undefined,
      materialType: category || undefined,
      pricingCategory,
      metalType,
      notes: notes || undefined,
      supplier: supplier || undefined,
      price,
      currency: currency || undefined,
      priceStatus: price === null ? 'PRICE_NOT_CONFIGURED' : 'CONFIGURED',
      priceTemporalStatus:
        price === null ? 'PRICE_NOT_CONFIGURED' : hasDates ? 'EFFECTIVE' : 'DATA_REQUIRED',
      priceEffectiveFrom: hasDates ? effectiveFromRaw : null,
      priceEffectiveTo: effectiveToRaw || null,
      status: statusRaw.toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      sourceBatch: batchNumber,
      createdAt: prev?.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
  });

  return finishCommit({
    stores,
    persist: options.persist !== false,
    mirrorBatchToLocalStorage: options.mirrorBatchToLocalStorage,
    actorId: options.actorId,
    importedBy,
    kind: 'raw_materials',
    rows,
    sourceFile,
    batchNumber,
    errors,
    warnings,
    information: [],
    validCount: valid.length,
    apply: () => {
      const keep = existing.filter((r) => !valid.some((v) => v.rawMaterialCode.toUpperCase() === r.rawMaterialCode.toUpperCase()));
      stores.saveRawMaterials([...valid, ...keep]);
    },
    extra: { rawMaterials: valid },
  });
}

function isMemoryImportStores(stores: ImportStores): boolean {
  return typeof (stores as ImportStores & { snapshot?: () => unknown }).snapshot === 'function';
}

function finishCommit(args: {
  stores: ImportStores;
  persist: boolean;
  mirrorBatchToLocalStorage?: boolean;
  actorId?: string;
  importedBy: string;
  kind: MasterImportKind;
  rows: Record<string, unknown>[];
  sourceFile: string;
  batchNumber: string;
  errors: ImportRowError[];
  warnings: ImportRowError[];
  information: ImportRowError[];
  skipped?: ImportRowError[];
  validCount: number;
  apply: () => void;
  extra: Partial<ImportCommitResult>;
}): ImportCommitResult {
  const skipped = args.skipped || [];
  const rejected = args.errors.length > 0;
  const willApply = args.persist && !rejected && args.validCount > 0;
  if (willApply) {
    args.apply();
    const entity =
      args.kind === 'cables' ? 'CableMaster' : args.kind === 'boms' ? 'CableBom' : args.kind === 'drums' ? 'DrumMaster' : 'RawMaterial';
    const action =
      args.kind === 'boms' ? 'BOM_CHANGE' : args.kind === 'drums' ? 'DRUM_CHANGE' : args.kind === 'raw_materials' ? 'PRICE_CHANGE' : 'IMPORT';
    appendAudit({
      actorId: args.actorId,
      actorName: args.importedBy,
      entity,
      entityId: args.batchNumber,
      action: args.kind === 'cables' ? 'IMPORT' : action,
      newValue: { kind: args.kind, count: args.validCount, skipped: skipped.length },
      message: `import ${args.kind} batch ${args.batchNumber} (legacy telemetry only)`,
    });
  }

  const duplicateCount = skipped.filter((s) => s.code === 'BUSINESS_DECISION_REQUIRED' || s.code === 'DUPLICATE_IDENTICAL' || s.code === 'DUPLICATE_BOM').length;

  const batch: ImportBatchRecord = {
    batchNumber: args.batchNumber,
    sourceFile: args.sourceFile,
    importedBy: args.importedBy,
    importedDate: nowIso(),
    dataType: args.kind,
    rowCount: args.rows.length,
    successCount: willApply ? args.validCount : rejected ? 0 : args.persist ? 0 : args.validCount,
    errorCount: args.errors.length,
    warningCount: args.warnings.length,
    skippedCount: skipped.length,
    duplicateCount,
    status: rejected ? 'REJECTED' : args.persist ? (willApply || skipped.length > 0 ? 'COMMITTED' : 'COMMITTED') : 'PREVIEWED',
    errors: args.errors.slice(0, 400),
    warnings: args.warnings.slice(0, 80),
    information: args.information.slice(0, 80),
    skipped: skipped.slice(0, 200),
  };
  if (args.persist) {
    const mirrorBatch =
      args.mirrorBatchToLocalStorage === true || isMemoryImportStores(args.stores);
    if (mirrorBatch) {
      args.stores.saveBatch(batch);
    }
  }
  return { batch, previewRows: args.rows, ...args.extra };
}

export async function fetchOfficialWorkbook(path: string): Promise<XLSX.WorkBook> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status}).`);
  const buf = await res.arrayBuffer();
  return workbookFromArrayBuffer(buf);
}

export function commitKind(
  kind: MasterImportKind,
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string,
  options: ImportCommitOptions = {}
): ImportCommitResult {
  if (kind === 'cables') return commitCables(rows, sourceFile, importedBy, options);
  if (kind === 'boms') return commitBoms(rows, sourceFile, importedBy, options);
  if (kind === 'drums') return commitDrums(rows, sourceFile, importedBy, options);
  return commitRawMaterials(rows, sourceFile, importedBy, options);
}

export function previewKind(
  kind: MasterImportKind,
  rows: Record<string, unknown>[],
  sourceFile: string,
  importedBy: string,
  options: Omit<ImportCommitOptions, 'persist'> = {}
): ImportCommitResult {
  return commitKind(kind, rows, sourceFile, importedBy, { ...options, persist: false });
}
