import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const dir = dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(join(dir, rel), 'utf8');
}

describe('05I-DF-B4-D architectural guardrails', () => {
  it('adds an immutable offer without a status machine, CostingRun FK, or inquiry-scoped pricing host', () => {
    const schema = read('../../prisma/schema.prisma');
    assert.match(schema, /model FinancialOfferSnapshot \{/);
    assert.match(schema, /model FinancialOfferProductLine \{/);
    assert.match(schema, /hostQuotationId/);
    assert.match(schema, /commercialPricingSnapshotId/);
    const offerBlock = schema.slice(
      schema.indexOf('model FinancialOfferSnapshot {'),
      schema.indexOf('model FinancialOfferProductLine {')
    );
    assert.equal(/status\s+/.test(offerBlock), false);
    assert.equal(offerBlock.includes('costingRunId'), false);
    assert.equal(offerBlock.includes('CostingRun'), false);
    const pricingBlock = schema.slice(
      schema.indexOf('model CommercialPricingSnapshot {'),
      schema.indexOf('model UserAccount {')
    );
    assert.match(pricingBlock, /quotationLineId\s+String\s+@unique/);
    assert.equal(pricingBlock.includes('inquiryLineId'), false);
  });

  it('enforces one current offer per inquiry in SQL, not only application code', () => {
    const sql = read('../../prisma/migrations/20260911220000_financial_offer_snapshot_b4d/migration.sql');
    assert.match(sql, /financial_offer_snapshot_one_current_per_inquiry/);
    assert.match(sql, /WHERE "isCurrent" = true/);
    assert.match(sql, /ON "FinancialOfferSnapshot"\("inquiryId"\)/);
    assert.equal(sql.includes('ALTER TABLE "CommercialQuotation"'), false);
  });

  it('keeps aggregation free of FX, costing, live rates, and competing quotation JSON writes', () => {
    const src = read('../server/financialOfferSnapshotRepository.ts');
    for (const token of [
      'commercialOfferSnapshot',
      'costingEngine',
      'CostingExchangeRate',
      'CostingRun',
      'CostingMetalCostComponent',
      'resolveShippingCostRate',
      'resolveShippingRate',
      'd365',
      'localStorage',
      'priceQuotation',
    ]) {
      assert.equal(src.includes(token), false, token);
    }
    assert.match(src, /\$transaction/);
    assert.match(src, /appendServerAuditTx/);
    assert.match(src, /FINANCIAL_OFFER_SNAPSHOT_CREATED/);
    assert.match(src, /FINANCIAL_OFFER_SNAPSHOT_CREATE_FAILED/);
    assert.match(src, /VIP_SHIPMENT_NOT_CONFIGURED/);
  });

  it('exposes create/read APIs without PATCH or DELETE', () => {
    const src = read('../server/financialOfferSnapshotRoutes.ts');
    assert.match(src, /post\('\/financial-offer-snapshots'/);
    assert.match(src, /get\('\/financial-offer-snapshots\/:id'/);
    assert.equal(src.includes('.patch('), false);
    assert.equal(src.includes('.delete('), false);
  });

  it('does not leak financial offer aggregation into the costing engine freeze surface', () => {
    const engine = read('./costingEngine.ts');
    assert.equal(engine.includes('FinancialOfferSnapshot'), false);
    assert.equal(engine.includes('inquiryTotal'), false);
  });
});
