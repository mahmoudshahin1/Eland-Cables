import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DrumMasterRecord } from '../types';
import {
  buildDrumDescription,
  resolveDrumDescription,
  cableWeightKgFromCuttingLength,
  drumCapacityFillPercent,
  resolveDrumEngineeringFields,
} from './drumMasterService';

function sampleDrum(over: Partial<DrumMasterRecord> = {}): DrumMasterRecord {
  return {
    id: 'drm-EWD630-0',
    drumCode: 'EWD630-0',
    flange: 630,
    barrel: 300,
    innerWidth: 600,
    outerWidth: 760,
    capacity: 650,
    dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
    capacityUom: 'CONFIGURATION_REQUIRED',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('drumMasterService', () => {
  it('buildDrumDescription formats Wooden Drum dimensions', () => {
    assert.equal(buildDrumDescription(630, 300, 600, 760), 'Wooden Drum F630 x B300 x 600 x 760');
    assert.equal(buildDrumDescription(630, 315, 335, 403), 'Wooden Drum F630 x B315 x 335 x 403');
    assert.equal(buildDrumDescription(700, 400, 600, 760), 'Wooden Drum F700 x B400 x 600 x 760');
  });

  it('resolveDrumDescription returns stored description when present', () => {
    const drum = sampleDrum({ description: 'Custom drum label' });
    assert.equal(resolveDrumDescription(drum), 'Custom drum label');
  });

  it('resolveDrumDescription builds from dimensions when description is blank', () => {
    const drum = sampleDrum({ description: undefined });
    assert.equal(resolveDrumDescription(drum), 'Wooden Drum F630 x B300 x 600 x 760');
  });

  it('cableWeightKgFromCuttingLength uses cutting length and approx kg/km', () => {
    assert.equal(cableWeightKgFromCuttingLength(1000, 268), 268);
    assert.ok(Math.abs(cableWeightKgFromCuttingLength(670, 3580) - 2398.6) < 0.001);
    assert.equal(cableWeightKgFromCuttingLength(0, 268), 0);
  });

  it('drumCapacityFillPercent is cable weight over drum capacity', () => {
    assert.equal(drumCapacityFillPercent(312, 650), 48);
    assert.equal(drumCapacityFillPercent(700, 650), 100);
    assert.equal(drumCapacityFillPercent(0, 650), null);
  });

  it('resolveDrumEngineeringFields applies TO defaults', () => {
    const blank = resolveDrumEngineeringFields(650, {});
    assert.equal(blank.clearanceMm, 50);
    assert.equal(blank.maxWeight, 650);
    const explicit = resolveDrumEngineeringFields(650, {
      clearanceMm: 20,
      maxLoadKg: 2000,
      emptyDrumNetWeightKg: 110,
    });
    assert.equal(explicit.clearanceMm, 20);
    assert.equal(explicit.maxWeight, 2000);
    assert.equal(explicit.emptyDrumNetWeightKg, 110);
  });
});
