import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateContainerStudyResultIntegrity } from './containerStudyResultIntegrity';
import { explainUnallocatedDrums } from './containerStudyUnallocatedExplanation';
import { evaluateSnapshotInputHardening, evaluateDrumPlanDrift } from './containerStudyInputHardening';
import { evaluateContainerStudyStructure } from './containerStudyValidation';

const lineage = {
  cuttingLengthRequirementIds: ['req-1'],
  authoritativeDrumPlanIds: ['plan-1'],
  drumPlans: [
    {
      inquiryLineId: 'line-1',
      cuttingLengthRequirementId: 'req-1',
      drumPlanId: 'plan-1',
      drumPlanVersionNo: 1,
      drumLinePins: [
        {
          v2DrumPlanLineId: 'SRC-1',
          inquiryLineId: 'line-1',
          cuttingLengthRequirementId: 'req-1',
          drumPlanId: 'plan-1',
          drumPlanVersionNo: 1,
          numberOfDrums: 2,
        },
      ],
    },
  ],
  drumLinePins: [
    {
      v2DrumPlanLineId: 'SRC-1',
      inquiryLineId: 'line-1',
      cuttingLengthRequirementId: 'req-1',
      drumPlanId: 'plan-1',
      numberOfDrums: 2,
    },
  ],
};

const drums = [{ sourceLineId: 'SRC-1', quantity: 2, packedLengthMm: 1400, packedWidthMm: 982, packedHeightMm: 2600, grossWeightKg: 1000 }];

function passResult() {
  return {
    inputSnapshotId: 'snap-1',
    allocations: [
      { physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0, allocationKind: 'PHYSICAL' },
      { physicalDrumKey: 'SRC-1:1', sourceLineId: 'SRC-1', instanceIndex: 1, allocationKind: 'PHYSICAL' },
    ],
    unallocated: [],
  };
}

describe('05I-DF-B3 snapshot input hardening', () => {
  it('rejects duplicate sourceLineId, non-positive geometry/weight, and non-integer quantity', () => {
    const result = evaluateSnapshotInputHardening({
      drums: [
        { sourceLineId: 'A', quantity: 1.5, packedLengthMm: 0, packedWidthMm: -1, packedHeightMm: 0, grossWeightKg: Number.NaN },
        { sourceLineId: 'A', quantity: 0, packedLengthMm: 100, packedWidthMm: 80, grossWeightKg: 0 },
      ],
      lineageProvenanceJson: lineage,
    });
    const codes = result.issues.map((i) => i.code);
    assert.ok(codes.includes('DUPLICATE_PHYSICAL_DRUM'));
    assert.ok(codes.includes('INVALID_DIMENSION'));
    assert.ok(codes.includes('INVALID_WEIGHT'));
    assert.ok(codes.includes('INVALID_PHYSICAL_QUANTITY'));
  });

  it('rejects missing lineage and drums without requirement provenance', () => {
    const missing = evaluateSnapshotInputHardening({ drums, lineageProvenanceJson: null });
    assert.ok(missing.issues.some((i) => i.code === 'MISSING_LINEAGE'));
    const unmatched = evaluateSnapshotInputHardening({
      drums: [{ ...drums[0], sourceLineId: 'OTHER' }],
      lineageProvenanceJson: lineage,
    });
    assert.ok(unmatched.issues.some((i) => i.code === 'MISSING_LINEAGE'));
  });

  it('detects drum-plan drift by id set and version', () => {
    const drifted = evaluateDrumPlanDrift({
      snapshotAuthoritativeDrumPlanIds: ['plan-1'],
      snapshotDrumPlanVersions: [{ drumPlanId: 'plan-1', drumPlanVersionNo: 1 }],
      liveEligibleDrumPlanIds: ['plan-2'],
      liveDrumPlanVersions: [{ drumPlanId: 'plan-2', versionNo: 1 }],
    });
    assert.equal(drifted.stale, true);
    assert.ok(drifted.issues.every((i) => i.code === 'STALE_DRUM_PLAN'));
  });
});

