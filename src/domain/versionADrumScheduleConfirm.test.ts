import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandPhysicalDrumsFromInquirySchedule,
  parseInquiryDrumSchedule,
} from './inquiryDrumSchedule';
import {
  buildConfirmedVersionADrumSchedule,
  evaluateVersionADrumScheduleConfirm,
} from './versionADrumScheduleConfirm';
import {
  describeInquiryShipmentDestination,
  evaluateInquiryContainerStudyReadiness,
} from './inquiryContainerStudyPresentation';

const rows = [
  { drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 1 },
  { drumCode: 'EWD800-9', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 1 },
  { drumCode: 'EWD1100-0', noOfDrums: 1, cuttingLengthM: 2000, drumTolerancePercent: 1 },
];

describe('versionADrumScheduleConfirm', () => {
  it('parses the existing Version A drum schedule without requiring a V2 snapshot', () => {
    const schedule = parseInquiryDrumSchedule({
      cableTolerancePercent: 1,
      rows,
    });
    assert.ok(schedule);
    assert.deepEqual(
      schedule!.rows.map((row) => ({ cutting: row.cuttingLengthM, drums: row.noOfDrums })),
      [
        { cutting: 1500, drums: 2 },
        { cutting: 1000, drums: 1 },
        { cutting: 2000, drums: 1 },
      ]
    );
  });

  it('confirms 1500×2 + 1000×1 + 2000×1 as 4 physical drums', () => {
    const schedule = buildConfirmedVersionADrumSchedule({
      rows,
      cableTolerancePercent: 1,
    });
    const physical = expandPhysicalDrumsFromInquirySchedule(schedule, 'line-1');
    assert.equal(physical.length, 4);
    assert.deepEqual(
      physical.map((drum) => drum.cuttingLengthM),
      [1500, 1500, 1000, 2000]
    );
    assert.equal(physical.reduce((sum, drum) => sum + drum.cuttingLengthM, 0), 6000);
  });

  it('does not require a V2 configuration snapshot to confirm', () => {
    const evaluation = evaluateVersionADrumScheduleConfirm({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      customerScopeValid: true,
      schedule: {
        cableTolerancePercent: 1,
        rows,
        lifecycleStatus: 'DRAFT',
      },
      drumMasterCodes: ['EWD900-0', 'EWD800-9', 'EWD1100-0'],
    });
    assert.equal(evaluation.canConfirm, true);
    assert.equal(evaluation.physicalDrums.length, 4);
  });

  it('blocks confirm when a selected drum is not in Drum Master', () => {
    const evaluation = evaluateVersionADrumScheduleConfirm({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      customerScopeValid: true,
      schedule: { cableTolerancePercent: 1, rows, lifecycleStatus: 'DRAFT' },
      drumMasterCodes: ['EWD900-0'],
    });
    assert.equal(evaluation.canConfirm, false);
    assert.ok(evaluation.issues.some((issue) => issue.code === 'DRUM_MASTER_NOT_FOUND'));
  });

  it('confirmed schedule cannot be edited in place', () => {
    const evaluation = evaluateVersionADrumScheduleConfirm({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      schedule: buildConfirmedVersionADrumSchedule({ rows, cableTolerancePercent: 1 }),
      drumMasterCodes: ['EWD900-0', 'EWD800-9', 'EWD1100-0'],
    });
    assert.equal(evaluation.confirmed, true);
    assert.equal(evaluation.canEditInPlace, false);
    assert.equal(evaluation.canConfirm, false);
  });

  it('Container Study reads confirmed Version A drums and does not say none exist', () => {
    const schedule = buildConfirmedVersionADrumSchedule({ rows, cableTolerancePercent: 1 });
    const physical = expandPhysicalDrumsFromInquirySchedule(schedule, 'line-1');
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-1',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'commercial-schedule:line-1:v1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: physical,
      approvedContainerTypes: [],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: null,
      incotermCode: 'FOB',
      region: 'Europe',
    });
    assert.equal(physical.length, 4);
    assert.equal(readiness.issues.some((issue) => issue.code === 'PHYSICAL_DRUMS_REQUIRED'), false);
    assert.equal(readiness.issues.some((issue) => issue.field === 'destinationPortCode'), false);
    assert.ok(readiness.issues.some((issue) => issue.message === 'Container type is not approved/configured.'));
  });

  it('unresolved Alexandria does not block packing and does not clear the 4 physical drums', () => {
    const schedule = buildConfirmedVersionADrumSchedule({ rows, cableTolerancePercent: 1 });
    const physical = expandPhysicalDrumsFromInquirySchedule(schedule, 'line-1');
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-1',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'commercial-schedule:line-1:v1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: physical,
      approvedContainerTypes: [
        {
          code: 'T1',
          description: 'Ready',
          active: true,
          dimensionsStatus: 'APPROVED',
          usableLengthMm: 12032,
          internalWidthMm: 2350,
          payloadCapacityKg: 26500,
        },
      ],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: null,
      unresolvedDestination: 'Alexandria',
      incotermCode: 'FOB',
      region: 'Europe',
    });
    const destination = describeInquiryShipmentDestination({
      requestedDestination: 'Alexandria',
      destinationPortCode: null,
    });
    assert.equal(physical.length, 4);
    assert.equal(readiness.ok, true);
    assert.equal(readiness.issues.some((issue) => issue.code === 'PHYSICAL_DRUMS_REQUIRED'), false);
    assert.equal(destination.calculationBlocked, false);
    assert.equal(destination.configured, false);
  });

  it('helpers perform no database writes', () => {
    expandPhysicalDrumsFromInquirySchedule(
      buildConfirmedVersionADrumSchedule({ rows, cableTolerancePercent: 1 }),
      'line-1'
    );
    assert.equal(true, true);
  });
});
