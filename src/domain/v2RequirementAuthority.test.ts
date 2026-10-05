import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import { selectEligibleConfirmedDrumPlans } from './containerStudyEntireInquiryAggregation';
import {
  assertLinePointerIsNotAuthoritativeMultiRequirementSource,
  lineLevelPointersAreAuthoritative,
  resolveAuthoritativeCurrentDrumPlanIds,
} from './v2RequirementAuthority';

describe('v2RequirementAuthority — line pointers are legacy only', () => {
  it('treats line-level pointers as authoritative only when no requirements exist', () => {
    assert.equal(lineLevelPointersAreAuthoritative(0), true);
    assert.equal(lineLevelPointersAreAuthoritative(3), false);
  });

  it('resolves all requirement current drum plans instead of the last-touched line pointer', () => {
    const ids = resolveAuthoritativeCurrentDrumPlanIds({
      lineCurrentDrumPlanId: 'plan-cl03-last-touched',
      requirements: [
        { currentDrumPlanId: 'plan-cl01' },
        { currentDrumPlanId: 'plan-cl02' },
        { currentDrumPlanId: 'plan-cl03-last-touched' },
      ],
    });
    assert.deepEqual(ids, ['plan-cl01', 'plan-cl02', 'plan-cl03-last-touched']);
    assert.equal(ids.length === 1 && ids[0] === 'plan-cl03-last-touched', false);
  });

  it('rejects using the line-level pointer as the sole multi-requirement source', () => {
    assert.throws(
      () =>
        assertLinePointerIsNotAuthoritativeMultiRequirementSource({
          lineCurrentDrumPlanId: 'plan-cl03-last-touched',
          selectedDrumPlanIds: ['plan-cl03-last-touched'],
          requirementCurrentDrumPlanIds: ['plan-cl01', 'plan-cl02', 'plan-cl03-last-touched'],
        }),
      (err: unknown) => err instanceof DomainError && /not authoritative/.test(err.message)
    );
  });

  it('accepts the full requirement current set even when the line pointer is last-touched only', () => {
    assertLinePointerIsNotAuthoritativeMultiRequirementSource({
      lineCurrentDrumPlanId: 'plan-cl03-last-touched',
      selectedDrumPlanIds: ['plan-cl01', 'plan-cl02', 'plan-cl03-last-touched'],
      requirementCurrentDrumPlanIds: ['plan-cl01', 'plan-cl02', 'plan-cl03-last-touched'],
    });
  });

  it('Container Study eligibility does not collapse requirements to the line-level current drum plan', () => {
    const selected = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: 'PER_INQUIRY_LINE',
      inquiryId: 'inq-1',
      shipmentGroupInquiryLineId: 'line-1',
      lines: [
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId: 'inq-1',
          currentDrumPlanId: 'plan-last-touched',
          currentDrumPlanStatus: 'CONFIRMED',
        },
      ],
      requirements: [
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId: 'inq-1',
          requirementId: 'req-1',
          sequenceNo: 1,
          currentDrumPlanId: 'plan-a',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId: 'inq-1',
          requirementId: 'req-2',
          sequenceNo: 2,
          currentDrumPlanId: 'plan-b',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId: 'inq-1',
          requirementId: 'req-3',
          sequenceNo: 3,
          currentDrumPlanId: 'plan-last-touched',
          currentDrumPlanStatus: 'CONFIRMED',
        },
      ],
    });
    assert.deepEqual(selected.currentDrumPlanIds, ['plan-a', 'plan-b', 'plan-last-touched']);
    assert.notDeepEqual(selected.currentDrumPlanIds, ['plan-last-touched']);
    assertLinePointerIsNotAuthoritativeMultiRequirementSource({
      lineCurrentDrumPlanId: 'plan-last-touched',
      selectedDrumPlanIds: selected.currentDrumPlanIds,
      requirementCurrentDrumPlanIds: ['plan-a', 'plan-b', 'plan-last-touched'],
    });
  });
});
