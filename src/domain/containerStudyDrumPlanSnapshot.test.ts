import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSnapshotDrumsFromDrumPlan,
  flattenLineageFromDrumPlans,
  resolveSnapshotDrumGeometry,
} from './containerStudyDrumPlanSnapshot';

describe('containerStudyDrumPlanSnapshot', () => {
  it('resolves geometry from packing profile pins', () => {
    const geom = resolveSnapshotDrumGeometry({
      line: {
        id: 'line-1',
        lineNo: 1,
        drumCode: 'D1',
        drumMasterId: 'm1',
        numberOfDrums: 2,
        cuttingLengthM: 1000,
        plannedCableLengthM: 2000,
        grossLoadedDrumWeightKg: 1500,
        engineering: null,
      },
      master: {
        drumMasterId: 'm1',
        drumCode: 'D1',
        flangeMm: 2600,
        barrelMm: 1400,
        outerWidthMm: 1600,
        innerWidthMm: 1500,
        emptyDrumNetWeightKg: 120,
      },
      packing: {
        packingProfileVersionId: 'ppv1',
        packedLengthMm: 1450,
        packedWidthMm: 982,
        packedHeightMm: null,
      },
    });
    assert.ok(geom);
    assert.equal(geom!.packedLengthMm, 1450);
    assert.equal(geom!.packedWidthMm, 982);
  });

  it('rejects non-positive packed height when height is represented', () => {
    const geom = resolveSnapshotDrumGeometry({
      line: {
        id: 'line-1',
        lineNo: 1,
        drumCode: 'D1',
        drumMasterId: 'm1',
        numberOfDrums: 1,
        cuttingLengthM: 1000,
        plannedCableLengthM: 1000,
        grossLoadedDrumWeightKg: 1500,
        engineering: null,
      },
      master: {
        drumMasterId: 'm1',
        drumCode: 'D1',
        flangeMm: 2600,
        barrelMm: 1400,
        outerWidthMm: 1600,
        innerWidthMm: 1500,
        emptyDrumNetWeightKg: 120,
      },
      packing: {
        packingProfileVersionId: 'ppv1',
        packedLengthMm: 1450,
        packedWidthMm: 982,
        packedHeightMm: 0,
      },
    });
    assert.equal(geom, null);
  });

  it('builds snapshot drums when geometry and gross weight exist', () => {
    const line = {
      id: 'line-1',
      lineNo: 1,
      drumCode: 'D1',
      drumMasterId: 'm1',
      numberOfDrums: 3,
      cuttingLengthM: 500,
      plannedCableLengthM: 1500,
      grossLoadedDrumWeightKg: 2000,
      engineering: null,
    };
    const { drums, missing } = buildSnapshotDrumsFromDrumPlan([line], () => ({
      master: {
        drumMasterId: 'm1',
        drumCode: 'D1',
        flangeMm: 2600,
        barrelMm: 1400,
        outerWidthMm: 1600,
        innerWidthMm: 1500,
        emptyDrumNetWeightKg: 120,
      },
      packing: {
        packingProfileVersionId: 'ppv1',
        packedLengthMm: 1400,
        packedWidthMm: 982,
        packedHeightMm: null,
      },
    }));
    assert.equal(missing.length, 0);
    assert.equal(drums.length, 1);
    assert.equal(drums[0].quantity, 3);
    assert.equal(drums[0].sourceLineId, 'line-1');
  });

  it('expands physical drum provenance for every instance', () => {
    const lineage = flattenLineageFromDrumPlans(
      'inq-1',
      {
        shipmentGroupId: 'sg-1',
        shipmentGroupVersionNo: 1,
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
        containerTypePreferenceCode: null,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      },
      [
        {
          inquiryLineId: 'line-1',
          cableMaterialNumber: 'M1',
          configurationSnapshotId: 'cfg-id',
          configurationSnapshotVersionNo: 1,
          configurationSnapshotIdString: 'cfg-1',
          cuttingLengthRequirementId: 'req-1',
          cuttingLengthPlanId: 'cut-id',
          cuttingLengthPlanVersionNo: 1,
          cuttingLengthPlanIdString: 'cut-1',
          requestedDrumCount: 2,
          physicalDrumCount: 2,
          toleranceMode: 'PERCENT',
          tolerancePercent: 1,
          positiveTolerancePercent: 1,
          negativeTolerancePercent: 1,
          drumPlanId: 'plan-id',
          drumPlanVersionNo: 3,
          drumPlanIdString: 'DP-1',
          drumLinePins: [
            {
              v2DrumPlanLineId: 'dpl-1',
              lineNo: 1,
              numberOfDrums: 2,
              cuttingLengthM: 500,
              plannedCableLengthM: 1000,
              inquiryId: 'inq-1',
              inquiryLineId: 'line-1',
              cuttingLengthRequirementId: 'req-1',
              cuttingLengthPlanId: 'cut-id',
              drumPlanId: 'plan-id',
              cableMaterialNumber: 'M1',
              drumMasterPin: null,
              packingPin: null,
              engineering: null,
            },
          ],
        },
      ]
    );
    assert.equal(lineage.physicalDrumPins.length, 2);
    assert.equal(lineage.physicalDrumPins[0]!.physicalDrumKey, 'dpl-1#1');
    assert.equal(lineage.physicalDrumPins[1]!.physicalDrumKey, 'dpl-1#2');
    assert.equal(lineage.drumPlanVersionNo, 3);
    assert.equal(lineage.physicalDrumPins[0]!.drumPlanVersionNo, 3);
  });
});
