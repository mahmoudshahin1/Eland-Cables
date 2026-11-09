import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeOrResetDrumScheduleRow } from './drumOptimizationPresentation';

describe('removeOrResetDrumScheduleRow', () => {
  const blank = {
    id: 'blank',
    drumCode: '',
    noOfDrums: 1,
    cuttingLengthM: '',
    drumTolerancePercent: '0',
  };

  it('resets the only remaining drum line instead of leaving it undeletable', () => {
    const rows = [
      { id: 'row-1', drumCode: 'EWD2600-K26', noOfDrums: 2, cuttingLengthM: '1500', drumTolerancePercent: '3' },
    ];
    const next = removeOrResetDrumScheduleRow(rows, 'row-1', blank);
    assert.equal(next.length, 1);
    assert.deepEqual(next[0], blank);
  });

  it('removes one line when more than one line exists', () => {
    const rows = [
      { id: 'row-1', drumCode: 'A', noOfDrums: 1, cuttingLengthM: '100', drumTolerancePercent: '0' },
      { id: 'row-2', drumCode: 'B', noOfDrums: 2, cuttingLengthM: '200', drumTolerancePercent: '1' },
    ];
    const next = removeOrResetDrumScheduleRow(rows, 'row-1', blank);
    assert.equal(next.length, 1);
    assert.equal(next[0].id, 'row-2');
  });
});
