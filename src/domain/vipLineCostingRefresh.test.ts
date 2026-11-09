import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldSkipVipLineCosting } from './vipLineCostingRefresh';

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
});
