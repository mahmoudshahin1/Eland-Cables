/**
 * Multi-currency conversion for costing.
 * Company base currency: LE (alias EGP). Official RM lists and Excel use LE; EGP is the ISO alias.
 *
 * Rate resolution priority (documented):
 * 1. Same currency — multiplier 1
 * 2. Inquiry rawMaterialExchangeRate when price currency matches rawMaterialCurrency (→ inquiry target)
 * 3. Inquiry exchangeRate when converting to inquiry target currency
 * 4. Governed CostingExchangeRate table (APPROVED or ACTIVE, effective on costing date)
 * 5. FX_NOT_CONFIGURED — blocks costing (DRAFT / SUBMITTED rates are ignored)
 */

export const COMPANY_BASE_CURRENCY = 'LE';

/** Currencies seen on RM prices plus ISO/company aliases. EGP persists as LE. */
export const COSTING_PRICE_CURRENCY_CODES = ['USD', 'EUR', 'LE', 'EGP', 'SAR', 'GBP', 'AED'] as const;

export function isConsumableGovernedFxStatus(workflowStatus?: string | null): boolean {
  const s = (workflowStatus || '').toUpperCase();
  return s === 'APPROVED' || s === 'ACTIVE';
}

export type FxRateSource =
  | 'SAME_CURRENCY'
  | 'INQUIRY_RAW_MATERIAL_RATE'
  | 'INQUIRY_EXCHANGE_RATE'
  | 'GOVERNED_TABLE'
  | 'GOVERNED_TABLE_INVERSE'
  | 'GOVERNED_TABLE_VIA_BASE';

export interface GovernedExchangeRateRecord {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  workflowStatus: string;
  code?: string;
}

export interface FxConversionContext {
  targetCurrency: string;
  costingDate: Date;
  companyBaseCurrency?: string;
  inquiryExchangeRate?: number;
  rawMaterialCurrency?: string;
  rawMaterialExchangeRate?: number;
  governedRates?: GovernedExchangeRateRecord[];
}

export interface FxResolution {
  rate: number;
  source: FxRateSource;
  fromCurrency: string;
  toCurrency: string;
  governedCode?: string;
}

export interface FxSnapshotEntry {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  source: FxRateSource;
  governedCode?: string;
}

/** Normalize LE ↔ EGP and trim. */
export function normalizeCostingCurrency(currency?: string | null): string {
  const c = (currency || '').trim().toUpperCase();
  if (!c) return '';
  if (c === 'EGP') return 'LE';
  if (c === 'EURO') return 'EUR';
  return c;
}

function calendarDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isEffectiveOnDate(
  rate: GovernedExchangeRateRecord,
  costingDate: Date
): boolean {
  if (!isConsumableGovernedFxStatus(rate.workflowStatus)) return false;
  const day = calendarDay(costingDate);
  if (rate.effectiveFrom && day < calendarDay(rate.effectiveFrom)) return false;
  if (rate.effectiveTo && day > calendarDay(rate.effectiveTo)) return false;
  return true;
}

function pickGovernedRate(candidates: GovernedExchangeRateRecord[]): GovernedExchangeRateRecord | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const ae = a.effectiveFrom?.getTime() ?? 0;
    const be = b.effectiveFrom?.getTime() ?? 0;
    if (be !== ae) return be - ae;
    return String(b.code || '').localeCompare(String(a.code || ''));
  });
  return sorted[0];
}

function findGovernedRate(
  from: string,
  to: string,
  costingDate: Date,
  governedRates: GovernedExchangeRateRecord[]
): FxResolution | null {
  const direct = pickGovernedRate(
    governedRates.filter(
      (r) =>
        normalizeCostingCurrency(r.fromCurrency) === from &&
        normalizeCostingCurrency(r.toCurrency) === to &&
        isEffectiveOnDate(r, costingDate)
    )
  );
  if (direct) {
    return {
      rate: Number(direct.rate),
      source: 'GOVERNED_TABLE',
      fromCurrency: from,
      toCurrency: to,
      governedCode: direct.code,
    };
  }

  const inverse = pickGovernedRate(
    governedRates.filter(
      (r) =>
        normalizeCostingCurrency(r.fromCurrency) === to &&
        normalizeCostingCurrency(r.toCurrency) === from &&
        isEffectiveOnDate(r, costingDate)
    )
  );
  if (inverse && Number(inverse.rate) > 0) {
    return {
      rate: 1 / Number(inverse.rate),
      source: 'GOVERNED_TABLE_INVERSE',
      fromCurrency: from,
      toCurrency: to,
      governedCode: inverse.code,
    };
  }

  return null;
}

/**
 * Resolves multiplier: amountInTarget = amountInSource * rate
 */
