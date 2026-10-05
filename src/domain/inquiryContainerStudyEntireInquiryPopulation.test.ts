import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAuthoritativeMemberLineIds } from './containerStudyShipmentGroupMembership';
import {
  evaluateInquiryContainerStudyReadiness,
  expandPhysicalDrumsFromPlanLines,
  filterPhysicalDrumsByMemberLineIds,
  groupPhysicalDrumsByInquiryLine,
  inquiryCalculateMustCaptureInputSnapshot,
  physicalPopulationIdentitiesEqual,
  physicalPopulationIdentity,
  snapshotPopulationIdentity,
  totalPhysicalCuttingLengthM,
  type PhysicalDrumForStudy,
} from './inquiryContainerStudyPresentation';
import {
  buildInquiryDrumSchedule,
  expandPhysicalDrumsFromInquirySchedule,
} from './inquiryDrumSchedule';

const allLineIds = ['line-1', 'line-2', 'line-3'];

function versionALine(
  lineId: string,
  lineNumber: number,
  rows: Array<{ drumCode: string; noOfDrums: number; cuttingLengthM: number }>,
  lifecycleStatus?: 'DRAFT' | 'CONFIRMED'
): PhysicalDrumForStudy[] {
  const schedule = buildInquiryDrumSchedule(
    rows.map((row) => ({ ...row, drumTolerancePercent: 5 })),
    3,
    lifecycleStatus ? { lifecycleStatus, versionNo: 1 } : {}
  );
  return expandPhysicalDrumsFromInquirySchedule(schedule, lineId).map((drum) => ({
    ...drum,
    inquiryId: 'inq-03447',
    inquiryLineNumber: lineNumber,
    cuttingRequirementId: `${lineId}#schedule`,
    cuttingPlanId: `commercial-schedule:${lineId}:v1`,
    drumPlanId: `commercial-schedule:${lineId}:v1`,
    drumPlanVersion: 1,
    drumPlanLineId: drum.physicalDrumKey,
    cableNetWeightKg: null,
    emptyDrumNetWeightKg: 68,
    grossWeightKg: 470,
  }));
}

/** INQ26-03447 shape: 4 + 4 + 7 = 15 drums, 26,500 m. */
function entireInquiryFifteenDrums(): PhysicalDrumForStudy[] {
  return [
    ...versionALine('line-1', 1, [
      { drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500 },
      { drumCode: 'EWD800-9', noOfDrums: 1, cuttingLengthM: 1000 },
      { drumCode: 'EWD1100-0', noOfDrums: 1, cuttingLengthM: 2000 },
    ], 'CONFIRMED'),
    ...versionALine('line-2', 2, [
      { drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500 },
      { drumCode: 'EWD800-9', noOfDrums: 1, cuttingLengthM: 2000 },
      { drumCode: 'EWD1100-0', noOfDrums: 1, cuttingLengthM: 2000 },
    ]),
    ...versionALine('line-3', 3, [
      { drumCode: 'EWD900-0', noOfDrums: 3, cuttingLengthM: 1500 },
      { drumCode: 'EWD800-9', noOfDrums: 2, cuttingLengthM: 2000 },
      { drumCode: 'EWD1100-0', noOfDrums: 2, cuttingLengthM: 2500 },
    ]),
  ];
}

const approvedType = {
  code: 'T1',
  description: 'Ready',
  active: true,
  currentVersionId: 'T1-v1',
  dimensionsStatus: 'APPROVED' as const,
  usableLengthMm: 12032,
  internalWidthMm: 2350,
  payloadCapacityKg: 26500,
};

