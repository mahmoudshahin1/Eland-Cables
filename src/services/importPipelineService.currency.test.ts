import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitRawMaterials, memoryImportStores } from './importPipelineService';

describe('importPipelineService — raw material currency column', () => {
  it('maps Currency column and normalizes EGP to LE', () => {
    const stores = memoryImportStores();
    const result = commitRawMaterials(
      [
        {
          'Raw Material Code': 'RM-FX-01',
          Description: 'Test copper',
          'Unit of Measurement': 'kg',
          Currency: 'EGP',
          Price: 10,
          'Effective From': '2026-01-01',
        },
      ],
      'Raw Material List.xlsx',
      'tester',
      { persist: true, stores }
    );

    assert.equal(result.batch.status, 'COMMITTED');
    assert.equal(result.rawMaterials?.length, 1);
    assert.equal(result.rawMaterials?.[0].currency, 'LE');
    assert.equal(result.rawMaterials?.[0].price, 10);
    assert.equal(stores.getRawMaterials()[0].currency, 'LE');
  });
});
