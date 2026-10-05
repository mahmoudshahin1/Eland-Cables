/**
 * Drum Master Excel preview/commit classification.
 * Matching key is Drum Code (trim only). Pure — no Prisma / HTTP / localStorage.
 */

import { DrumMasterRecord } from '../types';
import {
  asTrimmedString,
  getExcelVal,
  parseOptionalNumber,
  parseRequiredNumber,
} from '../services/excelFieldUtils';
import { buildDrumDescription, resolveDrumEngineeringFields } from '../services/drumMasterService';

export type DrumExcelRowStatus = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR';

export type DrumExcelFieldChange = {
  field: string;
  existing: string | number | null;
  uploaded: string | number | null;
};

export type DrumExcelPreviewRow = {
  rowNumber: number;
  drumCode: string;
  status: DrumExcelRowStatus;
  action: 'INSERT' | 'UPDATE' | 'NONE' | 'REJECT';
  existing: DrumMasterRecord | null;
  uploaded: DrumMasterRecord | null;
  changes: DrumExcelFieldChange[];
  errors: Array<{ field?: string; code: string; message: string }>;
};

/** Official Energya Drum Master Upload Template columns (sheet: Drum Master Template). */
export const APPROVED_DRUM_TEMPLATE_HEADERS = [
  'Drum Code',
  'Flange',
  'Barrel',
  'Inner Width',
  'Outer Width',
  'Capacity',
  'Clearance Mm',
  'Max Load Kg',
  'Empty Drum Net Weight Kg',
  'Description',
] as const;

const DRUM_CODE_KEYS = ['Drum Code', 'DrumCode', 'Code'];
const FLANGE_KEYS = ['Flange', 'Flange Diameter', 'FlangeDiameter'];
const BARREL_KEYS = ['Barrel', 'Barrel Diameter', 'BarrelDiameter'];
const INNER_WIDTH_KEYS = ['Inner Width', 'InnerWidth', 'Traverse', 'Usable Width'];
const OUTER_WIDTH_KEYS = ['Outer Width', 'OuterWidth', 'Overall Width', 'OverallWidth', 'Total Width'];
const CAPACITY_KEYS = ['Capacity', 'Capacity / KG', 'Capacity/KG', 'Drum Capacity', 'DrumCapacity'];
const CLEARANCE_KEYS = ['Clearance Mm', 'Clearance', 'ClearanceMm', 'Flange Clearance'];
const MAX_LOAD_KEYS = ['Max Load Kg', 'Max Load', 'MaxLoad', 'MaxLoadKg', 'Payload'];
const EMPTY_WEIGHT_KEYS = [
  'Empty Drum Net Weight Kg',
  'Empty Drum Net Weight',
  'EmptyDrumNetWeightKg',
  'Empty Drum Weight',
  'Empty Weight',
  'Tare',
  'Tare Weight',
];
const DESCRIPTION_KEYS = ['Description', 'Drum Description'];

const COMPARE_FIELDS: Array<{ key: keyof DrumMasterRecord; label: string }> = [
  { key: 'drumCode', label: 'Drum Code' },
  { key: 'flange', label: 'Flange' },
  { key: 'barrel', label: 'Barrel' },
  { key: 'innerWidth', label: 'Inner Width' },
  { key: 'outerWidth', label: 'Outer Width' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'clearanceMm', label: 'Clearance Mm' },
  { key: 'maxWeight', label: 'Max Load Kg' },
  { key: 'emptyDrumNetWeightKg', label: 'Empty Drum Net Weight Kg' },
  { key: 'description', label: 'Description' },
];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function validateApprovedDrumTemplateHeaders(rows: Record<string, unknown>[]): {
  ok: boolean;
  missing: string[];
  present: string[];
} {
  const present = rows[0] ? Object.keys(rows[0]) : [];
  const normalized = present.map(normalizeHeader);
  const missing = APPROVED_DRUM_TEMPLATE_HEADERS.filter((header) => !normalized.includes(normalizeHeader(header)));
  return { ok: missing.length === 0 && present.length > 0, missing, present };
}

function normCode(value: string): string {
  return value.trim().toUpperCase();
}

function numEq(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return String(a) === String(b);
  return Math.abs(na - nb) < 1e-9;
}

function displayValue(value: unknown): string | number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  return text || null;
}

function findExisting(code: string, existing: DrumMasterRecord[]): DrumMasterRecord | null {
  const key = normCode(code);
  return existing.find((row) => normCode(row.drumCode) === key) || null;
}

