import * as XLSX from 'xlsx';

import { DrumMasterRecord } from '../types';

/** Non-authoritative mirror (Task 04A). Prefer loadAuthoritativeDrums / drum API. */
export const DRUM_MASTER_STORAGE_KEY = 'energya_drum_master_v1';
const STORAGE_KEY = DRUM_MASTER_STORAGE_KEY;
export const DRUM_MASTER_LOCAL_IS_AUTHORITATIVE = false;
export const DRUM_MASTER_LS_CLASS = 'NON_AUTHORITATIVE_MIRROR';

/** TO default flange clearance (mm) when blank/absent on import or create. */
export const DRUM_DEFAULT_CLEARANCE_MM = 50;

export type DrumEngineeringWarning = {
  field: string;
  code: string;
  message: string;
};

/** Apply frozen TO engineering defaults: Clearance=50, MaxLoad=Capacity when absent. */
export function resolveDrumEngineeringFields(
  capacity: number,
  input: {
    clearanceMm?: number | null;
    maxLoadKg?: number | null;
    emptyDrumNetWeightKg?: number | null;
  }
): {
  clearanceMm: number;
  maxWeight: number;
  emptyDrumNetWeightKg: number | null;
  warnings: DrumEngineeringWarning[];
} {
  const warnings: DrumEngineeringWarning[] = [];
  let clearanceMm = input.clearanceMm;
  if (clearanceMm == null || !Number.isFinite(clearanceMm)) {
    clearanceMm = DRUM_DEFAULT_CLEARANCE_MM;
    warnings.push({
      field: 'Clearance Mm',
      code: 'DEFAULT_APPLIED',
      message: 'Clearance Mm defaulted to 50 mm (TO rule).',
    });
  }
  let maxWeight = input.maxLoadKg;
  if (maxWeight == null || !Number.isFinite(maxWeight)) {
    maxWeight = capacity;
    warnings.push({
      field: 'Max Load Kg',
      code: 'DEFAULT_APPLIED',
      message: 'MaxLoad set from Capacity (TO rule).',
    });
  }
  const emptyDrumNetWeightKg =
    input.emptyDrumNetWeightKg != null && Number.isFinite(input.emptyDrumNetWeightKg)
      ? input.emptyDrumNetWeightKg
      : null;
  return { clearanceMm, maxWeight, emptyDrumNetWeightKg, warnings };
}



export const DRUM_TEMPLATE_HEADERS = [

  'Drum Code',

  'Flange',

  'Barrel',

  'Inner Width',

  'Outer Width',

  'Capacity',

  /** TO default 50 mm when blank/absent (2026-09-01). */
  'Clearance Mm',

  /** MaxLoad = permitted cable payload (kg). TO rule: blank/absent → use Capacity. */
  'Max Load Kg',

  /** Logistics tare only — never required for technical suitability. */
  'Empty Drum Net Weight Kg',

  'Description',

] as const;



export const DRUM_TEMPLATE_SAMPLE_ROWS: Record<string, string | number>[] = [

  {

    'Drum Code': 'EWD630-0',

    Flange: 630,

    Barrel: 300,

    'Inner Width': 600,

    'Outer Width': 760,

    Capacity: 650,

    'Clearance Mm': '',

    'Max Load Kg': '',

    'Empty Drum Net Weight Kg': '',

    Description: 'Wooden Drum F630 x B300 x 600 x 760',

  },

  {

    'Drum Code': 'EWD630-T06',

    Flange: 630,

    Barrel: 315,

    'Inner Width': 335,

    'Outer Width': 403,

    Capacity: 650,

    'Clearance Mm': '',

    'Max Load Kg': '',

    'Empty Drum Net Weight Kg': '',

    Description: 'Wooden Drum F630 x B315 x 335 x 403',

  },

  {

    'Drum Code': 'EWD700-3',

    Flange: 700,

    Barrel: 400,

    'Inner Width': 600,

    'Outer Width': 760,

    Capacity: 650,

    'Clearance Mm': '',

    'Max Load Kg': '',

    'Empty Drum Net Weight Kg': '',

    Description: 'Wooden Drum F700 x B400 x 600 x 760',

  },

];



export function buildDrumDescription(

  flange: number,

  barrel: number,

  innerWidth: number,

  outerWidth: number,

  prefix = 'Wooden Drum'

): string {

  return `${prefix} F${flange} x B${barrel} x ${innerWidth} x ${outerWidth}`;

}



export function resolveDrumDescription(drum: DrumMasterRecord): string {

  const stored = (drum.description || '').trim();

  if (stored) return stored;

  return buildDrumDescription(drum.flange, drum.barrel, drum.innerWidth, drum.outerWidth);

}

/** Cable weight (kg) for one drum at cutting length: (m / 1000) × approx weight (kg/km). */
export function cableWeightKgFromCuttingLength(cuttingLengthM: number, approxWeightKgKm: number): number {
  if (!Number.isFinite(cuttingLengthM) || cuttingLengthM <= 0) return 0;
  if (!Number.isFinite(approxWeightKgKm) || approxWeightKgKm <= 0) return 0;
  return (cuttingLengthM / 1000) * approxWeightKgKm;
}

