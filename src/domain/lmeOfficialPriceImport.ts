/**
 * Deterministic parser for the known LME Official Prices table layout.
 * This is a test/review fixture parser, not a cloud OCR service.
 * Sample numbers belong in tests. They are not production seeds.
 */

export type MarketMetalCostingUsage = 'CABLE_COPPER' | 'CABLE_ALUMINIUM' | 'NONE';

export interface LmeInstrumentDef {
  code: string;
  name: string;
  costingUsage: MarketMetalCostingUsage;
  sortOrder: number;
}

export const LME_INSTRUMENTS: LmeInstrumentDef[] = [
  { code: 'COPPER', name: 'Copper', costingUsage: 'CABLE_COPPER', sortOrder: 1 },
  { code: 'ALUMINIUM', name: 'Aluminium', costingUsage: 'CABLE_ALUMINIUM', sortOrder: 2 },
  { code: 'NICKEL', name: 'Nickel', costingUsage: 'NONE', sortOrder: 3 },
  { code: 'ZINC', name: 'Zinc', costingUsage: 'NONE', sortOrder: 4 },
  { code: 'LEAD', name: 'Lead', costingUsage: 'NONE', sortOrder: 5 },
  { code: 'TIN', name: 'Tin', costingUsage: 'NONE', sortOrder: 6 },
  { code: 'AL_ALLOY', name: 'Al Alloy', costingUsage: 'NONE', sortOrder: 7 },
  { code: 'NASAAC', name: 'NASAAC', costingUsage: 'NONE', sortOrder: 8 },
  { code: 'COBALT', name: 'Cobalt', costingUsage: 'NONE', sortOrder: 9 },
  { code: 'MOLYBDENUM', name: 'Molybdenum', costingUsage: 'NONE', sortOrder: 10 },
  { code: 'US_ALUMINIUM_PREMIUM', name: 'US Aluminium Premium', costingUsage: 'NONE', sortOrder: 11 },
];

export interface LmeExtractedRow {
  code: string;
  name: string;
  costingUsage: MarketMetalCostingUsage;
  quoteDate: string | null;
  cashAsk: number | null;
  threeMonthAsk: number | null;
  suspended: boolean;
  blankCash: boolean;
  confidence: 'HIGH' | 'LOW';
}

export interface LmeExtractedSheet {
  sheetDate: string | null;
  confidence: 'HIGH' | 'LOW';
  rows: LmeExtractedRow[];
}

/** Known table text used by tests. Not written by seed. */
export const LME_OFFICIAL_FIXTURE_TEXT = [
  'LME Official Prices',
  '09 Sep 26 | Cash Ask | 3M Ask',
  'Copper (09 Sep 26) | 14672.00 | 14632.00',
  'Aluminium (09 Sep 26) | 3352.00 | 3338.00',
  'Nickel (09 Sep 26) | 16675.00 | 16830.00',
  'Zinc (09 Sep 26) | 4186.00 | 4036.00',
  'Lead (09 Sep 26) | 1871.00 | 1908.00',
  'Tin (09 Sep 26) | 55000.00 | 55150.00',
  'Al Alloy (09 Sep 26) | 3200.00 | 3200.00',
  'NASAAC (09 Sep 26) | 2750.00 | 2750.00',
  'Cobalt (09 Sep 26) | 43250.00 | 43690.00',
  'Molybdenum (Suspended) (08 Mar 19) | 26000.00 | 26000.00',
  'US Aluminium Premium (30 Sep 16) | |',
].join('\n');

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export function cableMetalsOnly(code: string): boolean {
  const usage = LME_INSTRUMENTS.find((row) => row.code === code)?.costingUsage;
  return usage === 'CABLE_COPPER' || usage === 'CABLE_ALUMINIUM';
}

function parseLmeDate(token: string): string | null {
  const match = token.trim().match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})/);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  const year = Number(match[3]) >= 70 ? `19${match[3]}` : `20${match[3]}`;
  return `${year}-${month}-${match[1].padStart(2, '0')}`;
}

function parseAmount(token: string | undefined): number | null {
  const raw = (token || '').trim();
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function instrumentForLabel(label: string): LmeInstrumentDef | null {
  const cleaned = label.replace(/\(suspended\)/i, '').replace(/\([^)]*\)/g, '').trim().toLowerCase();
  return (
    LME_INSTRUMENTS.find((row) => row.name.toLowerCase() === cleaned) ||
    LME_INSTRUMENTS.find((row) => cleaned.startsWith(row.name.toLowerCase())) ||
    null
  );
}

export function parseLmeOfficialPriceTable(text: string): LmeExtractedSheet {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sheetDate = parseLmeDate(lines.find((line) => /^\d{1,2}\s+[A-Za-z]{3}\s+\d{2}/.test(line)) || '');
  const rows: LmeExtractedRow[] = [];
  for (const line of lines) {
    if (/^lme official/i.test(line) || /cash ask/i.test(line)) continue;
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 2) continue;
    const label = parts[0];
    const instrument = instrumentForLabel(label);
    if (!instrument) continue;
    const dateInLabel = label.match(/\(([^)]+)\)\s*$/);
    const quoteDate = dateInLabel ? parseLmeDate(dateInLabel[1]) : sheetDate;
    const cashAsk = parseAmount(parts[1]);
    const threeMonthAsk = parseAmount(parts[2]);
    const suspended = /suspended/i.test(label);
    const blankCash = cashAsk == null;
    const low = blankCash || suspended || !quoteDate;
    rows.push({
      code: instrument.code,
      name: instrument.name,
      costingUsage: instrument.costingUsage,
      quoteDate,
      cashAsk,
      threeMonthAsk,
      suspended,
      blankCash,
      confidence: low ? 'LOW' : 'HIGH',
    });
  }
  const confidence = rows.length === LME_INSTRUMENTS.length && rows.every((row) => row.confidence === 'HIGH' || row.blankCash || row.suspended)
    ? rows.some((row) => row.confidence === 'LOW')
      ? 'LOW'
      : 'HIGH'
    : 'LOW';
  return { sheetDate, confidence, rows };
}

export function affectsCableCost(usage: MarketMetalCostingUsage): boolean {
  return usage === 'CABLE_COPPER' || usage === 'CABLE_ALUMINIUM';
}

export function assertImportReadyToPublish(status: string): void {
  if (status !== 'APPROVED') {
    throw Object.assign(new Error('Only an approved LME import can be published. Unapproved rows stay in review.'), {
      code: 'BUSINESS_RULE_REQUIRED',
    });
  }
}
