export function sheetHasColumn(rows: Record<string, unknown>[], possibleKeys: string[]): boolean {
  if (!rows.length) return false;
  const keys = Object.keys(rows[0]).map((k) => k.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  return possibleKeys.some((target) => keys.includes(target.trim().toLowerCase().replace(/[^a-z0-9]/g, '')));
}

export function getExcelVal(row: Record<string, unknown>, possibleKeys: string[]): unknown {
  const keys = Object.keys(row);
  for (const key of keys) {
    const cleanedKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const target of possibleKeys) {
      const cleanedTarget = target.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanedKey === cleanedTarget) return row[key];
    }
  }
  return undefined;
}

export function asTrimmedString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function parseRequiredNumber(
  value: unknown
): { ok: true; value: number } | { ok: false; reason: 'BLANK' | 'INVALID' } {
  if (value === null || value === undefined || value === '') {
    return { ok: false, reason: 'BLANK' };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { ok: true, value };
  }
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return { ok: false, reason: 'BLANK' };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { ok: false, reason: 'INVALID' };
  return { ok: true, value: n };
}

/** Blank/absent → value null; invalid text → invalid flag (not an error by itself). */
export function parseOptionalNumber(value: unknown): { value: number | null; invalid: boolean } {
  const parsed = parseRequiredNumber(value);
  if (parsed.ok) return { value: parsed.value, invalid: false };
  if (parsed.ok === false && parsed.reason === 'BLANK') return { value: null, invalid: false };
  return { value: null, invalid: true };
}

export function nextBatchNumber(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `IMP-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
