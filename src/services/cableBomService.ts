import * as XLSX from 'xlsx';
import { CableBomRawMaterial, MasterCableCatalogItem } from '../types';
import { getStoredCableCatalog } from './cableCatalogService';

/** Non-authoritative mirror (Task 04A). Prefer loadAuthoritativeCableBoms. */
export const BOM_STORAGE_KEY = 'energya_cable_boms_v3';
export const BOM_LOCAL_IS_AUTHORITATIVE = false;
export const BOM_LS_CLASS = 'NON_AUTHORITATIVE_MIRROR' as const;

/**
 * Task 04B-9 caller inventory — saveCableBoms (mirror only after PG success):
 * | Caller | Classification |
 * |--------|----------------|
 * | mirrorMasterDataToLocalStorage | Mirror after PG read/write |
 * | defaultImportStores.saveBoms | Mirror after Import Center PG commit |
 * | ExcelBomUploadModal | BLOCKED — use persistCableBomsViaApi |
 * | TechnicalOffice onSuccess | Reload via loadAuthoritativeCableBoms |
 */

export const BOM_TEMPLATE_HEADERS = [
  'Customer Code',
  'Cable Material Number',
  'Raw Material',
  'Weight',
  'Unit/Km',
];

export const RAW_MATERIAL_DICTIONARY: Record<string, { name: string; category: string }> = {
  CR01: { name: 'Copper Rod / Wire (Conductor ETP 99.99%)', category: 'Conductor' },
  CU01: { name: 'Copper Conductor Wire Class 2', category: 'Conductor' },
  AL01: { name: 'Aluminum Rod 1350 EC Grade', category: 'Conductor' },
  AL02: { name: 'Aluminum Alloy 6201 Conductor', category: 'Conductor' },
  XL08: { name: 'XLPE Insulation Compound (90°C Crosslinked)', category: 'Insulation' },
  XL01: { name: 'XLPE Natural Medium Voltage Compound', category: 'Insulation' },
  CX05: { name: 'Crosslinking Catalyst / Additive Masterbatch', category: 'Chemical Additive' },
  TP01: { name: 'Binding Non-Hygroscopic Polyester / Mica Tape', category: 'Tapes & Fillers' },
  LH02: { name: 'LSHF Low Smoke Zero Halogen Sheathing Compound', category: 'Outer Sheath' },
  LH01: { name: 'LSHF Bedding Compound', category: 'Inner Sheath' },
  PV01: { name: 'PVC ST2 Outer Sheath Compound (UV Resistant)', category: 'Outer Sheath' },
  PV02: { name: 'Extruded PVC Bedding / Inner Sheath', category: 'Inner Sheath' },
  SW01: { name: 'Galvanized Round Steel Wire Armour (SWA)', category: 'Armour' },
  ST01: { name: 'Double Steel Tape Armour (STA)', category: 'Armour' },
  SC01: { name: 'Semi-Conductive Conductor Screen Compound', category: 'Screening' },
  SC02: { name: 'Semi-Conductive Insulation Screen Compound', category: 'Screening' },
  CU_SCR: { name: 'Copper Tape / Wire Metallic Screen', category: 'Screening' },
};

export const BOM_TEMPLATE_SAMPLE_ROWS = [
  // 1X16 mm2 N2XH (Exact matching user uploaded data)
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009487',
    'Raw Material': 'CR01',
    'Weight': 135.23,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009487',
    'Raw Material': 'XL08',
    'Weight': 11.92,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009487',
    'Raw Material': 'CX05',
    'Weight': 0.61,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009487',
    'Raw Material': 'TP01',
    'Weight': 0.50,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009487',
    'Raw Material': 'LH02',
    'Weight': 119.74,
    'Unit/Km': 'kg',
  },
  // 1X25 mm2 N2XH
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009488',
    'Raw Material': 'CR01',
    'Weight': 211.50,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009488',
    'Raw Material': 'XL08',
    'Weight': 14.80,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009488',
    'Raw Material': 'CX05',
    'Weight': 0.75,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009488',
    'Raw Material': 'TP01',
    'Weight': 0.55,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009488',
    'Raw Material': 'LH02',
    'Weight': 146.40,
    'Unit/Km': 'kg',
  },
  // 1X35 mm2 N2XH
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009489',
    'Raw Material': 'CR01',
    'Weight': 298.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009489',
    'Raw Material': 'XL08',
    'Weight': 16.50,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009489',
    'Raw Material': 'CX05',
    'Weight': 0.85,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009489',
    'Raw Material': 'TP01',
    'Weight': 0.60,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009489',
    'Raw Material': 'LH02',
    'Weight': 161.05,
    'Unit/Km': 'kg',
  },
  // 1X50 mm2 N2XH
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009490',
    'Raw Material': 'CR01',
    'Weight': 405.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009490',
    'Raw Material': 'XL08',
    'Weight': 21.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009490',
    'Raw Material': 'CX05',
    'Weight': 1.10,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009490',
    'Raw Material': 'TP01',
    'Weight': 0.70,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009490',
    'Raw Material': 'LH02',
    'Weight': 184.20,
    'Unit/Km': 'kg',
  },
  // 1X70 mm2 N2XH
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009491',
    'Raw Material': 'CR01',
    'Weight': 580.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009491',
    'Raw Material': 'XL08',
    'Weight': 24.50,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009491',
    'Raw Material': 'CX05',
    'Weight': 1.25,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009491',
    'Raw Material': 'TP01',
    'Weight': 0.80,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009491',
    'Raw Material': 'LH02',
    'Weight': 223.45,
    'Unit/Km': 'kg',
  },
  // 1X95 mm2 N2XH
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009492',
    'Raw Material': 'CR01',
    'Weight': 795.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009492',
    'Raw Material': 'XL08',
    'Weight': 29.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009492',
    'Raw Material': 'CX05',
    'Weight': 1.50,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009492',
    'Raw Material': 'TP01',
    'Weight': 0.90,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009492',
    'Raw Material': 'LH02',
    'Weight': 278.60,
    'Unit/Km': 'kg',
  },
  // 4X16 mm2 N2XH
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009493',
    'Raw Material': 'CR01',
    'Weight': 541.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009493',
    'Raw Material': 'XL08',
    'Weight': 47.68,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009493',
    'Raw Material': 'CX05',
    'Weight': 2.44,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009493',
    'Raw Material': 'TP01',
    'Weight': 1.80,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009493',
    'Raw Material': 'LH01',
    'Weight': 95.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009493',
    'Raw Material': 'LH02',
    'Weight': 297.08,
    'Unit/Km': 'kg',
  },
  // 4X25 mm2 N2XH
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009494',
    'Raw Material': 'CR01',
    'Weight': 846.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009494',
    'Raw Material': 'XL08',
    'Weight': 59.20,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009494',
    'Raw Material': 'CX05',
    'Weight': 3.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009494',
    'Raw Material': 'TP01',
    'Weight': 2.20,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009494',
    'Raw Material': 'LH01',
    'Weight': 140.00,
    'Unit/Km': 'kg',
  },
  {
    'Customer Code': 'N2XH',
    'Cable Material Number': '10009494',
    'Raw Material': 'LH02',
    'Weight': 399.60,
    'Unit/Km': 'kg',
  },
];

