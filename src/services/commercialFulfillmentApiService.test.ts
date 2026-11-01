import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  approveQuotationPricingApi,
  FulfillmentApiError,
  formatFulfillmentError,
} from './commercialFulfillmentApiService';

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

  it('approves quotation pricing through the existing pricing approval route', async () => {
    const previousFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({ quotation: { id: 'quote-1', quotationNumber: 'QU-TEST', versionNo: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const quotation = await approveQuotationPricingApi('test-token', 'quote-1');
      assert.equal(requestedUrl, '/api/quotations/quote-1/approve-pricing');
      assert.equal(requestedInit?.method, 'POST');
      assert.equal((requestedInit?.headers as Record<string, string>).Authorization, 'Bearer test-token');
      assert.equal(requestedInit?.body, '{}');
      assert.equal(quotation.id, 'quote-1');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
