import { Prisma } from '@prisma/client';
import { CostingScrapScopeType } from '@prisma/client';
import { getPrisma } from './db';
import {
  calculateCableManufacturingCost,
  calculateMaterialLineCost,
  CostingContext,
  CostingRequest,
  evaluateCostingGates,
  validateCostingRequestInputs,
} from '../domain/costingEngine';
import { CostingDecimal } from '../domain/costingDecimal';
import { previewFormula } from '../domain/costingFormulaEngine';
import { selectFormulasForCable } from '../domain/costingFormulaAssignment';
import { StructuredCostingRequest } from '../services/costingRequestService';
import {
  buildFxContextFromCommercialMetadata,
  FxSnapshotEntry,
  GovernedExchangeRateRecord,
  normalizeCostingCurrency,
} from '../domain/currencyConversion';
import { resolveAllExtensionLayers } from './costingExtensionLayers';
import type { ExtensionLayerResult } from './costingExtensionLayers';
import { ensureEngineeringMappingApprovedForCosting } from './governanceRepository';
import { computeInquiryLineTotalValue } from '../domain/inquiryLineValue';
import { resolveInquiryMetalPricingForCosting } from '../domain/cableMetalPriceResolution';
import { snapshotMissingInquiryMetalPrices } from './marketMetalPriceDefaultRepository';
import {
  buildInquiryMetalPricingFromMetadata,
  buildMetalPricingSnapshot,
  normalizePricingCategory,
} from '../domain/inquiryMetalPricing';
import { getPublishedCableMetalQuotes } from './marketMetalPriceDefaultRepository';
import type { V2CostingLineageStamp } from '../domain/v2CostingRequestService';
import { extractPriceIdMap } from '../domain/v2CostingRequestService';
import {
  auditCostingContainerStudyPin,
  resolveCostingContainerStudyPin,
  type CostingContainerStudyPinSuccess,
} from './costingContainerStudyPinService';

export type CostingPreviewStatus = 'READY' | 'NOT_READY';

export interface MaterialLinePreview {
  rawMaterialCode: string;
  rawMaterialDesc: string;
  baseConsumptionPerKm: number;
  scrapRate: number | null;
  scrapSource: 'BOM_LINE' | 'SCRAP_RULE' | 'NONE';
  adjustedConsumptionPerKm: number;
  totalConsumption: number;
  consumptionUom: string;
  unitPrice: number | null;
  priceCurrency: string;
  lineCost: number;
  originalLineCost?: number;
  originalCurrency?: string;
  fxRate?: number;
  fxRateSource?: string;
  priceId?: string;
  pricingSource?: string;
  masterPrice?: number | null;
  masterPriceCurrency?: string | null;
  masterPriceUom?: string | null;
  inquiryHeaderPrice?: number | null;
  inquiryHeaderPriceUom?: string | null;
  metalType?: string;
  calculationNotes: string;
}

export interface LayerPreview {
  componentCode: string;
  componentName: string;
  kind: string;
  outputVariable: string;
  value: string | null;
  status: 'CALCULATED' | 'NOT_CONFIGURED' | 'SKIPPED';
  expression?: string;
  notes?: string;
}

