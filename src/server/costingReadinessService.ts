import { executeCostingForInquiryLine } from './costingOrchestrationService';
import { buildCostingRequestFromPreviewPayload } from '../services/costingRequestService';
import { getPrisma } from './db';

function isOfficialRawMaterialCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return !(/^I\d+-RM-/.test(normalized) || /^I\d+_TEST/.test(normalized) || normalized.startsWith('TEST-') || normalized.startsWith('TEST_'));
}

/** Identities from ELAND Cost Sheet Required.xlsx — regression only, not imported as master prices. */
export const ELAND_REGRESSION_CABLES = ['10009487', '10009546', '10010347', '10010439'] as const;

/** Consecutive Energya identities for live costing probes (header metal prices required). */
export const ENERGYA_COSTING_PROBE_CABLES = ['10009487', '10009488', '10009489', '10009490'] as const;

export interface CostingReadinessMatrixRow {
  materialNumber: string;
  status: string;
  costingStatus?: string;
  errorCode?: string;
  bom: boolean;
  rawMaterials: boolean;
  prices: boolean;
  scrap: boolean;
  formula: boolean;
  logistics: boolean;
  packing: boolean;
  missing: string[];
  calculationId?: string;
  persisted: boolean;
}

function reasonMatches(reasons: string[], pattern: RegExp): boolean {
  return reasons.some((reason) => pattern.test(reason));
}

export function summarizeReadinessFromPreview(preview: {
  materialNumber?: string;
  status?: string;
  costingStatus?: string;
  errorCode?: string;
  blockingReasons?: string[];
  materialBreakdown?: unknown[];
  layers?: unknown[];
  scrapCostStatus?: string;
  extensionLayers?: {
    logistics?: { status?: string };
    packing?: { status?: string };
  };
  persisted?: boolean;
  calculationId?: string;
}): CostingReadinessMatrixRow {
  const reasons = preview.blockingReasons || [];
  const missing = [...reasons];
  const bomOk =
    !reasonMatches(reasons, /BOM|conflict/i) &&
    ((preview.materialBreakdown && preview.materialBreakdown.length > 0) || preview.status === 'READY');
  const pricesOk = !reasonMatches(reasons, /UNPRICED|PRICE_NOT_CONFIGURED|No approved price/i);
  const rmOk = !reasonMatches(reasons, /RAW_MATERIAL_NOT_FOUND|unknown raw material/i);
  const scrapOk = preview.scrapCostStatus !== 'NOT_READY';
  const formulaOk = !reasonMatches(reasons, /FORMULA|Gate 5/i);
  const logisticsOk = preview.extensionLayers?.logistics?.status === 'CONFIGURED';
  const packingOk = preview.extensionLayers?.packing?.status === 'CONFIGURED';

  if (!logisticsOk && !missing.some((m) => /logistics|incoterm/i.test(m))) {
    missing.push('LOGISTICS_NOT_CONFIGURED');
  }
  if (!packingOk && !missing.some((m) => /packing|drum/i.test(m))) {
    missing.push('PACKING_NOT_CONFIGURED');
  }

  return {
    materialNumber: preview.materialNumber || '',
    status: preview.status || 'NOT_READY',
    costingStatus: preview.costingStatus,
    errorCode: preview.errorCode,
    bom: Boolean(bomOk),
    rawMaterials: Boolean(rmOk),
    prices: Boolean(pricesOk),
    scrap: Boolean(scrapOk),
    formula: Boolean(formulaOk),
    logistics: logisticsOk,
    packing: packingOk,
    missing,
    calculationId: preview.calculationId,
    persisted: Boolean(preview.persisted),
  };
}

export async function evaluateCostingReadinessForCables(
  materialNumbers: string[],
  actor: { id?: string; name?: string; email?: string },
  options?: {
    lengthMeters?: number;
    quantity?: number;
    currency?: string;
    copperPriceRate?: number;
    aluminiumPriceRate?: number;
  }
) {
  const rows: CostingReadinessMatrixRow[] = [];
  for (const materialNumber of materialNumbers) {
    const built = buildCostingRequestFromPreviewPayload({
      materialNumber,
      quantity: options?.quantity ?? 1,
      lengthMeters: options?.lengthMeters ?? 1000,
      currency: options?.currency ?? 'USD',
      copperPriceRate: options?.copperPriceRate,
      aluminiumPriceRate: options?.aluminiumPriceRate,
    });
    if ('error' in built) {
      rows.push({
        materialNumber,
        status: 'NOT_READY',
        errorCode: 'INVALID_REQUEST',
        bom: false,
        rawMaterials: false,
        prices: false,
        scrap: false,
        formula: false,
        logistics: false,
        packing: false,
        missing: [built.error],
        persisted: false,
      });
      continue;
    }
    const preview = await executeCostingForInquiryLine(built, actor, { persist: false });
    rows.push(
      summarizeReadinessFromPreview({
        ...preview,
        materialNumber,
      })
    );
  }
  return rows;
}

