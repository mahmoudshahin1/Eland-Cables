import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  catalogCategoryFamilyKeys,
  catalogFilterAliases,
  catalogPageWindow,
  catalogPrismaSort,
  catalogProductHasCostingLeak,
  catalogShowingLabel,
  formatCatalogCores,
  formatCatalogSize,
  mergeCableConstructionDisplay,
  parseCableDescriptionConstruction,
  parseCatalogPageSize,
  parseCatalogSortField,
  parseCustomerCatalogCategory,
  toCustomerCatalogProduct,
} from './customerCableCatalog';

describe('Customer cable catalog mapping', () => {
  it('parses category query params without inventing a Product Category column', () => {
    assert.equal(parseCustomerCatalogCategory('MV'), 'MV');
    assert.equal(parseCustomerCatalogCategory('mv'), 'MV');
    assert.equal(parseCustomerCatalogCategory('MV Cables'), 'MV');
    assert.equal(parseCustomerCatalogCategory('power'), 'POWER');
    assert.equal(parseCustomerCatalogCategory('instrumentation'), 'INSTRUMENTATION');
    assert.equal(parseCustomerCatalogCategory(''), null);
    assert.equal(parseCustomerCatalogCategory('HV'), null);
  });

  it('maps POWER/LV/MV from stored family keys and leaves CONTROL/SPECIAL as family contains', () => {
    assert.deepEqual(catalogCategoryFamilyKeys('POWER'), ['LV', 'MV']);
    assert.deepEqual(catalogCategoryFamilyKeys('LV'), ['LV']);
    assert.deepEqual(catalogCategoryFamilyKeys('MV'), ['MV']);
    assert.deepEqual(catalogCategoryFamilyKeys('CONTROL'), ['CONTROL']);
    assert.deepEqual(catalogCategoryFamilyKeys('INSTRUMENTATION'), ['INSTRUMENT']);
    assert.deepEqual(catalogCategoryFamilyKeys('SPECIAL'), ['SPECIAL']);
  });

  it('caps page size to 25/50/100 and maps sort fields to Cable Master columns', () => {
    assert.equal(parseCatalogPageSize('50'), 50);
    assert.equal(parseCatalogPageSize('100'), 100);
    assert.equal(parseCatalogPageSize('7'), 50);
    assert.equal(parseCatalogSortField('size'), 'size');
    assert.equal(parseCatalogSortField('recently added'), 'material');
    assert.equal(parseCatalogSortField('recent'), 'recent');
    assert.deepEqual(catalogPrismaSort('recent'), { field: 'createdAt', dir: 'desc' });
    assert.deepEqual(catalogPrismaSort('size'), { field: 'conductorSize', dir: 'asc' });
  });

  it('parses Energya description construction for display without rewriting masters', () => {
    const parsed = parseCableDescriptionConstruction(
      'Cu / XLPE / MDPE 6/10 kV CWs 1X150/25 mm2 RMC IEC 60502-2'
    );
    assert.equal(parsed.conductor, 'Copper');
    assert.equal(parsed.conductorSize, '150');
    assert.equal(parsed.cores, '1');
    assert.equal(parsed.insulation, 'XLPE');
    assert.equal(parsed.sheath, 'MDPE');
    assert.equal(parsed.screen, 'CWS');
    assert.equal(parsed.standard, 'IEC 60502-2');
    assert.equal(formatCatalogSize('150'), '150 mm²');
    assert.equal(formatCatalogCores('1C'), '1');
  });

  it('prefers stored construction columns over description tokens', () => {
    const merged = mergeCableConstructionDisplay({
      conductor: 'Aluminum',
      conductorSize: '240',
      cores: '3',
      description: 'Cu / XLPE / MDPE 6/10 kV 1X150 mm2 IEC 60502-2',
    });
    assert.equal(merged.conductor, 'Aluminum');
    assert.equal(merged.conductorSize, '240');
    assert.equal(merged.cores, '3');
  });

  it('expands conductor filter aliases and strips costing keys from catalog DTOs', () => {
    assert.deepEqual(catalogFilterAliases('conductor', 'Copper'), ['Copper', 'CU', 'Cu']);
    const product = toCustomerCatalogProduct({
      materialNumber: '10009558',
      itemCode: 'ITEM',
      customerCode: 'N2XS2Y',
      description: 'Cu / XLPE / MDPE 6/10 kV CWs 1X150/25 mm2 RMC IEC 60502-2',
      family: 'MV',
      voltage: '6/10 kV',
    });
    assert.equal(product.display.conductor, 'Copper');
    assert.equal(catalogProductHasCostingLeak(product), false);
    assert.equal(catalogProductHasCostingLeak({ ...product, unitPriceUsd: 9 }), true);
  });

  it('formats showing labels and compact pagination windows', () => {
    assert.equal(catalogShowingLabel(1, 50, 369), 'Showing 1 – 50 of 369 products');
    assert.deepEqual(catalogPageWindow(1, 8).slice(0, 3), [1, 2, 3]);
    assert.ok(catalogPageWindow(1, 31).includes('ellipsis'));
  });
});
