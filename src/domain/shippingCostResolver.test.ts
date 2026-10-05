import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalizeCode,
  canonicalizeCountryCode,
  dateCovers,
  dateRangesOverlap,
  parseDateOnly,
} from './shippingCostCanonical';
import { resolveShippingRateFromRows, type ShippingRateMatchRow } from './shippingCostResolver';

function row(
  id: string,
  from: string,
  to: string | null,
  extra?: Partial<ShippingRateMatchRow>
): ShippingRateMatchRow {
  return {
    id,
    destinationPortCode: 'ALEX',
    incotermCode: 'DAP',
    containerTypeCode: '40HQ',
    rateAmount: 900,
    currencyCode: 'USD',
    effectiveFrom: from,
    effectiveTo: to,
    active: true,
    ...extra,
  };
}

describe('B4-B canonical codes', () => {
  it('normalizes trim and case; names are not identity', () => {
    assert.equal(canonicalizeCode(' dap '), 'DAP');
    assert.equal(canonicalizeCode('DAP'), 'DAP');
    assert.equal(canonicalizeCode('Alexandria'), 'ALEXANDRIA');
    assert.notEqual(canonicalizeCode('Alexandria'), 'ALEX');
    assert.equal(canonicalizeCountryCode(' eg '), 'EG');
    assert.equal(canonicalizeCountryCode('EGY'), null);
    assert.equal(parseDateOnly('2026-01-20T15:00:00Z'), '2026-01-20');
    assert.equal(parseDateOnly('not-a-date'), null);
  });

  it('inclusive date coverage and overlap', () => {
    assert.equal(dateCovers('2026-01-01', '2026-01-01', '2026-01-31'), true);
    assert.equal(dateCovers('2026-01-31', '2026-01-01', '2026-01-31'), true);
    assert.equal(dateCovers('2026-02-01', '2026-01-01', '2026-01-31'), false);
    assert.equal(dateCovers('2026-04-01', '2026-01-01', null), true);
    assert.equal(dateRangesOverlap('2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30'), false);
    assert.equal(dateRangesOverlap('2026-01-01', '2026-03-31', '2026-03-31', '2026-03-31'), true);
    assert.equal(dateRangesOverlap('2026-01-01', null, '2026-04-01', '2026-06-30'), true);
  });
});

describe('B4-B shipping rate resolver', () => {
  it('returns RATE_NOT_FOUND for zero covering rows', () => {
    const result = resolveShippingRateFromRows([row('a', '2026-02-01', '2026-02-28')], {
      destinationPortCode: 'ALEX',
      incotermCode: 'DAP',
      containerTypeCode: '40HQ',
      asOfDate: '2026-01-20',
    });
    assert.equal(result.status, 'RATE_NOT_FOUND');
    assert.equal(result.rate, null);
  });

  it('returns SELECT for exactly one covering row', () => {
    const result = resolveShippingRateFromRows([row('a', '2026-01-01', '2026-01-31', { rateAmount: 900 })], {
      destinationPortCode: ' alex ',
      incotermCode: 'dap',
      containerTypeCode: '40hq',
      asOfDate: '2026-01-20',
    });
    assert.equal(result.status, 'SELECT');
    assert.equal(result.rate?.id, 'a');
    assert.equal(result.rate?.rateAmount, 900);
  });

  it('returns RATE_AMBIGUOUS for overlapping covering rows and never picks one', () => {
    const result = resolveShippingRateFromRows(
      [row('a', '2026-01-01', '2026-01-31'), row('b', '2026-01-15', '2026-02-15', { rateAmount: 950 })],
      {
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        containerTypeCode: '40HQ',
        asOfDate: '2026-01-20',
      }
    );
    assert.equal(result.status, 'RATE_AMBIGUOUS');
    assert.equal(result.rate, null);
    assert.equal(result.matchCount, 2);
  });

  it('selects A on 10-Jan and B on 10-Feb in the Doc 48 example', () => {
    const rows = [row('a', '2026-01-01', '2026-01-31'), row('b', '2026-01-15', '2026-02-15', { rateAmount: 950 })];
    assert.equal(
      resolveShippingRateFromRows(rows, {
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        containerTypeCode: '40HQ',
        asOfDate: '2026-01-10',
      }).rate?.id,
      'a'
    );
    assert.equal(
      resolveShippingRateFromRows(rows, {
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        containerTypeCode: '40HQ',
        asOfDate: '2026-02-10',
      }).rate?.id,
      'b'
    );
  });

  it('honours inclusive start and end and open-ended rates', () => {
    const closed = [row('a', '2026-01-01', '2026-01-31')];
    assert.equal(
      resolveShippingRateFromRows(closed, {
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        containerTypeCode: '40HQ',
        asOfDate: '2026-01-01',
      }).status,
      'SELECT'
    );
    assert.equal(
      resolveShippingRateFromRows(closed, {
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        containerTypeCode: '40HQ',
        asOfDate: '2026-01-31',
      }).status,
      'SELECT'
    );
    const open = [row('open', '2026-01-01', null)];
    assert.equal(
      resolveShippingRateFromRows(open, {
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        containerTypeCode: '40HQ',
        asOfDate: '2026-12-31',
      }).rate?.id,
      'open'
    );
  });

  it('ignores inactive rows and does not convert currency', () => {
    const result = resolveShippingRateFromRows(
      [row('dead', '2026-01-01', null, { active: false, rateAmount: 1 })],
      {
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        containerTypeCode: '40HQ',
        asOfDate: '2026-01-20',
      }
    );
    assert.equal(result.status, 'RATE_NOT_FOUND');
    assert.equal(result.rate, null);
  });

  it('does not substitute another container type', () => {
    const result = resolveShippingRateFromRows([row('hq', '2026-01-01', null)], {
      destinationPortCode: 'ALEX',
      incotermCode: 'DAP',
      containerTypeCode: '20STD',
      asOfDate: '2026-01-20',
    });
    assert.equal(result.status, 'RATE_NOT_FOUND');
  });
});
