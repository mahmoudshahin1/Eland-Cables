import * as XLSX from 'xlsx';
import { asTrimmedString, getExcelVal } from './excelFieldUtils';
import {
  ControlledEngineeringInput,
  validateEngineeringParameters,
} from './engineeringMapping';

export const MAPPING_TEMPLATE_COLUMNS = [
  'Material Number',
  'Cable Description',
  'Cable Family',
  'Voltage',
  'Conductor Material',
  'Conductor Size',
  'Number of Cores',
  'Insulation',
  'Screen',
  'Armour',
  'Sheath',
  'Sheath Colour',
  'Core Colour',
  'Standard',
  'Special Additives',
  'Comment',
] as const;

export interface MappingExcelRow {
  materialNumber: string;
  description?: string;
  family?: string;
  voltage?: string;
  conductor?: string;
  conductorSize?: string;
  cores?: string;
  insulation?: string;
  screen?: string;
  armour?: string;
  sheath?: string;
  sheathColour?: string;
  coreColour?: string;
  standard?: string;
  specialAdditives?: string;
  comment?: string;
}

export interface MappingImportRowValidation {
  rowNumber: number;
  materialNumber: string;
  valid: boolean;
  errors: Array<{ field: string; message: string; code: string }>;
  warnings: Array<{ field: string; message: string; code: string }>;
  parsedInput: ControlledEngineeringInput & { comment?: string };
}

export interface MappingImportPreviewResult {
  sourceFile: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  unknownCableCount: number;
  rows: MappingImportRowValidation[];
  canSubmit: boolean;
}

