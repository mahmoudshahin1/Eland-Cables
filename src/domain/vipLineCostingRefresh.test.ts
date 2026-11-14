import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldSkipVipLineCosting, vipQuotationDraftWasCreated } from './vipLineCostingRefresh';

describe('vip line costing refresh', () => {
  it('runs costing again when the copper rate changed and Calculate asks to recalculate', () => {
    const persisted = { costingCalculationId: 'calc-1', costingRunId: 'run-1' };
    assert.equal(shouldSkipVipLineCosting(false, persisted), true);
    assert.equal(shouldSkipVipLineCosting(undefined, persisted), true);
    assert.equal(shouldSkipVipLineCosting(true, persisted), false);
    assert.equal(
      shouldSkipVipLineCosting(true, { costingCalculationId: null, costingRunId: null }),
      false
    );
  });

  it('syncs an existing unissued draft instead of recording a new quotation', () => {
    assert.equal(
      vipQuotationDraftWasCreated({ existingId: 'q1', existingIssued: false, returnedId: 'q1' }),
      false
    );
    assert.equal(
      vipQuotationDraftWasCreated({ existingId: null, existingIssued: false, returnedId: 'q1' }),
      true
    );
    assert.equal(
      vipQuotationDraftWasCreated({ existingId: 'q1', existingIssued: true, returnedId: 'q2' }),
      true
    );
  });
});
