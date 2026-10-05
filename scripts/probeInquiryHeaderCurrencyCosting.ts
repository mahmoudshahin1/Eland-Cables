/**
 * Live costing probe: cable 10009487 × 1000 m across inquiry currencies,
 * copper header override, then ENERGYA_COSTING_PROBE_CABLES.
 */
import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';
import { executeCostingForInquiryLine } from '../src/server/costingOrchestrationService';
import { ENERGYA_COSTING_PROBE_CABLES } from '../src/server/costingReadinessService';
import { buildCostingRequestFromPreviewPayload } from '../src/services/costingRequestService';

dotenv.config();

const COPPER_USD_MT = 14600;
const COPPER_USD_MT_ALT = 16000;
const ALUMINIUM_USD_MT = 3300;
const HEADER_CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP'] as const;

const WORKBOOK_10009487: Record<string, number> = {
  LE: 128979.24511253499,
  EGP: 128979.24511253499,
  USD: 2571.1053966525396,
  EUR: 2204.8789533949484,
  GBP: 1888.0215051348544,
};

function summarize(preview: Awaited<ReturnType<typeof executeCostingForInquiryLine>>) {
  const trace = (preview.materialBreakdown || []).map((line) => ({
    rawMaterial: line.rawMaterialCode,
    consumption: line.baseConsumptionPerKm,
    uom: line.consumptionUom,
    appliedUnitPrice: line.unitPrice,
    priceCurrency: line.priceCurrency,
    pricingSource: line.pricingSource,
    metalType: line.metalType,
    baseCost: line.originalLineCost ?? line.lineCost,
    fxRate: line.fxRate,
    transactionCurrency: preview.resultCurrency,
    finalLineCost: line.lineCost,
  }));
  return {
    status: preview.status,
    errorCode: preview.errorCode,
    blockingReasons: preview.blockingReasons,
    requestCurrency: preview.currency,
    resultCurrency: preview.resultCurrency,
    materialCost: preview.totals?.materialCost,
    lineTotal: preview.totals?.lineTotal,
    breakdownCount: preview.materialBreakdown?.length || 0,
    trace,
  };
}

async function runOne(
  materialNumber: string,
  currency: string,
  actor: { id: string; name: string },
  copperPriceRate: number
) {
  const built = buildCostingRequestFromPreviewPayload({
    materialNumber,
    quantity: 1,
    lengthMeters: 1000,
    currency,
    copperPriceRate,
    aluminiumPriceRate: ALUMINIUM_USD_MT,
    commercialMetadata: {
      copperPriceUom: 'MT',
      copperPriceCurrency: 'USD',
      aluminiumPriceUom: 'MT',
      aluminiumPriceCurrency: 'USD',
    },
  });
  if ('error' in built) {
    return { materialNumber, currency, copperPriceRate, error: built.error };
  }
  const preview = await executeCostingForInquiryLine(built, actor, { persist: false });
  const workbook = WORKBOOK_10009487[currency];
  const app = preview.totals?.materialCost;
  const diff = workbook != null && app != null ? Number(app) - workbook : null;
  const diffPct = diff != null && workbook ? (diff / workbook) * 100 : null;
  return {
    materialNumber,
    quantityMeters: 1000,
    inquiryCurrency: currency,
    copperHeaderPrice: copperPriceRate,
    aluminiumHeaderPrice: ALUMINIUM_USD_MT,
    ...summarize(preview),
    workbookReference: workbook ?? null,
    difference: diff,
    differencePct: diffPct,
  };
}

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured.');
  const actor = { id: 'u-admin-1', name: 'energya-costing-probe' };

  const currencySweep = [];
  for (const currency of HEADER_CURRENCIES) {
    currencySweep.push(await runOne('10009487', currency, actor, COPPER_USD_MT));
  }

  const copperOverride = {
    copper14600: await runOne('10009487', 'USD', actor, COPPER_USD_MT),
    copper16000: await runOne('10009487', 'USD', actor, COPPER_USD_MT_ALT),
  };
  const copperChanged =
    'materialCost' in copperOverride.copper14600 &&
    'materialCost' in copperOverride.copper16000 &&
    Number(copperOverride.copper14600.materialCost) !== Number(copperOverride.copper16000.materialCost);

  const fourCables = [];
  for (const cable of ENERGYA_COSTING_PROBE_CABLES) {
    fourCables.push(await runOne(cable, 'USD', actor, COPPER_USD_MT));
  }

  const currenciesDiffer = new Set(currencySweep.map((row) => row.resultCurrency || row.inquiryCurrency)).size;

  if (
    !('materialCost' in copperOverride.copper14600) ||
    copperOverride.copper14600.status !== 'READY' ||
    Number(copperOverride.copper14600.materialCost) >= 50000
  ) {
    process.exitCode = 1;
  }

  console.log(
    JSON.stringify(
      {
        copperPriceRate: COPPER_USD_MT,
        aluminiumPriceRate: ALUMINIUM_USD_MT,
        quantityMeters: 1000,
        headerCurrencyChangesOutput: currenciesDiffer > 1,
        inquiryHeaderCopperOverridesMaster: copperChanged,
        uomInflationGuard:
          'materialCost' in copperOverride.copper14600 &&
          Number(copperOverride.copper14600.materialCost) < 50000,
        copperOverride,
        currencySweep,
        fourCables,
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
