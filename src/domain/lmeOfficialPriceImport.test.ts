import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildInquiryMetalPricingFromMetadata, buildMetalPricingSnapshot } from './inquiryMetalPricing';
import { applySystemMarketMetalDefaultsOnCreate } from './marketMetalPriceDefaults';
import {
  LME_OFFICIAL_FIXTURE_TEXT,
  affectsCableCost,
  assertImportReadyToPublish,
  parseLmeOfficialPriceTable,
} from './lmeOfficialPriceImport';

describe('LME official price import', () => {
  it('parses 11 rows, a blank US aluminium premium, and suspended molybdenum', () => {
    const sheet = parseLmeOfficialPriceTable(LME_OFFICIAL_FIXTURE_TEXT);
    assert.equal(sheet.rows.length, 11);
    assert.equal(sheet.confidence, 'LOW');
    const premium = sheet.rows.find((row) => row.code === 'US_ALUMINIUM_PREMIUM');
    assert.equal(premium?.cashAsk, null);
    assert.equal(premium?.blankCash, true);
    assert.equal(premium?.quoteDate, '2016-09-30');
    const moly = sheet.rows.find((row) => row.code === 'MOLYBDENUM');
    assert.equal(moly?.suspended, true);
    assert.equal(moly?.quoteDate, '2019-03-08');
    assert.equal(moly?.cashAsk, 26000);
    const copper = sheet.rows.find((row) => row.code === 'COPPER');
    assert.equal(copper?.cashAsk, 14672);
    assert.equal(copper?.threeMonthAsk, 14632);
    assert.notEqual(copper?.cashAsk, copper?.threeMonthAsk);
  });

  it('does not let other metals affect cable cost and does not publish unapproved rows', () => {
    const sheet = parseLmeOfficialPriceTable(LME_OFFICIAL_FIXTURE_TEXT);
    const cable = sheet.rows.filter((row) => affectsCableCost(row.costingUsage)).map((row) => row.code);
    assert.deepEqual(cable, ['COPPER', 'ALUMINIUM']);
    assert.equal(affectsCableCost('NONE'), false);
    assert.throws(() => assertImportReadyToPublish('IN_REVIEW'), /approved/);
    assert.doesNotThrow(() => assertImportReadyToPublish('APPROVED'));
  });

  it('keeps a costing metal snapshot stable after a later published price', () => {
    const applied = buildMetalPricingSnapshot(
      buildInquiryMetalPricingFromMetadata(
        {
          copperPriceRate: 14672,
          copperPriceUom: 'USD/MT',
          copperMarketPriceId: 'price-1',
          copperMarketQuoteDate: '2026-09-09',
          aluminiumPriceRate: 3352,
          aluminiumPriceUom: 'USD/MT',
        },
        'USD'
      )
    );
    const frozen = JSON.parse(JSON.stringify(applied));
    applySystemMarketMetalDefaultsOnCreate(
      {},
      {
        copper: {
          id: 'price-2',
          metalType: 'COPPER',
          priceRate: 15000,
          priceUom: 'USD/MT',
          effectiveFrom: new Date('2026-09-10'),
          effectiveTo: null,
          publishedPriceId: 'price-2',
          quoteDate: '2026-09-10',
        },
        aluminium: null,
      }
    );
    assert.equal(frozen.copperPrice, 14672);
    assert.equal(frozen.copperMarketPriceId, 'price-1');
    assert.equal(frozen.copperMarketQuoteDate, '2026-09-09');
  });
});
