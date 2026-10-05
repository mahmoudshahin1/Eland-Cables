import { PriceBasis } from '@prisma/client';
import {
  StoredPriceRecord,
  getValidRawMaterialPrice,
  priceBasisForConsumptionUom,
} from '../services/rawMaterialPriceGovernanceService';
import {
  FxConversionContext,
  FxSnapshotEntry,
  convertAmount,
  normalizeCostingCurrency,
} from './currencyConversion';
import {
  InquiryMetalPricing,
  MaterialPricingSource,
  RawMaterialPricingCategory,
  isMarketMetalCategory,
  normalizePricingCategory,
  resolveMaterialUnitPrice,
} from './inquiryMetalPricing';
import { convertPriceForConsumptionUom } from './priceUom';
import { isExcludedFromDirectRawMaterialCost } from './rawMaterialClassification';

export type CostingRunStatus = 'DRAFT' | 'CALCULATED' | 'INCOMPLETE' | 'BLOCKED' | 'SUPERSEDED';

export type CostComponentType =
  | 'MATERIAL'
  | 'PROCESS'
  | 'LABOUR'
  | 'ENERGY'
  | 'OVERHEAD'
  | 'PACKAGING'
  | 'DRUM'
  | 'SCRAP'
  | 'OTHER';

export interface CostingRequest {
  materialNumber: string;
  costingDate?: string | Date;
  quantity?: number;
  lengthMeters?: number;
  currency?: string;
  comment?: string;
  fxContext?: FxConversionContext;
}

export interface MaterialCostLineDetail {
  componentType: CostComponentType;
  rawMaterialCode: string;
  rawMaterialDesc: string;
  consumptionPerKm: number;
  totalConsumption: number;
  consumptionUom: string;
  price: number;
  priceCurrency: string;
  priceUom: string;
  priceBasis: string;
  priceRevision: number;
  priceId?: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  pricingSource?: MaterialPricingSource;
  masterPrice?: number | null;
  masterPriceCurrency?: string | null;
  masterPriceUom?: string | null;
  inquiryHeaderPrice?: number | null;
  inquiryHeaderPriceUom?: string | null;
  metalType?: string;
  lineCost: number;
  calculationNotes?: string;
  originalLineCost?: number;
  originalCurrency?: string;
  fxRate?: number;
  fxRateSource?: string;
}

export interface CostingEngineResult {
  success: boolean;
  costingStatus: CostingRunStatus;
  materialNumber: string;
  costingDate: Date;
  currency: string;
  quantity: number;
  lengthMeters: number;
  lengthKm: number;
  engineeringRevision: number;
  bomVersion: number;
  materialCost: number;
  processCostStatus: 'NOT_CONFIGURED';
  overheadCostStatus: 'NOT_CONFIGURED';
  scrapCostStatus: 'NOT_CONFIGURED';
  manufacturingCost: null;
  costingLines: MaterialCostLineDetail[];
  blockingReasons: string[];
  errorCode?: string;
  fxSnapshot?: FxSnapshotEntry[];
  resultCurrency?: string;
}

export interface CostingContext {
  cable: {
    materialNumber: string;
    description: string;
  };
  engineeringMapping: {
    status: string;
    revision: number;
    family?: string | null;
    voltage?: string | null;
    conductor?: string | null;
    conductorSize?: string | null;
    cores?: string | null;
    insulation?: string | null;
  } | null;
  governedBomLines: Array<{
    rawMaterialCode: string;
    rawMaterialDesc?: string;
    consumption: number;
    uom: string;
    bomVersion: number;
    status: string;
  }>;
  sourceBomLines: Array<{
    rawMaterialCode: string;
    rawMaterialDesc?: string;
    consumption: number;
    uom: string;
    bomVersion: number;
  }>;
  bomConflicts: Array<{
    conflictId?: string | null;
    rawMaterialCode: string;
    investigationStatus: string;
  }>;
  rawMaterials: Map<string, { code: string; description: string; uom: string; pricingCategory?: string; metalType?: string }>;
  rawMaterialPricingCategories?: Map<string, RawMaterialPricingCategory>;
  inquiryMetalPricing?: InquiryMetalPricing | null;
  approvedPrices: StoredPriceRecord[];
  fxContext?: FxConversionContext;
}