/** Drum capacity % = (cable weight kg / drum capacity kg) × 100. */
export function drumCapacityFillPercent(cableWeightKg: number, drumCapacityKg: number): number | null {
  if (!Number.isFinite(cableWeightKg) || cableWeightKg <= 0) return null;
  if (!Number.isFinite(drumCapacityKg) || drumCapacityKg <= 0) return null;
  return Math.min(100, Math.round((cableWeightKg / drumCapacityKg) * 100));
}



export function downloadDrumExcelTemplate(): void {

  const ws = XLSX.utils.json_to_sheet(DRUM_TEMPLATE_SAMPLE_ROWS, {

    header: [...DRUM_TEMPLATE_HEADERS],

  });



  ws['!cols'] = [

    { wch: 14 },

    { wch: 10 },

    { wch: 10 },

    { wch: 12 },

    { wch: 12 },

    { wch: 10 },

    { wch: 14 },

    { wch: 14 },

    { wch: 24 },

    { wch: 42 },

  ];



  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, 'Drum Master Template');

  XLSX.writeFile(wb, 'Energya_Drum_Master_Upload_Template.xlsx');

}



export function downloadDrumCsvTemplate(): void {

  const ws = XLSX.utils.json_to_sheet(DRUM_TEMPLATE_SAMPLE_ROWS, {

    header: [...DRUM_TEMPLATE_HEADERS],

  });

  const csv = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');

  link.href = url;

  link.download = 'Energya_Drum_Master_Upload_Template.csv';

  link.click();

  URL.revokeObjectURL(url);

}



export function getStoredDrumMaster(): DrumMasterRecord[] {

  if (typeof window === 'undefined') return [];

  try {

    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];

  } catch {

    return [];

  }

}



/**
 * Mirror Drum Master to localStorage only after a successful PostgreSQL commit/read.
 * Authoritative drum mutations must use drum API routes (Task 04B-11).
 */
export function saveDrumMaster(
  records: DrumMasterRecord[],
  options?: { mirrorAfterPgSuccess?: boolean }
): void {
  if (!options?.mirrorAfterPgSuccess) {
    throw new Error(
      'Drum Master must be committed to PostgreSQL first. energya_drum_master_v1 is NON_AUTHORITATIVE_MIRROR only.'
    );
  }
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent('drumMasterUpdated', { detail: records }));
}



export function getActiveDrumMaster(records?: DrumMasterRecord[]): DrumMasterRecord[] {

  const list = records ?? getStoredDrumMaster();

  return list.filter((d) => d.status === 'ACTIVE');

}



function findExactDrumMaster(

  value: string,

  records: DrumMasterRecord[]

): DrumMasterRecord | null {

  const upper = value.toUpperCase();

  const byCode = records.find((d) => d.drumCode.toUpperCase() === upper);

  if (byCode) return byCode;

  return records.find((d) => (d.drumType || '').trim().toUpperCase() === upper) || null;

}



/** Resolve an inquiry line drum value (code or type name) to Drum Master. Never invents dimensions. */

export function findDrumMasterForInquiryLine(

  drumValue: string | null | undefined,

  records: DrumMasterRecord[]

): DrumMasterRecord | null {

  const value = (drumValue || '').trim();

  if (!value || !records.length) return null;

  const exact = findExactDrumMaster(value, records);

  if (exact) return exact;

  const upper = value.toUpperCase();

  const contains = records.find(

    (d) =>

      d.drumCode.toUpperCase().includes(upper) ||

      (d.drumType || '').toUpperCase().includes(upper) ||

      resolveDrumDescription(d).toUpperCase().includes(upper) ||

      upper.includes(d.drumCode.toUpperCase())

  );

  return contains || null;

}



/** Resolve every drum code/type on a line (supports "EWD630-0 + EWD700-3"). */

export function findAllDrumMastersForInquiryLine(

  drumValue: string | null | undefined,

  records: DrumMasterRecord[]

): DrumMasterRecord[] {

  const value = (drumValue || '').trim();

  if (!value || !records.length) return [];

  const parts = value

    .split(/\s*\+\s*|\s*,\s*/)

    .map((part) => part.trim())

    .filter(Boolean);

  const found: DrumMasterRecord[] = [];

  const seen = new Set<string>();

  for (const part of parts) {

    const drum = findExactDrumMaster(part, records) || findDrumMasterForInquiryLine(part, records);

    if (drum && !seen.has(drum.drumCode)) {

      seen.add(drum.drumCode);

      found.push(drum);

    }

  }

  if (!found.length) {

    const one = findDrumMasterForInquiryLine(value, records);

    if (one) found.push(one);

  }

  return found;

}



export function findDrumByCode(

  drumCode: string,

  records?: DrumMasterRecord[]

): DrumMasterRecord | undefined {

  const code = drumCode.trim().toUpperCase();

  if (!code) return undefined;

  return (records ?? getStoredDrumMaster()).find((d) => d.drumCode.toUpperCase() === code);

}



/** @deprecated Use deactivateDrumViaApi / setDrumStatusViaApi — LS-only writes are blocked (04B-11). */
export function deactivateDrum(drumCode: string): DrumMasterRecord[] {
  void drumCode;
  throw new Error(
    'Drum status must be changed via PostgreSQL API (PUT /api/master/drums/:code). energya_drum_master_v1 is NON_AUTHORITATIVE_MIRROR only.'
  );
}