describe('05I-DF-B3 result integrity', () => {
  it('passes exact physicalDrumKey set conservation', () => {
    const report = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: passResult(),
    });
    assert.equal(report.ok, true);
    assert.deepEqual(report.expectedKeys.sort(), ['SRC-1:0', 'SRC-1:1']);
  });

  it('detects duplicate allocation, duplicate unallocated, intersection, unknown key, invalid instanceIndex, VIRTUAL, mismatch', () => {
    const dupAlloc = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: {
        inputSnapshotId: 'snap-1',
        allocations: [
          { physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0, allocationKind: 'PHYSICAL' },
          { physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0, allocationKind: 'PHYSICAL' },
        ],
        unallocated: [],
      },
    });
    assert.ok(dupAlloc.issues.some((i) => i.code === 'DUPLICATE_PHYSICAL_DRUM'));

    const both = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: {
        inputSnapshotId: 'snap-1',
        allocations: [{ physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0, allocationKind: 'PHYSICAL' }],
        unallocated: [{ physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0 }],
      },
    });
    assert.ok(both.issues.some((i) => i.code === 'DUPLICATE_PHYSICAL_DRUM'));

    const unknown = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: {
        inputSnapshotId: 'snap-1',
        allocations: [{ physicalDrumKey: 'NOPE:0', sourceLineId: 'NOPE', instanceIndex: 0, allocationKind: 'PHYSICAL' }],
        unallocated: [{ physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0 }],
      },
    });
    assert.ok(unknown.issues.some((i) => i.code === 'UNACCOUNTED_PHYSICAL_DRUM'));

    const idx = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: {
        inputSnapshotId: 'snap-1',
        allocations: [{ physicalDrumKey: 'SRC-1:9', sourceLineId: 'SRC-1', instanceIndex: 9, allocationKind: 'PHYSICAL' }],
        unallocated: [{ physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0 }],
      },
    });
    assert.ok(idx.issues.some((i) => i.code === 'INVALID_ALLOCATION'));

    const virtual = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: {
        inputSnapshotId: 'snap-1',
        allocations: [
          { physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0, allocationKind: 'VIRTUAL' },
          { physicalDrumKey: 'SRC-1:1', sourceLineId: 'SRC-1', instanceIndex: 1, allocationKind: 'PHYSICAL' },
        ],
        unallocated: [],
      },
    });
    assert.ok(virtual.issues.some((i) => i.code === 'VIRTUAL_ALLOCATION_NOT_SUPPORTED'));

    const mismatch = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: { ...passResult(), inputSnapshotId: 'other' },
    });
    assert.ok(mismatch.issues.some((i) => i.code === 'RESULT_SNAPSHOT_MISMATCH'));

    const dupUnalloc = evaluateContainerStudyResultIntegrity({
      snapshotRecordId: 'snap-1',
      drums,
      lineageProvenanceJson: lineage,
      result: {
        inputSnapshotId: 'snap-1',
        allocations: [],
        unallocated: [
          { physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0 },
          { physicalDrumKey: 'SRC-1:0', sourceLineId: 'SRC-1', instanceIndex: 0 },
        ],
      },
    });
    assert.ok(dupUnalloc.issues.some((i) => i.code === 'DUPLICATE_PHYSICAL_DRUM'));
  });

  it('explains unallocated drums with dimensions, weight, and requirement provenance', () => {
    const explained = explainUnallocatedDrums({
      drums,
      lineageProvenanceJson: lineage,
      unallocated: [
        {
          physicalDrumKey: 'SRC-1:0',
          sourceLineId: 'SRC-1',
          instanceIndex: 0,
          reasonCode: 'DIMENSION_LIMIT',
          detail: 'too wide',
        },
      ],
    });
    assert.equal(explained.length, 1);
    assert.equal(explained[0].reasonCode, 'DIMENSION_LIMIT');
    assert.equal(explained[0].packedLengthMm, 1400);
    assert.equal(explained[0].packedWidthMm, 982);
    assert.equal(explained[0].packedHeightMm, 2600);
    assert.equal(explained[0].grossWeightKg, 1000);
    assert.equal(explained[0].cuttingLengthRequirementId, 'req-1');
    assert.equal(explained[0].drumPlanId, 'plan-1');
    assert.equal(explained[0].drumPlanLineId, 'SRC-1');
    assert.equal(explained[0].inquiryLineId, 'line-1');
  });

  it('does not introduce CALCULATED as a structural status check', () => {
    const structural = evaluateContainerStudyStructure({
      shipmentGroupId: 'sg',
      stuffingMethod: 'Rolling',
      algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
      configurationVersion: 'CFG-1',
      configurationStatus: 'ACTIVE',
      drums,
      pinnedContainerTypes: [
        {
          code: '40HQ',
          parityLabel: '40 HQ',
          versionId: 'v1',
          versionNo: 1,
          usableLengthMm: 12000,
          internalWidthMm: 2350,
          payloadCapacityKg: 26000,
          dimensionsStatus: 'APPROVED',
        },
      ],
    });
    assert.equal(structural.ok, true);
  });
});
