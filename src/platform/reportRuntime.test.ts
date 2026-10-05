import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertReportDefinitionAllowed,
  isGenericBiEngineEnabled,
  REPORT_ENTITY_WHITELIST,
  whitelistEntryForEntity,
} from './reporting/reportRuntime';

describe('Phase 10 reporting whitelist runtime', () => {
  it('does not enable a generic BI / SQL engine', () => {
    assert.equal(isGenericBiEngineEnabled(), false);
  });

  it('whitelists only governed count entities', () => {
    const codes = REPORT_ENTITY_WHITELIST.map((e) => e.entityCode);
    assert.ok(codes.includes('CommercialInquiry'));
    assert.equal(whitelistEntryForEntity('CostingRun'), null);
    assert.equal(whitelistEntryForEntity('CostingMetalCostComponent'), null);
    assert.equal(whitelistEntryForEntity('EpcSalesOrder'), null);
  });

  it('rejects cost/secret fields and unknown entities', () => {
    assert.throws(
      () =>
        assertReportDefinitionAllowed({
          entityCode: 'CostingRun',
          fieldCodes: ['id'],
        }),
      (err: Error & { code?: string }) => err.code === 'REPORT_ENTITY_NOT_WHITELISTED'
    );
    assert.throws(
      () =>
        assertReportDefinitionAllowed({
          entityCode: 'CommercialInquiry',
          fieldCodes: ['unitCost'],
        }),
      (err: Error & { code?: string }) => err.code === 'REPORT_FIELD_FORBIDDEN'
    );
  });

  it('forbids customer-visible internal datasets', () => {
    assert.throws(
      () =>
        assertReportDefinitionAllowed({
          entityCode: 'BomDuplicateObservation',
          fieldCodes: ['id'],
          customerVisible: true,
        }),
      (err: Error & { code?: string }) => err.code === 'REPORT_CUSTOMER_VISIBLE_FORBIDDEN'
    );
  });

  it('accepts inquiry status counts', () => {
    const ok = assertReportDefinitionAllowed({
      entityCode: 'CommercialInquiry',
      fieldCodes: ['status'],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.entry.entityCode, 'CommercialInquiry');
  });
});
