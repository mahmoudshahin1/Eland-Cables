import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isExcludedFromDirectRawMaterialCost, suggestedClassificationFromCode } from './rawMaterialClassification';

describe('suggestedClassificationFromCode', () => {
  it('classifies CR01 as inquiry-header copper', () => {
    const result = suggestedClassificationFromCode('CR01', 'Copper rod');
    assert.equal(result.pricingCategory, 'MARKET_METAL_COPPER');
    assert.equal(result.metalType, 'COPPER');
  });

  it('classifies ALxxxx as inquiry-header aluminium', () => {
    const result = suggestedClassificationFromCode('AL1201', 'Aluminium wire');
    assert.equal(result.pricingCategory, 'MARKET_METAL_ALUMINIUM');
    assert.equal(result.metalType, 'ALUMINIUM');
  });

  it('leaves end caps and aluminium tape as standard accessories', () => {
    assert.equal(suggestedClassificationFromCode('A-ECAP10', 'End Cap 10 mm', 'PCS').pricingCategory, 'STANDARD_RAW_MATERIAL');
    assert.equal(suggestedClassificationFromCode('A-EC01', 'End Cap 020 mm', 'kg').pricingCategory, 'STANDARD_RAW_MATERIAL');
    assert.equal(
      suggestedClassificationFromCode('AFD075', 'ALUMINUM TAPE – Double Side 75 Width', 'kg').pricingCategory,
      'STANDARD_RAW_MATERIAL'
    );
  });

  it('classifies aluminium rod AR01 as inquiry-header aluminium', () => {
    const result = suggestedClassificationFromCode('AR01', 'Aluminum rod 1350 H12 ASTM B233', 'kg');
    assert.equal(result.pricingCategory, 'MARKET_METAL_ALUMINIUM');
  });

  it('leaves PVC compounds as standard', () => {
    assert.equal(suggestedClassificationFromCode('PVC01', 'PVC compound', 'kg').pricingCategory, 'STANDARD_RAW_MATERIAL');
  });

  it('excludes end-cap packing from Direct Raw Material Cost', () => {
    assert.equal(isExcludedFromDirectRawMaterialCost('A-ECAP10', 'End Cap 10 mm', 'PCS'), true);
    assert.equal(isExcludedFromDirectRawMaterialCost('CR01', 'Copper rod', 'kg'), false);
  });
});
