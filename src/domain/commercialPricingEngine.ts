import {
  Prisma,
  PricingRuleType,
  PricingRuleScope,
  CommercialPricingStatus,
  PriceWorkflowStatus,
} from '@prisma/client';
import { dateCovers, formatDateOnlyUtc, parseDateOnly } from './shippingCostCanonical';

export const PRICING_MONEY_DECIMAL_PLACES = 2;

/** Authoritative Costing V2 commercial pricing precedence. Highest specificity wins. */
export const PRICING_PRECEDENCE = [
  { level: 1, scope: 'CUSTOMER_CABLE_SPECIFIC' as const, levelName: 'CUSTOMER_CABLE' },
  { level: 2, scope: 'CUSTOMER_GROUP_CABLE' as const, levelName: 'CUSTOMER_GROUP_CABLE' },
  { level: 3, scope: 'CUSTOMER_FAMILY' as const, levelName: 'CUSTOMER_FAMILY' },
  { level: 4, scope: 'CUSTOMER_GROUP_FAMILY' as const, levelName: 'CUSTOMER_GROUP_FAMILY' },
  { level: 5, scope: 'CABLE_FAMILY' as const, levelName: 'CABLE_FAMILY' },
  { level: 6, scope: 'GLOBAL' as const, levelName: 'GLOBAL' },
] as const;

export type PricingPrecedenceLevelName =
  | 'CUSTOMER_CABLE'
  | 'CUSTOMER_GROUP_CABLE'
  | 'CUSTOMER_FAMILY'
  | 'CUSTOMER_GROUP_FAMILY'
  | 'CABLE_FAMILY'
  | 'CUSTOMER_SPECIFIC'
  | 'CUSTOMER_TIER_CABLE_SPECIFIC'
  | 'CUSTOMER_TIER'
  | 'GLOBAL';

export interface PricingResolutionRequest {
  materialCost: number | string | Prisma.Decimal;
  currency: string;
  materialNumber?: string;
  customerId?: string;
  customerGroupId?: string;
  customerTierCode?: string;
  cableFamily?: string;
  pricingDate?: Date;
  quantity?: number;
  lengthMeters?: number;
  requestedDiscountPercentage?: number;
}

export interface StoredPricingRule {
  id: string;
  ruleCode: string;
  ruleName: string;
  scope: PricingRuleScope;
  ruleType: PricingRuleType;
  customerId: string | null;
  customerGroupId?: string | null;
  customerTierCode: string | null;
  cableMaterialNumber: string | null;
  cableFamily?: string | null;
  percentageValue: number | string | Prisma.Decimal;
  currency: string;
  priority: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  workflowStatus: PriceWorkflowStatus;
  status?: string | null;
  isCurrent: boolean;
  revision: number;
  minMarginThreshold: number | null;
  maxDiscountAllowed: number | null;
}

export interface StoredDiscountRule {
  id: string;
  discountCode: string;
  discountName: string;
  customerId: string | null;
  customerTierCode: string | null;
  cableMaterialNumber: string | null;
  discountPercentage: number;
  maxDiscountAllowed: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  workflowStatus: PriceWorkflowStatus;
  isCurrent: boolean;
  revision: number;
}

export interface ResolvedPricingRuleResult {
  code: 'PRICING_RULE_FOUND' | 'PRICING_NOT_CONFIGURED' | 'PRICING_RULE_CONFLICT' | 'PRICING_RULE_EXPIRED' | 'PRICING_CURRENCY_MISMATCH';
  rule?: StoredPricingRule;
  message: string;
  scope?: PricingRuleScope | string;
  precedence?: number;
  resolutionReason?: string;
}

export interface CommercialPriceCalculationResult {
  success: boolean;
  pricingStatus: CommercialPricingStatus;
  materialCost: number;
  materialCostExact: string;
  currency: string;
  quantity: number;
  lengthMeters: number;
  lengthKm: number;

  pricingRuleId?: string;
  pricingRuleCode?: string;
  pricingRuleRevision?: number;
  pricingRuleType?: PricingRuleType;
  pricingRuleScope?: PricingRuleScope | string;
  percentageValue?: number;
  percentageValueExact?: string;
  resolutionReason?: string;
  precedence?: number;

  baseSellingPrice: number | null;
  baseSellingPriceExact: string | null;
  discountPercentage: number;
  discountAmount: number | null;
  finalSellingPrice: number | null;
  finalSellingPriceExact: string | null;
  unitSellingPrice: number | null;

