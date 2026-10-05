import * as XLSX from 'xlsx';

const SECRET_FIELD = /password|passwd|token|secret|jwt|session|hash|authorization|refresh/i;

export function isSecretExportField(name: string): boolean {
  return SECRET_FIELD.test(String(name || ''));
}

export function excelDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function excelNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function appendFrozenSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | Date | null>>
): void {
  if (headers.some((h) => isSecretExportField(h))) {
    throw new Error('Export refused: secret field in worksheet headers.');
  }
  const sheetName = name.slice(0, 31);
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const lastRow = Math.max(rows.length, 0);
  const lastCol = Math.max(headers.length - 1, 0);
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } }),
  };
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 14), 40) }));
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
}

export function createWorkbook(): XLSX.WorkBook {
  return XLSX.utils.book_new();
}

export function workbookToBuffer(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellDates: true }) as Buffer;
}

export function sendExcelResponse(
  res: { setHeader: (k: string, v: string) => void; send: (b: Buffer) => void },
  filename: string,
  buffer: Buffer
): void {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}
