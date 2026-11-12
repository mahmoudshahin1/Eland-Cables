import { DrumMasterRecord } from '../types';
import {
  resolveInquiryLineDrumsQuantity,
  resolveInquiryLineTotalLengthMeters,
  type InquiryLineLengthInput,
} from '../services/commercialInquiryApiService';
import {
  findAllDrumMastersForInquiryLine,
  findDrumByCode,
  resolveDrumDescription,
} from '../services/drumMasterService';
import { parseInquiryDrumSchedule } from './inquiryDrumSchedule';

export interface InquiryDrumLineSummaryEntry {
  drumCode: string;
  description: string;
  drumCount?: number;
}

export interface InquiryDrumLineSummary {
  cableDescription: string;
  drumCount: number;
  drumEntries: InquiryDrumLineSummaryEntry[];
  totalLengthM: number;
}

export type InquiryDrumLineSummaryInput = InquiryLineLengthInput & {
  cableDescription: string;
  drumType?: string | null;
};

export function buildInquiryDrumLineSummary(
  line: InquiryDrumLineSummaryInput,
  drumMaster: DrumMasterRecord[]
): InquiryDrumLineSummary {
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  let drumEntries: InquiryDrumLineSummaryEntry[] = [];

  if (schedule?.rows?.length) {
    const byCode = new Map<string, number>();
    for (const row of schedule.rows) {
      const code = String(row.drumCode || '').trim();
      if (!code) continue;
      const drums = Number(row.noOfDrums) || 0;
      byCode.set(code, (byCode.get(code) ?? 0) + drums);
    }
    drumEntries = Array.from(byCode.entries()).map(([drumCode, drumCount]) => {
      const master = findDrumByCode(drumCode, drumMaster);
      return {
        drumCode,
        description: master ? resolveDrumDescription(master) : '',
        drumCount: drumCount > 0 ? drumCount : undefined,
      };
    });
  }

  if (!drumEntries.length) {
    const matched = findAllDrumMastersForInquiryLine(line.drumType, drumMaster);
    if (matched.length) {
      drumEntries = matched.map((drum) => ({
        drumCode: drum.drumCode,
        description: resolveDrumDescription(drum),
      }));
    } else if (line.drumType?.trim()) {
      drumEntries = [{ drumCode: line.drumType.trim(), description: '' }];
    }
  }

  return {
    cableDescription: line.cableDescription?.trim() || '—',
    drumCount: resolveInquiryLineDrumsQuantity(line),
    drumEntries,
    totalLengthM: resolveInquiryLineTotalLengthMeters(line),
  };
}

export function formatInquiryDrumLineSummaryEntry(entry: InquiryDrumLineSummaryEntry): string {
  const code = entry.drumCode.trim();
  const desc = entry.description.trim();
  if (!code) return '—';
  if (!desc || desc === code) return code;
  return `${code} — ${desc}`;
}

/** Cable-lines expression: `1 × 1,000m (EWD2600-K26) + 2 × 800m (EWD2200-39)`. */
export function formatInquiryDrumScheduleExpression(line: {
  drumSchedule?: unknown;
  drumType?: string | null;
  requestedQuantity?: number | string | null;
  cuttingLengthMeters?: number | string | null;
  requestedLengthMeters?: number | string | null;
}): string {
  const meters = (value: number) => Number(value).toLocaleString('en-GB');
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  if (schedule?.rows.length) {
    return schedule.rows
      .map((row) => `${row.noOfDrums} × ${meters(row.cuttingLengthM)}m (${row.drumCode})`)
      .join(' + ');
  }
  const drums = Number(line.requestedQuantity);
  const cutting = Number(line.cuttingLengthMeters);
  const total = Number(line.requestedLengthMeters);
  const length =
    Number.isFinite(cutting) && cutting > 0
      ? cutting
      : Number.isFinite(drums) && drums > 0 && Number.isFinite(total) && total > 0
        ? total / drums
        : null;
  const code = String(line.drumType || '').trim();
  if (Number.isFinite(drums) && drums > 0 && length != null && code) {
    return `${drums} × ${meters(length)}m (${code})`;
  }
  return code || '—';
}

export function formatInquiryDrumLineSummaryDrums(entries: InquiryDrumLineSummaryEntry[]): string {
  if (!entries.length) return 'Not selected';
  return entries
    .map((entry) => {
      const base = formatInquiryDrumLineSummaryEntry(entry);
      if (entry.drumCount != null && entries.length > 1) {
        return `${base} (${entry.drumCount})`;
      }
      return base;
    })
    .join(' · ');
}
