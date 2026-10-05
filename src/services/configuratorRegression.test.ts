import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateCableConfiguration } from '../services/cableConstraintEngine';
import { MASTER_CABLE_CATALOG } from '../data/mockData';

describe('Increment 3 configurator regression', () => {
  it('Test G: V1 constraint engine still evaluates a catalog configuration', () => {
    const sample = MASTER_CABLE_CATALOG[0];
    const result = validateCableConfiguration(
      {
        family: sample.voltageClass,
        voltage: sample.voltageClass === 'LV' ? '0.6/1 kV' : '6/10 kV',
        conductor: sample.conductor,
        conductorSize: sample.crossSectionMm2,
        core: sample.cores,
        insulation: 'XLPE',
        customerCode: sample.customerCode,
      },
      { customCatalog: MASTER_CABLE_CATALOG }
    );
    assert.ok(result);
    assert.ok(typeof result.isValid === 'boolean');
    assert.ok(Array.isArray(result.matchingCables));
  });
});
