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
