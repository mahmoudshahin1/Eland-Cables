import { Prisma } from '@prisma/client';
import { getPrisma } from './db';

export const COSTING_SCRAP_SEQUENCE_PREFIX = 'SC';
export const COSTING_FORMULA_SEQUENCE_PREFIX = 'FM';
export const COSTING_FX_SEQUENCE_PREFIX = 'FX';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export function formatCostingDocumentCode(prefix: string, yearFull: number, serial: number): string {
  const yy = String(yearFull % 100).padStart(2, '0');
  return `${prefix.toUpperCase()}${yy}-${String(serial).padStart(5, '0')}`;
}

export function parseCostingDocumentCode(code: string): { prefix: string; year: number; serial: number } | null {
  const match = /^([A-Z]{2})(\d{2})-(\d{5})$/.exec(code.trim().toUpperCase());
  if (!match) return null;
  const yy = Number(match[2]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return { prefix: match[1], year, serial: Number(match[3]) };
}

export function isOfficialSequenceCode(code: string, prefix: string): boolean {
  const parsed = parseCostingDocumentCode(code);
  return parsed != null && parsed.prefix === prefix.toUpperCase();
}

type Tx = Prisma.TransactionClient;

async function maxExistingSerial(tx: Tx, prefix: string, yearFull: number): Promise<number> {
  const yy = String(yearFull % 100).padStart(2, '0');
  const p = prefix.toUpperCase();
  const startsWith = `${p}${yy}-`;
  const [scrap, formulas, fxRates] = await Promise.all([
    p === COSTING_SCRAP_SEQUENCE_PREFIX
      ? tx.costingScrapRule.findMany({
          where: { code: { startsWith } },
          select: { code: true },
        })
      : Promise.resolve([] as Array<{ code: string }>),
    p === COSTING_FORMULA_SEQUENCE_PREFIX
      ? tx.costingFormula.findMany({
          where: { code: { startsWith } },
          select: { code: true },
        })
      : Promise.resolve([] as Array<{ code: string }>),
    p === COSTING_FX_SEQUENCE_PREFIX
      ? tx.costingExchangeRate.findMany({
          where: { code: { startsWith } },
          select: { code: true },
        })
      : Promise.resolve([] as Array<{ code: string }>),
  ]);
  let max = 0;
  for (const row of [...scrap, ...formulas, ...fxRates]) {
    const parsed = parseCostingDocumentCode(row.code);
    if (parsed && parsed.prefix === prefix.toUpperCase() && parsed.year === yearFull) {
      max = Math.max(max, parsed.serial);
    }
  }
  return max;
}

export async function allocateNextCostingDocumentCode(prefix: string, now = new Date()): Promise<string> {
  const prisma = requirePrisma();
  const year = now.getFullYear();
  const p = prefix.toUpperCase();

  return prisma.$transaction(async (tx) => {
    const existingMax = await maxExistingSerial(tx, p, year);
    const current = await tx.costingDocumentSequence.findUnique({
      where: { prefix_year: { prefix: p, year } },
    });
    const baseline = Math.max(current?.lastSerial ?? 0, existingMax);
    const next = baseline + 1;
    await tx.costingDocumentSequence.upsert({
      where: { prefix_year: { prefix: p, year } },
      create: { prefix: p, year, lastSerial: next },
      update: { lastSerial: next },
    });
    return formatCostingDocumentCode(p, year, next);
  });
}

/** Keep sequence cursor at least as high as an already-accepted official code. */
export async function noteIssuedCostingDocumentCode(code: string): Promise<void> {
  const parsed = parseCostingDocumentCode(code);
  if (!parsed) return;
  const prisma = requirePrisma();
  const current = await prisma.costingDocumentSequence.findUnique({
    where: { prefix_year: { prefix: parsed.prefix, year: parsed.year } },
  });
  const lastSerial = Math.max(current?.lastSerial ?? 0, parsed.serial);
  await prisma.costingDocumentSequence.upsert({
    where: { prefix_year: { prefix: parsed.prefix, year: parsed.year } },
    create: { prefix: parsed.prefix, year: parsed.year, lastSerial },
    update: { lastSerial },
  });
}

export async function resolveScrapRuleCode(requested?: string | null): Promise<string> {
  const trimmed = (requested || '').trim().toUpperCase();
  if (!trimmed) {
    return allocateNextCostingDocumentCode(COSTING_SCRAP_SEQUENCE_PREFIX);
  }
  if (isOfficialSequenceCode(trimmed, COSTING_SCRAP_SEQUENCE_PREFIX)) {
    await noteIssuedCostingDocumentCode(trimmed);
    return trimmed;
  }
  return trimmed;
}

export async function resolveFormulaCode(requested?: string | null): Promise<string> {
  const trimmed = (requested || '').trim().toUpperCase();
  if (!trimmed) {
    return allocateNextCostingDocumentCode(COSTING_FORMULA_SEQUENCE_PREFIX);
  }
  if (isOfficialSequenceCode(trimmed, COSTING_FORMULA_SEQUENCE_PREFIX)) {
    await noteIssuedCostingDocumentCode(trimmed);
    return trimmed;
  }
  return trimmed;
}

export async function resolveExchangeRateCode(requested?: string | null): Promise<string> {
  const trimmed = (requested || '').trim().toUpperCase();
  if (!trimmed) {
    return allocateNextCostingDocumentCode(COSTING_FX_SEQUENCE_PREFIX);
  }
  if (isOfficialSequenceCode(trimmed, COSTING_FX_SEQUENCE_PREFIX)) {
    await noteIssuedCostingDocumentCode(trimmed);
    return trimmed;
  }
  return trimmed;
}