/**
 * Validates Request Inputs (Quantity > 0, Length > 0, Valid Date, Currency)
 */
export function validateCostingRequestInputs(req: CostingRequest): {
  valid: boolean;
  costingDate: Date;
  quantity: number;
  lengthMeters: number;
  currency: string;
  errors: string[];
} {
  const errors: string[] = [];

  if (!req.materialNumber || !req.materialNumber.trim()) {
    errors.push('Material Number is mandatory for costing.');
  }

  const quantity = req.quantity != null ? Number(req.quantity) : 1;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push('Quantity must be a positive number greater than 0.');
  }

  const lengthMeters = req.lengthMeters != null ? Number(req.lengthMeters) : 1000;
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) {
    errors.push('Length in meters must be a positive number greater than 0.');
  }

  let costingDate = new Date();
  if (req.costingDate) {
    costingDate = new Date(req.costingDate);
    if (Number.isNaN(costingDate.getTime())) {
      errors.push('Costing Date is not a valid date.');
    }
  }

  const currency = (req.currency || 'USD').trim().toUpperCase();
  if (!currency) {
    errors.push('Currency is mandatory for costing.');
  }

  return {
    valid: errors.length === 0,
    costingDate,
    quantity,
    lengthMeters,
    currency,
    errors,
  };
}

/**
 * Evaluates the 4-Gate Costing Readiness prior to calculation.
 */
