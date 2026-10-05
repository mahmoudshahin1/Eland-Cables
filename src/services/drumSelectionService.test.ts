import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DrumMasterRecord } from '../types';
import { EWD_AUTOMATIC_SELECTION_CODE, selectDrum, searchDrumMasterReference } from './drumSelectionService';

function drum(over: Partial<DrumMasterRecord> = {}): DrumMasterRecord {
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

describe('drumSelectionService', () => {
  it('does not auto-select when MaxLoad/clearance engineering data is missing', () => {
    const result = selectDrum({
      method: 'AUTOMATIC',
      drumMaster: [drum(), drum({ id: 'drm-EWD700-3', drumCode: 'EWD700-3', flange: 700, barrel: 400 })],
      cuttingLengthMeters: 1000,
      cableDiameterMm: 10.9,
      cableWeightKgKm: 268,
    });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.selectedDrum, null);
    assert.equal(EWD_AUTOMATIC_SELECTION_CODE, 'CONFIGURATION_REQUIRED');
    assert.ok(result.blockingReasons.length > 0);
    assert.equal(result.referenceDrums.length, 2);
  });

  it('does not run local automatic optimization when engineering fields are configured', () => {
    const ready = drum({
      id: 'drm-ready',
      drumCode: 'EWD1200-T',
      flange: 1200,
      barrel: 600,
      innerWidth: 800,
      clearanceMm: 15,
      maxWeight: 2500,
      emptyDrumNetWeightKg: 140,
    });
    const result = selectDrum({
      method: 'AUTOMATIC',
      drumMaster: [ready],
      cuttingLengthMeters: 400,
      cableDiameterMm: 20,
      cableWeightKgKm: 1000,
    });
    assert.equal(result.status, 'CONFIGURATION_REQUIRED');
    assert.equal(result.selectedDrum, null);
    assert.match(result.blockingReasons[0] || '', /drum selection API/i);
  });

  it('does not pick the first Drum Master row as a default without engineering data', () => {
    const first = drum();
    const result = selectDrum({ method: 'AUTOMATIC', drumMaster: [first] });
    assert.notEqual(result.selectedDrum?.drumCode, first.drumCode);
    assert.equal(result.selectedDrum, null);
  });

  it('links a manual ACTIVE EWD code without replacing prototype type', () => {
    const result = selectDrum({
      method: 'MANUAL',
      drumMaster: [drum()],
      selectedDrumCode: 'ewd630-0',
      prototypeDrumType: 'Wood Reel 220',
    });
    assert.equal(result.status, 'SELECTED_MANUAL_EWD');
    assert.equal(result.selectedDrum?.drumCode, 'EWD630-0');
    assert.equal(result.prototypeDrumType, 'Wood Reel 220');
    assert.equal(result.blockingReasons.length, 0);
  });

  it('rejects unknown and inactive drums', () => {
    const missing = selectDrum({
      method: 'MANUAL',
      drumMaster: [drum()],
      selectedDrumCode: 'EWD-FAKE',
    });
    assert.equal(missing.status, 'DRUM_NOT_FOUND');

    const inactive = selectDrum({
      method: 'MANUAL',
      drumMaster: [drum({ status: 'INACTIVE' })],
      selectedDrumCode: 'EWD630-0',
    });
    assert.equal(inactive.status, 'DRUM_INACTIVE');
  });

  it('searches reference drums without ranking by invented capacity', () => {
    const rows = searchDrumMasterReference(
      [drum(), drum({ id: 'b', drumCode: 'EWD3000-7', flange: 3000, barrel: 1850, capacity: 8000 })],
      '3000'
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].drumCode, 'EWD3000-7');
  });

  it('searches reference drums by description', () => {
    const rows = searchDrumMasterReference(
      [drum({ description: 'Wooden Drum F630 x B315 x 335 x 403' })],
      'B315'
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].drumCode, 'EWD630-0');
  });
});
