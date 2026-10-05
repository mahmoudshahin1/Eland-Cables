import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCostingDocumentCode, parseCostingDocumentCode, isOfficialSequenceCode } from '../server/costingDocumentSequence';
import {
  isIncrementTestScrapCode,
  isSyntheticCostingConfigCode,
  isSyntheticRawMaterialCode,
} from './costingSyntheticCodes';

describe('Costing document sequence format', () => {
  it('formats scrap SC26-00001', () => {
    assert.equal(formatCostingDocumentCode('SC', 2026, 1), 'SC26-00001');
    assert.equal(formatCostingDocumentCode('FM', 2026, 12), 'FM26-00012');
    assert.equal(formatCostingDocumentCode('FX', 2026, 1), 'FX26-00001');
  });

  it('parses official sequence codes', () => {
    const parsed = parseCostingDocumentCode('SC26-00001');
    assert.deepEqual(parsed, { prefix: 'SC', year: 2026, serial: 1 });
    assert.equal(isOfficialSequenceCode('SC26-00001', 'SC'), true);
    assert.equal(isOfficialSequenceCode('I13D-SCRAP', 'SC'), false);
  });
});

describe('Synthetic costing codes', () => {
  it('detects increment RM and config codes', () => {
    assert.equal(isSyntheticRawMaterialCode('I4-RM-123'), true);
    assert.equal(isSyntheticRawMaterialCode('I13D-RM-x'), true);
    assert.equal(isSyntheticCostingConfigCode('I13_TEST_FOO'), true);
    assert.equal(isIncrementTestScrapCode('I13D-scrap'), true);
    assert.equal(isIncrementTestScrapCode('SC26-00001'), false);
  });
});
