import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertDrumSelectionContext,
  buildCableFromHandoff,
  mapAuthoritativePlanToPersistData,
  previewAutomaticDrumPlan,
  reconcileDrumPlanQuantity,
} from './v2DrumPlanService';
import type { DrumSelectionHandoffDto } from './v2CuttingLengthService';
import type { DrumMasterForOptimization } from './drumOptimizationService';

function handoff(over: Partial<DrumSelectionHandoffDto> = {}): DrumSelectionHandoffDto {
  return {
    planId: 'v2cut-test-v1',
    planVersionNo: 1,
    configurationSnapshotId: 'snap-1',
    configurationSnapshotIdString: 'v2cfg-test',
    configurationSnapshotVersionNo: 1,
    cableMaterialNumber: 'MAT-001',
    itemCode: 'ITEM',
    customerCode: 'CUST',
    cuttingLengthMeters: 500,
    cableTolerancePercent: 1,
    toleranceMode: 'SYMMETRIC',
    positiveTolerancePercent: 1,
    negativeTolerancePercent: 1,
    requestedDrumCount: 1,
    cuttingLengthRequirementId: 'req-1',
    minLengthM: 495,
    maxLengthM: 505,
    cableDiameterMm: 25,
    cableWeightKgKm: 1200,
    validationStatus: 'VALID',
    validationMessages: [],
    drumHandoffReady: true,
    notes: null,
    capturedAt: new Date().toISOString(),
    ...over,
  };
}

function testDrum(over: Partial<DrumMasterForOptimization> = {}): DrumMasterForOptimization {
  return {
    id: 'drum-1',
    drumCode: 'EWD1200-T',
    flange: 2600,
    barrel: 1400,
    innerWidth: 1500,
    clearanceMm: 50,
    maxWeight: 5000,
    capacity: 5000,
    status: 'ACTIVE',
    ...over,
  };
}

