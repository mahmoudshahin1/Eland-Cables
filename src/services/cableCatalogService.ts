import { MasterCableCatalogItem } from '../types';
import { MASTER_CABLE_CATALOG } from '../data/mockData';
import * as XLSX from 'xlsx';

/** Non-authoritative compatibility mirror key (Task 04A). Prefer loadAuthoritativeCableCatalog. */
export const CABLE_CATALOG_STORAGE_KEY = 'energya_master_cable_catalog_v3';
const STORAGE_KEY = CABLE_CATALOG_STORAGE_KEY;

/**
 * Sync LS / mock catalog reader — NOT source of truth.
 * Use loadAuthoritativeCableCatalog / fetchMasterCables for governed reads.
 * MASTER_CABLE_CATALOG is a fixture fallback only when LS is empty (tests / offline).
 */
export const CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE = false;
export const CABLE_CATALOG_LS_CLASS = 'NON_AUTHORITATIVE_MIRROR' as const;

/**
 * Task 04B-6 caller inventory — saveCableCatalog (mirror only after PG success):
 * | Caller | Classification |
 * |--------|----------------|
 * | mirrorMasterDataToLocalStorage | Mirror after PG read/write |
 * | defaultImportStores.saveCables | Mirror after Import Center PG commit |
 * | ExcelCableUploadModal | BLOCKED — use persistCableCatalogRowsViaApi |
 * | technicalOfficeServiceV2 (Excel/TCR) | BLOCKED — use masterDataApiService |
 * | cableBomService.syncBomsToMasterCatalog | Removed — no cable master mutation from BOM LS |
 * | importPipelineService (memory stores) | In-memory test double only |
 */

// Initial sample items matching the exact user template
export const TEMPLATE_HEADERS = [
  'Customer Code',
  'Item Code',
  'Cable Material Number',
  'Cable Desc',
  'Total Cable Weight',
  'Cable Diameter',
];

export const TEMPLATE_SAMPLE_ROWS = [
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO117X101C0002',
    'Cable Material Number': '10009487',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 268.00,
    'Cable Diameter': 10.90,
  },
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO127X101C0002',
    'Cable Material Number': '10009488',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 1X25 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 374.00,
    'Cable Diameter': 12.40,
  },
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO137X101C0002',
    'Cable Material Number': '10009489',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 1X35 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 477.00,
    'Cable Diameter': 13.50,
  },
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO147X101C0002',
    'Cable Material Number': '10009490',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 1X50 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 612.00,
    'Cable Diameter': 15.00,
  },
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO157X101C0002',
    'Cable Material Number': '10009491',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 1X70 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 830.00,
    'Cable Diameter': 16.80,
  },
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO167X101C0002',
    'Cable Material Number': '10009492',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 1X95 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 1105.00,
    'Cable Diameter': 18.60,
  },
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO417X101C0002',
    'Cable Material Number': '10009493',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 4X16 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 985.00,
    'Cable Diameter': 20.20,
  },
  {
    'Customer Code': 'N2XH',
    'Item Code': 'ICO427X101C0002',
    'Cable Material Number': '10009494',
    'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 4X25 mm2 RMC IEC 60502-1',
    'Total Cable Weight': 1450.00,
    'Cable Diameter': 23.80,
  },
];

export function getStoredCableCatalog(): MasterCableCatalogItem[] {
  if (typeof window === 'undefined') return MASTER_CABLE_CATALOG;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Exclude any legacy demo cable codes
        const cleaned = parsed.filter(
          (p: any) =>
            !p.cableCode?.startsWith('ENG-MV') &&
            !p.cableCode?.startsWith('ENG-LV0') &&
            !p.cableCode?.startsWith('ENG-HV') &&
            !p.cableCode?.startsWith('ENG-CTRL') &&
            !p.cableCode?.startsWith('ENG-SOL')
        );
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch (e) {
    console.error('Error reading cable catalog from localStorage:', e);
  }
  return MASTER_CABLE_CATALOG;
}

/**
 * Mirror Cable Master to localStorage only after a successful PostgreSQL commit/read.
 * Authoritative cable mutations must use POST/PUT /api/master/cables (Task 04B-6).
 */