export interface CostingPreviewResult {
  status: CostingPreviewStatus;
  costingStatus: string;
  materialNumber: string;
  costingDate: string;
  currency: string;
  quantity: number;
  lengthMeters: number;
  blockingReasons: string[];
  calculationWarnings?: string[];
  errorCode?: string;
  materialBreakdown: MaterialLinePreview[];
  layers: LayerPreview[];
  totals: {
    materialCost: string;
    scrapAdjustmentCost: string;
    layerTotals: Record<string, string>;
    manufacturingTotal: string | null;
    /** Material + manufacturing rollup + configured logistics/packing. */
    lineTotal?: string;
  };
  scrapCostStatus: 'CONFIGURED' | 'NOT_CONFIGURED' | 'NOT_READY';
  configurationVersionId?: string;
  bomVersion?: number;
  engineeringRevision?: number;
  fxSnapshot?: FxSnapshotEntry[];
  resultCurrency?: string;
  extensionLayers?: {
    copper: ExtensionLayerResult;
    aluminium: ExtensionLayerResult;
    logistics: ExtensionLayerResult;
    packing: ExtensionLayerResult;
  };
  incotermChargeStatus?: 'CONFIGURED' | 'NOT_CONFIGURED';
  drumCostStatus?: 'CONFIGURED' | 'NOT_CONFIGURED';
  metalRateStatus?: 'CONFIGURED' | 'PARTIAL' | 'NOT_CONFIGURED';
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

type ScrapRuleRow = {
  id: string;
  code: string;
  scopeType: CostingScrapScopeType;
  scopeValue: string | null;
  materialClass: string | null;
  scrapRate: { toString(): string } | null;
  workflowStatus: string;
  priority: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

const SCRAP_SCOPE_SPECIFICITY: Record<CostingScrapScopeType, number> = {
  BOM_LINE: 5,
  CABLE: 4,
  FAMILY: 3,
  MATERIAL_CLASS: 2,
  GLOBAL: 1,
};

function isEffective(rule: ScrapRuleRow, costingDate: Date): boolean {
  if (rule.workflowStatus !== 'ACTIVE') return false;
  if (rule.effectiveFrom && costingDate < rule.effectiveFrom) return false;
  if (rule.effectiveTo && costingDate > rule.effectiveTo) return false;
  return true;
}

function normalizeScrapClass(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase();
}

function scrapRuleClassKey(rule: ScrapRuleRow): string {
  return normalizeScrapClass(rule.scopeValue) || normalizeScrapClass(rule.materialClass);
}

function scrapRuleMatchesLine(
  rule: ScrapRuleRow,
  bomLine: { rawMaterialCode: string },
  cableFamily: string | null,
  materialNumber: string,
  materialCategory: string | null | undefined
): boolean {
  if (rule.scopeType === 'GLOBAL') return true;
  if (rule.scopeType === 'CABLE') return rule.scopeValue === materialNumber;
  if (rule.scopeType === 'FAMILY') return Boolean(cableFamily) && rule.scopeValue === cableFamily;
  if (rule.scopeType === 'BOM_LINE') return rule.scopeValue === bomLine.rawMaterialCode;
  if (rule.scopeType === 'MATERIAL_CLASS') {
    const ruleClass = scrapRuleClassKey(rule);
    const lineClass = normalizeScrapClass(materialCategory);
    return Boolean(ruleClass) && Boolean(lineClass) && ruleClass === lineClass;
  }
  return false;
}

export type ScrapRateResolution = {
  rate: number | null;
  source: 'BOM_LINE' | 'SCRAP_RULE' | 'NONE';
  blocking?: string;
  errorCode?: 'BUSINESS_RULE_REQUIRED';
};

/** BOM line % first; else most specific ACTIVE CostingScrapRule, then lowest priority. Equal remaining overlap is BUSINESS_RULE_REQUIRED. */
export function resolveScrapRate(
  bomLine: { scrapPercentage?: number | null; rawMaterialCode: string },
  cableFamily: string | null,
  materialNumber: string,
  rules: ScrapRuleRow[],
  costingDate: Date,
  materialCategory?: string | null
): ScrapRateResolution {
  if (bomLine.scrapPercentage != null && Number(bomLine.scrapPercentage) >= 0) {
    return { rate: Number(bomLine.scrapPercentage), source: 'BOM_LINE' };
  }

  const matches = rules.filter(
    (rule) =>
      isEffective(rule, costingDate) &&
      scrapRuleMatchesLine(rule, bomLine, cableFamily, materialNumber, materialCategory)
  );

  if (matches.length === 0) return { rate: null, source: 'NONE' };

  const maxSpecificity = Math.max(...matches.map((rule) => SCRAP_SCOPE_SPECIFICITY[rule.scopeType] || 0));
  const mostSpecific = matches.filter((rule) => (SCRAP_SCOPE_SPECIFICITY[rule.scopeType] || 0) === maxSpecificity);
  const lowestPriority = Math.min(...mostSpecific.map((rule) => rule.priority));
  const winners = mostSpecific.filter((rule) => rule.priority === lowestPriority);

  if (winners.length > 1) {
    const codes = winners.map((rule) => rule.code).sort().join(', ');
    return {
      rate: null,
      source: 'NONE',
      errorCode: 'BUSINESS_RULE_REQUIRED',
      blocking: `Overlapping ACTIVE scrap rules (${codes}) share the same scope type and priority — BUSINESS_RULE_REQUIRED.`,
    };
  }

  const best = winners[0];
  if (best.scrapRate == null) {
    return {
      rate: null,
      source: 'NONE',
      blocking: `Scrap rule ${best.code} is ACTIVE but has no governed rate — NOT_READY.`,
    };
  }

  return { rate: Number(best.scrapRate), source: 'SCRAP_RULE' };
}

async function loadGovernedExchangeRates(_costingDate: Date): Promise<GovernedExchangeRateRecord[]> {
  const prisma = requirePrisma();
  const rows = await prisma.costingExchangeRate.findMany({
    where: { isCurrent: true, status: 'ACTIVE', workflowStatus: { in: ['ACTIVE', 'APPROVED'] } },
  });
  return rows.map((r) => ({
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    rate: Number(r.rate),
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    workflowStatus: r.workflowStatus,
    code: r.code,
  }));
}

async function metalPricingForCosting(
  metadata: Record<string, unknown> | undefined,
  currency: string
) {
  const inquiry = buildInquiryMetalPricingFromMetadata(metadata, currency);
  const published = await getPublishedCableMetalQuotes();
  return resolveInquiryMetalPricingForCosting(inquiry, published).pricing;
}

function buildFxContextForRequest(
  request: StructuredCostingRequest,
  costingDate: Date,
  governedRates: GovernedExchangeRateRecord[]
) {
  const base = buildFxContextFromCommercialMetadata(
    request.currency,
    costingDate,
    request.commercialMetadata,
    governedRates
  );
  if (request.fxContext) {
    return { ...base, ...request.fxContext, governedRates };
  }
  return base;
}

export async function executeCostingPreview(request: StructuredCostingRequest): Promise<CostingPreviewResult> {
  const prisma = requirePrisma();
  const matNo = request.materialNumber.trim();

  const costingReq: CostingRequest = {
    materialNumber: matNo,
    costingDate: request.costingDate,
    quantity: request.quantity,
    lengthMeters: request.lengthMeters,
    currency: request.currency,
  };

  const val = validateCostingRequestInputs(costingReq);
  const baseBlocking: string[] = [...val.errors];

  const [cable, mapping, governedBoms, sourceBoms, conflicts, rawMaterials, approvedPrices, scrapRules, governedExchangeRates] =
    await Promise.all([
      prisma.cableMaster.findUnique({ where: { materialNumber: matNo } }),
      prisma.cableEngineeringMapping.findFirst({ where: { materialNumber: matNo, isCurrent: true } }),
      prisma.governedBomLine.findMany({ where: { cableMaterialNumber: matNo, status: 'APPROVED' } }),
      prisma.cableBomLine.findMany({ where: { cableMaterialNumber: matNo } }),
      prisma.bomDuplicateObservation.findMany({ where: { cableMaterialNumber: matNo } }),
      prisma.rawMaterial.findMany(),
      prisma.rawMaterialPrice.findMany({
        where: { status: 'ACTIVE', isCurrent: true },
      }),
      prisma.costingScrapRule.findMany({ where: { isCurrent: true, status: 'ACTIVE' } }),
      loadGovernedExchangeRates(val.costingDate),
    ]);

  if (!cable) {
    return notReadyResult(request, val, [`Cable Master "${matNo}" not found.`], 'CABLE_NOT_FOUND');
  }

  const rmMap = new Map(
    rawMaterials.map((r) => [
      r.code.toUpperCase(),
      {
        code: r.code,
        description: r.description,
        uom: r.uom,
        pricingCategory: r.pricingCategory,
        metalType: r.metalType,
      },
    ])
  );
  const rmCategoryByCode = new Map(rawMaterials.map((r) => [r.code.toUpperCase(), r.category]));
  const rmPricingCategoryByCode = new Map(
    rawMaterials.map((r) => [r.code.toUpperCase(), normalizePricingCategory(r.pricingCategory)])
  );

  const inquiryMetalPricing = await metalPricingForCosting(
    request.commercialMetadata as Record<string, unknown> | undefined,
    request.currency
  );

  const fxContext = buildFxContextForRequest(request, val.costingDate, governedExchangeRates);

  const context: CostingContext = {
    cable: { materialNumber: cable.materialNumber, description: cable.description },
    engineeringMapping: mapping
      ? {
          status: mapping.status,
          revision: mapping.revision,
          family: mapping.family,
          voltage: mapping.voltage,
          conductor: mapping.conductor,
          conductorSize: mapping.conductorSize,
          cores: mapping.cores,
          insulation: mapping.insulation,
        }
      : null,
    governedBomLines: governedBoms.map((g) => ({
      rawMaterialCode: g.rawMaterialCode,
      rawMaterialDesc: rmMap.get(g.rawMaterialCode.toUpperCase())?.description,
      consumption: Number(g.consumption),
      uom: g.uom,
      bomVersion: g.bomVersion,
      status: g.status,
    })),
    sourceBomLines: sourceBoms.map((s) => ({
      rawMaterialCode: s.rawMaterialCode,
      rawMaterialDesc: rmMap.get(s.rawMaterialCode.toUpperCase())?.description,
      consumption: Number(s.consumption),
      uom: s.uom,
      bomVersion: s.bomVersion,
    })),
    bomConflicts: conflicts.map((c) => ({
      conflictId: c.conflictId,
      rawMaterialCode: c.rawMaterialCode,
      investigationStatus: c.investigationStatus,
    })),
    rawMaterials: rmMap,
    rawMaterialPricingCategories: rmPricingCategoryByCode,
    inquiryMetalPricing,
    approvedPrices: approvedPrices.map((p) => ({
      id: p.id,
      rawMaterialCode: p.rawMaterialCode,
      price: p.price != null ? Number(p.price) : null,
      currency: p.currency,
      uom: p.uom,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      supplier: p.supplier,
      source: p.source,
      priceBasis: p.priceBasis,
      workflowStatus: p.workflowStatus,
      isCurrent: p.isCurrent,
      revision: p.revision,
      temporalStatus: p.temporalStatus,
    })),
    fxContext,
  };

  costingReq.fxContext = fxContext;

  const gateCheck = evaluateCostingGates(matNo, val.costingDate, val.currency, context);
  const blockingReasons = [...baseBlocking, ...gateCheck.blockingReasons];

  // Gate 5 — optional published configuration
  let configVersion: {
    id: string;
    status: string;
    workflowStatus: string;
    formulas: Array<{
      code: string;
      name: string;
      outputVariableCode: string;
      assignmentScope: string;
      assignmentValue: string | null;
      assignmentPriority: number;
      status: string;
      component: { code: string; name: string; kind: string; sortOrder: number } | null;
      versions: Array<{ expression: string; status: string }>;
    }>;
  } | null = null;

  if (request.configurationVersionId) {
    configVersion = await prisma.costingConfigurationVersion.findUnique({
      where: { id: request.configurationVersionId },
      include: {
        formulas: {
          where: { status: 'ACTIVE' },
          include: {
            component: true,
            versions: { where: { status: 'ACTIVE' }, orderBy: { versionNo: 'desc' }, take: 1 },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!configVersion) {
      blockingReasons.push('Gate 5 Failed: Requested configuration version not found.');
    } else if (configVersion.workflowStatus !== 'ACTIVE' && configVersion.status !== 'ACTIVE') {
      blockingReasons.push(
        `Gate 5 Failed: Configuration version is not ACTIVE (workflow=${configVersion.workflowStatus}).`
      );
    }
  }

  const cableFamily = mapping?.family || cable.family || null;
  const governedWithScrap = governedBoms.map((g) => ({
    ...g,
    scrapPercentage: g.scrapPercentage != null ? Number(g.scrapPercentage) : null,
  }));

  const materialBreakdown: MaterialLinePreview[] = [];
  let scrapBlocking: string | undefined;
  let scrapErrorCode: 'BUSINESS_RULE_REQUIRED' | undefined;
  let hasScrapApplied = false;
  let totalMaterial = CostingDecimal.zero();
  let totalScrapAdj = CostingDecimal.zero();
  let fxSnapshot: FxSnapshotEntry[] | undefined;

  let materialEngineResult: ReturnType<typeof calculateCableManufacturingCost> | null = null;
  if (gateCheck.ready && val.valid) {
    materialEngineResult = calculateCableManufacturingCost(costingReq, context);
    if (!materialEngineResult.success) {
      blockingReasons.push(...materialEngineResult.blockingReasons);
      fxSnapshot = materialEngineResult.fxSnapshot;
    } else {
      fxSnapshot = materialEngineResult.fxSnapshot;
    }
  }

  if (gateCheck.ready && val.valid && materialEngineResult?.success) {
    const effectiveBom =
      governedWithScrap.length > 0
        ? governedWithScrap
        : sourceBoms.map((s) => ({ ...s, scrapPercentage: null as number | null }));

    for (const line of effectiveBom) {
      const rm = rmMap.get(line.rawMaterialCode.toUpperCase());
      if (!rm) continue;

      const scrapRes = resolveScrapRate(
        { scrapPercentage: line.scrapPercentage, rawMaterialCode: line.rawMaterialCode },
        cableFamily,
        matNo,
        scrapRules as ScrapRuleRow[],
        val.costingDate,
        rmCategoryByCode.get(line.rawMaterialCode.toUpperCase())
      );

      if (scrapRes.blocking) scrapBlocking = scrapRes.blocking;
      if (scrapRes.errorCode) scrapErrorCode = scrapRes.errorCode;

      const baseConsumption = Number(line.consumption);
      const scrapRate = scrapRes.rate;
      const adjustedConsumption =
        scrapRate != null ? baseConsumption * (1 + scrapRate) : baseConsumption;

      if (scrapRate != null) hasScrapApplied = true;

      const baseCalc = calculateMaterialLineCost(
        baseConsumption,
        val.lengthMeters,
        val.quantity,
        line.uom,
        0,
        line.uom,
        'PER_KG'
      );

      const existingLine = materialEngineResult.costingLines.find(
        (l) => l.rawMaterialCode.toUpperCase() === line.rawMaterialCode.toUpperCase()
      );

      let unitPrice: number | null = existingLine?.price ?? null;
      let lineCost = 0;
      let priceCurrency = existingLine?.priceCurrency || val.currency;
      let priceId = existingLine?.priceId;
      let notes = baseCalc.calculationNotes;

      if (existingLine && unitPrice != null) {
        const baseLineCost = existingLine.lineCost;
        // Direct Raw Material Cost excludes scrap: Consumption × Applied Price only.
        lineCost = baseLineCost;
        notes = existingLine.calculationNotes || notes;
        if (scrapRate != null) {
          const scrapOnlyCost =
            baseConsumption > 0
              ? Math.round((baseLineCost * scrapRate + Number.EPSILON) * 100) / 100
              : 0;
          notes += ` (scrap ${(scrapRate * 100).toFixed(2)}% from ${scrapRes.source}; not included in direct RM cost)`;
          totalScrapAdj = totalScrapAdj.add(new CostingDecimal(String(scrapOnlyCost)));
        }
        totalMaterial = totalMaterial.add(new CostingDecimal(String(baseLineCost)));
      }

      materialBreakdown.push({
        rawMaterialCode: line.rawMaterialCode,
        rawMaterialDesc: rm.description,
        baseConsumptionPerKm: baseConsumption,
        scrapRate,
        scrapSource: scrapRes.source,
        adjustedConsumptionPerKm: adjustedConsumption,
        totalConsumption: baseCalc.totalConsumption,
        consumptionUom: line.uom,
        unitPrice,
        priceCurrency,
        lineCost,
        originalLineCost: existingLine?.originalLineCost,
        originalCurrency: existingLine?.originalCurrency,
        fxRate: existingLine?.fxRate,
        fxRateSource: existingLine?.fxRateSource,
        priceId,
        pricingSource: existingLine?.pricingSource,
        masterPrice: existingLine?.masterPrice,
        masterPriceCurrency: existingLine?.masterPriceCurrency,
        masterPriceUom: existingLine?.masterPriceUom,
        inquiryHeaderPrice: existingLine?.inquiryHeaderPrice,
        inquiryHeaderPriceUom: existingLine?.inquiryHeaderPriceUom,
        metalType: existingLine?.metalType || rm.metalType || 'NONE',
        calculationNotes: notes,
      });
    }
  }

  const layers: LayerPreview[] = [];
  const layerTotals: Record<string, string> = {};
  const variableValues: Record<string, string> = {
    MATERIAL_COST: totalMaterial.toString(),
    QUANTITY: String(val.quantity),
    LENGTH_METERS: String(val.lengthMeters),
    ...(request.layerInputs
      ? Object.fromEntries(Object.entries(request.layerInputs).map(([k, v]) => [k, String(v)]))
      : {}),
  };

  if (configVersion && gateCheck.ready && blockingReasons.length === 0) {
    const sortedFormulas = selectFormulasForCable(
      [...configVersion.formulas],
      { materialNumber: matNo, family: cableFamily }
    ).sort(
      (a, b) =>
        (a.assignmentPriority ?? 100) - (b.assignmentPriority ?? 100) ||
        (a.component?.sortOrder ?? 0) - (b.component?.sortOrder ?? 0)
    );

    for (const formula of sortedFormulas) {
      const activeVersion = formula.versions[0];
      const componentCode = formula.component?.code || 'OTHER';

      if (!activeVersion) {
        layers.push({
          componentCode,
          componentName: formula.component?.name || formula.name,
          kind: formula.component?.kind || 'OTHER',
          outputVariable: formula.outputVariableCode,
          value: null,
          status: 'NOT_CONFIGURED',
          notes: 'No active formula version.',
        });
        continue;
      }

      try {
        const preview = previewFormula({
          expression: activeVersion.expression,
          outputVariable: formula.outputVariableCode,
          registry: [],
          existingFormulas: [],
          variableValues,
        });

        if (preview.valid && preview.result != null) {
          variableValues[formula.outputVariableCode] = String(preview.result);
          layerTotals[componentCode] = String(preview.result);
          layers.push({
            componentCode,
            componentName: formula.component?.name || formula.name,
            kind: formula.component?.kind || 'OTHER',
            outputVariable: formula.outputVariableCode,
            value: String(preview.result),
            status: 'CALCULATED',
            expression: activeVersion.expression,
          });
        } else {
          layers.push({
            componentCode,
            componentName: formula.component?.name || formula.name,
            kind: formula.component?.kind || 'OTHER',
            outputVariable: formula.outputVariableCode,
            value: null,
            status: 'NOT_CONFIGURED',
            expression: activeVersion.expression,
            notes: preview.errors?.map((e) => e.message).join('; '),
          });
        }
      } catch (err) {
        layers.push({
          componentCode,
          componentName: formula.component?.name || formula.name,
          kind: formula.component?.kind || 'OTHER',
          outputVariable: formula.outputVariableCode,
          value: null,
          status: 'NOT_CONFIGURED',
          expression: activeVersion.expression,
          notes: err instanceof Error ? err.message : 'Evaluation failed',
        });
      }
    }
  }

  const scrapCostStatus: 'CONFIGURED' | 'NOT_CONFIGURED' | 'NOT_READY' = scrapBlocking
    ? 'NOT_READY'
    : hasScrapApplied
      ? 'CONFIGURED'
      : 'NOT_CONFIGURED';

  const optionalWarnings: string[] = [];
  if (scrapBlocking && scrapErrorCode === 'BUSINESS_RULE_REQUIRED') {
    blockingReasons.push(scrapBlocking);
  } else if (scrapBlocking) {
    optionalWarnings.push(scrapBlocking);
  }

  const structuralReady = blockingReasons.length === 0 && gateCheck.ready && val.valid;
  const isReady = structuralReady;
  const materialCostStr = totalMaterial.toString();

  return {
    status: isReady ? 'READY' : 'NOT_READY',
    costingStatus: !isReady ? 'BLOCKED' : optionalWarnings.length ? 'CALCULATED_WITH_WARNINGS' : 'PREVIEW_READY',
    materialNumber: matNo,
    costingDate: val.costingDate.toISOString().slice(0, 10),
    currency: normalizeCostingCurrency(val.currency) || val.currency,
    quantity: val.quantity,
    lengthMeters: val.lengthMeters,
    blockingReasons,
    calculationWarnings: optionalWarnings,
    errorCode: isReady ? undefined : scrapErrorCode || gateCheck.errorCode || 'COSTING_NOT_READY',
    materialBreakdown,
    layers,
    totals: {
      materialCost: materialCostStr,
      scrapAdjustmentCost: totalScrapAdj.toString(),
      layerTotals,
      manufacturingTotal: layers.length > 0 ? variableValues.EX_WORK_COST || materialCostStr : null,
    },
    scrapCostStatus,
    configurationVersionId: request.configurationVersionId,
    bomVersion: governedBoms[0]?.bomVersion,
    engineeringRevision: mapping?.revision,
    fxSnapshot,
    resultCurrency: normalizeCostingCurrency(val.currency) || val.currency,
  };
}

export interface InquiryLineCostingResult extends CostingPreviewResult {
  calculationId?: string;
  costingRunId?: string;
  persisted: boolean;
  containerStudyResultId?: string | null;
}

export async function resolveActiveConfigurationVersion(costingDate: Date): Promise<string | undefined> {
  const prisma = requirePrisma();
  const version = await prisma.costingConfigurationVersion.findFirst({
    where: {
      workflowStatus: 'ACTIVE',
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: costingDate } }],
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: costingDate } }] }],
    },
    orderBy: [{ isCurrent: 'desc' }, { versionNo: 'desc' }],
  });
  return version?.id;
}

