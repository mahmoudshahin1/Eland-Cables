/** Canonical codes and calendar-date helpers for B4-B Shipping Cost Master. */

export function canonicalizeCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function requireCanonicalCode(value: unknown, label: string): string {
  const code = canonicalizeCode(value);
  if (!code) {
    throw Object.assign(new Error(`${label} is required.`), { issueCode: 'INVALID_CODE' });
  }
  return code;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD from a Date using UTC calendar components. */
export function formatDateOnlyUtc(value: Date): string {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
}

/**
 * Parse a calendar date. Accepts YYYY-MM-DD (optionally with time suffix) or Date.
 * Returns YYYY-MM-DD or null. Does not invent a default as-of date.
 */
export function parseDateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnlyUtc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
    if (!match) return null;
    const iso = match[1];
    const [y, m, d] = iso.split('-').map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== m - 1 ||
      probe.getUTCDate() !== d
    ) {
      return null;
    }
    return iso;
  }
  return null;
}

/** Persist DATE columns as UTC midnight of the calendar day. */
export function dateOnlyToUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function canonicalizeCountryCode(value: unknown): string | null {
  const code = canonicalizeCode(value);
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

/** Inclusive/inclusive overlap. Null end = open-ended. */
export function dateRangesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null
): boolean {
  const aEnd = aTo ?? '9999-12-31';
  const bEnd = bTo ?? '9999-12-31';
  return aFrom <= bEnd && bFrom <= aEnd;
}

/** Inclusive/inclusive coverage. Null end = open-ended. */
export function dateCovers(asOfDate: string, effectiveFrom: string, effectiveTo: string | null): boolean {
  return effectiveFrom <= asOfDate && (effectiveTo === null || asOfDate <= effectiveTo);
}
