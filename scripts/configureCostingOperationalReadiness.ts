/**
 * Operational costing readiness: classify RMs, approve existing draft prices,
 * configure workbook FX/scrap. Does not re-import Cable Master / BOM / RM codes.
 */
import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';
import { classifySuggestedRawMaterials } from '../src/server/masterDataRepository';
import { processPriceWorkflowAction } from '../src/server/governanceRepository';
import { normalizeCostingCurrency } from '../src/domain/currencyConversion';
import {
  activateCostingExchangeRate,
  approveCostingExchangeRate,
  createCostingExchangeRate,
  listCostingExchangeRates,
  submitCostingExchangeRate,
} from '../src/server/costingExchangeRateRepository';
import {
  activateCostingScrapRule,
  approveCostingScrapRule,
  createCostingScrapRule,
  listCostingScrapRules,
  submitCostingScrapRule,
} from '../src/server/costingScrapRuleRepository';

dotenv.config();

const ACTOR = { id: 'u-admin-1', name: 'costing-operational-readiness' };
const PRICE_CODES = ['HF27', 'HF30', 'CX05', 'ML04', 'TP01', 'XL08'];
const WORKBOOK_FX = [
  { fromCurrency: 'USD', toCurrency: 'LE', rate: 50.1649 },
  { fromCurrency: 'EUR', toCurrency: 'LE', rate: 58.4972 },
  { fromCurrency: 'GBP', toCurrency: 'LE', rate: 68.3145 },
];

async function counts(prisma: NonNullable<ReturnType<typeof getPrisma>>) {
  return {
    cables: await prisma.cableMaster.count(),
    bomLines: await prisma.cableBomLine.count(),
    rawMaterials: await prisma.rawMaterial.count(),
    prices: await prisma.rawMaterialPrice.count(),
    currencies: await prisma.costingCurrency.count(),
    exchangeRates: await prisma.costingExchangeRate.count(),
    scrapRules: await prisma.costingScrapRule.count(),
  };
}

async function activateFxPair(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  changes: unknown[]
) {
  const existing = await listCostingExchangeRates();
  const hit = existing.find(
    (r) =>
      normalizeCostingCurrency(r.fromCurrency) === fromCurrency &&
      normalizeCostingCurrency(r.toCurrency) === toCurrency
  );
  if (hit && (hit.workflowStatus === 'APPROVED' || hit.workflowStatus === 'ACTIVE')) {
    changes.push({
      entity: 'CostingExchangeRate',
      action: 'SKIP',
      code: hit.code,
      reason: `${fromCurrency}→${toCurrency} already ${hit.workflowStatus}`,
    });
    return;
  }
  let id = hit?.id;
  if (!id) {
    const created = await createCostingExchangeRate(
      {
        fromCurrency,
        toCurrency,
        rate,
        sourceReference: 'Energya Cable Master Data / costing workbook reference FX',
        changeNotes: 'Configured for costing operational readiness. Rate is workbook reference, not engine hard-code.',
      },
      ACTOR
    );
    id = created.id;
    changes.push({ entity: 'CostingExchangeRate', action: 'INSERT', code: created.code, rate });
  }
  const submitted = await submitCostingExchangeRate(id, ACTOR);
  const approved = await approveCostingExchangeRate(submitted.id, ACTOR);
  const activated = await activateCostingExchangeRate(approved.id, ACTOR);
  changes.push({ entity: 'CostingExchangeRate', action: 'ACTIVATE', code: activated.code, rate: Number(activated.rate) });
}

