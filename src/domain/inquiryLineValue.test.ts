import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeInquiryLineTotalValue } from './inquiryLineValue';

describe('computeInquiryLineTotalValue', () => {
  it('uses material cost when no other costing parameters are configured', () => {
    assert.equal(computeInquiryLineTotalValue({ materialCost: 1250.5 }), 1250.5);
  });

  it('uses manufacturing total instead of double-counting material', () => {
    assert.equal(
      computeInquiryLineTotalValue({
        materialCost: 1000,
        manufacturingTotal: 1300,
      }),
      1300
    );
  });

  it('adds only configured logistics and packing amounts', () => {
    assert.equal(
      computeInquiryLineTotalValue({
        materialCost: 1000,
        manufacturingTotal: 1300,
        logisticsAmount: 125.5,
        packingAmount: 40,
      }),
      1465.5
    );
  });

  it('does not invent logistics or packing when amounts are missing', () => {
    assert.equal(
      computeInquiryLineTotalValue({
        materialCost: 1000,
        logisticsAmount: null,
        packingAmount: undefined,
      }),
      1000
    );
  });
});