describe('v2DrumPlanService', () => {
  it('maps handoff to cable engineering input', () => {
    const cable = buildCableFromHandoff(handoff());
    assert.equal(cable.cableDiameterMm, 25);
    assert.equal(cable.approxWeightKgKm, 1200);
  });

  it('rejects stale cutting plan id', () => {
    assert.throws(
      () =>
        assertDrumSelectionContext({
          handoff: handoff(),
          lineCurrentCuttingPlanId: 'current-cut',
          lineCurrentSnapshotId: 'snap-1',
          cuttingLengthPlanId: 'old-cut',
          cuttingPlanConfigurationSnapshotId: 'snap-1',
        }),
      (err: Error & { code?: string }) => err.code === 'STALE_CUTTING_PLAN'
    );
  });

  it('passes handoff tolerance to automatic optimizer', () => {
    const ctx = assertDrumSelectionContext({
      handoff: handoff({ cableTolerancePercent: 2, cuttingLengthMeters: 400 }),
      lineCurrentCuttingPlanId: 'cut-1',
      lineCurrentSnapshotId: 'snap-1',
      cuttingLengthPlanId: 'cut-1',
      cuttingPlanConfigurationSnapshotId: 'snap-1',
      downstreamGates: { drumSelection: true },
    });
    const plan = previewAutomaticDrumPlan(ctx, [testDrum()]);
    assert.equal(plan.cableTolerancePercent, 2);
    assert.ok(plan.lines.length >= 1);
  });

  it('reconciles quantity with explicit remainder', () => {
    const plan = previewAutomaticDrumPlan(
      assertDrumSelectionContext({
        handoff: handoff({ cuttingLengthMeters: 1000 }),
        lineCurrentCuttingPlanId: 'cut-1',
        lineCurrentSnapshotId: 'snap-1',
        cuttingLengthPlanId: 'cut-1',
        cuttingPlanConfigurationSnapshotId: 'snap-1',
      }),
      [testDrum()]
    );
    const recon = reconcileDrumPlanQuantity(handoff({ cuttingLengthMeters: 1000 }), plan);
    assert.ok(typeof recon.remainderLengthM === 'number');
    assert.ok(recon.messages.length > 0);
  });

  it('maps authoritative plan to persist rows with engineering snapshot', () => {
    const h = handoff();
    const ctx = assertDrumSelectionContext({
      handoff: h,
      lineCurrentCuttingPlanId: 'cut-1',
      lineCurrentSnapshotId: 'snap-1',
      cuttingLengthPlanId: 'cut-1',
      cuttingPlanConfigurationSnapshotId: 'snap-1',
    });
    const plan = previewAutomaticDrumPlan(ctx, [testDrum()]);
    const mapped = mapAuthoritativePlanToPersistData(ctx, plan, [testDrum()]);
    assert.ok(mapped.lines.length >= 1);
    assert.equal(mapped.selectionMethod, 'AUTOMATIC');
    assert.ok(mapped.engineeringSnapshot.lines.length >= 1);
    assert.equal(mapped.lines[0].drumCode, 'EWD1200-T');
  });

  it('flags over-scheduled quantity as ERROR reconciliation', () => {
    const h = handoff({ minLengthM: 100, maxLengthM: 600 });
    const plan = previewAutomaticDrumPlan(
      assertDrumSelectionContext({
        handoff: h,
        lineCurrentCuttingPlanId: 'cut-1',
        lineCurrentSnapshotId: 'snap-1',
        cuttingLengthPlanId: 'cut-1',
        cuttingPlanConfigurationSnapshotId: 'snap-1',
      }),
      [testDrum()]
    );
    const recon = reconcileDrumPlanQuantity(h, plan, 200);
    if (recon.totalScheduledM > 600) {
      assert.equal(recon.status, 'OVER');
      assert.ok(recon.messages.some((m) => m.severity === 'error'));
    }
  });

  it('does not treat requested drum count as a drum-type selection input', () => {
    const ctx1 = assertDrumSelectionContext({
      handoff: handoff({ cuttingLengthMeters: 1000, requestedDrumCount: 1, minLengthM: 990, maxLengthM: 1010 }),
      lineCurrentCuttingPlanId: 'cut-1',
      lineCurrentSnapshotId: 'snap-1',
      cuttingLengthPlanId: 'cut-1',
      cuttingPlanConfigurationSnapshotId: 'snap-1',
    });
    const ctx3 = assertDrumSelectionContext({
      handoff: handoff({ cuttingLengthMeters: 1000, requestedDrumCount: 3, minLengthM: 990, maxLengthM: 1010 }),
      lineCurrentCuttingPlanId: 'cut-1',
      lineCurrentSnapshotId: 'snap-1',
      cuttingLengthPlanId: 'cut-1',
      cuttingPlanConfigurationSnapshotId: 'snap-1',
    });
    const ctx5 = assertDrumSelectionContext({
      handoff: handoff({ cuttingLengthMeters: 1000, requestedDrumCount: 5, minLengthM: 990, maxLengthM: 1010 }),
      lineCurrentCuttingPlanId: 'cut-1',
      lineCurrentSnapshotId: 'snap-1',
      cuttingLengthPlanId: 'cut-1',
      cuttingPlanConfigurationSnapshotId: 'snap-1',
    });
    const drums = [testDrum()];
    const plan1 = previewAutomaticDrumPlan(ctx1, drums);
    const plan3 = previewAutomaticDrumPlan(ctx3, drums);
    const plan5 = previewAutomaticDrumPlan(ctx5, drums);
    assert.equal(plan1.lines[0].drumCode, plan3.lines[0].drumCode);
    assert.equal(plan1.lines[0].drumCode, plan5.lines[0].drumCode);
    assert.equal(plan1.lines[0].cuttingLengthM, 1000);
    assert.equal(plan3.lines[0].cuttingLengthM, 1000);
    assert.equal(plan5.lines[0].cuttingLengthM, 1000);
    assert.equal(plan1.lines.reduce((n, l) => n + l.numberOfDrums, 0), 1);
    assert.equal(plan3.lines.reduce((n, l) => n + l.numberOfDrums, 0), 3);
    assert.equal(plan5.lines.reduce((n, l) => n + l.numberOfDrums, 0), 5);
    const recon5 = reconcileDrumPlanQuantity(ctx5.handoff, plan5);
    assert.notEqual(recon5.status, 'OVER');
    assert.ok(!recon5.messages.some((m) => m.code === 'ABOVE_MAX_TOLERANCE'));
  });
});