export function getStoredCableBoms(): CableBomRawMaterial[] {
  if (typeof window === 'undefined') return mapSampleRowsToBoms(BOM_TEMPLATE_SAMPLE_ROWS);
  try {
    const saved = localStorage.getItem(BOM_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Exclude legacy demo cable BOMs
        const cleaned = parsed.filter(
          (p: any) =>
            !p.cableMaterialNumber?.startsWith('ENG-MV') &&
            !p.cableMaterialNumber?.startsWith('ENG-LV0') &&
            !p.cableMaterialNumber?.startsWith('ENG-HV') &&
            !p.cableMaterialNumber?.startsWith('ENG-CTRL') &&
            !p.cableMaterialNumber?.startsWith('ENG-SOL')
        );
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch (e) {
    console.error('Error reading BOMs from localStorage:', e);
  }
  return mapSampleRowsToBoms(BOM_TEMPLATE_SAMPLE_ROWS);
}

/**
 * Mirror Cable BOM to localStorage only after a successful PostgreSQL commit/read.
 * Authoritative BOM mutations must use POST /api/master/boms/excel-commit or Import Center (Task 04B-9).
 */
export function saveCableBoms(
  boms: CableBomRawMaterial[],
  options?: { mirrorAfterPgSuccess?: boolean }
): void {
  if (!options?.mirrorAfterPgSuccess) {
    throw new Error(
      'Cable BOM must be committed to PostgreSQL first. energya_cable_boms_v3 is NON_AUTHORITATIVE_MIRROR only.'
    );
  }
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BOM_STORAGE_KEY, JSON.stringify(boms));
    
    // Also associate to master cable items
    syncBomsToMasterCatalog(boms);

    window.dispatchEvent(new CustomEvent('cableBomsUpdated', { detail: boms }));
  } catch (e) {
    console.error('Error saving BOMs to localStorage:', e);
  }
}

function mapSampleRowsToBoms(rows: typeof BOM_TEMPLATE_SAMPLE_ROWS): CableBomRawMaterial[] {
  return rows.map((r, index) => {
    const dict = RAW_MATERIAL_DICTIONARY[r['Raw Material'].toUpperCase()] || {
      name: `Raw Material ${r['Raw Material']}`,
      category: 'General Material',
    };
    return {
      id: `bom-item-${index + 1}`,
      customerCode: r['Customer Code'],
      cableMaterialNumber: r['Cable Material Number'],
      rawMaterial: r['Raw Material'],
      rawMaterialName: dict.name,
      weight: r['Weight'],
      unitKm: r['Unit/Km'] || 'kg',
    };
  });
}

/**
 * Associates BOM breakdown arrays with Master Cable Catalog items (in-memory only).
 * Task 04B-6: no Cable Master LS mutation — mirror updates come from PostgreSQL reload only.
 */
export function syncBomsToMasterCatalog(_boms: CableBomRawMaterial[]): void {
  // Intentionally no-op: BOM LS writes must not mutate Cable Master mirror directly.
}

/**
 * Downloads official BOM Excel Template (.xlsx)
 */
export function downloadBomExcelTemplate(): void {
  const ws = XLSX.utils.json_to_sheet(BOM_TEMPLATE_SAMPLE_ROWS, {
    header: BOM_TEMPLATE_HEADERS,
  });

  ws['!cols'] = [
    { wch: 18 }, // Customer Code
    { wch: 26 }, // Cable Material Number
    { wch: 18 }, // Raw Material
    { wch: 16 }, // Weight
    { wch: 14 }, // Unit/Km
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cable BOMs Template');

  XLSX.writeFile(wb, 'Energya_Cable_BOM_Upload_Template.xlsx');
}

/**
 * Downloads BOM CSV Template (.csv)
 */
export function downloadBomCsvTemplate(): void {
  const ws = XLSX.utils.json_to_sheet(BOM_TEMPLATE_SAMPLE_ROWS, {
    header: BOM_TEMPLATE_HEADERS,
  });
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Energya_Cable_BOM_Upload_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
