import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDrumSelectionHandoff,
  computeToleranceBounds,
  validateV2CuttingLength,
} from './v2CuttingLengthService';

const validSnapshot = {
  id: 'snap-cuid-1',
  snapshotId: 'v2cfg-INQ26-00001-L1-v1',
  versionNo: 1,
  flowState: 'VALID',
  catalogAuthoritative: true,
  cableMaterialNumber: 'MAT-001',
  estimatedDiameterMm: 25,
  estimatedWeightKgKm: 1200,
  downstreamGates: { cuttingLength: true, drumSelection: true },
  selections: {
    voltage: '6/10 kV (6.35/11 kV)',
    armour: 'No Armour',
  },
};

describe('v2CuttingLengthService', () => {
  it('computes symmetric tolerance bounds from nominal length', () => {
    const bounds = computeToleranceBounds(500, 1);
    assert.equal(bounds.minLengthM, 495);
    assert.equal(bounds.maxLengthM, 505);
  });

  it('returns VALID for nominal length within production envelope', () => {
    const result = validateV2CuttingLength({
      nominalLengthM: 500,
      tolerancePercent: 1,
      snapshot: validSnapshot,
      lineCurrentSnapshotId: 'snap-cuid-1',
    });
    assert.equal(result.validationStatus, 'VALID');
    assert.equal(result.drumHandoffReady, true);
    assert.equal(result.minLengthM, 495);
    assert.equal(result.maxLengthM, 505);
  });

  it('returns ERROR when snapshot is stale', () => {
    const result = validateV2CuttingLength({
      nominalLengthM: 500,
      tolerancePercent: 1,
      snapshot: validSnapshot,
      lineCurrentSnapshotId: 'snap-cuid-2',
    });
    assert.equal(result.validationStatus, 'ERROR');
    assert.equal(result.drumHandoffReady, false);
    assert.ok(result.validationMessages.some((m) => m.code === 'STALE_CONFIGURATION_SNAPSHOT'));
  });

  it('returns WARNING when below minimum production length', () => {
    const result = validateV2CuttingLength({
      nominalLengthM: 40,
      tolerancePercent: 1,
      snapshot: validSnapshot,
      lineCurrentSnapshotId: 'snap-cuid-1',
    });
    assert.equal(result.validationStatus, 'WARNING');
    assert.ok(result.validationMessages.some((m) => m.code === 'BELOW_MIN_PRODUCTION'));
  });

  it('builds deterministic drum handoff DTO from plan + snapshot', () => {
    const handoff = buildDrumSelectionHandoff({
      plan: {
        planId: 'v2cut-INQ26-00001-L1-v1',
        versionNo: 1,
        configurationSnapshotId: 'snap-cuid-1',
        configurationSnapshotIdString: validSnapshot.snapshotId,
        configurationSnapshotVersionNo: 1,
        nominalLengthM: 500,
        tolerancePercent: 1,
        minLengthM: 495,
        maxLengthM: 505,
        validationStatus: 'VALID',
        validationMessages: [],
        notes: 'Export packaging',
        capturedAt: '2026-09-05T10:00:00.000Z',
      },
      snapshot: {
        cableMaterialNumber: 'MAT-001',
        itemCode: 'ITEM-001',
        customerCode: 'CUST-001',
        estimatedDiameterMm: 25,
        estimatedWeightKgKm: 1200,
      },
      lineCurrentSnapshotId: 'snap-cuid-1',
    });

    assert.equal(handoff.cuttingLengthMeters, 500);
    assert.equal(handoff.cableTolerancePercent, 1);
    assert.equal(handoff.requestedDrumCount, 1);
    assert.equal(handoff.toleranceMode, 'SYMMETRIC');
    assert.equal(handoff.cableDiameterMm, 25);
    assert.equal(handoff.cableWeightKgKm, 1200);
    assert.equal(handoff.drumHandoffReady, true);
    assert.equal(handoff.notes, 'Export packaging');
  });

  it('marks handoff stale when line snapshot moved on', () => {
    const handoff = buildDrumSelectionHandoff({
      plan: {
        planId: 'v2cut-INQ26-00001-L1-v1',
        versionNo: 1,
        configurationSnapshotId: 'snap-cuid-1',
        configurationSnapshotIdString: validSnapshot.snapshotId,
        configurationSnapshotVersionNo: 1,
        nominalLengthM: 500,
        tolerancePercent: 1,
        minLengthM: 495,
        maxLengthM: 505,
        validationStatus: 'VALID',
        validationMessages: [],
        notes: null,
        capturedAt: '2026-09-05T10:00:00.000Z',
      },
      snapshot: {
        cableMaterialNumber: 'MAT-001',
        itemCode: null,
        customerCode: null,
        estimatedDiameterMm: 25,
        estimatedWeightKgKm: 1200,
      },
      lineCurrentSnapshotId: 'snap-cuid-2',
    });

    assert.equal(handoff.validationStatus, 'ERROR');
    assert.equal(handoff.drumHandoffReady, false);
  });
});