describe('Container Study ENTIRE_INQUIRY physical population', () => {
  it('TEST 1 — ENTIRE_INQUIRY consumes all three lines (4+4+7=15), not first-line only', () => {
    const memberLineIds = resolveAuthoritativeMemberLineIds({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      groupInquiryLineId: 'line-1',
      membershipLineIds: ['line-1', 'line-2'],
      allInquiryLineIds: allLineIds,
    });
    const physical = filterPhysicalDrumsByMemberLineIds(entireInquiryFifteenDrums(), memberLineIds);
    assert.deepEqual(memberLineIds, allLineIds);
    assert.equal(physical.length, 15);
    assert.equal(totalPhysicalCuttingLengthM(physical), 26500);
    const byLine = groupPhysicalDrumsByInquiryLine(physical);
    assert.deepEqual(
      byLine.map((row) => ({ line: row.inquiryLineNumber, drums: row.drumCount, metres: row.totalCuttingLengthM })),
      [
        { line: 1, drums: 4, metres: 6000 },
        { line: 2, drums: 4, metres: 7000 },
        { line: 3, drums: 7, metres: 13500 },
      ]
    );
  });

  it('TEST 2 — PER_INQUIRY_LINE consumes the selected line only', () => {
    const memberLineIds = resolveAuthoritativeMemberLineIds({
      deliveryAllocationMode: 'PER_INQUIRY_LINE',
      groupInquiryLineId: 'line-2',
      membershipLineIds: ['line-2'],
      allInquiryLineIds: allLineIds,
    });
    const physical = filterPhysicalDrumsByMemberLineIds(entireInquiryFifteenDrums(), memberLineIds);
    assert.deepEqual(memberLineIds, ['line-2']);
    assert.equal(physical.length, 4);
    assert.equal(totalPhysicalCuttingLengthM(physical), 7000);
    assert.ok(physical.every((drum) => drum.inquiryLineId === 'line-2'));
  });

  it('TEST 3 — DESTINATION_CLUSTER consumes group members of that identity only', () => {
    const memberLineIds = resolveAuthoritativeMemberLineIds({
      deliveryAllocationMode: 'DESTINATION_CLUSTER',
      groupInquiryLineId: 'line-1',
      membershipLineIds: ['line-1', 'line-3'],
      allInquiryLineIds: allLineIds,
    });
    const physical = filterPhysicalDrumsByMemberLineIds(entireInquiryFifteenDrums(), memberLineIds);
    assert.deepEqual(memberLineIds, ['line-1', 'line-3']);
    assert.equal(physical.length, 11);
    assert.equal(totalPhysicalCuttingLengthM(physical), 19500);
    assert.ok(physical.every((drum) => drum.inquiryLineId === 'line-1' || drum.inquiryLineId === 'line-3'));
  });

  it('TEST 4 — ContainerShipmentGroup.inquiryLineId is not authoritative for ENTIRE_INQUIRY', () => {
    const memberLineIds = resolveAuthoritativeMemberLineIds({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      groupInquiryLineId: 'line-1',
      membershipLineIds: [],
      allInquiryLineIds: allLineIds,
    });
    assert.deepEqual(memberLineIds, allLineIds);
    assert.equal(memberLineIds.includes('line-1') && memberLineIds.length === 1, false);
  });

  it('TEST 5 — physical drums are instances (2×1500 m = two 1500 m drums)', () => {
    const two = expandPhysicalDrumsFromInquirySchedule(
      buildInquiryDrumSchedule(
        [{ drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 5 }],
        3
      ),
      'line-1'
    );
    assert.equal(two.length, 2);
    assert.equal(two[0]?.cuttingLengthM, 1500);
    assert.equal(two[1]?.cuttingLengthM, 1500);
    assert.notEqual(two[0]?.physicalDrumKey, two[1]?.physicalDrumKey);
    assert.notEqual(totalPhysicalCuttingLengthM(two), 3000 / 2);
    const v2 = expandPhysicalDrumsFromPlanLines([
      {
        id: 'v2-line',
        drumPlanId: 'plan-1',
        inquiryLineId: 'line-1',
        drumCode: 'EWD900-0',
        numberOfDrums: 2,
        cuttingLengthM: 1500,
      },
    ]);
    assert.equal(v2.length, 2);
    assert.ok(v2.every((drum) => drum.cuttingLengthM === 1500));
  });

  it('TEST 6 — stale 4-drum snapshot must be recaptured against the 15-drum population', () => {
    const physical = entireInquiryFifteenDrums();
    const staleSnapshot = [
      { sourceLineId: 'line-1#1', drumCode: 'EWD900-0', quantity: 2 },
      { sourceLineId: 'line-1#2', drumCode: 'EWD800-9', quantity: 1 },
      { sourceLineId: 'line-1#3', drumCode: 'EWD1100-0', quantity: 1 },
    ];
    const snapshotIdentity = snapshotPopulationIdentity(staleSnapshot);
    const physicalIdentity = physicalPopulationIdentity(physical);
    assert.equal(physicalIdentity.reduce((n, row) => n + row.instanceCount, 0), 15);
    assert.equal(snapshotIdentity.reduce((n, row) => n + row.instanceCount, 0), 4);
    assert.equal(physicalPopulationIdentitiesEqual(snapshotIdentity, physicalIdentity), false);
    assert.equal(
      inquiryCalculateMustCaptureInputSnapshot({
        currentSnapshotId: 'snap-stale-4',
        snapshotIdentity,
        physicalIdentity,
      }),
      true
    );
    const currentFifteen = [
      { sourceLineId: 'line-1#1', drumCode: 'EWD900-0', quantity: 2 },
      { sourceLineId: 'line-1#2', drumCode: 'EWD800-9', quantity: 1 },
      { sourceLineId: 'line-1#3', drumCode: 'EWD1100-0', quantity: 1 },
      { sourceLineId: 'line-2#1', drumCode: 'EWD900-0', quantity: 2 },
      { sourceLineId: 'line-2#2', drumCode: 'EWD800-9', quantity: 1 },
      { sourceLineId: 'line-2#3', drumCode: 'EWD1100-0', quantity: 1 },
      { sourceLineId: 'line-3#1', drumCode: 'EWD900-0', quantity: 3 },
      { sourceLineId: 'line-3#2', drumCode: 'EWD800-9', quantity: 2 },
      { sourceLineId: 'line-3#3', drumCode: 'EWD1100-0', quantity: 2 },
    ];
    assert.equal(
      inquiryCalculateMustCaptureInputSnapshot({
        currentSnapshotId: 'snap-current-15',
        snapshotIdentity: snapshotPopulationIdentity(currentFifteen),
        physicalIdentity,
      }),
      false
    );
  });

  it('TEST 7 — calculate creates a new snapshot identity; historical 4-drum identity is unchanged', () => {
    const historical = Object.freeze([
      { sourceLineId: 'line-1#1', drumCode: 'EWD900-0', quantity: 2 },
      { sourceLineId: 'line-1#2', drumCode: 'EWD800-9', quantity: 1 },
      { sourceLineId: 'line-1#3', drumCode: 'EWD1100-0', quantity: 1 },
    ]);
    const historicalIdentity = snapshotPopulationIdentity(historical);
    const nextIdentity = physicalPopulationIdentity(entireInquiryFifteenDrums());
    assert.equal(inquiryCalculateMustCaptureInputSnapshot({
      currentSnapshotId: 'snap-historical',
      snapshotIdentity: historicalIdentity,
      physicalIdentity: nextIdentity,
    }), true);
    assert.deepEqual(snapshotPopulationIdentity(historical), historicalIdentity);
    assert.equal(historicalIdentity.reduce((n, row) => n + row.instanceCount, 0), 4);
    assert.equal(nextIdentity.reduce((n, row) => n + row.instanceCount, 0), 15);
  });

  it('TEST 8 — DONCASTER / CIF do not block packing readiness', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-03447',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'commercial-schedule:line-1:v1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: entireInquiryFifteenDrums(),
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
      region: 'Europe',
    });
    assert.equal(readiness.ok, true);
    const missingDest = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-03447',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'commercial-schedule:line-1:v1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: entireInquiryFifteenDrums(),
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: null,
      unresolvedDestination: 'DONCASTER',
      incotermCode: null,
      unresolvedIncoterm: 'CIF',
      region: 'Europe',
    });
    assert.equal(missingDest.ok, true);
    assert.equal(missingDest.issues.some((issue) => issue.field === 'destinationPortCode'), false);
    assert.equal(missingDest.issues.some((issue) => issue.field === 'incotermCode'), false);
  });

  it('TEST 9 — empty ENTIRE_INQUIRY membership falls back to all current inquiry lines and invents none', () => {
    const memberLineIds = resolveAuthoritativeMemberLineIds({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      membershipLineIds: [],
      allInquiryLineIds: allLineIds,
    });
    assert.deepEqual(memberLineIds, allLineIds);
    const emptyInquiry = resolveAuthoritativeMemberLineIds({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      membershipLineIds: [],
      allInquiryLineIds: [],
    });
    assert.deepEqual(emptyInquiry, []);
    assert.deepEqual(filterPhysicalDrumsByMemberLineIds(entireInquiryFifteenDrums(), []), []);
    assert.equal(filterPhysicalDrumsByMemberLineIds(entireInquiryFifteenDrums(), ['invented-line']).length, 0);
  });

  it('TEST 10 — expanded instances carry inquiry / line / plan provenance', () => {
    const [first] = entireInquiryFifteenDrums();
    assert.ok(first);
    assert.equal(first.inquiryId, 'inq-03447');
    assert.equal(first.inquiryLineId, 'line-1');
    assert.equal(first.inquiryLineNumber, 1);
    assert.equal(first.cuttingRequirementId, 'line-1#schedule');
    assert.equal(first.cuttingPlanId, 'commercial-schedule:line-1:v1');
    assert.equal(first.drumPlanId, 'commercial-schedule:line-1:v1');
    assert.equal(first.drumPlanVersion, 1);
    assert.ok(first.drumPlanLineId);
    assert.equal(first.drumCode, 'EWD900-0');
    assert.equal(first.cuttingLengthM, 1500);
    assert.equal(first.emptyDrumNetWeightKg, 68);
    assert.equal(first.grossWeightKg, 470);
  });
});
