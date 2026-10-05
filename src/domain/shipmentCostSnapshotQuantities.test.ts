import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateResultContainerQuantities,
  assertHomogeneousCurrency,
} from './shipmentCostSnapshotQuantities';

describe('B4-C quantity aggregation', () => {
  it('counts physical containers by typeCode and sorts codes ascending', () => {
    const result = aggregateResultContainerQuantities([
      { typeCode: '40STD' },
      { typeCode: '40HQ' },
      { typeCode: '40HQ' },
      { typeCode: '20STD' },
      { typeCode: '40HQ' },
    ]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.lines, [
      { containerTypeCode: '20STD', containerQuantity: 1 },
      { containerTypeCode: '40HQ', containerQuantity: 3 },
      { containerTypeCode: '40STD', containerQuantity: 1 },
    ]);
  });

  it('does not use drumCountQ3 as the freight quantity', () => {
    const result = aggregateResultContainerQuantities([
      { typeCode: '40HQ', drumCountQ3: 9 } as { typeCode: string; drumCountQ3: number },
      { typeCode: '40HQ', drumCountQ3: 4 } as { typeCode: string; drumCountQ3: number },
    ]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.lines[0].containerQuantity, 2);
  });

  it('fails closed on blank typeCode and empty containers', () => {
    assert.equal(aggregateResultContainerQuantities([]).ok, false);
    assert.equal(
      (aggregateResultContainerQuantities([]) as { issueCode: string }).issueCode,
      'RESULT_INTEGRITY_FAILED'
    );
    assert.equal(
      (aggregateResultContainerQuantities([{ typeCode: '40HQ' }, { typeCode: '  ' }]) as { issueCode: string })
        .issueCode,
      'CONTAINER_TYPE_NOT_FOUND'
    );
  });

  it('rejects mixed currencies rather than converting', () => {
    assert.equal(assertHomogeneousCurrency(['USD', 'USD']).ok, true);
    assert.equal(assertHomogeneousCurrency(['USD', 'EUR']).ok, false);
    assert.equal(assertHomogeneousCurrency([]).ok, false);
  });
});
