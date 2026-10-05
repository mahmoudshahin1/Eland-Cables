import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLayerInputsFromCalculatorRows,
  stackCalculatorRows,
  type CalculatorRowInput,
} from './costingCalculator';

describe('costingCalculator', () => {
  it('stacks fixed and percent lines on a material base', () => {
    const rows: CalculatorRowInput[] = [
      { parameterType: 'SCRAP', basis: 'PERCENT_OF_BASE', value: 5 },
      { parameterType: 'MARGIN', basis: 'PERCENT_OF_BASE', value: 6 },
    ];
    const result = stackCalculatorRows(rows, {
      baseAmount: 1000,
      quantity: 1,
      lengthMeters: 1000,
    });
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].amount, 50);
    assert.equal(result.lines[1].amount, 63);
    assert.equal(result.total, 1113);
  });

  it('maps margin and scrap rows to layer inputs', () => {
    const inputs = buildLayerInputsFromCalculatorRows([
      { parameterType: 'SCRAP', basis: 'PERCENT_OF_BASE', value: 3 },
      { parameterType: 'MARGIN', basis: 'PERCENT_OF_BASE', value: 6 },
      { parameterType: 'EXCHANGE', basis: 'FIXED_VALUE', value: 48.5 },
    ]);
    assert.equal(inputs.SCRAP_RATE, '0.03');
    assert.equal(inputs.EX_WORK_RATE, '0.06');
    assert.equal(inputs.EXCHANGE_RATE, '48.5');
  });
});
