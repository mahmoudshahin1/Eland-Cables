import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInquiryCommercialTotals, unitSeaFreightUsd } from './inquiryGrandTotal';

describe('resolveInquiryCommercialTotals', () => {
  it('adds Doncaster 40HQ sea freight to the products subtotal', () => {
    const totals = resolveInquiryCommercialTotals({
      productsTotal: 353439.95,
      containerType: '40HQ',
      destination: 'Doncaster',
      containerCount: 1,
    });
    assert.equal(totals.productsTotal, 353439.95);
    assert.equal(totals.freightTotal, 3300);
    assert.equal(totals.grandTotal, 356739.95);
  });

  it('uses the 20STD Doncaster rate and multiplies by container count', () => {
    const totals = resolveInquiryCommercialTotals({
      productsTotal: 1000,
      containerType: '20STD',
      destination: 'Doncaster / UK',
      containerCount: 2,
    });
    assert.equal(totals.freightTotal, 6200);
    assert.equal(totals.grandTotal, 7200);
  });

  it('uses Rotterdam rates and the container-spec fallback for other destinations', () => {
    assert.equal(unitSeaFreightUsd('20STD', 'Rotterdam'), 1800);
    assert.equal(unitSeaFreightUsd('40STD', 'Rotterdam'), 2000);
    assert.equal(unitSeaFreightUsd('40HQ', 'Jeddah', 4200), 4200);
    assert.equal(unitSeaFreightUsd('20STD', null), 3100);
    assert.equal(unitSeaFreightUsd('40OT', null), 3300);
  });

  it('returns null totals when the products subtotal is missing', () => {
    const totals = resolveInquiryCommercialTotals({ productsTotal: null, containerType: '40HQ' });
    assert.equal(totals.productsTotal, null);
    assert.equal(totals.freightTotal, null);
    assert.equal(totals.grandTotal, null);
  });
});
