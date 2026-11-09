import type { InquiryMetalPricing } from './inquiryMetalPricing';
import type { RequiredInquiryMetals } from './inquiryRequiredMetals';

/**
 * Cable copper/aluminium price resolution.
 * A. Inquiry snapshot or header override already stored on the inquiry.
 * B. Published LME cash ask: the requested date, otherwise the newest published
 *    cash ask on or before that date. A blank date uses the current published row.
 * C. Block. No system-default table, no zero, no unapproved row, no future date.
 * Cash ask is the costing basis. 3-month ask stays on the price row and is not substituted.
 */

export type CableMetalResolution = 'INQUIRY_SNAPSHOT' | 'PUBLISHED' | 'BLOCKED';

export interface PublishedCableMetalQuote {
  id: string;
  quoteDate: string;
  cashAsk: number | null;
  threeMonthAsk: number | null;
}

export interface PublishedCableMetalQuotes {
  copper: PublishedCableMetalQuote | null;
  aluminium: PublishedCableMetalQuote | null;
}

export interface CableMetalPriceCandidate {
  id: string;
  code: string;
  costingUsage: 'CABLE_COPPER' | 'CABLE_ALUMINIUM' | 'NONE' | string;
  status: string;
  isCurrent: boolean;
  quoteDate: string;
  cashAsk: number | null;
  threeMonthAsk: number | null;
}

function positive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function publishedCashQuote(row: CableMetalPriceCandidate | undefined): PublishedCableMetalQuote | null {
  if (!row || row.cashAsk == null || positive(row.cashAsk) == null) return null;
  return {
    id: row.id,
    quoteDate: row.quoteDate,
    cashAsk: row.cashAsk,
    threeMonthAsk: row.threeMonthAsk,
  };
}

/** Keeps only current published copper and aluminium rows that have a cash ask. */
export function selectPublishedCableQuotes(rows: CableMetalPriceCandidate[]): PublishedCableMetalQuotes {
  const pick = (usage: 'CABLE_COPPER' | 'CABLE_ALUMINIUM'): PublishedCableMetalQuote | null =>
    publishedCashQuote(
      rows.find(
        (candidate) =>
          candidate.costingUsage === usage &&
          candidate.status === 'PUBLISHED' &&
          candidate.isCurrent &&
          positive(candidate.cashAsk) != null
      )
    );
  return { copper: pick('CABLE_COPPER'), aluminium: pick('CABLE_ALUMINIUM') };
}

/**
 * Published cash ask for one quote date. Historical rows do not need isCurrent.
 * This exact-date selector does not substitute another date.
 * 3-month ask is not used as the rate.
 */
export function selectPublishedCableQuotesForDate(
  rows: CableMetalPriceCandidate[],
  quoteDate: string
): PublishedCableMetalQuotes {
  const day = quoteDate.trim().slice(0, 10);
  const pick = (usage: 'CABLE_COPPER' | 'CABLE_ALUMINIUM'): PublishedCableMetalQuote | null =>
    publishedCashQuote(
      rows.find(
        (candidate) =>
          candidate.costingUsage === usage &&
          candidate.status === 'PUBLISHED' &&
          candidate.quoteDate === day &&
          positive(candidate.cashAsk) != null
      )
    );
  return { copper: pick('CABLE_COPPER'), aluminium: pick('CABLE_ALUMINIUM') };
}

/**
 * Newest published cash ask on or before asOfDate, per metal.
 * An exact date wins because it is the newest row that is not after asOfDate.
 * A later quote date is ignored. 3-month ask is not used as the rate.
 */
export function selectLatestPublishedCableQuotes(
  rows: CableMetalPriceCandidate[],
  asOfDate: string
): PublishedCableMetalQuotes {
  const day = asOfDate.trim().slice(0, 10);
  const pick = (usage: 'CABLE_COPPER' | 'CABLE_ALUMINIUM'): PublishedCableMetalQuote | null => {
    const matches = rows.filter(
      (candidate) =>
        candidate.costingUsage === usage &&
        candidate.status === 'PUBLISHED' &&
        candidate.quoteDate <= day &&
        positive(candidate.cashAsk) != null
    );
    matches.sort((left, right) => right.quoteDate.localeCompare(left.quoteDate));
    return publishedCashQuote(matches[0]);
  };
  return { copper: pick('CABLE_COPPER'), aluminium: pick('CABLE_ALUMINIUM') };
}

