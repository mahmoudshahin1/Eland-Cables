import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FulfillmentApiError, formatFulfillmentError } from './commercialFulfillmentApiService';

describe('commercialFulfillmentApiService — error surfacing', () => {
  it('formats FulfillmentApiError with classified title', () => {
    const err = new FulfillmentApiError('Release quantity exceeds remaining quantity on line L1.', {
      code: 'BUSINESS_RULE_REQUIRED',
      status: 422,
    });
    assert.equal(err.kind, 'over_release');
    const formatted = formatFulfillmentError(err);
    assert.equal(formatted.kind, 'over_release');
    assert.match(formatted.title, /Over-release/i);
    assert.match(formatted.message, /exceeds remaining/i);
  });

  it('formats generic Error without throwing', () => {
    const formatted = formatFulfillmentError(new Error('Pricing must be PRICING_APPROVED'));
    assert.equal(formatted.kind, 'pricing_required');
    assert.match(formatted.title, /Pricing/i);
  });
});