export function evaluateCostingGates(
  materialNumber: string,
  costingDate: Date,
  currency: string,
  context: CostingContext
): { ready: boolean; blockingReasons: string[]; errorCode?: string } {
  const blockingReasons: string[] = [];

  // GATE 1 — ENGINEERING
  if (!context.engineeringMapping || context.engineeringMapping.status !== 'APPROVED') {
    const st = context.engineeringMapping?.status || 'MISSING';
    blockingReasons.push(`Gate 1 Failed: Engineering mapping is ${st} (ENGINEERING_NOT_APPROVED).`);
  }

  // GATE 2 — BOM
  const unapprovedConflicts = context.bomConflicts.filter((cf) => cf.investigationStatus !== 'APPROVED');
  if (unapprovedConflicts.length > 0) {
    unapprovedConflicts.forEach((cf) => {
      blockingReasons.push(`Gate 2 Failed: BOM conflict ${cf.conflictId || 'BOM-CONF'} for Raw Material ${cf.rawMaterialCode} is unresolved (${cf.investigationStatus}).`);
    });
  }

  // Effective BOM lines (prefer governed BOM lines over source BOM lines)
  const effectiveBomLines = context.governedBomLines.length > 0
    ? context.governedBomLines.filter((g) => g.status === 'APPROVED')
    : context.sourceBomLines;

  if (effectiveBomLines.length === 0) {
    blockingReasons.push('Gate 2 Failed: Cable has no approved BOM lines.');
  }

  // GATE 3 & 4 — RAW MATERIALS & PRICE VALIDITY
  for (const line of effectiveBomLines) {
    const rm = context.rawMaterials.get(line.rawMaterialCode.toUpperCase());
    if (!rm) {
      blockingReasons.push(`Gate 3 Failed: Consumed Raw Material "${line.rawMaterialCode}" does not exist in master data.`);
      continue;
    }

    if (isExcludedFromDirectRawMaterialCost(line.rawMaterialCode, rm.description, line.uom)) {
      continue;
    }

    const pricingCategory =
      context.rawMaterialPricingCategories?.get(line.rawMaterialCode.toUpperCase()) ||
      normalizePricingCategory(rm.pricingCategory);

    if (isMarketMetalCategory(pricingCategory)) {
      const resolved = resolveMaterialUnitPrice({
        rawMaterialCode: line.rawMaterialCode,
        pricingCategory,
        consumptionUom: line.uom,
        costingCurrency: currency,
        costingDate,
        inquiryMetalPricing: context.inquiryMetalPricing,
        approvedPrices: context.approvedPrices,
      });
      if (!resolved.ok) {
        blockingReasons.push(`Gate 4 Failed: ${line.rawMaterialCode} — ${resolved.message} (${resolved.code}).`);
      } else if (
        resolved.appliedCurrency &&
        normalizeCostingCurrency(resolved.appliedCurrency) !== normalizeCostingCurrency(currency)
      ) {
        const fxCtx: FxConversionContext = {
          targetCurrency: currency,
          costingDate,
          ...(context.fxContext || {}),
        };
        const probe = convertAmount(1, resolved.appliedCurrency, currency, fxCtx);
        if (probe.ok === false) {
          blockingReasons.push(
            `Gate 4 Failed: ${line.rawMaterialCode} — inquiry metal price is ${resolved.appliedCurrency} but costing target is ${currency}; ${probe.message} (${probe.code}).`
          );
        }
      }
      continue;
    }

    const priceVal = getValidRawMaterialPrice(
      line.rawMaterialCode,
      costingDate,
      line.uom,
      currency,
      priceBasisForConsumptionUom(line.uom),
      context.approvedPrices,
      true
    );

    if (priceVal.code !== 'PRICE_VALID') {
      blockingReasons.push(`Gate 4 Failed: ${line.rawMaterialCode} — ${priceVal.message} (${priceVal.code}).`);
    } else if (priceVal.currency && normalizeCostingCurrency(priceVal.currency) !== normalizeCostingCurrency(currency)) {
      const fxCtx: FxConversionContext = {
        targetCurrency: currency,
        costingDate,
        ...(context.fxContext || {}),
      };
      const probe = convertAmount(1, priceVal.currency, currency, fxCtx);
      if (probe.ok === false) {
        blockingReasons.push(
          `Gate 4 Failed: ${line.rawMaterialCode} — price is ${priceVal.currency} but costing target is ${currency}; ${probe.message} (${probe.code}).`
        );
      }
    }
  }

  if (blockingReasons.length > 0) {
    let errorCode = 'COSTING_NOT_READY';
    if (blockingReasons.some((r) => r.includes('Gate 1'))) errorCode = 'ENGINEERING_NOT_APPROVED';
    else if (blockingReasons.some((r) => r.includes('Gate 2'))) errorCode = 'BOM_CONFLICT_UNRESOLVED';
    else if (blockingReasons.some((r) => r.includes('Gate 3'))) errorCode = 'RAW_MATERIAL_NOT_FOUND';
    else if (blockingReasons.some((r) => r.includes('PRICE_NOT_CONFIGURED'))) errorCode = 'PRICE_NOT_CONFIGURED';
    else if (blockingReasons.some((r) => r.includes('PRICE_EXPIRED'))) errorCode = 'PRICE_EXPIRED';
    else if (blockingReasons.some((r) => r.includes('PRICE_UOM_INCOMPATIBLE') || r.includes('PRICE_UOM_MISMATCH'))) errorCode = 'PRICE_UOM_INCOMPATIBLE';
    else if (blockingReasons.some((r) => r.includes('PRICE_UOM_REQUIRED'))) errorCode = 'PRICE_UOM_REQUIRED';
    else if (blockingReasons.some((r) => r.includes('PRICE_CURRENCY_MISMATCH'))) errorCode = 'PRICE_CURRENCY_MISMATCH';
    else if (blockingReasons.some((r) => r.includes('INQUIRY_COPPER_PRICE_REQUIRED'))) errorCode = 'INQUIRY_COPPER_PRICE_REQUIRED';
    else if (blockingReasons.some((r) => r.includes('INQUIRY_ALUMINIUM_PRICE_REQUIRED'))) errorCode = 'INQUIRY_ALUMINIUM_PRICE_REQUIRED';
    else if (blockingReasons.some((r) => r.includes('INQUIRY_METAL_UOM_INVALID'))) errorCode = 'INQUIRY_METAL_UOM_INVALID';
    else if (blockingReasons.some((r) => r.includes('FX_NOT_CONFIGURED'))) errorCode = 'FX_NOT_CONFIGURED';

    return { ready: false, blockingReasons, errorCode };
  }

  return { ready: true, blockingReasons: [] };
}

/**
 * Calculates raw material line cost with strict dimensional verification.
 */
