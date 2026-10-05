import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildInquiryMetalPricingFromMetadata, buildMetalPricingSnapshot } from './inquiryMetalPricing';
import { affectsCableCost } from './lmeOfficialPriceImport';
import {
  metalHeaderPatchFromPublished,
  resolveInquiryMetalPricingForCosting,
  selectPublishedCableQuotes,
  type CableMetalPriceCandidate,
  type PublishedCableMetalQuote,
} from './cableMetalPriceResolution';

const publishedCopper: PublishedCableMetalQuote = {
  id: 'price-cu-1',
  quoteDate: '2026-09-09',
  cashAsk: 14672,
  threeMonthAsk: 14632,
};
const publishedAluminium: PublishedCableMetalQuote = {
  id: 'price-al-1',
  quoteDate: '2026-09-09',
  cashAsk: 3352,
  threeMonthAsk: 3338,
};

function inquiryWith(meta: Record<string, unknown>) {
  return buildInquiryMetalPricingFromMetadata(meta, 'USD');
}

describe('cable metal price resolution', () => {
  it('uses the inquiry override instead of a published price', () => {
    const inquiry = inquiryWith({
      copperPriceRate: 16000,
      copperPriceSource: 'INQUIRY_OVERRIDE',
      copperMarketPriceId: 'price-cu-old',
      copperMarketQuoteDate: '2026-08-01',
      aluminiumPriceRate: 3000,
      aluminiumPriceSource: 'INQUIRY_OVERRIDE',
    });
    const frozenInquiry = structuredClone(inquiry);
    const resolved = resolveInquiryMetalPricingForCosting(inquiry, {
      copper: { ...publishedCopper, cashAsk: 15000, id: 'price-cu-new' },
      aluminium: publishedAluminium,
    });
    assert.equal(resolved.copper, 'INQUIRY_SNAPSHOT');
    assert.equal(resolved.pricing.copperPrice, 16000);
    assert.equal(resolved.pricing.copperMarketPriceId, 'price-cu-old');
    assert.equal(resolved.aluminium, 'INQUIRY_SNAPSHOT');
    assert.equal(resolved.pricing.aluminiumPrice, 3000);
    assert.deepEqual(inquiry, frozenInquiry);
  });

  it('snapshots a missing header from the published cash ask and keeps an existing rate', () => {
    const empty = metalHeaderPatchFromPublished({}, { copper: publishedCopper, aluminium: publishedAluminium });
    assert.equal(empty.copperPriceRate, 14672);
    assert.equal(empty.aluminiumPriceRate, 3352);
    assert.equal(empty.copperPriceUom, 'MT');
    assert.equal(empty.aluminiumPriceUom, 'MT');
    assert.notEqual(empty.copperPriceRate, publishedCopper.threeMonthAsk);
    const kept = metalHeaderPatchFromPublished(
      { copperPriceRate: 16000, copperMarketPriceId: 'price-cu-old' },
      { copper: publishedCopper, aluminium: publishedAluminium }
    );
    assert.equal('copperPriceRate' in kept, false);
    assert.equal(kept.aluminiumPriceRate, 3352);
    const blocked = metalHeaderPatchFromPublished({}, { copper: null, aluminium: null });
    assert.deepEqual(blocked, {});
  });

  it('uses the published cash ask when the inquiry has no metal snapshot', () => {
    const inquiry = inquiryWith({});
    const resolved = resolveInquiryMetalPricingForCosting(inquiry, {
      copper: publishedCopper,
      aluminium: publishedAluminium,
    });
    assert.equal(resolved.copper, 'PUBLISHED');
    assert.equal(resolved.aluminium, 'PUBLISHED');
    assert.equal(resolved.pricing.copperPrice, 14672);
    assert.equal(resolved.pricing.aluminiumPrice, 3352);
    assert.equal(resolved.pricing.copperMarketPriceId, 'price-cu-1');
    assert.notEqual(resolved.pricing.copperPrice, publishedCopper.threeMonthAsk);
    assert.equal(inquiry.copperPrice, null);
  });

  it('blocks when neither an inquiry snapshot nor a published price exists', () => {
    const resolved = resolveInquiryMetalPricingForCosting(inquiryWith({}), {
      copper: null,
      aluminium: { id: 'blank', quoteDate: '2016-09-30', cashAsk: null, threeMonthAsk: null },
    });
    assert.equal(resolved.copper, 'BLOCKED');
    assert.equal(resolved.aluminium, 'BLOCKED');
    assert.equal(resolved.pricing.copperPrice, null);
    assert.equal(resolved.pricing.aluminiumPrice, null);
    assert.notEqual(resolved.pricing.copperPrice, 0);
  });

  it('does not let a later publish rewrite stored inquiry, costing, pricing, or quotation snapshots', () => {
    const inquiry = inquiryWith({
      copperPriceRate: 14672,
      copperMarketPriceId: 'price-cu-1',
      copperMarketQuoteDate: '2026-09-09',
      aluminiumPriceRate: 3352,
      aluminiumMarketPriceId: 'price-al-1',
      aluminiumMarketQuoteDate: '2026-09-09',
    });
    const first = resolveInquiryMetalPricingForCosting(inquiry, {
      copper: publishedCopper,
      aluminium: publishedAluminium,
    });
    const costingRun = { marketMetalSnapshot: buildMetalPricingSnapshot(first.pricing) };
    const pricingSnapshot = { copperPrice: first.pricing.copperPrice, aluminiumPrice: first.pricing.aluminiumPrice };
    const quotation = { metal: structuredClone(costingRun.marketMetalSnapshot) };
    const inquirySnapshot = structuredClone(inquiry);

    resolveInquiryMetalPricingForCosting(inquiry, {
      copper: { id: 'price-cu-2', quoteDate: '2026-09-10', cashAsk: 15000, threeMonthAsk: 14900 },
      aluminium: { id: 'price-al-2', quoteDate: '2026-09-10', cashAsk: 3400, threeMonthAsk: 3380 },
    });

    assert.equal(inquirySnapshot.copperPrice, 14672);
    assert.equal(costingRun.marketMetalSnapshot.copperPrice, 14672);
    assert.equal(costingRun.marketMetalSnapshot.copperMarketPriceId, 'price-cu-1');
    assert.equal(pricingSnapshot.copperPrice, 14672);
    assert.equal(quotation.metal.aluminiumPrice, 3352);
    assert.deepEqual(inquiry, inquirySnapshot);
  });

  it('ignores other metals, unapproved rows, and a system-default stand-in', () => {
    const rows: CableMetalPriceCandidate[] = [
      { id: 'ni', code: 'NICKEL', costingUsage: 'NONE', status: 'PUBLISHED', isCurrent: true, quoteDate: '2026-09-09', cashAsk: 16675, threeMonthAsk: 16830 },
      { id: 'zn', code: 'ZINC', costingUsage: 'NONE', status: 'PUBLISHED', isCurrent: true, quoteDate: '2026-09-09', cashAsk: 4186, threeMonthAsk: 4036 },
      { id: 'draft-cu', code: 'COPPER', costingUsage: 'CABLE_COPPER', status: 'IN_REVIEW', isCurrent: false, quoteDate: '2026-09-09', cashAsk: 1, threeMonthAsk: 1 },
      { id: 'old-cu', code: 'COPPER', costingUsage: 'CABLE_COPPER', status: 'PUBLISHED', isCurrent: false, quoteDate: '2026-01-01', cashAsk: 9000, threeMonthAsk: 9000 },
      { id: 'cu', code: 'COPPER', costingUsage: 'CABLE_COPPER', status: 'PUBLISHED', isCurrent: true, quoteDate: '2026-09-09', cashAsk: 14672, threeMonthAsk: 14632 },
    ];
    const selected = selectPublishedCableQuotes(rows);
    assert.equal(selected.copper?.id, 'cu');
    assert.equal(selected.aluminium, null);
    assert.equal(affectsCableCost('NONE'), false);
    const resolved = resolveInquiryMetalPricingForCosting(inquiryWith({}), selected);
    assert.equal(resolved.pricing.copperPrice, 14672);
    assert.equal(resolved.aluminium, 'BLOCKED');
    assert.notEqual(resolved.pricing.copperPrice, 9000);
    assert.notEqual(resolved.pricing.copperPrice, 16675);
  });
});
