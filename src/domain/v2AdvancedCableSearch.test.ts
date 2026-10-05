import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CABLE_SEARCH_UNAVAILABLE_ON_PG,
  cableSearchHitHasCostingLeak,
  hasAnyAdvancedFilter,
  parseAdvancedCableSearchQuery,
  parseMatchMode,
  prismaStringFilter,
  toCableSearchHit,
  trimSearchInput,
} from './v2AdvancedCableSearch';

describe('V2 Advanced Cable Search — query model', () => {
  it('trims and case-folds match mode without changing stored values', () => {
    assert.equal(trimSearchInput('  N2XH  '), 'N2XH');
    assert.equal(parseMatchMode('EXACT'), 'exact');
    assert.equal(parseMatchMode('starts-with'), 'startsWith');
    assert.equal(parseMatchMode('Contains'), 'contains');
    assert.equal(parseMatchMode(undefined), 'contains');
  });

  it('builds exact / contains / startsWith Prisma filters', () => {
    assert.deepEqual(prismaStringFilter('  10000088  ', 'exact'), {
      equals: '10000088',
      mode: 'insensitive',
    });
    assert.deepEqual(prismaStringFilter('ICO', 'startsWith'), {
      startsWith: 'ICO',
      mode: 'insensitive',
    });
    assert.deepEqual(prismaStringFilter('xlpe', 'contains'), {
      contains: 'xlpe',
      mode: 'insensitive',
    });
    assert.equal(prismaStringFilter('   ', 'contains'), undefined);
  });

  it('caps customer page size and ignores unknown sort', () => {
    const q = parseAdvancedCableSearchQuery(
      { page: '0', pageSize: '999', sortBy: 'price', sortDir: 'desc', q: '  cu  ' },
      'customer'
    );
    assert.equal(q.page, 1);
    assert.equal(q.pageSize, 50);
    assert.equal(q.sortBy, 'materialNumber');
    assert.equal(q.sortDir, 'desc');
    assert.equal(q.q, 'cu');
  });

  it('does not treat empty filters as a search', () => {
    const q = parseAdvancedCableSearchQuery({}, 'internal');
    assert.equal(hasAnyAdvancedFilter(q), false);
  });

  it('strips costing keys from search hits', () => {
    const hit = toCableSearchHit({
      materialNumber: '10000088',
      itemCode: 'ICO1',
      customerCode: 'N2XH',
      family: 'UGC',
      voltage: '0.6/1 kV',
      standard: 'IEC 60502-1',
      conductor: 'Copper',
      conductorSize: '240',
      cores: '1',
      insulation: 'XLPE',
      screen: 'CWS',
      armour: 'SWA',
      sheath: 'PVC',
      description: 'Test cable',
      diameter: 42.1,
      weight: 2100,
    });
    assert.equal(hit.materialNumber, '10000088');
    assert.equal(cableSearchHitHasCostingLeak(hit), false);
    assert.equal(
      cableSearchHitHasCostingLeak({ ...hit, standardPriceUsdPerM: 12 } as object),
      true
    );
  });

  it('documents PG fields that must not be invented as search columns', () => {
    assert.ok(CABLE_SEARCH_UNAVAILABLE_ON_PG.includes('cpr'));
    assert.ok(CABLE_SEARCH_UNAVAILABLE_ON_PG.includes('screenCsa'));
  });
});