/** Header metal date, or null when it is missing or not YYYY-MM-DD. */
export function readMetalPriceDate(metadata: Record<string, unknown> | null | undefined): string | null {
  const raw = metadata?.metalPriceDate;
  if (typeof raw !== 'string') return null;
  const day = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function applyPublished(
  pricing: InquiryMetalPricing,
  metal: 'copper' | 'aluminium',
  published: PublishedCableMetalQuote | null
): { pricing: InquiryMetalPricing; resolution: CableMetalResolution } {
  const price = metal === 'copper' ? pricing.copperPrice : pricing.aluminiumPrice;
  if (positive(price) != null) {
    return { pricing, resolution: 'INQUIRY_SNAPSHOT' };
  }
  const cash = positive(published?.cashAsk);
  if (!published || cash == null) {
    return { pricing, resolution: 'BLOCKED' };
  }
  if (metal === 'copper') {
    return {
      resolution: 'PUBLISHED',
      pricing: {
        ...pricing,
        copperPrice: cash,
        copperPriceUom: pricing.copperPriceUom || 'MT',
        copperPriceCurrency: 'USD',
        copperMarketPriceId: published.id,
        copperMarketQuoteDate: published.quoteDate,
      },
    };
  }
  return {
    resolution: 'PUBLISHED',
    pricing: {
      ...pricing,
      aluminiumPrice: cash,
      aluminiumPriceUom: pricing.aluminiumPriceUom || 'MT',
      aluminiumPriceCurrency: 'USD',
      aluminiumMarketPriceId: published.id,
      aluminiumMarketQuoteDate: published.quoteDate,
    },
  };
}

function positiveMetaRate(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Header fields to store when submit or calculate resolves a missing copper or aluminium
 * rate from the current published cash ask. Existing positive rates are left untouched.
 * Returns an empty object when nothing should be written.
 */
export function metalHeaderPatchFromPublished(
  metadata: Record<string, unknown> | null | undefined,
  published: PublishedCableMetalQuotes,
  required?: RequiredInquiryMetals
): Record<string, unknown> {
  const meta = metadata || {};
  const patch: Record<string, unknown> = {};
  const needCopper = required?.copper !== false;
  const needAluminium = required?.aluminium !== false;
  const copperCash = positive(published.copper?.cashAsk);
  if (
    needCopper &&
    positiveMetaRate(meta.copperPriceRate) == null &&
    published.copper &&
    copperCash != null
  ) {
    patch.copperPriceRate = copperCash;
    patch.copperPriceUom = 'MT';
    patch.copperPriceCurrency = 'USD';
    patch.copperMarketPriceId = published.copper.id;
    patch.copperMarketQuoteDate = published.copper.quoteDate;
    patch.copperPriceSource = null;
  }
  const aluminiumCash = positive(published.aluminium?.cashAsk);
  if (
    needAluminium &&
    positiveMetaRate(meta.aluminiumPriceRate) == null &&
    published.aluminium &&
    aluminiumCash != null
  ) {
    patch.aluminiumPriceRate = aluminiumCash;
    patch.aluminiumPriceUom = 'MT';
    patch.aluminiumPriceCurrency = 'USD';
    patch.aluminiumMarketPriceId = published.aluminium.id;
    patch.aluminiumMarketQuoteDate = published.aluminium.quoteDate;
    patch.aluminiumPriceSource = null;
  }
  return patch;
}

/**
 * Returns a new pricing object for this calculation. Does not mutate the inquiry snapshot.
 */
export function resolveInquiryMetalPricingForCosting(
  inquiry: InquiryMetalPricing,
  published: PublishedCableMetalQuotes
): {
  pricing: InquiryMetalPricing;
  copper: CableMetalResolution;
  aluminium: CableMetalResolution;
} {
  const copper = applyPublished(inquiry, 'copper', published.copper);
  const aluminium = applyPublished(copper.pricing, 'aluminium', published.aluminium);
  return { pricing: aluminium.pricing, copper: copper.resolution, aluminium: aluminium.resolution };
}
