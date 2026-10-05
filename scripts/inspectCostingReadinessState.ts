import dotenv from 'dotenv';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { disconnectPrisma, getPrisma } from '../src/server/db';

dotenv.config();

const CODES = ['HF27', 'HF30', 'CX05', 'ML04', 'TP01', 'XL08', 'CR01', 'A-ECAP10'];
const CABLE = '10009487';

function inspectWorkbook(filePath: string) {
  if (!fs.existsSync(filePath)) return { missing: true, filePath };
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  const sheets = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' });
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const related = rows.filter((r) =>
      JSON.stringify(r).toUpperCase().includes(CABLE) ||
      CODES.some((c) => JSON.stringify(r).toUpperCase().includes(c))
    );
    return { name, rowCount: rows.length, headers, sampleRelated: related.slice(0, 12) };
  });
  return { filePath, sheets };
}

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('no db');

  const counts = {
    cables: await prisma.cableMaster.count(),
    boms: await prisma.cableBomLine.count(),
    governedBoms: await prisma.governedBomLine.count(),
    rms: await prisma.rawMaterial.count(),
    prices: await prisma.rawMaterialPrice.count(),
    currencies: await prisma.costingCurrency.count(),
    fx: await prisma.costingExchangeRate.count(),
    scrap: await prisma.costingScrapRule.count(),
  };

  const cable = await prisma.cableMaster.findUnique({
    where: { materialNumber: CABLE },
    select: { materialNumber: true, description: true, family: true, diameter: true, weight: true, status: true },
  });
  const bom = await prisma.cableBomLine.findMany({
    where: { cableMaterialNumber: CABLE },
    select: { rawMaterialCode: true, consumption: true, uom: true, scrap: true, status: true },
    orderBy: { rawMaterialCode: 'asc' },
  });
  const classifications = await prisma.rawMaterial.findMany({
    select: { code: true, description: true, uom: true, pricingCategory: true, metalType: true },
    orderBy: { code: 'asc' },
  });
  const prices = await prisma.rawMaterialPrice.findMany({
    where: { rawMaterialCode: { in: CODES } },
    select: {
      id: true,
      rawMaterialCode: true,
      price: true,
      currency: true,
      uom: true,
      workflowStatus: true,
      isCurrent: true,
      status: true,
      effectiveFrom: true,
    },
    orderBy: [{ rawMaterialCode: 'asc' }, { createdAt: 'desc' }],
  });
  const fx = await prisma.costingExchangeRate.findMany({
    where: { isCurrent: true },
    select: {
      code: true,
      fromCurrency: true,
      toCurrency: true,
      rate: true,
      workflowStatus: true,
      status: true,
      effectiveFrom: true,
    },
  });
  const scrap = await prisma.costingScrapRule.findMany({
    where: { isCurrent: true },
    select: {
      code: true,
      name: true,
      scopeType: true,
      scopeValue: true,
      scrapRate: true,
      workflowStatus: true,
      status: true,
    },
  });
  const currencies = await prisma.costingCurrency.findMany({
    select: { code: true, name: true, isBaseCurrency: true, status: true },
  });

  const workbook = inspectWorkbook('data/source/Energya Cable Master Data.xlsx');

  console.log(
    JSON.stringify(
      { counts, cable, bom, classifications, prices, fx, scrap, currencies, workbook },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