export async function executeCostingForInquiryLine(
  request: StructuredCostingRequest,
  actor: { id?: string; name?: string; email?: string },
  options: {
    persist: boolean;
    inquiryId?: string;
    inquiryLineId?: string;
    configurationVersionId?: string;
    v2Lineage?: V2CostingLineageStamp;
    containerStudyResultId?: string | null;
  }
): Promise<InquiryLineCostingResult> {
  const prisma = requirePrisma();

  let csPin: CostingContainerStudyPinSuccess | null = null;
  if (options.inquiryId) {
    const pin = await resolveCostingContainerStudyPin({
      inquiryId: options.inquiryId,
      inquiryLineId: options.inquiryLineId,
      requestedResultId: options.containerStudyResultId,
    });
    if (pin.ok === false) {
      const val = validateCostingRequestInputs(request);
      return {
        ...notReadyResult(request, val, pin.blockingReasons, pin.code),
        persisted: false,
        containerStudyResultId: null,
      };
    }
    csPin = pin;
  }

  if (options.inquiryId && options.persist && !request.previewOnly) {
    const snapped = await snapshotMissingInquiryMetalPrices(options.inquiryId);
    request = { ...request, commercialMetadata: snapped };
  }

  let configVersionId = request.configurationVersionId || options.configurationVersionId;
  if (!configVersionId && !request.previewOnly) {
    const costingDate = new Date(request.costingDate);
    configVersionId = await resolveActiveConfigurationVersion(costingDate);
  }

  const previewRequest: StructuredCostingRequest = {
    ...request,
    configurationVersionId: configVersionId,
    inquiryLineId: options.inquiryLineId,
    previewOnly: request.previewOnly,
  };

  if (options.persist && !request.previewOnly) {
    await ensureEngineeringMappingApprovedForCosting(request.materialNumber.trim(), actor);
  }

  const preview = await executeCostingPreview(previewRequest);

  const meta = (request.commercialMetadata || {}) as Record<string, unknown>;
  const extensionLayers = await resolveAllExtensionLayers({
    costingDate: request.costingDate,
    currency: request.currency,
    incoterm: (meta.incoterms as string) || (meta.incoterm as string) || null,
    destination: (meta.deliveryDestination as string) || null,
    drumCode: (meta.drumType as string) || null,
    copperRate: meta.copperPriceRate != null ? Number(meta.copperPriceRate) : null,
    aluminiumRate: meta.aluminiumPriceRate != null ? Number(meta.aluminiumPriceRate) : null,
  });
  const extensionStamp = {
    extensionLayers,
    incotermChargeStatus:
      extensionLayers.logistics.status === 'CONFIGURED' ? ('CONFIGURED' as const) : ('NOT_CONFIGURED' as const),
    drumCostStatus:
      extensionLayers.packing.status === 'CONFIGURED' ? ('CONFIGURED' as const) : ('NOT_CONFIGURED' as const),
    metalRateStatus:
      extensionLayers.copper.status === 'CONFIGURED' && extensionLayers.aluminium.status === 'CONFIGURED'
        ? ('CONFIGURED' as const)
        : extensionLayers.copper.status === 'CONFIGURED' || extensionLayers.aluminium.status === 'CONFIGURED'
          ? ('PARTIAL' as const)
          : ('NOT_CONFIGURED' as const),
  };

  const materialCostNumber = Number(preview.totals.materialCost);
  const manufacturingNumber = preview.totals.manufacturingTotal
    ? Number(preview.totals.manufacturingTotal)
    : null;
  const lineTotal = computeInquiryLineTotalValue({
    materialCost: Number.isFinite(materialCostNumber) ? materialCostNumber : 0,
    manufacturingTotal: manufacturingNumber,
    logisticsAmount:
      extensionLayers.logistics.status === 'CONFIGURED' ? extensionLayers.logistics.amount : null,
    packingAmount:
      extensionLayers.packing.status === 'CONFIGURED' ? extensionLayers.packing.amount : null,
  });
  preview.totals.lineTotal = String(lineTotal);

  const optionalLayerWarnings: string[] = [];
  if (extensionLayers.logistics.status !== 'CONFIGURED') {
    optionalLayerWarnings.push('Logistics charge was not available and was treated as 0.');
  }
  if (extensionLayers.packing.status !== 'CONFIGURED') {
    optionalLayerWarnings.push('Packing / drum charge was not available and was treated as 0.');
  }
  if (csPin?.warnings.length) {
    optionalLayerWarnings.push(...csPin.warnings);
  }
  preview.calculationWarnings = [...(preview.calculationWarnings || []), ...optionalLayerWarnings];
  if (preview.status === 'READY' && preview.calculationWarnings.length > 0) {
    preview.costingStatus = 'CALCULATED_WITH_WARNINGS';
  }

  if (!options.persist || request.previewOnly) {
    return {
      ...preview,
      ...extensionStamp,
      persisted: false,
      containerStudyResultId: csPin?.containerStudyResultId ?? null,
    };
  }

  if (preview.status === 'NOT_READY') {
    if (options.inquiryLineId) {
      await prisma.commercialInquiryLine.update({
        where: { id: options.inquiryLineId },
        data: {
          costingReadinessStatus: 'NOT_READY',
        },
      });
    }
    return { ...preview, ...extensionStamp, persisted: false, containerStudyResultId: csPin?.containerStudyResultId ?? null };
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const calculationNumber = `CC-${stamp}-${rand}`;
  const costingRunNumber = `CR-${stamp}-${rand}`;

  const materialCost = Number.isFinite(materialCostNumber) ? materialCostNumber : 0;
  const manufacturingTotal = manufacturingNumber != null ? manufacturingNumber : materialCost;

  const inquiryMetalPricing = await metalPricingForCosting(
    request.commercialMetadata as Record<string, unknown> | undefined,
    request.currency
  );
  const metalPricingSnapshot = buildMetalPricingSnapshot(inquiryMetalPricing);
  const rawMaterialPriceIds = extractPriceIdMap(preview);
  const governedBomRows = await prisma.governedBomLine.findMany({
    where: { cableMaterialNumber: request.materialNumber.trim(), status: 'APPROVED' },
    select: { id: true },
  });

  const inputSnapshot = {
    materialNumber: request.materialNumber,
    costingDate: request.costingDate,
    quantity: request.quantity,
    lengthMeters: request.lengthMeters,
    currency: request.currency,
    configurationVersionId: configVersionId,
    layerInputs: request.layerInputs,
    inquiryLineId: options.inquiryLineId,
    inquiryId: options.inquiryId,
    commercialMetadata: request.commercialMetadata,
    metalPricingSnapshot,
    fxSnapshot: preview.fxSnapshot,
    resultCurrency: preview.resultCurrency || request.currency,
    ...(options.v2Lineage
      ? {
          workflowChannel: options.v2Lineage.workflowChannel,
          v2Handoff: options.v2Lineage.v2Handoff,
        }
      : {}),
    containerStudyResultId: csPin?.containerStudyResultId ?? null,
    containerStudyShipping: csPin?.shipping ?? null,
    containerStudyPinWarnings: csPin?.warnings ?? [],
  };

  const referenceSnapshot = {
    bomVersion: preview.bomVersion,
    engineeringRevision: preview.engineeringRevision,
    configurationVersionId: configVersionId,
    scrapCostStatus: preview.scrapCostStatus,
    governedBomLineIds: governedBomRows.map((g) => g.id),
    rawMaterialPriceIds,
    marketMetalSnapshot: metalPricingSnapshot,
    ...(options.v2Lineage
      ? {
          configurationSnapshotId: options.v2Lineage.configurationSnapshotId,
          cuttingLengthPlanId: options.v2Lineage.cuttingLengthPlanId,
          drumPlanId: options.v2Lineage.drumPlanId,
          drumPlanVersionNo: options.v2Lineage.drumPlanVersionNo,
          workflowChannel: options.v2Lineage.workflowChannel,
        }
      : {}),
    containerStudyResultId: csPin?.containerStudyResultId ?? null,
    containerStudyShipping: csPin?.shipping ?? null,
  };

  const outputSnapshot = {
    materialBreakdown: preview.materialBreakdown,
    layers: preview.layers,
    totals: preview.totals,
    costingStatus: preview.costingStatus,
    scrapCostStatus: preview.scrapCostStatus,
    fxSnapshot: preview.fxSnapshot,
    resultCurrency: preview.resultCurrency || request.currency,
    ...extensionStamp,
  };

  const created = await prisma.$transaction(async (tx) => {
    const calculation = await tx.costingCalculation.create({
      data: {
        calculationNumber,
        configurationVersionId: configVersionId || null,
        inquiryId: options.inquiryId || null,
        inquiryLineId: options.inquiryLineId || null,
        materialNumber: request.materialNumber,
        costingDate: new Date(request.costingDate),
        status: 'LOCKED',
        inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
        referenceSnapshot: referenceSnapshot as unknown as Prisma.InputJsonValue,
        outputSnapshot: outputSnapshot as unknown as Prisma.InputJsonValue,
        configurationSnapshotId: options.v2Lineage?.configurationSnapshotId || null,
        cuttingLengthPlanId: options.v2Lineage?.cuttingLengthPlanId || null,
        drumPlanId: options.v2Lineage?.drumPlanId || null,
        drumPlanVersionNo: options.v2Lineage?.drumPlanVersionNo ?? null,
        workflowChannel: options.v2Lineage?.workflowChannel || null,
        containerStudyResultId: csPin?.containerStudyResultId || null,
        createdBy: actor.name || actor.email || actor.id,
        snapshots: {
          create: [
            { snapshotType: 'INPUT', payload: inputSnapshot as unknown as Prisma.InputJsonValue },
            { snapshotType: 'REFERENCE', payload: referenceSnapshot as Prisma.InputJsonValue },
            {
              snapshotType: 'OUTPUT',
              payload: outputSnapshot as unknown as Prisma.InputJsonValue,
              formulaTrace: preview.layers as unknown as Prisma.InputJsonValue,
            },
          ],
        },
      },
    });

    await tx.costingRun.updateMany({
      where: {
        materialNumber: request.materialNumber,
        isCurrent: true,
        ...(options.inquiryLineId ? { inquiryLineId: options.inquiryLineId } : {}),
      },
      data: { isCurrent: false },
    });

    const run = await tx.costingRun.create({
      data: {
        costingRunNumber,
        materialNumber: request.materialNumber,
        costingDate: new Date(request.costingDate),
        currency: request.currency,
        quantity: request.quantity,
        lengthMeters: request.lengthMeters,
        lengthKm: request.lengthMeters / 1000,
        engineeringRevision: preview.engineeringRevision || 1,
        bomVersion: preview.bomVersion || 1,
        status: preview.layers.length > 0 ? 'CALCULATED' : 'INCOMPLETE',
        configurationVersionId: configVersionId || null,
        materialCost,
        scrapCostStatus: preview.scrapCostStatus,
        manufacturingCost: manufacturingTotal,
        isCurrent: true,
        inquiryLineId: options.inquiryLineId || null,
        drumPlanId: options.v2Lineage?.drumPlanId || null,
        containerStudyResultId: csPin?.containerStudyResultId || null,
        createdBy: actor.name || actor.email || actor.id,
        costingLines: {
          create: preview.materialBreakdown
            .filter((line) => line.unitPrice != null)
            .map((line) => ({
              componentType: 'MATERIAL' as const,
              rawMaterialCode: line.rawMaterialCode,
              rawMaterialDesc: line.rawMaterialDesc,
              consumptionPerKm: line.baseConsumptionPerKm,
              totalConsumption: line.totalConsumption,
              consumptionUom: line.consumptionUom,
              price: line.unitPrice!,
              priceCurrency: line.priceCurrency,
              priceUom: line.consumptionUom,
              priceBasis: 'PER_KG',
              priceId: line.priceId || null,
              pricingSource: line.pricingSource || null,
              masterPrice: line.masterPrice ?? null,
              masterPriceCurrency: line.masterPriceCurrency ?? null,
              masterPriceUom: line.masterPriceUom ?? null,
              inquiryHeaderPrice: line.inquiryHeaderPrice ?? null,
              inquiryHeaderPriceUom: line.inquiryHeaderPriceUom ?? null,
              lineCost: line.lineCost,
              calculationNotes: line.calculationNotes,
            })),
        },
      },
    });

    if (options.inquiryLineId) {
      await tx.commercialInquiryLine.update({
        where: { id: options.inquiryLineId },
        data: {
          costingReadinessStatus:
            (preview.calculationWarnings && preview.calculationWarnings.length) || (csPin?.warnings.length ?? 0)
              ? 'CALCULATED_WITH_WARNINGS'
              : 'READY_FOR_COSTING',
          costingRunId: run.id,
          costingCalculationId: calculation.id,
          materialCost: lineTotal,
          materialCostCurrency: request.currency,
          status: 'COSTING_READY',
        },
      });
    }

    return { calculation, run };
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'CostingCalculation',
        entityId: created.calculation.calculationNumber,
        action: 'CREATE',
        newValue: {
          calculationNumber: created.calculation.calculationNumber,
          materialNumber: request.materialNumber,
          materialCost,
          inquiryLineId: options.inquiryLineId,
          containerStudyResultId: csPin?.containerStudyResultId ?? null,
        },
        message: `Inquiry line costing calculated: ${materialCost} ${request.currency} for ${request.materialNumber}`,
      },
    });
  }

  await auditCostingContainerStudyPin({
    actor,
    costingRunId: created.run.id,
    costingRunNumber: created.run.costingRunNumber,
    containerStudyResultId: csPin?.containerStudyResultId ?? null,
    inquiryId: options.inquiryId,
    inquiryLineId: options.inquiryLineId,
  });

  return {
    ...preview,
    ...extensionStamp,
    calculationId: created.calculation.id,
    costingRunId: created.run.id,
    persisted: true,
    containerStudyResultId: csPin?.containerStudyResultId ?? null,
  };
}

function notReadyResult(
  request: StructuredCostingRequest,
  val: ReturnType<typeof validateCostingRequestInputs>,
  reasons: string[],
  errorCode: string
): CostingPreviewResult {
  return {
    status: 'NOT_READY',
    costingStatus: 'BLOCKED',
    materialNumber: request.materialNumber,
    costingDate: val.costingDate.toISOString().slice(0, 10),
    currency: val.currency,
    quantity: val.quantity,
    lengthMeters: val.lengthMeters,
    blockingReasons: reasons,
    errorCode,
    materialBreakdown: [],
    layers: [],
    totals: {
      materialCost: '0',
      scrapAdjustmentCost: '0',
      layerTotals: {},
      manufacturingTotal: null,
    },
    scrapCostStatus: 'NOT_CONFIGURED',
    configurationVersionId: request.configurationVersionId,
  };
}