export function resolveFxRate(
  fromCurrency: string,
  toCurrency: string,
  context: FxConversionContext
): { ok: true; resolution: FxResolution } | { ok: false; code: 'FX_NOT_CONFIGURED'; message: string } {
  const from = normalizeCostingCurrency(fromCurrency);
  const to = normalizeCostingCurrency(toCurrency || context.targetCurrency);

  if (!from || !to) {
    return {
      ok: false,
      code: 'FX_NOT_CONFIGURED',
      message: 'Source or target currency is missing for FX conversion.',
    };
  }

  if (from === to) {
    return {
      ok: true,
      resolution: { rate: 1, source: 'SAME_CURRENCY', fromCurrency: from, toCurrency: to },
    };
  }

  const rmCur = normalizeCostingCurrency(context.rawMaterialCurrency);
  const target = normalizeCostingCurrency(context.targetCurrency);

  if (
    from === rmCur &&
    to === target &&
    context.rawMaterialExchangeRate != null &&
    context.rawMaterialExchangeRate > 0
  ) {
    return {
      ok: true,
      resolution: {
        rate: context.rawMaterialExchangeRate,
        source: 'INQUIRY_RAW_MATERIAL_RATE',
        fromCurrency: from,
        toCurrency: to,
      },
    };
  }

  if (
    to === target &&
    context.inquiryExchangeRate != null &&
    context.inquiryExchangeRate > 0 &&
    from !== to
  ) {
    return {
      ok: true,
      resolution: {
        rate: context.inquiryExchangeRate,
        source: 'INQUIRY_EXCHANGE_RATE',
        fromCurrency: from,
        toCurrency: to,
      },
    };
  }

  const governed = findGovernedRate(from, to, context.costingDate, context.governedRates || []);
  if (governed) {
    return { ok: true, resolution: governed };
  }

  const base = normalizeCostingCurrency(context.companyBaseCurrency) || COMPANY_BASE_CURRENCY;
  if (base && from !== base && to !== base) {
    const toBase = findGovernedRate(from, base, context.costingDate, context.governedRates || []);
    const fromBase = findGovernedRate(base, to, context.costingDate, context.governedRates || []);
    if (toBase && fromBase) {
      return {
        ok: true,
        resolution: {
          rate: Number(toBase.rate) * Number(fromBase.rate),
          source: 'GOVERNED_TABLE_VIA_BASE',
          fromCurrency: from,
          toCurrency: to,
          governedCode: [toBase.governedCode, fromBase.governedCode].filter(Boolean).join('+'),
        },
      };
    }
  }

  return {
    ok: false,
    code: 'FX_NOT_CONFIGURED',
    message: `No FX rate configured for ${from} → ${to} on ${context.costingDate.toISOString().slice(0, 10)}.`,
  };
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  context: FxConversionContext
):
  | { ok: true; converted: number; resolution: FxResolution; snapshot: FxSnapshotEntry }
  | { ok: false; code: 'FX_NOT_CONFIGURED'; message: string } {
  const resolved = resolveFxRate(fromCurrency, toCurrency, context);
  if (resolved.ok === false) {
    return { ok: false, code: resolved.code, message: resolved.message };
  }

  const converted = Math.round((amount * resolved.resolution.rate + Number.EPSILON) * 100) / 100;
  return {
    ok: true,
    converted,
    resolution: resolved.resolution,
    snapshot: {
      fromCurrency: resolved.resolution.fromCurrency,
      toCurrency: resolved.resolution.toCurrency,
      rate: resolved.resolution.rate,
      source: resolved.resolution.source,
      governedCode: resolved.resolution.governedCode,
    },
  };
}

export function buildFxContextFromCommercialMetadata(
  targetCurrency: string,
  costingDate: Date,
  metadata?: Record<string, unknown> | null,
  governedRates?: GovernedExchangeRateRecord[]
): FxConversionContext {
  const exchangeRate =
    metadata?.exchangeRate != null && metadata.exchangeRate !== ''
      ? Number(metadata.exchangeRate)
      : undefined;
  const rawMaterialExchangeRate =
    metadata?.rawMaterialExchangeRate != null && metadata.rawMaterialExchangeRate !== ''
      ? Number(metadata.rawMaterialExchangeRate)
      : undefined;

  return {
    targetCurrency: normalizeCostingCurrency(targetCurrency) || 'USD',
    costingDate,
    companyBaseCurrency: COMPANY_BASE_CURRENCY,
    inquiryExchangeRate:
      exchangeRate != null && Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : undefined,
    rawMaterialCurrency: metadata?.rawMaterialCurrency
      ? normalizeCostingCurrency(String(metadata.rawMaterialCurrency))
      : undefined,
    rawMaterialExchangeRate:
      rawMaterialExchangeRate != null && Number.isFinite(rawMaterialExchangeRate) && rawMaterialExchangeRate > 0
        ? rawMaterialExchangeRate
        : undefined,
    governedRates,
  };
}
