import { getPrisma } from '../server/db';
import { asTrimmedString, getExcelVal } from './excelFieldUtils';
import { getBomScrapLines, bulkUpdateBomScrap } from '../server/costingBomScrapRepository';

export const CABLE_SCRAP_TEMPLATE_HEADERS = [
  'Specification Code',
  'Item Code',
  'Cable Material Number',
  'Eland Item Number',
  'Cable Desc',
  'Total Cable Weight',
  'Cable Diameter',
  'Metal',
  'Family',
  'Qty(Meter)',
  'Scrap %',
] as const;

/** Canonical sheet names for the multi-sheet costing reference workbook. */
export const COSTING_WORKBOOK_SHEETS = {
  cableMaster: 'Cable_Master',
  cableBom: 'Cable_BOM',
  costingReference: 'Costing_Reference',
  /** @deprecated Legacy single-sheet name; still accepted on import. */
  legacyScrap: 'Cable Scrap Rates',
  instructions: 'Instructions',
} as const;

export const CABLE_MASTER_EXPORT_HEADERS = [
  'Specification Code',
  'Item Code',
  'Cable Material Number',
  'Eland Item Number',
  'Cable Description',
  'Total Cable Weight',
  'Cable Diameter',
  'Metal',
  'Family',
] as const;

export const CABLE_BOM_SCRAP_HEADERS = [
  'Cable Material Number',
  'Metal',
  'Family',
  'Scrap %',
] as const;

export const COSTING_REFERENCE_HEADERS = [
  'Cable Material Number',
  'Qty Meter',
  'Direct RM Cost EGP',
  'Direct RM Cost USD',
  'Direct RM Cost EUR',
  'Direct RM Cost GBP',
] as const;

export type CableScrapTemplateRow = {
  specificationCode: string;
  itemCode: string;
  cableMaterialNumber: string;
  elandItemNumber: string;
  cableDescription: string;
  totalCableWeight: number | null;
  cableDiameter: number | null;
  metal: string;
  family: string;
  qtyMeters: number;
  scrapPercent: number | null;
};

export type CableScrapImportPreviewRow = {
  rowNumber: number;
  cableMaterialNumber: string;
  scrapPercent: number | null;
  metal: string;
  family: string;
  status: 'VALID' | 'ERROR' | 'WARNING';
  bomLineCount: number;
  errors: Array<{ field: string; message: string; code: string }>;
  warnings: Array<{ field: string; message: string; code: string }>;
};

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export function deriveMetalFromConductor(conductor?: string | null): string {
  const value = (conductor || '').trim().toUpperCase();
  if (!value) return '';
  if (value.includes('AL') || value.includes('ALUMIN')) return 'AL';
  if (value.includes('CU') || value.includes('COPPER')) return 'CU';
  return value.slice(0, 2);
}

export function parseScrapPercentInput(
  value: unknown
): { ok: true; percent: number } | { ok: false; message: string } {
  if (value == null || value === '') {
    return { ok: false, message: 'Scrap % is required.' };
  }
  const raw = String(value).trim().replace(/%/g, '');
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    return { ok: false, message: 'Scrap % must be a valid number.' };
  }
  // Excel percent cells often arrive as 0.015 for 1.5%
  const percent = n > 0 && n < 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
  if (percent < 0) return { ok: false, message: 'Scrap % cannot be negative.' };
  if (percent >= 100) return { ok: false, message: 'Scrap % must be less than 100.' };
  return { ok: true, percent };
}

