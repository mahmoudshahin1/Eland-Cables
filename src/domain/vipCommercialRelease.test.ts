import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vipSalesReleaseAcceptsCalculatedPrice } from './vipCommercialRelease';

describe('vipSalesReleaseAcceptsCalculatedPrice', () => {
  it('accepts a calculated VIP price so sales can release the order', () => {
    assert.equal(
      vipSalesReleaseAcceptsCalculatedPrice({
        commercialPricingStatus: 'PRICING_CALCULATED',
        inquiryMetadata: { workflowChannel: 'V2_CONFIGURATION' },
      }),
      true
    );
  });

  it('does not accept a calculated standard quotation', () => {
    assert.equal(
      vipSalesReleaseAcceptsCalculatedPrice({
        commercialPricingStatus: 'PRICING_CALCULATED',
        inquiryMetadata: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
      }),
      false
    );
  });

  it('does not skip an explicit pricing-approval hold', () => {
    assert.equal(
      vipSalesReleaseAcceptsCalculatedPrice({
        commercialPricingStatus: 'PRICING_APPROVAL_REQUIRED',
        inquiryMetadata: { workflowChannel: 'V2_CONFIGURATION' },
      }),
      false
    );
  });
});
