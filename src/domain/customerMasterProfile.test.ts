import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCustomerCommercialProfile } from './customerMasterProfile';

describe('Customer commercial profile resolution', () => {
  it('resolves master FKs without inventing values', () => {
    const profile = resolveCustomerCommercialProfile({
      defaultCurrency: 'USD',
      type: 'EPC_CUSTOMER',
      paymentTerms: 'Net 45',
      paymentTerm: { code: 'NET45', name: 'Net 45 days' },
      paymentMethod: { code: 'TT', name: 'Telegraphic Transfer' },
      classification: { code: 'VIP', name: 'VIP' },
      segment: { code: 'EXPORT', name: 'Export' },
      currencyMaster: { code: 'USD', name: 'US Dollar' },
    });
    assert.equal(profile.currencyCode, 'USD');
    assert.equal(profile.currencyName, 'US Dollar');
    assert.equal(profile.paymentTermCode, 'NET45');
    assert.equal(profile.paymentTermName, 'Net 45 days');
    assert.equal(profile.paymentMethodName, 'Telegraphic Transfer');
    assert.equal(profile.classificationName, 'VIP');
    assert.equal(profile.segmentName, 'Export');
    assert.equal(profile.customerType, 'EPC_CUSTOMER');
  });

  it('falls back to legacy payment terms text and does not invent classification', () => {
    const profile = resolveCustomerCommercialProfile({
      defaultCurrency: 'EUR',
      type: 'OTHER',
      paymentTerms: 'LC at sight',
    });
    assert.equal(profile.paymentTermCode, null);
    assert.equal(profile.paymentTermName, 'LC at sight');
    assert.equal(profile.paymentMethodName, null);
    assert.equal(profile.classificationName, null);
    assert.equal(profile.segmentName, null);
  });
});