export function classifyDrumExcelRows(input: {
  rows: Record<string, unknown>[];
  existing: DrumMasterRecord[];
  batchNumber?: string;
  nowIso?: string;
}): DrumExcelPreviewRow[] {
  const seen = new Set<string>();
  const now = input.nowIso || '1970-01-01T00:00:00.000Z';
  const batchNumber = input.batchNumber || 'PREVIEW';

  return input.rows.map((row, idx) => {
    const rowNumber = idx + 2;
    const drumCode = asTrimmedString(getExcelVal(row, DRUM_CODE_KEYS));
    const errors: DrumExcelPreviewRow['errors'] = [];
    if (!drumCode) {
      errors.push({ field: 'Drum Code', code: 'REQUIRED', message: 'Drum Code is required.' });
    }
    const key = drumCode ? normCode(drumCode) : '';
    if (drumCode && seen.has(key)) {
      errors.push({ field: 'Drum Code', code: 'DUPLICATE', message: `Duplicate Drum Code ${drumCode}.` });
    }
    if (drumCode) seen.add(key);

    const flange = parseRequiredNumber(getExcelVal(row, FLANGE_KEYS));
    const barrel = parseRequiredNumber(getExcelVal(row, BARREL_KEYS));
    const innerWidth = parseRequiredNumber(getExcelVal(row, INNER_WIDTH_KEYS));
    const outerWidth = parseRequiredNumber(getExcelVal(row, OUTER_WIDTH_KEYS));
    const capacity = parseRequiredNumber(getExcelVal(row, CAPACITY_KEYS));
    const clearanceRaw = parseOptionalNumber(getExcelVal(row, CLEARANCE_KEYS));
    const maxLoadRaw = parseOptionalNumber(getExcelVal(row, MAX_LOAD_KEYS));
    const emptyWeightRaw = parseOptionalNumber(getExcelVal(row, EMPTY_WEIGHT_KEYS));
    const descriptionRaw = asTrimmedString(getExcelVal(row, DESCRIPTION_KEYS));

    const existing = drumCode ? findExisting(drumCode, input.existing) : null;
    const requireGeometry = !existing;
    (
      [
        ['Flange', flange],
        ['Barrel', barrel],
        ['Inner Width', innerWidth],
        ['Outer Width', outerWidth],
        ['Capacity', capacity],
      ] as const
    ).forEach(([field, parsed]) => {
      if (parsed.ok === true) {
        if (parsed.value <= 0) {
          errors.push({ field, code: 'INVALID_NUMBER', message: `${field} must be greater than zero.` });
        }
        return;
      }
      const reason = parsed.ok === false ? parsed.reason : 'BLANK';
      if (requireGeometry || reason === 'INVALID') {
        errors.push({
          field,
          code: reason === 'BLANK' ? 'REQUIRED' : 'INVALID_NUMBER',
          message:
            reason === 'BLANK'
              ? `${field} is required numeric. Blank is not stored as zero.`
              : `${field} must be numeric.`,
        });
      }
    });

    const checkOptional = (
      field: string,
      parsed: { value: number | null; invalid: boolean },
      allowZero: boolean
    ) => {
      if (parsed.invalid) {
        errors.push({ field, code: 'INVALID_NUMBER', message: `${field} must be numeric when provided.` });
      } else if (parsed.value != null && parsed.value < 0) {
        errors.push({ field, code: 'INVALID_NUMBER', message: `${field} cannot be negative.` });
      } else if (parsed.value != null && !allowZero && parsed.value <= 0) {
        errors.push({ field, code: 'INVALID_NUMBER', message: `${field} must be greater than zero when provided.` });
      }
    };
    checkOptional('Clearance Mm', clearanceRaw, false);
    checkOptional('Max Load Kg', maxLoadRaw, false);
    checkOptional('Empty Drum Net Weight Kg', emptyWeightRaw, true);

    if (errors.length || !drumCode) {
      return {
        rowNumber,
        drumCode: drumCode || '',
        status: 'ERROR',
        action: 'REJECT',
        existing,
        uploaded: null,
        changes: [],
        errors,
      };
    }

    const mergedFlange = flange.ok ? flange.value : existing!.flange;
    const mergedBarrel = barrel.ok ? barrel.value : existing!.barrel;
    const mergedInner = innerWidth.ok ? innerWidth.value : existing!.innerWidth;
    const mergedOuter = outerWidth.ok ? outerWidth.value : existing!.outerWidth;
    const mergedCapacity = capacity.ok ? capacity.value : existing!.capacity;

    if (mergedInner > mergedOuter) {
      errors.push({ field: 'Inner Width', code: 'INVALID', message: 'Inner Width is greater than Outer Width.' });
    }
    if (mergedBarrel >= mergedFlange) {
      errors.push({ field: 'Barrel', code: 'INVALID', message: 'Barrel is greater than or equal to Flange.' });
    }
    if (errors.length) {
      return {
        rowNumber,
        drumCode,
        status: 'ERROR',
        action: 'REJECT',
        existing,
        uploaded: null,
        changes: [],
        errors,
      };
    }

    const engineering = existing
      ? {
          clearanceMm: clearanceRaw.value != null ? clearanceRaw.value : existing.clearanceMm ?? null,
          maxWeight:
            maxLoadRaw.value != null
              ? maxLoadRaw.value
              : capacity.ok && existing.maxWeight != null && numEq(existing.maxWeight, existing.capacity)
                ? mergedCapacity
                : existing.maxWeight ?? null,
          emptyDrumNetWeightKg:
            emptyWeightRaw.value != null ? emptyWeightRaw.value : existing.emptyDrumNetWeightKg ?? null,
        }
      : resolveDrumEngineeringFields(mergedCapacity, {
          clearanceMm: clearanceRaw.value,
          maxLoadKg: maxLoadRaw.value,
          emptyDrumNetWeightKg: emptyWeightRaw.value,
        });

    // Explicit Description always wins. Generated text is used only when the cell is blank.
    const description =
      descriptionRaw ||
      existing?.description ||
      buildDrumDescription(mergedFlange, mergedBarrel, mergedInner, mergedOuter);

    const uploaded: DrumMasterRecord = {
      id: existing?.id || `drm-${drumCode}`,
      drumCode: existing?.drumCode || drumCode,
      drumType: existing?.drumType,
      description,
      flange: mergedFlange,
      barrel: mergedBarrel,
      barrelWidth: existing?.barrelWidth ?? null,
      innerWidth: mergedInner,
      outerWidth: mergedOuter,
      usableWidth: existing?.usableWidth ?? null,
      capacity: mergedCapacity,
      clearanceMm: engineering.clearanceMm,
      maxWeight: engineering.maxWeight,
      emptyDrumNetWeightKg: engineering.emptyDrumNetWeightKg,
      dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
      capacityUom: 'CONFIGURATION_REQUIRED',
      status: existing?.status || 'ACTIVE',
      sourceBatch: batchNumber,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const changes: DrumExcelFieldChange[] = [];
    if (existing) {
      for (const field of COMPARE_FIELDS) {
        const before = existing[field.key];
        const after = uploaded[field.key];
        const same =
          field.key === 'description' || field.key === 'drumCode'
            ? String(before || '') === String(after || '')
            : numEq(before, after);
        if (!same) {
          changes.push({
            field: field.label,
            existing: displayValue(before),
            uploaded: displayValue(after),
          });
        }
      }
    }

    if (!existing) {
      return {
        rowNumber,
        drumCode: uploaded.drumCode,
        status: 'NEW',
        action: 'INSERT',
        existing: null,
        uploaded,
        changes: [],
        errors: [],
      };
    }
    if (changes.length === 0) {
      return {
        rowNumber,
        drumCode: uploaded.drumCode,
        status: 'UNCHANGED',
        action: 'NONE',
        existing,
        uploaded,
        changes: [],
        errors: [],
      };
    }
    return {
      rowNumber,
      drumCode: uploaded.drumCode,
      status: 'UPDATE',
      action: 'UPDATE',
      existing,
      uploaded,
      changes,
      errors: [],
    };
  });
}

export function summarizeDrumExcelPreview(rows: DrumExcelPreviewRow[]) {
  return {
    totalRows: rows.length,
    newCount: rows.filter((row) => row.status === 'NEW').length,
    updateCount: rows.filter((row) => row.status === 'UPDATE').length,
    unchangedCount: rows.filter((row) => row.status === 'UNCHANGED').length,
    errorCount: rows.filter((row) => row.status === 'ERROR').length,
  };
}

export function committableDrumExcelRows(rows: DrumExcelPreviewRow[]): DrumExcelPreviewRow[] {
  return rows.filter((row) => row.status === 'NEW' || row.status === 'UPDATE');
}
