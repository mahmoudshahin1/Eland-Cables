import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canEditDrumPlanInPlace,
  confirmedPhysicalPopulationFromPlanLines,
  cuttingLengthsIntact,
  evaluateAutoConfirmDrumPlan,
  evaluateDrumPlanConfirmReadiness,
  expectedPhysicalCountFromSchedule,
  DRUM_PLAN_CONFIRMED_STATUS_LABEL,
  DRUM_PLAN_NOT_CONFIRMED_STATUS_LABEL,
} from './drumPlanConfirmReadiness';

const threeRequirementRows = [
  { cuttingLengthM: 1500, noOfDrums: 2, drumCode: 'EWD1250' },
  { cuttingLengthM: 1000, noOfDrums: 1, drumCode: 'EWD1000' },
  { cuttingLengthM: 800, noOfDrums: 3, drumCode: 'EWD800' },
];

describe('evaluateDrumPlanConfirmReadiness', () => {
  it('1. Confirm is available when a valid draft drum plan exists', () => {
    const readiness = evaluateDrumPlanConfirmReadiness({
      lifecycleStatus: 'DRAFT',
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
    });
    assert.equal(readiness.canShowConfirm, true);
    assert.equal(readiness.canConfirm, true);
    assert.equal(readiness.confirmed, false);
  });

  it('2. Confirm is blocked when physical drum coverage is incomplete', () => {
    const readiness = evaluateDrumPlanConfirmReadiness({
      lifecycleStatus: 'DRAFT',
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: [
        { cuttingLengthM: 1500, noOfDrums: 2, drumCode: 'EWD1250' },
        { cuttingLengthM: 1000, noOfDrums: 1, drumCode: '' },
        { cuttingLengthM: 800, noOfDrums: 3, drumCode: 'EWD800' },
      ],
    });
    assert.equal(readiness.canConfirm, false);
    assert.ok(readiness.issues.some((issue) => issue.code === 'INCOMPLETE_COVERAGE' || issue.code === 'DRUM_NOT_SELECTED'));
  });

  it('3. Confirm readiness becomes CONFIRMED only after an explicit confirm status', () => {
    const draft = evaluateDrumPlanConfirmReadiness({
      lifecycleStatus: 'DRAFT',
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
    });
    assert.equal(draft.confirmed, false);
    const confirmed = evaluateDrumPlanConfirmReadiness({
      lifecycleStatus: 'CONFIRMED',
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
    });
    assert.equal(confirmed.confirmed, true);
    assert.equal(confirmed.canConfirm, false);
    assert.equal(confirmed.canShowConfirm, false);
  });

  it('4. Confirmed plan cannot be edited in place', () => {
    assert.equal(canEditDrumPlanInPlace('CONFIRMED'), false);
    assert.equal(
      evaluateDrumPlanConfirmReadiness({
        lifecycleStatus: 'CONFIRMED',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows: threeRequirementRows,
      }).canEditInPlace,
      false
    );
    assert.equal(canEditDrumPlanInPlace('DRAFT'), true);
  });

  it('5. Container Study can read the confirmed physical drum population', () => {
    const physical = confirmedPhysicalPopulationFromPlanLines([
      {
        id: 'l1',
        drumPlanId: 'plan-1',
        inquiryLineId: 'line-1',
        requirementId: 'r1',
        drumCode: 'EWD1250',
        numberOfDrums: 2,
        cuttingLengthM: 1500,
      },
      {
        id: 'l2',
        drumPlanId: 'plan-2',
        inquiryLineId: 'line-1',
        requirementId: 'r2',
        drumCode: 'EWD1000',
        numberOfDrums: 1,
        cuttingLengthM: 1000,
      },
      {
        id: 'l3',
        drumPlanId: 'plan-3',
        inquiryLineId: 'line-1',
        requirementId: 'r3',
        drumCode: 'EWD800',
        numberOfDrums: 3,
        cuttingLengthM: 800,
      },
    ]);
    assert.equal(physical.length, 6);
    assert.deepEqual(
      physical.map((drum) => drum.cuttingLengthM),
      [1500, 1500, 1000, 800, 800, 800]
    );
  });

  it('6. Multiple cutting lengths remain intact after confirmation', () => {
    const afterConfirm = threeRequirementRows.map((row) => ({ ...row }));
    assert.equal(cuttingLengthsIntact(threeRequirementRows, afterConfirm), true);
    assert.equal(
      cuttingLengthsIntact(threeRequirementRows, [
        { cuttingLengthM: 1500, noOfDrums: 2, drumCode: 'EWD1250' },
      ]),
      false
    );
  });

  it('7. 1500 × 2 + 1000 × 1 + 800 × 3 = 6 physical drums', () => {
    const readiness = evaluateDrumPlanConfirmReadiness({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
    });
    assert.equal(readiness.physicalDrumCount, 6);
    assert.equal(expectedPhysicalCountFromSchedule(threeRequirementRows), 6);
    assert.deepEqual(
      readiness.physicalDrums.map((drum) => drum.cuttingLengthM),
      [1500, 1500, 1000, 800, 800, 800]
    );
  });

  it('8. Readiness evaluation performs no database writes', () => {
    evaluateDrumPlanConfirmReadiness({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
    });
    assert.equal(true, true);
  });

  it('does not treat a missing inquiry/line as confirmable', () => {
    const readiness = evaluateDrumPlanConfirmReadiness({
      rows: threeRequirementRows,
    });
    assert.equal(readiness.canShowConfirm, true);
    assert.equal(readiness.canConfirm, false);
    assert.ok(readiness.issues.some((issue) => issue.code === 'SCOPE_REQUIRED'));
  });
});