export type ConfigStripStatus = 'READY' | 'WARNING' | 'MISSING' | 'PENDING APPROVAL';

export interface CostingConfigStripItem {
  key: string;
  status: ConfigStripStatus;
  ready: number;
  warning: number;
  missing: number;
  pendingApproval: number;
}

export interface CostingWorkspaceKpis {
  pendingApproval: number;
  expiredPrices: number;
  pendingBreakdown: {
    prices: number;
    formulas: number;
    scrapRules: number;
    exchangeRates: number;
    configVersions: number;
  };
  configuration: CostingConfigStripItem[];
}

function stripStatus(ready: number, warning: number, missing: number, pending: number): ConfigStripStatus {
  if (pending > 0) return 'PENDING APPROVAL';
  if (ready === 0 && (missing > 0 || warning > 0)) return 'MISSING';
  if (warning > 0 || missing > 0) return 'WARNING';
  if (ready > 0) return 'READY';
  return 'MISSING';
}

function stripItem(
  key: string,
  ready: number,
  warning: number,
  missing: number,
  pendingApproval: number
): CostingConfigStripItem {
  return {
    key,
    status: stripStatus(ready, warning, missing, pendingApproval),
    ready,
    warning,
    missing,
    pendingApproval,
  };
}

export function summarizeCableReadiness(
  list: Array<{ overallStatus?: string }>
): {
  totalCables: number;
  readyForCosting: number;
  dataIssue: number;
  underReview: number;
  notReady: number;
} {
  return {
    totalCables: list.length,
    readyForCosting: list.filter((c) => c.overallStatus === 'READY_FOR_COSTING').length,
    dataIssue: list.filter((c) => c.overallStatus === 'DATA_ISSUE').length,
    underReview: list.filter((c) => c.overallStatus === 'UNDER_REVIEW').length,
    notReady: list.filter((c) => c.overallStatus === 'NOT_READY').length,
  };
}