export function calculateMaterialLineCost(
  consumptionPerKm: number,
  lengthMeters: number,
  quantity: number,
  consumptionUom: string,
  price: number,
  priceUom: string,
  priceBasis: string
): { lineCost: number; totalConsumption: number; calculationNotes: string } {
  void priceBasis;
  const lengthKm = lengthMeters / 1000;
  const totalConsumption = consumptionPerKm * lengthKm * quantity;

  const converted = convertPriceForConsumptionUom(price, priceUom, consumptionUom);
  if (converted.ok === false) {
    throw Object.assign(new Error(converted.message), {
      code: converted.code,
    });
  }
  const effectiveUnitPrice = converted.price;
  let notes = `${totalConsumption.toFixed(4)} ${consumptionUom} @ ${price.toFixed(4)} / ${priceUom}`;
  if (converted.factor !== 1) notes += ` → ${converted.notes}`;

  const rawCost = totalConsumption * effectiveUnitPrice;
  const lineCost = Math.round((rawCost + Number.EPSILON) * 100) / 100; // 2 decimal precision

  return {
    lineCost,
    totalConsumption: Math.round((totalConsumption + Number.EPSILON) * 10000) / 10000,
    calculationNotes: notes,
  };
}

/**
 * Costing Engine Domain Service:
 * Evaluates readiness gates, executes material cost calculations, and produces immutable CostingEngineResult.
 * NEVER calculates process cost, overhead, scrap, margins, discounts, or selling prices.
 */
