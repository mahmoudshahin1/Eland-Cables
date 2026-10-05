import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import {
  LmeExtractedRow,
  assertImportReadyToPublish,
  parseLmeOfficialPriceTable,
} from '../domain/lmeOfficialPriceImport';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { name?: string; email?: string; id?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

export async function createMarketMetalImport(
  input: { sourceFileName?: string; mimeType?: string; imageBase64?: string; tableText?: string },
  actor: { name?: string; email?: string; id?: string }
) {
  const prisma = requirePrisma();
  const extracted = input.tableText?.trim()
    ? parseLmeOfficialPriceTable(input.tableText)
    : { sheetDate: null, confidence: 'LOW' as const, rows: [] as LmeExtractedRow[] };
  const image = input.imageBase64 ? Buffer.from(input.imageBase64, 'base64') : null;
  const batch = await prisma.marketMetalImportBatch.create({
    data: {
      status: 'IN_REVIEW',
      sourceFileName: input.sourceFileName || null,
      mimeType: input.mimeType || null,
      image,
      extractedJson: extracted as unknown as Prisma.InputJsonValue,
      quoteDate: extracted.sheetDate ? new Date(extracted.sheetDate) : null,
      confidence: extracted.confidence,
      createdBy: actorLabel(actor),
      rows: {
        create: await rowsForExtract(extracted.rows),
      },
    },
    include: { rows: { include: { instrument: true } } },
  });
  return batch;
}

async function rowsForExtract(rows: LmeExtractedRow[]) {
  const prisma = requirePrisma();
  const instruments = await prisma.marketMetalInstrument.findMany();
  const byCode = new Map(instruments.map((row) => [row.code, row]));
  return rows.flatMap((row) => {
    const instrument = byCode.get(row.code);
    if (!instrument || !row.quoteDate) return [];
    return [{
      instrumentId: instrument.id,
      quoteDate: new Date(row.quoteDate),
      cashAsk: row.cashAsk,
      threeMonthAsk: row.threeMonthAsk,
      suspended: row.suspended,
      blankCash: row.blankCash,
      status: 'IN_REVIEW' as const,
      isCurrent: false,
    }];
  });
}

export async function listMarketMetalImports() {
  const prisma = requirePrisma();
  return prisma.marketMetalImportBatch.findMany({
    orderBy: { createdAt: 'desc' },
    include: { rows: { include: { instrument: true }, orderBy: { instrument: { sortOrder: 'asc' } } } },
    take: 20,
  });
}

export async function getMarketMetalImport(id: string) {
  const prisma = requirePrisma();
  return prisma.marketMetalImportBatch.findUnique({
    where: { id },
    include: { rows: { include: { instrument: true }, orderBy: { instrument: { sortOrder: 'asc' } } } },
  });
}

export async function correctMarketMetalImportRow(
  batchId: string,
  code: string,
  input: { cashAsk?: number | null; threeMonthAsk?: number | null; quoteDate?: string | null }
) {
  const prisma = requirePrisma();
  const batch = await getMarketMetalImport(batchId);
  if (!batch) {
    throw Object.assign(new Error('Import not found.'), { code: 'NOT_FOUND' });
  }
  if (batch.status === 'PUBLISHED') {
    throw Object.assign(new Error('Published imports are immutable.'), { code: 'BUSINESS_RULE_REQUIRED' });
  }
  const row = batch.rows.find((item) => item.instrument.code === code);
  if (!row) {
    throw Object.assign(new Error(`No extracted row for ${code}.`), { code: 'NOT_FOUND' });
  }
  return prisma.marketMetalPrice.update({
    where: { id: row.id },
    data: {
      cashAsk: input.cashAsk === undefined ? undefined : input.cashAsk,
      threeMonthAsk: input.threeMonthAsk === undefined ? undefined : input.threeMonthAsk,
      blankCash: input.cashAsk === null,
      quoteDate: input.quoteDate ? new Date(input.quoteDate) : undefined,
      status: 'IN_REVIEW',
    },
  });
}

export async function approveMarketMetalImport(id: string, actor: { name?: string; email?: string; id?: string }) {
  const prisma = requirePrisma();
  const batch = await getMarketMetalImport(id);
  if (!batch) throw Object.assign(new Error('Import not found.'), { code: 'NOT_FOUND' });
  if (batch.status === 'PUBLISHED') {
    throw Object.assign(new Error('Import is already published.'), { code: 'BUSINESS_RULE_REQUIRED' });
  }
  await prisma.marketMetalPrice.updateMany({
    where: { importBatchId: id },
    data: { status: 'APPROVED' },
  });
  return prisma.marketMetalImportBatch.update({
    where: { id },
    data: { status: 'APPROVED', approvedBy: actorLabel(actor), approvedAt: new Date() },
    include: { rows: { include: { instrument: true } } },
  });
}

export async function publishMarketMetalImport(id: string, actor: { name?: string; email?: string; id?: string }) {
  const prisma = requirePrisma();
  const batch = await getMarketMetalImport(id);
  if (!batch) throw Object.assign(new Error('Import not found.'), { code: 'NOT_FOUND' });
  assertImportReadyToPublish(batch.status);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const row of batch.rows) {
      if (row.instrument.costingUsage === 'CABLE_COPPER' || row.instrument.costingUsage === 'CABLE_ALUMINIUM') {
        if (row.cashAsk == null) {
          throw Object.assign(new Error(`${row.instrument.name} needs a cash ask before publish.`), {
            code: 'BUSINESS_RULE_REQUIRED',
          });
        }
      }
      await tx.marketMetalPrice.updateMany({
        where: { instrumentId: row.instrumentId, isCurrent: true, id: { not: row.id } },
        data: { isCurrent: false },
      });
      await tx.marketMetalPrice.update({
        where: { id: row.id },
        data: { status: 'PUBLISHED', isCurrent: true, publishedAt: now },
      });
    }
    await tx.marketMetalImportBatch.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedBy: actorLabel(actor), publishedAt: now },
    });
  });
  return getMarketMetalImport(id);
}
