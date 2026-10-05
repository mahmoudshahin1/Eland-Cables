import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CostingScrapScopeType } from '@prisma/client';
import { resolveScrapRate } from './costingOrchestrationService';

const costingDate = new Date('2026-08-22');

function rule(partial: {
  code: string;
  scopeType: CostingScrapScopeType;
  scopeValue?: string | null;
  materialClass?: string | null;
  scrapRate?: number | null;
  priority?: number;
  workflowStatus?: string;
}) {
  const rate = partial.scrapRate === undefined ? 0.02 : partial.scrapRate;
  return {
    id: partial.code,
    code: partial.code,
    scopeType: partial.scopeType,
    scopeValue: partial.scopeValue ?? null,
    materialClass: partial.materialClass ?? null,
    scrapRate: rate == null ? null : { toString: () => String(rate) },
    workflowStatus: partial.workflowStatus ?? 'ACTIVE',
    priority: partial.priority ?? 100,
    effectiveFrom: null,
    effectiveTo: null,
  };
}

const bomLine = { scrapPercentage: null as number | null, rawMaterialCode: 'CU-WIRE' };

describe('Costing scrap rule resolution', () => {
  it('matches MATERIAL_CLASS to RawMaterial.category', () => {
    const result = resolveScrapRate(
      bomLine,
      'MV',
      'CABLE-1',
      [rule({ code: 'SC-MC', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.03, priority: 40 })],
      costingDate,
      'copper'
    );
    assert.equal(result.source, 'SCRAP_RULE');
    assert.equal(result.rate, 0.03);
    assert.equal(result.errorCode, undefined);
  });

  it('does not match MATERIAL_CLASS when category differs', () => {
    const result = resolveScrapRate(
      bomLine,
      'MV',
      'CABLE-1',
      [rule({ code: 'SC-MC', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.03 })],
      costingDate,
      'PVC'
    );
    assert.equal(result.source, 'NONE');
    assert.equal(result.rate, null);
  });

  it('uses BOM line scrap % before any matching rule', () => {
    const result = resolveScrapRate(
      { scrapPercentage: 0.01, rawMaterialCode: 'CU-WIRE' },
      'MV',
      'CABLE-1',
      [
        rule({ code: 'SC-MC', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.09, priority: 1 }),
        rule({ code: 'SC-G', scopeType: 'GLOBAL', scrapRate: 0.05, priority: 1 }),
      ],
      costingDate,
      'Copper'
    );
    assert.equal(result.source, 'BOM_LINE');
    assert.equal(result.rate, 0.01);
  });

  it('picks lowest priority among the winning specificity', () => {
    const result = resolveScrapRate(
      bomLine,
      'MV',
      'CABLE-1',
      [
        rule({ code: 'SC-HI', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.08, priority: 50 }),
        rule({ code: 'SC-LO', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.04, priority: 10 }),
      ],
      costingDate,
      'Copper'
    );
    assert.equal(result.source, 'SCRAP_RULE');
    assert.equal(result.rate, 0.04);
  });

  it('prefers MATERIAL_CLASS over GLOBAL even when GLOBAL has a lower priority number', () => {
    const result = resolveScrapRate(
      bomLine,
      'MV',
      'CABLE-1',
      [
        rule({ code: 'SC-G', scopeType: 'GLOBAL', scrapRate: 0.01, priority: 1 }),
        rule({ code: 'SC-MC', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.07, priority: 90 }),
      ],
      costingDate,
      'Copper'
    );
    assert.equal(result.source, 'SCRAP_RULE');
    assert.equal(result.rate, 0.07);
  });

  it('returns BUSINESS_RULE_REQUIRED when two ACTIVE rules share specificity, priority, and effective date', () => {
    const result = resolveScrapRate(
      bomLine,
      'MV',
      'CABLE-1',
      [
        rule({ code: 'SC-A', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.02, priority: 20 }),
        rule({ code: 'SC-B', scopeType: 'MATERIAL_CLASS', scopeValue: 'Copper', scrapRate: 0.06, priority: 20 }),
      ],
      costingDate,
      'Copper'
    );
    assert.equal(result.source, 'NONE');
    assert.equal(result.rate, null);
    assert.equal(result.errorCode, 'BUSINESS_RULE_REQUIRED');
    assert.match(String(result.blocking), /BUSINESS_RULE_REQUIRED/);
  });
});
