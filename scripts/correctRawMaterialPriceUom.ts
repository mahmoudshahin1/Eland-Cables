/**
 * Relabels operational list prices that were stored as kg but are MT economics.
 * Does not insert or approve new price rows. Marks synthetic FX as TEST/LEGACY.
 */
import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';
import { priceBasisFromPriceUom } from '../src/domain/priceUom';
import { isSyntheticCostingRawMaterialCode } from '../src/server/governanceRepository';

dotenv.config();

const EXPLICIT_MT_CODES = new Set(['HF27', 'HF30', 'CX05', 'ML04', 'TP01', 'XL08']);

function looksLikeMetricTonListPrice(code: string, price: number | null, uom: string | null): boolean {
  if (price == null || !Number.isFinite(price) || price < 100) return false;
  const u = (uom || '').toLowerCase();
  if (u === 'mt' || u === 'ton' || u === 'tonne' || u === 't') return false;
  if (u !== 'kg' && u !== 'kgs' && u !== '') return false;
  if (isSyntheticCostingRawMaterialCode(code)) return false;
  if (EXPLICIT_MT_CODES.has(code.toUpperCase())) return true;
  return /^[A-Z]{1,3}\d{2}/.test(code.toUpperCase());
}

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured.');

  const prices = await prisma.rawMaterialPrice.findMany({
    where: { isCurrent: true, workflowStatus: 'APPROVED' },
  });

  const relabeled = [];
  for (const row of prices) {
    const code = row.rawMaterialCode;
    const price = row.price != null ? Number(row.price) : null;
    if (!looksLikeMetricTonListPrice(code, price, row.uom)) continue;
    const updated = await prisma.rawMaterialPrice.update({
      where: { id: row.id },
      data: {
        uom: 'MT',
        priceBasis: priceBasisFromPriceUom('MT'),
      },
    });
    relabeled.push({
      id: updated.id,
      rawMaterialCode: updated.rawMaterialCode,
      price: Number(updated.price),
      previousUom: row.uom,
      uom: updated.uom,
      priceBasis: updated.priceBasis,
    });
  }

  const fxAll = await prisma.costingExchangeRate.findMany();
  const fxMarked = [];
  for (const row of fxAll) {
    const rate = Number(row.rate);
    const isSynthetic =
      row.code === 'I13F-FX-EGP-USD' ||
      rate === 0.02 ||
      (row.sourceReference || '').includes('TEST / LEGACY');
    if (!isSynthetic) continue;
    if (row.status === 'INACTIVE' && (row.sourceReference || '').includes('TEST / LEGACY')) {
      fxMarked.push({ id: row.id, code: row.code, status: row.status, skipped: true });
      continue;
    }
    const updated = await prisma.costingExchangeRate.update({
      where: { id: row.id },
      data: {
        status: 'INACTIVE',
        sourceReference: 'TEST / LEGACY — synthetic increment-13 rate 0.02; do not use in production costing.',
        changeNotes: row.changeNotes
          ? `${row.changeNotes} | TEST / LEGACY`
          : 'TEST / LEGACY — deactivated so production costing uses governed USD/LE, EUR/LE, GBP/LE.',
      },
    });
    fxMarked.push({
      id: updated.id,
      code: updated.code,
      status: updated.status,
      sourceReference: updated.sourceReference,
    });
  }

  console.log(
    JSON.stringify(
      {
        relabeledCount: relabeled.length,
        relabeled,
        fxInventory: fxAll.map((r) => ({
          code: r.code,
          from: r.fromCurrency,
          to: r.toCurrency,
          rate: Number(r.rate),
          status: r.status,
          workflowStatus: r.workflowStatus,
        })),
        fxMarked,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