export function saveCableCatalog(
  items: MasterCableCatalogItem[],
  options?: { mirrorAfterPgSuccess?: boolean }
): void {
  if (!options?.mirrorAfterPgSuccess) {
    throw new Error(
      'Cable catalog must be committed to PostgreSQL first. energya_master_cable_catalog_v3 is NON_AUTHORITATIVE_MIRROR only.'
    );
  }
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('cableCatalogUpdated', { detail: items }));
  } catch (e) {
    console.error('Error saving cable catalog to localStorage:', e);
  }
}

export function resetCableCatalog(): MasterCableCatalogItem[] {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('cableCatalogUpdated', { detail: MASTER_CABLE_CATALOG }));
  }
  return MASTER_CABLE_CATALOG;
}

/**
 * Downloads the official Excel template (.xlsx) with the requested header
 */
export function downloadExcelTemplate(): void {
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS, {
    header: TEMPLATE_HEADERS,
  });

  // Set column widths
  ws['!cols'] = [
    { wch: 18 }, // Customer Code
    { wch: 20 }, // Item Code
    { wch: 24 }, // Cable Material Number
    { wch: 60 }, // Cable Desc
    { wch: 20 }, // Total Cable Weight
    { wch: 18 }, // Cable Diameter
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cable Master Template');

  XLSX.writeFile(wb, 'Energya_Cable_Upload_Template.xlsx');
}

/**
 * Downloads CSV template
 */
export function downloadCsvTemplate(): void {
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS, {
    header: TEMPLATE_HEADERS,
  });
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Energya_Cable_Upload_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse description to extract attributes if not explicitly specified
 */
export function parseCableDescription(desc: string): {
  voltageClass: 'LV' | 'MV' | 'HV' | 'Control' | 'Special';
  conductor: 'Copper' | 'Aluminum';
  cores: string;
  crossSectionMm2: number;
} {
  const d = desc.toLowerCase();
  
  // Conductor
  let conductor: 'Copper' | 'Aluminum' = 'Copper';
  if (d.includes('al') || d.includes('aluminum') || d.includes('aluminium') || d.includes('na2xs')) {
    conductor = 'Aluminum';
  }

  // Voltage Class
  let voltageClass: 'LV' | 'MV' | 'HV' | 'Control' | 'Special' = 'LV';
  const hasKvPair = /\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*kV/i.test(desc);
  const isLvPair = /0\.6\s*\/\s*1\s*kV/i.test(desc);
  if (d.includes('66kv') || d.includes('132kv') || d.includes('220kv') || d.includes('380kv') || d.includes('high voltage') || /\bhv\b/.test(d)) {
    voltageClass = 'HV';
  } else if (
    d.includes('33kv') ||
    d.includes('11kv') ||
    d.includes('22kv') ||
    d.includes('6.6kv') ||
    d.includes('medium voltage') ||
    d.includes('60502-2') ||
    (hasKvPair && !isLvPair)
  ) {
    voltageClass = 'MV';
  } else if (d.includes('control') || d.includes('instrumentation') || d.includes('signal')) {
    voltageClass = 'Control';
  }

  // Cores (e.g. 1X16, 3C, 3 Core, 4 Core, 1 Core, 1X50)
  let cores = '1C';
  const coreMatch = desc.match(/(\d+)\s*[xX]\s*(\d+)/i);
  if (coreMatch) {
    cores = `${coreMatch[1]}C`;
  } else if (d.includes('3 core') || d.includes('3c')) {
    cores = '3C';
  } else if (d.includes('4 core') || d.includes('4c')) {
    cores = '4C';
  } else if (d.includes('1 core') || d.includes('1c') || d.includes('single core')) {
    cores = '1C';
  }

  // Cross section
  let crossSectionMm2 = 50;
  if (coreMatch) {
    crossSectionMm2 = parseFloat(coreMatch[2]) || 50;
  } else {
    const sizeMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:mm2|mm²)/i);
    if (sizeMatch) {
      crossSectionMm2 = parseFloat(sizeMatch[1]) || 50;
    }
  }

  return { voltageClass, conductor, cores, crossSectionMm2 };
}