  approvalRequired: boolean;
  approvalReason?: string;
  blockingReasons: string[];
  errorCode?: string;
}

export function normalizePricingFamily(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export function buildPricingScopeKey(input: {
  scope: string;
  currency?: string | null;
  customerId?: string | null;
  customerGroupId?: string | null;
  customerTierCode?: string | null;
  cableMaterialNumber?: string | null;
  cableFamily?: string | null;
}): string {
  return [
    input.scope,
    (input.currency || 'USD').trim().toUpperCase(),
    input.customerId || '',
    input.customerGroupId || '',
    input.customerTierCode || '',
    input.cableMaterialNumber || '',
    normalizePricingFamily(input.cableFamily) || '',
  ].join('|');
}

function toDecimal(value: number | string | Prisma.Decimal, label: string): Prisma.Decimal {
  try {
    const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    if (!decimal.isFinite()) {
      throw new Error('not finite');
    }
    return decimal;
  } catch {
    throw Object.assign(new Error(`${label} must be a finite decimal.`), { code: 'INVALID_DECIMAL' });
  }
}

function moneyDecimal(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(PRICING_MONEY_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
}

function eqIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function familyEq(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePricingFamily(a);
  const right = normalizePricingFamily(b);
  return Boolean(left && right && left === right);
}

function isGovernedRule(rule: StoredPricingRule): boolean {
  if (rule.workflowStatus !== 'APPROVED') return false;
  if (rule.status === 'INACTIVE') return false;
  return true;
}

/**
 * Calculates Base Selling Price using Prisma Decimal.
 * MARKUP and GROSS_MARGIN (margin) are distinct formulas. Do not treat them as the same.
 *
 * Markup:  SellingPrice = Cost × (1 + Markup% / 100)
 * Margin:  SellingPrice = Cost ÷ (1 − Margin% / 100)
 */
export function calculateBaseSellingPriceDecimal(
  materialCost: number | string | Prisma.Decimal,
  ruleType: PricingRuleType,
  percentageValue: number | string | Prisma.Decimal
): Prisma.Decimal {
  const cost = toDecimal(materialCost, 'Material cost');
  if (cost.isNaN() || !cost.isFinite()) {
    throw Object.assign(new Error('Material cost is not a finite decimal.'), { code: 'INVALID_MATERIAL_COST' });
  }
  if (cost.lessThan(0)) {
    throw Object.assign(new Error('Material cost cannot be negative.'), { code: 'INVALID_MATERIAL_COST' });
  }

  const pct = toDecimal(percentageValue, 'Percentage');
  if (pct.isNaN() || !pct.isFinite()) {
    throw Object.assign(new Error('Percentage is not a finite decimal.'), { code: 'INVALID_PERCENTAGE' });
  }

  if (ruleType === 'MARKUP') {
    if (pct.lessThan(0)) {
      throw Object.assign(new Error('Markup percentage cannot be negative.'), { code: 'INVALID_MARKUP_VALUE' });
    }
    const factor = new Prisma.Decimal(1).plus(pct.div(100));
    return moneyDecimal(cost.times(factor));
  }

  if (ruleType === 'GROSS_MARGIN') {
    if (pct.lessThan(0) || pct.greaterThanOrEqualTo(100)) {
      throw Object.assign(new Error('Gross margin percentage must be between 0% and less than 100%.'), {
        code: 'INVALID_MARGIN_VALUE',
      });
    }
    const denominator = new Prisma.Decimal(1).minus(pct.div(100));
    if (denominator.lessThanOrEqualTo(0)) {
      throw Object.assign(new Error('Gross margin percentage must be strictly less than 100% (division by zero).'), {
        code: 'INVALID_MARGIN_VALUE',
      });
    }
    const raw = cost.div(denominator);
    if (!raw.isFinite()) {
      throw Object.assign(new Error('Margin calculation produced a non-finite selling price.'), {
        code: 'INVALID_MARGIN_VALUE',
      });
    }
    return moneyDecimal(raw);
  }

  throw Object.assign(new Error(`Unsupported pricing rule type: ${ruleType}`), {
    code: 'UNSUPPORTED_RULE_TYPE',
  });
}

/**
 * Number-returning wrapper for existing Increment 12 tests. Authority is Decimal.
 */
export function calculateBaseSellingPrice(
  materialCost: number,
  ruleType: PricingRuleType,
  percentageValue: number
): number {
  return Number(calculateBaseSellingPriceDecimal(materialCost, ruleType, percentageValue));
}

export function calculateDiscountAndFinalPriceDecimal(
  baseSellingPrice: number | string | Prisma.Decimal,
  discountPercentage: number | string | Prisma.Decimal
): { discountAmount: Prisma.Decimal; finalSellingPrice: Prisma.Decimal } {
  const base = toDecimal(baseSellingPrice, 'Base selling price');
  const pct = toDecimal(discountPercentage, 'Discount percentage');
  if (pct.lessThan(0) || pct.greaterThan(100)) {
    throw Object.assign(new Error('Discount percentage must be between 0% and 100%.'), {
      code: 'INVALID_DISCOUNT_VALUE',
    });
  }
  const discountAmount = moneyDecimal(base.times(pct.div(100)));
  const finalSellingPrice = moneyDecimal(base.minus(discountAmount));
  return { discountAmount, finalSellingPrice };
}

export function calculateDiscountAndFinalPrice(
  baseSellingPrice: number,
  discountPercentage: number
): { discountAmount: number; finalSellingPrice: number } {
  const res = calculateDiscountAndFinalPriceDecimal(baseSellingPrice, discountPercentage);
  return {
    discountAmount: Number(res.discountAmount),
    finalSellingPrice: Number(res.finalSellingPrice),
  };
}

function pricingDateKey(value?: Date): string {
  if (value && !Number.isNaN(value.getTime())) return formatDateOnlyUtc(value);
  return formatDateOnlyUtc(new Date());
}

function ruleDateValid(rule: StoredPricingRule, asOf: string): boolean {
  const from = rule.effectiveFrom ? parseDateOnly(rule.effectiveFrom) : '0001-01-01';
  const to = rule.effectiveTo ? parseDateOnly(rule.effectiveTo) : null;
  if (!from) return false;
  return dateCovers(asOf, from, to);
}

function pickDeterministicRule(rules: StoredPricingRule[], levelName: string): ResolvedPricingRuleResult {
  const sorted = [...rules].sort((a, b) => {
    if (b.revision !== a.revision) return b.revision - a.revision;
    const aFrom = a.effectiveFrom ? a.effectiveFrom.getTime() : 0;
    const bFrom = b.effectiveFrom ? b.effectiveFrom.getTime() : 0;
    if (bFrom !== aFrom) return bFrom - aFrom;
    return a.id.localeCompare(b.id);
  });
  const top = sorted[0];
  const tied = sorted.filter(
    (r) =>
      r.revision === top.revision &&
      (r.effectiveFrom?.getTime() ?? 0) === (top.effectiveFrom?.getTime() ?? 0)
  );
  if (tied.length > 1) {
    return {
      code: 'PRICING_RULE_CONFLICT',
      message: `Multiple active pricing rules share identical scope (${levelName}), version (${top.revision}), and effective-from. Conflict detected.`,
      scope: top.scope,
      resolutionReason: `CONFLICT at ${levelName}`,
    };
  }
  return {
    code: 'PRICING_RULE_FOUND',
    rule: top,
    message: `Resolved pricing rule ${top.ruleCode} (${top.ruleName}) at scope ${levelName}.`,
    scope: top.scope,
    resolutionReason: `Selected ${top.ruleCode} at ${levelName} version ${top.revision}`,
  };
}

/**
 * Deterministically resolves governed commercial pricing rules.
 * Required precedence (highest specificity wins):
 * 1. Customer + Cable
 * 2. Customer Group + Cable
 * 3. Customer + Cable Family
 * 4. Customer Group + Cable Family
 * 5. Cable Family
 * 6. Global Default
 *
 * Increment 12 CUSTOMER_SPECIFIC / CUSTOMER_TIER / CABLE_SPECIFIC remain as
 * compatibility fallbacks between Cable Family and Global so existing approved
 * rules continue to resolve. They are not a second hierarchy.
 */
export function resolvePricingRule(
  req: {
    materialNumber?: string;
    customerId?: string;
    customerGroupId?: string;
    customerTierCode?: string;
    cableFamily?: string;
    currency: string;
    pricingDate?: Date;
  },
  approvedRules: StoredPricingRule[]
): ResolvedPricingRuleResult {
  const asOf = pricingDateKey(req.pricingDate);
  const reqCurrency = req.currency.toUpperCase();
  const mat = req.materialNumber;
  const cust = req.customerId;
  const group = req.customerGroupId;
  const family = normalizePricingFamily(req.cableFamily);
  const tier = req.customerTierCode;

  const candidateRules = approvedRules.filter(isGovernedRule);
  if (!candidateRules.length) {
    return {
      code: 'PRICING_NOT_CONFIGURED',
      message: 'No approved commercial pricing rules exist in the governance catalog.',
      resolutionReason: 'PRICING_NOT_CONFIGURED',
    };
  }

  const matchers: Array<{
    level: number;
    levelName: PricingPrecedenceLevelName;
    filter: (r: StoredPricingRule) => boolean;
  }> = [
    {
      level: 1,
      levelName: 'CUSTOMER_CABLE',
      filter: (r) =>
        r.scope === 'CUSTOMER_CABLE_SPECIFIC' &&
        eqIgnoreCase(r.customerId, cust) &&
        eqIgnoreCase(r.cableMaterialNumber, mat),
    },
    {
      level: 2,
      levelName: 'CUSTOMER_GROUP_CABLE',
      filter: (r) =>
        r.scope === 'CUSTOMER_GROUP_CABLE' &&
        eqIgnoreCase(r.customerGroupId, group) &&
        eqIgnoreCase(r.cableMaterialNumber, mat),
    },
    {
      level: 3,
      levelName: 'CUSTOMER_FAMILY',
      filter: (r) => r.scope === 'CUSTOMER_FAMILY' && eqIgnoreCase(r.customerId, cust) && familyEq(r.cableFamily, family),
    },
    {
      level: 4,
      levelName: 'CUSTOMER_GROUP_FAMILY',
      filter: (r) =>
        r.scope === 'CUSTOMER_GROUP_FAMILY' &&
        eqIgnoreCase(r.customerGroupId, group) &&
        familyEq(r.cableFamily, family),
    },
    {
      level: 5,
      levelName: 'CABLE_FAMILY',
      filter: (r) => r.scope === 'CABLE_FAMILY' && familyEq(r.cableFamily, family) && !r.customerId && !r.customerGroupId,
    },
    {
      level: 6,
      levelName: 'CUSTOMER_SPECIFIC',
      filter: (r) =>
        r.scope === 'CUSTOMER_SPECIFIC' && eqIgnoreCase(r.customerId, cust) && !r.cableMaterialNumber && !r.cableFamily,
    },
    {
      level: 7,
      levelName: 'CUSTOMER_TIER_CABLE_SPECIFIC',
      filter: (r) =>
        r.scope === 'CABLE_SPECIFIC' &&
        eqIgnoreCase(r.customerTierCode, tier) &&
        eqIgnoreCase(r.cableMaterialNumber, mat),
    },
    {
      level: 8,
      levelName: 'CUSTOMER_TIER',
      filter: (r) =>
        r.scope === 'CUSTOMER_TIER' && eqIgnoreCase(r.customerTierCode, tier) && !r.cableMaterialNumber && !r.cableFamily,
    },
    {
      level: 9,
      levelName: 'GLOBAL',
      filter: (r) =>
        r.scope === 'GLOBAL' &&
        !r.customerId &&
        !r.customerGroupId &&
        !r.customerTierCode &&
        !r.cableMaterialNumber &&
        !r.cableFamily,
    },
  ];

  let sawExpired = false;
  let sawCurrencyMismatch = false;

  for (const matcher of matchers) {
    const matched = candidateRules.filter(matcher.filter);
    if (!matched.length) continue;

    const currencyMatched = matched.filter((r) => r.currency.toUpperCase() === reqCurrency);
    if (!currencyMatched.length) {
      sawCurrencyMismatch = true;
      continue;
    }

    const temporallyValid = currencyMatched.filter((r) => ruleDateValid(r, asOf));
    if (!temporallyValid.length) {
      sawExpired = true;
      continue;
    }

    const picked = pickDeterministicRule(temporallyValid, matcher.levelName);
    if (picked.code === 'PRICING_RULE_FOUND' && picked.rule) {
      picked.precedence = matcher.level;
      picked.resolutionReason = `precedence ${matcher.level} ${matcher.levelName}; rule ${picked.rule.ruleCode} version ${picked.rule.revision}`;
    }
    return picked;
  }

  if (sawCurrencyMismatch && !sawExpired) {
    return {
      code: 'PRICING_CURRENCY_MISMATCH',
      message: `Pricing rule found but currency differs from requested "${reqCurrency}". Automated FX conversion is prohibited.`,
      resolutionReason: 'PRICING_CURRENCY_MISMATCH',
    };
  }
  if (sawExpired) {
    return {
      code: 'PRICING_RULE_EXPIRED',
      message: `Pricing rules matching this scope have expired for pricing date ${asOf}.`,
      resolutionReason: 'PRICING_RULE_EXPIRED',
    };
  }
  return {
    code: 'PRICING_NOT_CONFIGURED',
    message: 'No governed commercial pricing rule matched the customer, group, family, or cable scope.',
    resolutionReason: 'PRICING_NOT_CONFIGURED',
  };
}

function emptyMoneyResult(
  extras: Partial<CommercialPriceCalculationResult> &
    Pick<CommercialPriceCalculationResult, 'success' | 'pricingStatus' | 'materialCost' | 'materialCostExact' | 'currency' | 'quantity' | 'lengthMeters' | 'lengthKm' | 'blockingReasons'>
): CommercialPriceCalculationResult {
  return {
    baseSellingPrice: null,
    baseSellingPriceExact: null,
    discountPercentage: 0,
    discountAmount: null,
    finalSellingPrice: null,
    finalSellingPriceExact: null,
    unitSellingPrice: null,
    approvalRequired: false,
    ...extras,
  };
}

/**
 * Commercial Pricing Engine Domain Service:
 * Consumes an authoritative Costing V2 cost. Does not recalculate raw-material consumption.
 */
export function calculateCommercialSellingPrice(
  req: PricingResolutionRequest,
  context: {
    approvedPricingRules: StoredPricingRule[];
    approvedDiscountRules?: StoredDiscountRule[];
  }
): CommercialPriceCalculationResult {
  const blockingReasons: string[] = [];
  const quantity = req.quantity != null ? Number(req.quantity) : 1;
  const lengthMeters = req.lengthMeters != null ? Number(req.lengthMeters) : 1000;
  const lengthKm = lengthMeters / 1000;

  let cost: Prisma.Decimal;
  try {
    cost = toDecimal(req.materialCost, 'Material cost');
  } catch (err: any) {
    blockingReasons.push(err.message);
    return emptyMoneyResult({
      success: false,
      pricingStatus: 'PRICING_NOT_CONFIGURED',
      materialCost: Number(req.materialCost) || 0,
      materialCostExact: String(req.materialCost ?? '0'),
      currency: req.currency,
      quantity,
      lengthMeters,
      lengthKm,
      blockingReasons,
      errorCode: err.code || 'INVALID_MATERIAL_COST',
    });
  }

  if (cost.lessThan(0) || !cost.isFinite()) {
    blockingReasons.push('Material cost is negative or not finite. Cannot calculate selling price.');
    return emptyMoneyResult({
      success: false,
      pricingStatus: 'PRICING_NOT_CONFIGURED',
      materialCost: Number(cost),
      materialCostExact: cost.toFixed(),
      currency: req.currency,
      quantity,
      lengthMeters,
      lengthKm,
      blockingReasons,
      errorCode: 'INVALID_MATERIAL_COST',
    });
  }

  const ruleResolution = resolvePricingRule(
    {
      materialNumber: req.materialNumber,
      customerId: req.customerId,
      customerGroupId: req.customerGroupId,
      customerTierCode: req.customerTierCode,
      cableFamily: req.cableFamily,
      currency: req.currency,
      pricingDate: req.pricingDate,
    },
    context.approvedPricingRules
  );

  if (ruleResolution.code !== 'PRICING_RULE_FOUND' || !ruleResolution.rule) {
    blockingReasons.push(`Pricing Rule Resolution: ${ruleResolution.message}`);
    const statusMap: Record<string, CommercialPricingStatus> = {
      PRICING_NOT_CONFIGURED: 'PRICING_NOT_CONFIGURED',
      PRICING_RULE_CONFLICT: 'PRICING_RULE_CONFLICT',
      PRICING_RULE_EXPIRED: 'PRICING_EXPIRED',
      PRICING_CURRENCY_MISMATCH: 'PRICING_CURRENCY_MISMATCH',
    };
    return emptyMoneyResult({
      success: false,
      pricingStatus: statusMap[ruleResolution.code] || 'PRICING_NOT_CONFIGURED',
      materialCost: Number(cost),
      materialCostExact: cost.toFixed(),
      currency: req.currency,
      quantity,
      lengthMeters,
      lengthKm,
      blockingReasons,
      errorCode: ruleResolution.code,
      resolutionReason: ruleResolution.resolutionReason,
    });
  }

  const selectedRule = ruleResolution.rule;
  const percentageVal = toDecimal(selectedRule.percentageValue, 'Percentage');

  let baseSellingPrice: Prisma.Decimal;
  try {
    baseSellingPrice = calculateBaseSellingPriceDecimal(cost, selectedRule.ruleType, percentageVal);
  } catch (err: any) {
    blockingReasons.push(err.message);
    return emptyMoneyResult({
      success: false,
      pricingStatus: 'PRICING_NOT_CONFIGURED',
      materialCost: Number(cost),
      materialCostExact: cost.toFixed(),
      currency: req.currency,
      quantity,
      lengthMeters,
      lengthKm,
      blockingReasons,
      errorCode: err.code || 'CALCULATION_ERROR',
    });
  }

  const discountPercentage =
    req.requestedDiscountPercentage != null ? Math.max(0, Number(req.requestedDiscountPercentage)) : 0;
  if (discountPercentage > 100) {
    blockingReasons.push('Discount percentage cannot exceed 100%.');
    return emptyMoneyResult({
      success: false,
      pricingStatus: 'PRICING_NOT_CONFIGURED',
      materialCost: Number(cost),
      materialCostExact: cost.toFixed(),
      currency: req.currency,
      quantity,
      lengthMeters,
      lengthKm,
      blockingReasons,
      errorCode: 'INVALID_DISCOUNT_VALUE',
      baseSellingPrice: Number(baseSellingPrice),
      baseSellingPriceExact: baseSellingPrice.toFixed(),
    });
  }

  const { discountAmount, finalSellingPrice } = calculateDiscountAndFinalPriceDecimal(
    baseSellingPrice,
    discountPercentage
  );

  let approvalRequired = false;
  let approvalReason: string | undefined;

  const maxAllowedDisc = selectedRule.maxDiscountAllowed != null ? Number(selectedRule.maxDiscountAllowed) : 15.0;
  if (discountPercentage > maxAllowedDisc) {
    approvalRequired = true;
    approvalReason = `Requested discount (${discountPercentage}%) exceeds maximum allowed threshold (${maxAllowedDisc}%).`;
  }

  if (selectedRule.minMarginThreshold != null && finalSellingPrice.greaterThan(0)) {
    const actualGrossMargin = finalSellingPrice.minus(cost).div(finalSellingPrice).times(100);
    const minMargin = Number(selectedRule.minMarginThreshold);
    if (Number(actualGrossMargin) < minMargin) {
      approvalRequired = true;
      approvalReason =
        (approvalReason ? `${approvalReason} ` : '') +
        `Resulting gross margin (${actualGrossMargin.toFixed(2)}%) is below minimum threshold (${minMargin}%).`;
    }
  }

  const unitSellingPrice =
    lengthKm > 0 ? moneyDecimal(finalSellingPrice.div(new Prisma.Decimal(lengthKm * quantity))) : finalSellingPrice;

  return {
    success: true,
    pricingStatus: approvalRequired ? 'PRICING_APPROVAL_REQUIRED' : 'PRICING_CALCULATED',
    materialCost: Number(cost),
    materialCostExact: cost.toFixed(),
    currency: selectedRule.currency,
    quantity,
    lengthMeters,
    lengthKm,
    pricingRuleId: selectedRule.id,
    pricingRuleCode: selectedRule.ruleCode,
    pricingRuleRevision: selectedRule.revision,
    pricingRuleType: selectedRule.ruleType,
    pricingRuleScope: selectedRule.scope,
    percentageValue: Number(percentageVal),
    percentageValueExact: percentageVal.toFixed(),
    resolutionReason: ruleResolution.resolutionReason,
    precedence: ruleResolution.precedence,
    baseSellingPrice: Number(baseSellingPrice),
    baseSellingPriceExact: baseSellingPrice.toFixed(),
    discountPercentage,
    discountAmount: Number(discountAmount),
    finalSellingPrice: Number(finalSellingPrice),
    finalSellingPriceExact: finalSellingPrice.toFixed(),
    unitSellingPrice: Number(unitSellingPrice),
    approvalRequired,
    approvalReason,
    blockingReasons: [],
  };
}