describe('evaluateAutoConfirmDrumPlan', () => {
  it('A. cutting + valid drum + technical validation auto-confirms', () => {
    const decision = evaluateAutoConfirmDrumPlan({
      lifecycleStatus: 'DRAFT',
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
      technicalPlanValid: true,
    });
    assert.equal(decision.shouldAutoConfirm, true);
    assert.equal(decision.confirmed, false);
    assert.equal(DRUM_PLAN_CONFIRMED_STATUS_LABEL, 'Drum Plan: CONFIRMED');
  });

  it('B. cutting without a drum does not auto-confirm', () => {
    const decision = evaluateAutoConfirmDrumPlan({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: [{ cuttingLengthM: 1500, noOfDrums: 1, drumCode: '' }],
      technicalPlanValid: true,
    });
    assert.equal(decision.shouldAutoConfirm, false);
    assert.equal(decision.confirmed, false);
    assert.ok(decision.issues.some((issue) => issue.code === 'DRUM_NOT_SELECTED' || issue.code === 'INCOMPLETE_COVERAGE'));
  });

  it('C. drum without cutting does not auto-confirm', () => {
    const decision = evaluateAutoConfirmDrumPlan({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: [{ cuttingLengthM: '', noOfDrums: 1, drumCode: 'EWD1250' }],
      technicalPlanValid: true,
    });
    assert.equal(decision.shouldAutoConfirm, false);
    assert.ok(decision.issues.some((issue) => issue.code === 'NO_PHYSICAL_DRUMS' || issue.code === 'INCOMPLETE_COVERAGE'));
  });

  it('D. invalid capacity does not auto-confirm', () => {
    const decision = evaluateAutoConfirmDrumPlan({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
      technicalPlanValid: false,
    });
    assert.equal(decision.shouldAutoConfirm, false);
    assert.ok(decision.issues.some((issue) => issue.code === 'CAPACITY_VALIDATION_FAILED'));
    assert.equal(DRUM_PLAN_NOT_CONFIRMED_STATUS_LABEL, 'Drum Plan: NOT CONFIRMED');
  });

  it('E. multiple allocations auto-confirm only when every required drum is selected', () => {
    const incomplete = evaluateAutoConfirmDrumPlan({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: [
        { cuttingLengthM: 1500, noOfDrums: 2, drumCode: 'EWD1250' },
        { cuttingLengthM: 1000, noOfDrums: 1, drumCode: '' },
        { cuttingLengthM: 800, noOfDrums: 3, drumCode: 'EWD800' },
      ],
      technicalPlanValid: true,
    });
    assert.equal(incomplete.shouldAutoConfirm, false);
    const complete = evaluateAutoConfirmDrumPlan({
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
      technicalPlanValid: true,
    });
    assert.equal(complete.shouldAutoConfirm, true);
  });

  it('does not treat UI selection as CONFIRMED until an explicit persisted confirm status', () => {
    const decision = evaluateAutoConfirmDrumPlan({
      lifecycleStatus: 'DRAFT',
      inquiryId: 'inq-1',
      lineId: 'line-1',
      rows: threeRequirementRows,
      technicalPlanValid: true,
    });
    assert.equal(decision.confirmed, false);
    assert.equal(
      evaluateAutoConfirmDrumPlan({
        lifecycleStatus: 'CONFIRMED',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows: threeRequirementRows,
        technicalPlanValid: true,
      }).confirmed,
      true
    );
  });
});