async function ensureScrap(changes: unknown[]) {
  const rules = await listCostingScrapRules();
  const family = (value: string) =>
    rules.find((r) => r.scopeType === 'FAMILY' && (r.scopeValue || '').toUpperCase() === value.toUpperCase());

  if (!family('CU L.V')) {
    const created = await createCostingScrapRule(
      {
        name: 'CU L.V scrap',
        scopeType: 'FAMILY',
        scopeValue: 'CU L.V',
        scrapRate: 0.015,
        sourceReference: 'Energya workbook CU L.V = 1.50%',
      },
      ACTOR
    );
    await submitCostingScrapRule(created.id, ACTOR);
    await approveCostingScrapRule(created.id, ACTOR);
    await activateCostingScrapRule(created.id, ACTOR);
    changes.push({ entity: 'CostingScrapRule', action: 'INSERT+ACTIVATE', code: created.code, scrapRate: 0.015 });
  } else {
    const existing = family('CU L.V')!;
    if (existing.workflowStatus !== 'ACTIVE' && existing.workflowStatus !== 'APPROVED') {
      if (existing.workflowStatus === 'DRAFT') await submitCostingScrapRule(existing.id, ACTOR);
      const current = await listCostingScrapRules();
      const row = current.find((r) => r.id === existing.id);
      if (row?.workflowStatus === 'SUBMITTED') await approveCostingScrapRule(existing.id, ACTOR);
      await activateCostingScrapRule(existing.id, ACTOR);
      changes.push({ entity: 'CostingScrapRule', action: 'ACTIVATE', code: existing.code });
    } else {
      changes.push({ entity: 'CostingScrapRule', action: 'SKIP', code: existing.code });
    }
  }

  for (const name of ['CU M.V', 'AL M.V']) {
    if (family(name)) {
      changes.push({ entity: 'CostingScrapRule', action: 'SKIP', scope: name, reason: 'under creation' });
      continue;
    }
    const created = await createCostingScrapRule(
      {
        name: `${name} scrap (under creation)`,
        scopeType: 'FAMILY',
        scopeValue: name,
        scrapRate: null,
        sourceReference: 'UNDER_CREATION — no business-approved percentage',
      },
      ACTOR
    );
    changes.push({ entity: 'CostingScrapRule', action: 'INSERT_DRAFT', code: created.code, scope: name });
  }
}

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured.');
  const before = await counts(prisma);
  const changes: unknown[] = [];

  const classified = await classifySuggestedRawMaterials(ACTOR, { onlyUnclassified: true });
  changes.push({ entity: 'RawMaterial', action: 'CLASSIFY', ...classified });

  for (const code of PRICE_CODES) {
    const approved = await prisma.rawMaterialPrice.findFirst({
      where: { rawMaterialCode: code, workflowStatus: 'APPROVED', isCurrent: true },
      orderBy: { createdAt: 'desc' },
    });
    if (approved) {
      changes.push({ entity: 'RawMaterialPrice', action: 'SKIP', code, reason: 'already APPROVED' });
      continue;
    }
    const draft = await prisma.rawMaterialPrice.findFirst({
      where: {
        rawMaterialCode: code,
        isCurrent: true,
        workflowStatus: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
      changes.push({ entity: 'RawMaterialPrice', action: 'MISSING_DRAFT', code });
      continue;
    }
    const normalized = normalizeCostingCurrency(draft.currency);
    if (normalized && normalized !== draft.currency) {
      await prisma.rawMaterialPrice.update({
        where: { id: draft.id },
        data: { currency: normalized },
      });
      changes.push({ entity: 'RawMaterialPrice', action: 'NORMALIZE_CURRENCY', code, from: draft.currency, to: normalized });
    }
    try {
      if (draft.workflowStatus === 'DRAFT') {
        await processPriceWorkflowAction(draft.id, 'SUBMIT', { comment: 'Operational readiness' }, ACTOR);
      }
      const afterSubmit = await prisma.rawMaterialPrice.findUnique({ where: { id: draft.id } });
      if (afterSubmit && afterSubmit.workflowStatus !== 'APPROVED') {
        await processPriceWorkflowAction(draft.id, 'APPROVE', { comment: 'Operational readiness' }, ACTOR);
      }
      changes.push({ entity: 'RawMaterialPrice', action: 'APPROVE', code, id: draft.id, price: Number(draft.price), currency: normalized || draft.currency });
    } catch (err) {
      changes.push({
        entity: 'RawMaterialPrice',
        action: 'ERROR',
        code,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const fx of WORKBOOK_FX) {
    try {
      await activateFxPair(fx.fromCurrency, fx.toCurrency, fx.rate, changes);
    } catch (err) {
      changes.push({
        entity: 'CostingExchangeRate',
        action: 'ERROR',
        pair: `${fx.fromCurrency}→${fx.toCurrency}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await ensureScrap(changes);

  const cable = await prisma.cableMaster.findUnique({ where: { materialNumber: '10009487' } });
  if (cable && !cable.family) {
    await prisma.cableMaster.update({
      where: { materialNumber: '10009487' },
      data: { family: 'CU L.V' },
    });
    changes.push({ entity: 'CableMaster', action: 'UPDATE', materialNumber: '10009487', family: 'CU L.V' });
  }

  const after = await counts(prisma);
  const copper = await prisma.rawMaterial.findMany({
    where: { pricingCategory: 'MARKET_METAL_COPPER' },
    select: { code: true, description: true, metalType: true, uom: true },
    orderBy: { code: 'asc' },
  });
  const aluminium = await prisma.rawMaterial.findMany({
    where: { pricingCategory: 'MARKET_METAL_ALUMINIUM' },
    select: { code: true, description: true, metalType: true, uom: true },
    orderBy: { code: 'asc' },
  });
  const bom10009487 = await prisma.cableBomLine.findMany({
    where: { cableMaterialNumber: '10009487' },
    select: { rawMaterialCode: true, consumption: true, uom: true },
    orderBy: { rawMaterialCode: 'asc' },
  });

  console.log(JSON.stringify({ before, after, changes, copper, aluminium, bom10009487 }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