export function calculateCableManufacturingCost(
  req: CostingRequest,
  context: CostingContext
): CostingEngineResult {
  const val = validateCostingRequestInputs(req);
  if (!val.valid) {
    return {
      success: false,
      costingStatus: 'BLOCKED',
      materialNumber: req.materialNumber,
      costingDate: val.costingDate,
      currency: val.currency,
      quantity: val.quantity,
      lengthMeters: val.lengthMeters,
      lengthKm: val.lengthMeters / 1000,
      engineeringRevision: context.engineeringMapping?.revision || 1,
      bomVersion: 1,
      materialCost: 0,
      processCostStatus: 'NOT_CONFIGURED',
      overheadCostStatus: 'NOT_CONFIGURED',
      scrapCostStatus: 'NOT_CONFIGURED',
      manufacturingCost: null,
      costingLines: [],
      blockingReasons: val.errors,
      errorCode: 'INVALID_REQUEST_INPUTS',
    };
  }

  // 4-Gate Costing Readiness Check
  const gateCheck = evaluateCostingGates(req.materialNumber, val.costingDate, val.currency, context);
  if (!gateCheck.ready) {
    return {
      success: false,
      costingStatus: 'BLOCKED',
      materialNumber: req.materialNumber,
      costingDate: val.costingDate,
      currency: val.currency,
      quantity: val.quantity,
      lengthMeters: val.lengthMeters,
      lengthKm: val.lengthMeters / 1000,
      engineeringRevision: context.engineeringMapping?.revision || 1,
      bomVersion: context.governedBomLines[0]?.bomVersion || 1,
      materialCost: 0,
      processCostStatus: 'NOT_CONFIGURED',
      overheadCostStatus: 'NOT_CONFIGURED',
      scrapCostStatus: 'NOT_CONFIGURED',
      manufacturingCost: null,
      costingLines: [],
      blockingReasons: gateCheck.blockingReasons,
      errorCode: gateCheck.errorCode || 'COSTING_NOT_READY',
    };
  }

  // Material Cost Calculation Layer
  const effectiveBomLines = context.governedBomLines.length > 0
    ? context.governedBomLines.filter((g) => g.status === 'APPROVED')
    : context.sourceBomLines;

  const costingLines: MaterialCostLineDetail[] = [];
  let totalMaterialCost = 0;
  const fxSnapshot: FxSnapshotEntry[] = [];
  const fxCtx: FxConversionContext = {
    targetCurrency: val.currency,
    costingDate: val.costingDate,
    ...(req.fxContext || context.fxContext || {}),
  };

  for (const line of effectiveBomLines) {
    const rm = context.rawMaterials.get(line.rawMaterialCode.toUpperCase())!;
    if (isExcludedFromDirectRawMaterialCost(line.rawMaterialCode, rm.description, line.uom)) {
      costingLines.push({
        componentType: 'PACKAGING',
        rawMaterialCode: line.rawMaterialCode,
        rawMaterialDesc: rm.description,
        consumptionPerKm: line.consumption,
        totalConsumption: line.consumption * (val.lengthMeters / 1000) * val.quantity,
        consumptionUom: line.uom,
        price: 0,
        priceCurrency: val.currency,
        priceUom: line.uom,
        priceBasis: 'PER_PCS',
        priceRevision: 1,
        pricingSource: 'RAW_MATERIAL_MASTER',
        metalType: rm.metalType || 'NONE',
        lineCost: 0,
        calculationNotes: 'Excluded from Direct Raw Material Cost (packing / accessory).',
      });
      continue;
    }

    const pricingCategory =
      context.rawMaterialPricingCategories?.get(line.rawMaterialCode.toUpperCase()) ||
      normalizePricingCategory(rm.pricingCategory);

    const priceRes = resolveMaterialUnitPrice({
      rawMaterialCode: line.rawMaterialCode,
      pricingCategory,
      consumptionUom: line.uom,
      costingCurrency: val.currency,
      costingDate: val.costingDate,
      inquiryMetalPricing: context.inquiryMetalPricing,
      approvedPrices: context.approvedPrices,
    });

    if (!priceRes.ok || priceRes.appliedPrice == null) {
      return {
        success: false,
        costingStatus: 'BLOCKED',
        materialNumber: req.materialNumber,
        costingDate: val.costingDate,
        currency: val.currency,
        quantity: val.quantity,
        lengthMeters: val.lengthMeters,
        lengthKm: val.lengthMeters / 1000,
        engineeringRevision: context.engineeringMapping?.revision || 1,
        bomVersion: effectiveBomLines[0]?.bomVersion || 1,
        materialCost: 0,
        processCostStatus: 'NOT_CONFIGURED',
        overheadCostStatus: 'NOT_CONFIGURED',
        scrapCostStatus: 'NOT_CONFIGURED',
        manufacturingCost: null,
        costingLines: [],
        blockingReasons: [
          `${line.rawMaterialCode}: ${priceRes.message || 'Price resolution failed'} (${priceRes.code || 'PRICE_NOT_CONFIGURED'}).`,
        ],
        errorCode: priceRes.code || 'PRICE_NOT_CONFIGURED',
        fxSnapshot,
        resultCurrency: val.currency,
      };
    }

    const priceRec = priceRes.priceRecord;
    let lineCalc;
    try {
      lineCalc = calculateMaterialLineCost(
        line.consumption,
        val.lengthMeters,
        val.quantity,
        line.uom,
        priceRes.appliedPrice,
        priceRes.appliedUom || line.uom,
        priceRes.priceBasis || 'PER_KG'
      );
    } catch (err) {
      const code = (err as { code?: string }).code || 'PRICE_UOM_INCOMPATIBLE';
      return {
        success: false,
        costingStatus: 'BLOCKED',
        materialNumber: req.materialNumber,
        costingDate: val.costingDate,
        currency: val.currency,
        quantity: val.quantity,
        lengthMeters: val.lengthMeters,
        lengthKm: val.lengthMeters / 1000,
        engineeringRevision: context.engineeringMapping?.revision || 1,
        bomVersion: effectiveBomLines[0]?.bomVersion || 1,
        materialCost: 0,
        processCostStatus: 'NOT_CONFIGURED',
        overheadCostStatus: 'NOT_CONFIGURED',
        scrapCostStatus: 'NOT_CONFIGURED',
        manufacturingCost: null,
        costingLines: [],
        blockingReasons: [`${line.rawMaterialCode}: ${(err as Error).message} (${code}).`],
        errorCode: code,
        fxSnapshot,
        resultCurrency: val.currency,
      };
    }

    const priceCurrency = priceRes.appliedCurrency || val.currency;
    let lineCost = lineCalc.lineCost;
    let notes = lineCalc.calculationNotes;
    if (
      priceRes.pricingSource === 'INQUIRY_HEADER' ||
      priceRes.pricingSource === 'INQUIRY_OVERRIDE' ||
      priceRes.pricingSource === 'INQUIRY_SYSTEM_DEFAULT'
    ) {
      notes = `${priceRes.inquiryHeaderPrice} ${priceRes.inquiryHeaderPriceUom || ''} (${priceRes.pricingSource}) → ${notes}`;
    }
    let originalLineCost: number | undefined;
    let originalCurrency: string | undefined;
    let fxRate: number | undefined;
    let fxRateSource: string | undefined;

    if (normalizeCostingCurrency(priceCurrency) !== normalizeCostingCurrency(val.currency)) {
      originalLineCost = lineCost;
      originalCurrency = normalizeCostingCurrency(priceCurrency);
      const converted = convertAmount(lineCost, priceCurrency, val.currency, fxCtx);
      if (converted.ok === false) {
        return {
          success: false,
          costingStatus: 'BLOCKED',
          materialNumber: req.materialNumber,
          costingDate: val.costingDate,
          currency: val.currency,
          quantity: val.quantity,
          lengthMeters: val.lengthMeters,
          lengthKm: val.lengthMeters / 1000,
          engineeringRevision: context.engineeringMapping?.revision || 1,
          bomVersion: effectiveBomLines[0]?.bomVersion || 1,
          materialCost: 0,
          processCostStatus: 'NOT_CONFIGURED',
          overheadCostStatus: 'NOT_CONFIGURED',
          scrapCostStatus: 'NOT_CONFIGURED',
          manufacturingCost: null,
          costingLines: [],
          blockingReasons: [
            `${line.rawMaterialCode}: ${converted.message} (${converted.code}).`,
          ],
          errorCode: 'FX_NOT_CONFIGURED',
          fxSnapshot,
          resultCurrency: val.currency,
        };
      }
      lineCost = converted.converted;
      fxRate = converted.resolution.rate;
      fxRateSource = converted.resolution.source;
      fxSnapshot.push(converted.snapshot);
      notes += ` → ${lineCost.toFixed(2)} ${val.currency} @ FX ${fxRate} (${fxRateSource})`;
    }

    totalMaterialCost += lineCost;

    costingLines.push({
      componentType: 'MATERIAL',
      rawMaterialCode: line.rawMaterialCode,
      rawMaterialDesc: rm.description,
      consumptionPerKm: line.consumption,
      totalConsumption: lineCalc.totalConsumption,
      consumptionUom: line.uom,
      price: priceRes.appliedPrice,
      priceCurrency: priceRes.appliedCurrency || val.currency,
      priceUom: priceRes.appliedUom || line.uom,
      priceBasis: priceRes.priceBasis || 'PER_KG',
      priceRevision: priceRes.masterPriceRevision || priceRec?.revision || 1,
      priceId: priceRes.masterPriceId || priceRec?.id,
      effectiveFrom: priceRes.masterEffectiveFrom ?? priceRec?.effectiveFrom,
      effectiveTo: priceRes.masterEffectiveTo ?? priceRec?.effectiveTo,
      pricingSource: priceRes.pricingSource,
      masterPrice: priceRes.masterPrice,
      masterPriceCurrency: priceRes.masterPriceCurrency,
      masterPriceUom: priceRes.masterPriceUom,
      inquiryHeaderPrice: priceRes.inquiryHeaderPrice,
      inquiryHeaderPriceUom: priceRes.inquiryHeaderPriceUom,
      metalType: rm.metalType || 'NONE',
      lineCost,
      calculationNotes: notes,
      originalLineCost,
      originalCurrency,
      fxRate,
      fxRateSource,
    });
  }

  const roundedTotalMaterialCost = Math.round((totalMaterialCost + Number.EPSILON) * 100) / 100;

  return {
    success: true,
    costingStatus: 'INCOMPLETE', // Material cost calculated, process/overhead NOT configured
    materialNumber: req.materialNumber,
    costingDate: val.costingDate,
    currency: val.currency,
    quantity: val.quantity,
    lengthMeters: val.lengthMeters,
    lengthKm: val.lengthMeters / 1000,
    engineeringRevision: context.engineeringMapping?.revision || 1,
    bomVersion: effectiveBomLines[0]?.bomVersion || 1,
    materialCost: roundedTotalMaterialCost,
    processCostStatus: 'NOT_CONFIGURED',
    overheadCostStatus: 'NOT_CONFIGURED',
    scrapCostStatus: 'NOT_CONFIGURED',
    manufacturingCost: null, // Never display false total manufacturing cost
    costingLines,
    blockingReasons: [],
    fxSnapshot: fxSnapshot.length ? fxSnapshot : undefined,
    resultCurrency: val.currency,
  };
}
