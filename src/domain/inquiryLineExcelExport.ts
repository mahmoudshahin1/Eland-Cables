import { parseInquiryDrumSchedule } from './inquiryDrumSchedule';

function text(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Authoritative cutting-length display for inquiry Excel export.
 * Multi-row drum schedules stay as separate lengths (1500 × 2; 1000 × 1; 2000 × 1)
 * and are never collapsed into a single total-metre value.
 */
export function formatInquiryCuttingLengthDisplay(line: {
  drumSchedule?: unknown;
  cuttingLengthMeters?: unknown;
  requestedQuantity?: unknown;
  requestedLengthMeters?: unknown;
}): string {
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  if (schedule?.rows.length) {
    return schedule.rows.map((row) => `${row.cuttingLengthM} × ${row.noOfDrums}`).join('; ');
  }
  const cutting = Number(line.cuttingLengthMeters);
  if (Number.isFinite(cutting) && cutting > 0) {
    const qty = Number(line.requestedQuantity);
    return `${cutting} × ${Number.isFinite(qty) && qty > 0 ? qty : 1}`;
  }
  return '';
}

export function formatInquiryDrumCodes(line: { drumSchedule?: unknown; drumType?: unknown }): string {
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  if (schedule?.rows.length) {
    return [...new Set(schedule.rows.map((row) => text(row.drumCode)).filter(Boolean))].join(', ');
  }
  return text(line.drumType);
}

export function formatInquiryDrumDescriptions(
  line: { drumSchedule?: unknown; drumType?: unknown },
  drumsByCode: Map<string, { description?: string | null }>
): string {
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  const codes = schedule?.rows.length
    ? [...new Set(schedule.rows.map((row) => text(row.drumCode)).filter(Boolean))]
    : [text(line.drumType)].filter(Boolean);
  return codes
    .map((code) => text(drumsByCode.get(code)?.description) || code)
    .filter(Boolean)
    .join(', ');
}

export function inquiryLineTotalLengthMeters(line: {
  drumSchedule?: unknown;
  cuttingLengthMeters?: unknown;
  requestedQuantity?: unknown;
  requestedLengthMeters?: unknown;
}): number | null {
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  if (schedule?.rows.length) {
    return schedule.rows.reduce((sum, row) => sum + row.cuttingLengthM * row.noOfDrums, 0);
  }
  const cutting = Number(line.cuttingLengthMeters);
  const qty = Number(line.requestedQuantity);
  if (Number.isFinite(cutting) && cutting > 0 && Number.isFinite(qty) && qty > 0) {
    return cutting * qty;
  }
  const total = Number(line.requestedLengthMeters);
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function expandInquiryDrumScheduleRows(line: {
  id?: string;
  lineNumber?: number;
  drumSchedule?: unknown;
  cuttingLengthMeters?: unknown;
  requestedQuantity?: unknown;
  drumType?: unknown;
}): Array<{ lineNumber: number | null; drumCode: string; noOfDrums: number; cuttingLengthM: number }> {
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  const lineNumber = line.lineNumber != null ? Number(line.lineNumber) : null;
  if (schedule?.rows.length) {
    return schedule.rows.map((row) => ({
      lineNumber,
      drumCode: row.drumCode,
      noOfDrums: row.noOfDrums,
      cuttingLengthM: row.cuttingLengthM,
    }));
  }
  const cutting = Number(line.cuttingLengthMeters);
  const qty = Number(line.requestedQuantity);
  if (Number.isFinite(cutting) && cutting > 0) {
    return [
      {
        lineNumber,
        drumCode: text(line.drumType),
        noOfDrums: Number.isFinite(qty) && qty > 0 ? qty : 1,
        cuttingLengthM: cutting,
      },
    ];
  }
  return [];
}

export const CUSTOMER_HIDDEN_INQUIRY_EXPORT_FIELDS = [
  'materialCost',
  'materialCostCurrency',
  'costingRunId',
  'costingCalculationId',
  'costingReadinessStatus',
] as const;