export function resolveScrapImportSheetName(sheetNames: string[]): string | null {
  const normalized = new Map(sheetNames.map((n) => [n.trim().toLowerCase(), n]));
  const pick = (...candidates: string[]) => {
    for (const c of candidates) {
      const hit = normalized.get(c.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };
  return (
    pick(COSTING_WORKBOOK_SHEETS.cableBom, COSTING_WORKBOOK_SHEETS.legacyScrap) ||
    sheetNames.find((n) => n.trim().toLowerCase() !== COSTING_WORKBOOK_SHEETS.instructions.toLowerCase()) ||
    null
  );
}

function normalizeFilterToken(value?: string | null): string {
  return (value || '').trim().toUpperCase();
}

function unifiedScrapPercent(lines: Array<{ scrapPercent: number | null }>): number | null {
  const values = lines.map((l) => l.scrapPercent).filter((p): p is number => p != null);
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((v) => v === first) ? first : null;
}

export async function listCableScrapTemplateRows(options?: {
  metal?: string;
  family?: string;
  search?: string;
}): Promise<CableScrapTemplateRow[]> {
  const prisma = requirePrisma();
  const metalFilter = normalizeFilterToken(options?.metal);
  const familyFilter = normalizeFilterToken(options?.family);
  const search = (options?.search || '').trim();

  const [governed, source] = await Promise.all([
    prisma.governedBomLine.findMany({
      where: { status: 'APPROVED' },
      select: { cableMaterialNumber: true },
      distinct: ['cableMaterialNumber'],
    }),
    prisma.cableBomLine.findMany({
      where: { status: 'ACTIVE' },
      select: { cableMaterialNumber: true },
      distinct: ['cableMaterialNumber'],
    }),
  ]);

  const materialNumbers = Array.from(
    new Set([...governed.map((g) => g.cableMaterialNumber), ...source.map((s) => s.cableMaterialNumber)])
  ).sort();

  if (materialNumbers.length === 0) return [];

  const cables = await prisma.cableMaster.findMany({
    where: {
      materialNumber: { in: materialNumbers },
      ...(search
        ? {
            OR: [
              { materialNumber: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { itemCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      engineeringMappings: {
        where: { isCurrent: true },
        take: 1,
      },
    },
    orderBy: [{ family: 'asc' }, { materialNumber: 'asc' }],
  });

  const rows: CableScrapTemplateRow[] = [];

  for (const cable of cables) {
    const mapping = cable.engineeringMappings[0];
    const family = mapping?.family || cable.family || '';
    const conductor = mapping?.conductor || cable.conductor || '';
    const metal = deriveMetalFromConductor(conductor);

    if (metalFilter && metalFilter !== 'ALL' && metal !== metalFilter) continue;
    if (familyFilter && familyFilter !== 'ALL' && normalizeFilterToken(family) !== familyFilter) continue;

    const bom = await getBomScrapLines(cable.materialNumber);
    const scrapPercent = unifiedScrapPercent(bom.lines);

    rows.push({
      specificationCode: cable.customerCode || '',
      itemCode: cable.itemCode || '',
      cableMaterialNumber: cable.materialNumber,
      elandItemNumber: cable.elandItemNumber || '',
      cableDescription: cable.description || '',
      totalCableWeight: cable.weight != null ? Number(cable.weight) : null,
      cableDiameter: cable.diameter != null ? Number(cable.diameter) : null,
      metal,
      family,
      qtyMeters: 1000,
      scrapPercent,
    });
  }

  return rows;
}

export function cableScrapTemplateRowToArray(row: CableScrapTemplateRow): (string | number)[] {
  return [
    row.specificationCode,
    row.itemCode,
    row.cableMaterialNumber,
    row.elandItemNumber,
    row.cableDescription,
    row.totalCableWeight != null ? row.totalCableWeight : '',
    row.cableDiameter != null ? row.cableDiameter : '',
    row.metal,
    row.family,
    row.qtyMeters,
    row.scrapPercent != null ? `${row.scrapPercent}%` : '',
  ];
}

export async function buildCableScrapTemplateWorkbook(options?: {
  metal?: string;
  family?: string;
  search?: string;
}): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const rows = await listCableScrapTemplateRows(options);

  const cableMasterData = [
    Array.from(CABLE_MASTER_EXPORT_HEADERS),
    ...rows.map((r) => [
      r.specificationCode,
      r.itemCode,
      r.cableMaterialNumber,
      r.elandItemNumber,
      r.cableDescription,
      r.totalCableWeight != null ? r.totalCableWeight : '',
      r.cableDiameter != null ? r.cableDiameter : '',
      r.metal,
      r.family,
    ]),
  ];
  const cableMasterSheet = XLSX.utils.aoa_to_sheet(cableMasterData);
  cableMasterSheet['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 48 },
    { wch: 16 },
    { wch: 14 },
    { wch: 8 },
    { wch: 8 },
  ];

  const cableBomData = [
    Array.from(CABLE_BOM_SCRAP_HEADERS),
    ...rows.map((r) => [
      r.cableMaterialNumber,
      r.metal,
      r.family,
      r.scrapPercent != null ? `${r.scrapPercent}%` : '',
    ]),
  ];
  const cableBomSheet = XLSX.utils.aoa_to_sheet(cableBomData);
  cableBomSheet['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];

  const costingRefData = [
    Array.from(COSTING_REFERENCE_HEADERS),
    ...rows.map((r) => [r.cableMaterialNumber, r.qtyMeters, '', '', '', '']),
  ];
  const costingRefSheet = XLSX.utils.aoa_to_sheet(costingRefData);
  costingRefSheet['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, cableMasterSheet, COSTING_WORKBOOK_SHEETS.cableMaster);
  XLSX.utils.book_append_sheet(wb, cableBomSheet, COSTING_WORKBOOK_SHEETS.cableBom);
  XLSX.utils.book_append_sheet(wb, costingRefSheet, COSTING_WORKBOOK_SHEETS.costingReference);
  const instructions = XLSX.utils.aoa_to_sheet([
    ['Costing Reference Workbook — Data Ownership'],
    [''],
    ['Sheet responsibilities'],
    ['Cable_Master', 'Reference only. Import cable identity via Import Center (Master Data → Import).'],
    ['Cable_BOM', 'Scrap % upload for Costing Configuration. Only Scrap % is imported.'],
    ['Costing_Reference', 'Validation targets only. Direct RM costs are never imported.'],
    [''],
    ['Scrap rules'],
    ['1. Cable Material Number is the primary key on Cable_BOM.'],
    ['2. Scrap % updates GovernedBomLine.scrapPercentage (all BOM lines for that cable).'],
    ['3. Scrap is not written to Cable Master and is not included in Direct RM Cost today.'],
    ['4. Enter Scrap % as 1.5 or 1.5%. Leave blank to skip a row.'],
  ]);
  XLSX.utils.book_append_sheet(wb, instructions, COSTING_WORKBOOK_SHEETS.instructions);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function previewCableScrapImport(
  rows: Record<string, unknown>[]
): Promise<{ rows: CableScrapImportPreviewRow[]; validCount: number; errorCount: number }> {
  const prisma = requirePrisma();
  const previewRows: CableScrapImportPreviewRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNumber = idx + 2;
    const errors: CableScrapImportPreviewRow['errors'] = [];
    const warnings: CableScrapImportPreviewRow['warnings'] = [];

    const materialNumber = asTrimmedString(
      getExcelVal(row, ['Cable Material Number', 'Material Number', 'CableMaterialNumber'])
    );
    const metal = normalizeFilterToken(
      asTrimmedString(getExcelVal(row, ['Metal', 'Conductor Metal']))
    );
    const family = asTrimmedString(getExcelVal(row, ['Family', 'Cable Family']));
    const scrapRaw = getExcelVal(row, ['Scrap %', 'Scrape %', 'Scrap', 'Scrape', 'Scrap Percent']);

    if (!materialNumber) {
      errors.push({ field: 'Cable Material Number', message: 'Cable Material Number is required.', code: 'REQUIRED' });
    }

    const scrapParsed = parseScrapPercentInput(scrapRaw);
    if (scrapParsed.ok === false) {
      if (scrapRaw == null || scrapRaw === '') {
        warnings.push({ field: 'Scrap %', message: 'Scrap % is blank — row will be skipped on commit.', code: 'SKIPPED' });
      } else {
        errors.push({ field: 'Scrap %', message: scrapParsed.message, code: 'INVALID_SCRAP_RATE' });
      }
    }

    let bomLineCount = 0;
    if (materialNumber) {
      const cable = await prisma.cableMaster.findUnique({
        where: { materialNumber },
        include: { engineeringMappings: { where: { isCurrent: true }, take: 1 } },
      });
      if (!cable) {
        errors.push({
          field: 'Cable Material Number',
          message: `Cable "${materialNumber}" was not found in Cable Master.`,
          code: 'CABLE_NOT_FOUND',
        });
      } else {
        const mapping = cable.engineeringMappings[0];
        const cableFamily = mapping?.family || cable.family || '';
        const cableMetal = deriveMetalFromConductor(mapping?.conductor || cable.conductor);

        if (metal && cableMetal && metal !== cableMetal) {
          errors.push({
            field: 'Metal',
            message: `Metal ${metal} does not match cable master (${cableMetal}).`,
            code: 'METAL_MISMATCH',
          });
        }
        if (family && cableFamily && normalizeFilterToken(family) !== normalizeFilterToken(cableFamily)) {
          errors.push({
            field: 'Family',
            message: `Family ${family} does not match cable master (${cableFamily}).`,
            code: 'FAMILY_MISMATCH',
          });
        }

        const bom = await getBomScrapLines(materialNumber);
        bomLineCount = bom.lines.length;
        if (bomLineCount === 0) {
          errors.push({
            field: 'Cable Material Number',
            message: `Cable "${materialNumber}" has no BOM lines to apply scrap.`,
            code: 'BOM_NOT_FOUND',
          });
        }
      }
    }

    const status: CableScrapImportPreviewRow['status'] =
      errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'VALID';
    if (status === 'VALID') validCount += 1;
    if (status === 'ERROR') errorCount += 1;

    previewRows.push({
      rowNumber,
      cableMaterialNumber: materialNumber,
      scrapPercent: scrapParsed.ok ? scrapParsed.percent : null,
      metal,
      family,
      status,
      bomLineCount,
      errors,
      warnings,
    });
  }

  return { rows: previewRows, validCount, errorCount };
}

export async function commitCableScrapImport(
  rows: Record<string, unknown>[],
  actor: { id?: string; name?: string; email?: string }
): Promise<{
  updatedCables: number;
  skippedRows: number;
  errors: Array<{ rowNumber: number; message: string; code: string }>;
}> {
  const preview = await previewCableScrapImport(rows);
  const errors: Array<{ rowNumber: number; message: string; code: string }> = [];
  let updatedCables = 0;
  let skippedRows = 0;

  for (const row of preview.rows) {
    if (row.status === 'ERROR') {
      errors.push({
        rowNumber: row.rowNumber,
        message: row.errors.map((e) => e.message).join(' '),
        code: row.errors[0]?.code || 'IMPORT_ERROR',
      });
      continue;
    }
    if (row.scrapPercent == null) {
      skippedRows += 1;
      continue;
    }

    const bom = await getBomScrapLines(row.cableMaterialNumber);
    if (bom.lines.length === 0) {
      errors.push({
        rowNumber: row.rowNumber,
        message: `No BOM lines for cable ${row.cableMaterialNumber}.`,
        code: 'BOM_NOT_FOUND',
      });
      continue;
    }

    await bulkUpdateBomScrap(
      row.cableMaterialNumber,
      bom.lines.map((line) => ({
        id: line.id,
        source: line.source,
        scrapPercent: row.scrapPercent,
      })),
      actor
    );
    updatedCables += 1;
  }

  return { updatedCables, skippedRows, errors };
}
