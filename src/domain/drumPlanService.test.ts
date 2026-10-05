import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { suggestDrumPlan, validateCuttingLength } from './drumPlanService';
import { findAllDrumMastersForInquiryLine, findDrumMasterForInquiryLine } from '../services/drumMasterService';
import { DrumMasterRecord } from '../types';

function sampleDrum(over: Partial<DrumMasterRecord> = {}): DrumMasterRecord {
  return {
    id: 'drm-1',
    drumCode: 'EWD220',
    drumType: 'Wood Reel 220',
    flange: 2200,
    barrel: 1120,
    barrelWidth: 900,
    innerWidth: 1000,
    outerWidth: 1200,
    usableWidth: 980,
    capacity: 2500,
    maxWeight: 4000,
    dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
    capacityUom: 'CONFIGURATION_REQUIRED',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('drumPlanService', () => {
  it('validates cutting length within line length', () => {
    assert.equal(validateCuttingLength(1000, 500).valid, true);
    assert.equal(validateCuttingLength(1000, 1200).valid, false);
  });

  it('suggests drum count from line and cutting length', () => {
    const plan = suggestDrumPlan(3000, 1000);
    assert.equal(plan.drumCount, 3);
    assert.ok(plan.drumTypeName.length > 0);
    assert.equal(plan.withinCapacity, true);
  });

  it('prefers Drum Master capacity when drums are supplied', () => {
    const plan = suggestDrumPlan(2000, 900, [
      { drumCode: 'EWD220', drumType: 'Wood Reel 220', capacity: 2500 },
      { drumCode: 'SMALL', drumType: 'Small', capacity: 1000 },
    ]);
    assert.equal(plan.drumTypeId, 'SMALL');
    assert.equal(plan.withinCapacity, true);
  });

  it('resolves inquiry line drum values to full Drum Master specification', () => {
    const drums = [sampleDrum()];
    assert.equal(findDrumMasterForInquiryLine('EWD220', drums)?.capacity, 2500);
    assert.equal(findDrumMasterForInquiryLine('Wood Reel 220', drums)?.flange, 2200);
    assert.equal(findDrumMasterForInquiryLine('unknown', drums), null);
    assert.equal(findDrumMasterForInquiryLine('', drums), null);
  });

  it('resolves every drum code on a combined inquiry line drum plan', () => {
    const drums = [
      sampleDrum(),
      sampleDrum({
        id: 'drm-2',
        drumCode: 'EWD700-3',
        drumType: undefined,
        description: 'Wooden Drum F700 x B400 x 600 x 760',
        flange: 700,
        barrel: 400,
        innerWidth: 600,
        outerWidth: 760,
        capacity: 650,
      }),
    ];
    const matched = findAllDrumMastersForInquiryLine('EWD220 + EWD700-3', drums);
    assert.equal(matched.length, 2);
    assert.equal(matched[0].flange, 2200);
    assert.equal(matched[1].innerWidth, 600);
    assert.equal(matched[1].capacity, 650);
  });
});
