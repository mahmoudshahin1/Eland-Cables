import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agreementReleaseIntegrationAdapter,
  customerIntegrationAdapter,
  salesAgreementIntegrationAdapter,
  salesOrderIntegrationAdapter,
} from './d365Adapters';

describe('d365Adapters', () => {
  it('does not pretend D365 is connected', async () => {
    const customer = await customerIntegrationAdapter.pullCustomer('ELAND');
    const so = await salesOrderIntegrationAdapter.postSalesOrder('QT-1');
    const sa = await salesAgreementIntegrationAdapter.postSalesAgreement('SA-1');
    const rel = await agreementReleaseIntegrationAdapter.postAgreementRelease('REL-1');
    assert.equal(customer.status, 'NOT_IMPLEMENTED');
    assert.equal(so.status, 'NOT_IMPLEMENTED');
    assert.equal(sa.status, 'NOT_IMPLEMENTED');
    assert.equal(rel.status, 'NOT_IMPLEMENTED');
  });
});