export function generateMappingTemplateWorkbook(
  cables: Array<{
    materialNumber: string;
    description: string;
    family?: string | null;
    voltage?: string | null;
    conductor?: string | null;
    conductorSize?: string | null;
    cores?: string | null;
    insulation?: string | null;
    screen?: string | null;
    armour?: string | null;
    sheath?: string | null;
    sheathColour?: string | null;
    coreColour?: string | null;
    standard?: string | null;
    specialAdditives?: string | null;
    comment?: string | null;
  }>
): XLSX.WorkBook {
  const headers = [...MAPPING_TEMPLATE_COLUMNS];
  const data = cables.map((c) => [
    c.materialNumber,
    c.description || '',
    c.family || '',
    c.voltage || '',
    c.conductor || '',
    c.conductorSize || '',
    c.cores || '',
    c.insulation || '',
    c.screen || '',
    c.armour || '',
    c.sheath || '',
    c.sheathColour || '',
    c.coreColour || '',
    c.standard || '',
    c.specialAdditives || '',
    c.comment || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Engineering Mapping');
  return wb;
}

export function parseMappingExcelRows(
  rows: Record<string, unknown>[]
): MappingExcelRow[] {
  return rows.map((row) => {
    return {
      materialNumber: asTrimmedString(
        getExcelVal(row, ['Material Number', 'MaterialNumber', 'Cable Material Number', 'Material No'])
      ),
      description: asTrimmedString(
        getExcelVal(row, ['Cable Description', 'Description', 'Cable Desc'])
      ),
      family: asTrimmedString(getExcelVal(row, ['Cable Family', 'Family'])),
      voltage: asTrimmedString(getExcelVal(row, ['Voltage', 'Voltage Class'])),
      conductor: asTrimmedString(
        getExcelVal(row, ['Conductor Material', 'Conductor'])
      ),
      conductorSize: asTrimmedString(
        getExcelVal(row, ['Conductor Size', 'Cross Section', 'Size'])
      ),
      cores: asTrimmedString(getExcelVal(row, ['Number of Cores', 'Cores', 'Core Count'])),
      insulation: asTrimmedString(getExcelVal(row, ['Insulation'])),
      screen: asTrimmedString(getExcelVal(row, ['Screen', 'Screen Type'])),
      armour: asTrimmedString(getExcelVal(row, ['Armour', 'Armor', 'Armour Type'])),
      sheath: asTrimmedString(getExcelVal(row, ['Sheath', 'Sheathing'])),
      sheathColour: asTrimmedString(
        getExcelVal(row, ['Sheath Colour', 'Sheath Color'])
      ),
      coreColour: asTrimmedString(getExcelVal(row, ['Core Colour', 'Core Color'])),
      standard: asTrimmedString(getExcelVal(row, ['Standard'])),
      specialAdditives: asTrimmedString(
        getExcelVal(row, ['Special Additives', 'Additives'])
      ),
      comment: asTrimmedString(getExcelVal(row, ['Comment', 'Comments', 'Notes'])),
    };
  });
}

export function validateMappingImportRows(
  rawRows: Record<string, unknown>[],
  context: {
    existingCables: Map<string, { materialNumber: string; description: string }>;
    parameters: Array<{ kind: string; code: string; name?: string; status?: string }>;
    compatibility: Array<{ fromKind: string; fromCode: string; toKind: string; toCode: string; relation: string }>;
  },
  sourceFile: string = 'Engineering_Mapping_Upload.xlsx'
): MappingImportPreviewResult {
  const parsed = parseMappingExcelRows(rawRows);
  const seenMaterials = new Map<string, number>();
  const results: MappingImportRowValidation[] = [];

  parsed.forEach((r, idx) => {
    const rowNumber = idx + 2;
    const errors: Array<{ field: string; message: string; code: string }> = [];
    const warnings: Array<{ field: string; message: string; code: string }> = [];

    if (!r.materialNumber) {
      errors.push({
        field: 'Material Number',
        message: 'Material Number is required and cannot be empty.',
        code: 'REQUIRED',
      });
    } else {
      const matKey = r.materialNumber.toLowerCase();
      if (seenMaterials.has(matKey)) {
        errors.push({
          field: 'Material Number',
          message: `Duplicate Material Number ${r.materialNumber} found in row ${seenMaterials.get(matKey)}.`,
          code: 'DUPLICATE',
        });
      } else {
        seenMaterials.set(matKey, rowNumber);
      }

      if (!context.existingCables.has(matKey)) {
        errors.push({
          field: 'Material Number',
          message: `Material Number "${r.materialNumber}" does not exist in Cable Master catalog.`,
          code: 'UNKNOWN_MATERIAL_NUMBER',
        });
      }
    }

    const input: ControlledEngineeringInput = {
      family: r.family || null,
      voltage: r.voltage || null,
      conductor: r.conductor || null,
      conductorSize: r.conductorSize || null,
      cores: r.cores || null,
      insulation: r.insulation || null,
      screen: r.screen || null,
      armour: r.armour || null,
      sheath: r.sheath || null,
      sheathColour: r.sheathColour || null,
      coreColour: r.coreColour || null,
      standard: r.standard || null,
      specialAdditives: r.specialAdditives || null,
    };

    // Parameter validity checks
    const paramVal = validateEngineeringParameters(input, {
      parameters: context.parameters,
      compatibility: context.compatibility,
    });

    paramVal.errors.forEach((err) => {
      errors.push({
        field: err.field,
        message: err.message,
        code: err.message.includes('forbidden') || err.message.includes('not in the allowed')
          ? 'APPROVAL_BLOCKED_INVALID_COMPATIBILITY'
          : 'INVALID_PARAMETER',
      });
    });

    results.push({
      rowNumber,
      materialNumber: r.materialNumber || `ROW-${rowNumber}`,
      valid: errors.length === 0,
      errors,
      warnings,
      parsedInput: { ...input, comment: r.comment || undefined },
    });
  });

  const totalRows = results.length;
  const invalidCount = results.filter((r) => !r.valid).length;
  const validCount = results.filter((r) => r.valid).length;
  const duplicateCount = results.filter((r) => r.errors.some((e) => e.code === 'DUPLICATE')).length;
  const unknownCableCount = results.filter((r) =>
    r.errors.some((e) => e.code === 'UNKNOWN_MATERIAL_NUMBER')
  ).length;

  return {
    sourceFile,
    totalRows,
    validCount,
    invalidCount,
    duplicateCount,
    unknownCableCount,
    rows: results,
    canSubmit: invalidCount === 0 && totalRows > 0,
  };
}