/** Live governance KPIs. Blank RM prices stay PRICE_NOT_CONFIGURED (never counted as priced). */
export async function loadCostingWorkspaceKpis(
  cables?: Array<{ bomStatus?: string }>
): Promise<CostingWorkspaceKpis> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      pendingApproval: 0,
      expiredPrices: 0,
      pendingBreakdown: { prices: 0, formulas: 0, scrapRules: 0, exchangeRates: 0, configVersions: 0 },
      configuration: [
        stripItem('bom', 0, 0, 0, 0),
        stripItem('rmPrices', 0, 0, 0, 0),
        stripItem('scrap', 0, 0, 0, 0),
        stripItem('variables', 0, 0, 0, 0),
        stripItem('formulas', 0, 0, 0, 0),
        stripItem('metal', 0, 0, 0, 0),
        stripItem('logistics', 0, 0, 0, 0),
        stripItem('packing', 0, 0, 0, 0),
      ],
    };
  }

  const now = new Date();
  const syntheticPrice = { startsWith: 'I4-RM-' as const };

  const [
    pendingPrices,
    pendingFormulas,
    pendingScrap,
    pendingFx,
    pendingConfig,
    expiredPrices,
    pricedOfficial,
    blankOfficial,
    scrapActiveRated,
    scrapActiveBlank,
    variablesActive,
    formulasActive,
    metalReady,
    metalBlank,
    metalPending,
    logisticsReady,
    logisticsBlank,
    logisticsPending,
    packingReady,
    packingBlank,
    packingPending,
  ] = await Promise.all([
    prisma.rawMaterialPrice.count({
      where: { workflowStatus: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, NOT: { rawMaterialCode: syntheticPrice } },
    }),
    prisma.costingFormula.count({ where: { status: 'SUBMITTED' as never } }),
    prisma.costingScrapRule.count({ where: { workflowStatus: 'SUBMITTED', isCurrent: true } }),
    prisma.costingExchangeRate.count({ where: { workflowStatus: 'SUBMITTED', isCurrent: true } }),
    prisma.costingConfigurationVersion.count({ where: { workflowStatus: 'SUBMITTED' } }),
    prisma.rawMaterialPrice.count({
      where: {
        isCurrent: true,
        NOT: { rawMaterialCode: syntheticPrice },
        OR: [{ workflowStatus: 'EXPIRED' }, { effectiveTo: { lt: now } }],
      },
    }),
    prisma.rawMaterialPrice.count({
      where: {
        isCurrent: true,
        workflowStatus: 'APPROVED',
        price: { not: null },
        NOT: { rawMaterialCode: syntheticPrice },
      },
    }),
    prisma.rawMaterialPrice.count({
      where: {
        isCurrent: true,
        price: null,
        NOT: { rawMaterialCode: syntheticPrice },
      },
    }),
    prisma.costingScrapRule.count({ where: { isCurrent: true, workflowStatus: 'ACTIVE', scrapRate: { not: null } } }),
    prisma.costingScrapRule.count({ where: { isCurrent: true, workflowStatus: 'ACTIVE', scrapRate: null } }),
    prisma.costingVariable.count({ where: { status: 'ACTIVE' } }),
    prisma.costingFormula.count({ where: { status: 'ACTIVE' as never } }),
    prisma.costingMetalRate.count({ where: { isCurrent: true, rate: { not: null } } }),
    prisma.costingMetalRate.count({ where: { isCurrent: true, rate: null } }),
    prisma.costingMetalRate.count({ where: { isCurrent: true, workflowStatus: 'SUBMITTED' } }),
    prisma.costingLogisticsRule.count({ where: { isCurrent: true, cost: { not: null } } }),
    prisma.costingLogisticsRule.count({ where: { isCurrent: true, cost: null } }),
    prisma.costingLogisticsRule.count({ where: { isCurrent: true, workflowStatus: 'SUBMITTED' } }),
    prisma.costingPackingRule.count({ where: { isCurrent: true, packingCost: { not: null } } }),
    prisma.costingPackingRule.count({ where: { isCurrent: true, packingCost: null } }),
    prisma.costingPackingRule.count({ where: { isCurrent: true, workflowStatus: 'SUBMITTED' } }),
  ]);

  const pendingBreakdown = {
    prices: pendingPrices,
    formulas: pendingFormulas,
    scrapRules: pendingScrap,
    exchangeRates: pendingFx,
    configVersions: pendingConfig,
  };
  const pendingApproval =
    pendingPrices + pendingFormulas + pendingScrap + pendingFx + pendingConfig;

  const officialRm = await prisma.rawMaterial.findMany({ select: { code: true } });
  const officialCodes = officialRm.filter((r) => isOfficialRawMaterialCode(r.code));
  const rmMissing = Math.max(0, officialCodes.length - pricedOfficial);

  return {
    pendingApproval,
    expiredPrices,
    pendingBreakdown,
    configuration: [
      stripItem(
        'bom',
        cables ? cables.filter((c) => c.bomStatus === 'RESOLVED').length : 0,
        cables ? cables.filter((c) => c.bomStatus === 'CONFLICT_UNRESOLVED').length : 0,
        cables ? cables.filter((c) => c.bomStatus === 'NO_BOM' || c.bomStatus === 'NOT_READY').length : 0,
        0
      ),
      stripItem('rmPrices', pricedOfficial, blankOfficial, rmMissing, pendingPrices),
      stripItem('scrap', scrapActiveRated, scrapActiveBlank, scrapActiveRated + scrapActiveBlank === 0 ? 1 : 0, pendingScrap),
      stripItem('variables', variablesActive, 0, variablesActive === 0 ? 1 : 0, 0),
      stripItem('formulas', formulasActive, 0, formulasActive === 0 ? 1 : 0, pendingFormulas),
      stripItem('metal', metalReady, metalBlank, metalReady + metalBlank === 0 ? 1 : 0, metalPending),
      stripItem('logistics', logisticsReady, logisticsBlank, logisticsReady + logisticsBlank === 0 ? 1 : 0, logisticsPending),
      stripItem('packing', packingReady, packingBlank, packingReady + packingBlank === 0 ? 1 : 0, packingPending),
    ],
  };
}
