import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseMetalCostComponentInput,
  periodsOverlap,
  parseDateOnly,
} from './metalCostComponents';

describe('Metal cost component validation (master data only)', () => {
  it('defaults new records to Draft', () => {
    const parsed = parseMetalCostComponentInput({
      metal: 'Copper',
      componentType: 'Premium',
      value: 555,
      currency: 'USD',
      priceBasis: 'MT',
      effectiveFrom: '2026-09-01',
    });
    assert.equal(parsed.status, 'DRAFT');
    assert.equal(parsed.metal, 'COPPER');
    assert.equal(parsed.componentType, 'PREMIUM');
  });

  it('rejects negative values', () => {
    assert.throws(
      () =>
        parseMetalCostComponentInput({
          metal: 'COPPER',
          componentType: 'SHIPPING',
          value: -1,
          currency: 'USD',
          priceBasis: 'MT',
          effectiveFrom: '2026-09-01',
        }),
      /negative/i
    );
  });

  it('rejects Effective To before From', () => {
    assert.throws(
      () =>
        parseMetalCostComponentInput({
          metal: 'ALUMINIUM',
          componentType: 'CLEARANCE',
          value: 10,
          currency: 'USD',
          priceBasis: 'KG',
          effectiveFrom: '2026-09-10',
          effectiveTo: '2026-09-01',
        }),
      /cannot be before/i
    );
  });

  it('detects overlapping inclusive periods', () => {
    const aFrom = parseDateOnly('2026-01-01', 'from', true)!;
    const aTo = parseDateOnly('2026-06-30', 'to', false);
    const bFrom = parseDateOnly('2026-06-30', 'from', true)!;
    assert.equal(periodsOverlap(aFrom, aTo, bFrom, null), true);
    const cFrom = parseDateOnly('2026-07-01', 'from', true)!;
    assert.equal(periodsOverlap(aFrom, aTo, cFrom, null), false);
  });

  it('stores Percentage and Fixed Amount without converting them', () => {
    const pct = parseMetalCostComponentInput({
      metal: 'COPPER',
      componentType: 'PREMIUM',
      value: 2.5,
      currency: 'USD',
      priceBasis: 'Percentage',
      effectiveFrom: '2026-09-01',
    });
    assert.equal(pct.priceBasis, 'PERCENTAGE');
    assert.equal(pct.value, 2.5);
    const fixed = parseMetalCostComponentInput({
      metal: 'COPPER',
      componentType: 'SHIPPING',
      value: 100,
      currency: 'USD',
      priceBasis: 'Fixed Amount',
      effectiveFrom: '2026-09-01',
    });
    assert.equal(fixed.priceBasis, 'FIXED_AMOUNT');
    assert.equal(fixed.value, 100);
  });
});
