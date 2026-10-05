import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import {
  assertCuttingLengthsNotAggregated,
  selectEligibleConfirmedDrumPlans,
} from './containerStudyEntireInquiryAggregation';

const inquiryId = 'inq-1';

function line(
  lineNumber: number,
  status: string | null,
  planId: string | null,
  lineId = `line-${lineNumber}`
) {
  return {
    lineId,
    lineNumber,
    inquiryId,
    currentDrumPlanId: planId,
    currentDrumPlanStatus: status,
  };
}

describe('05I-DF-B2 ENTIRE_INQUIRY aggregation rules', () => {
  it('includes every current CONFIRMED drum plan and ignores a client singleton override', () => {
    const selected = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      inquiryId,
      lines: [line(1, 'CONFIRMED', 'plan-a'), line(2, 'CONFIRMED', 'plan-b'), line(3, 'CONFIRMED', 'plan-c')],
      clientDrumPlanId: 'plan-a',
    });
    assert.deepEqual(selected.currentDrumPlanIds, ['plan-a', 'plan-b', 'plan-c']);
  });

  it('rejects ENTIRE_INQUIRY when any line lacks a CONFIRMED current plan', () => {
    assert.throws(
      () =>
        selectEligibleConfirmedDrumPlans({
          deliveryAllocationMode: 'ENTIRE_INQUIRY',
          inquiryId,
          lines: [line(1, 'CONFIRMED', 'plan-a'), line(2, 'DRAFT', 'plan-b')],
        }),
      (err: unknown) => err instanceof DomainError && /CONFIRMED/.test(err.message)
    );
  });

  it('PER_INQUIRY_LINE includes only the shipment-group line', () => {
    const selected = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: 'PER_INQUIRY_LINE',
      inquiryId,
      shipmentGroupInquiryLineId: 'line-2',
      lines: [line(1, 'CONFIRMED', 'plan-a'), line(2, 'CONFIRMED', 'plan-b')],
    });
    assert.deepEqual(selected.currentDrumPlanIds, ['plan-b']);
  });

  it('rejects a client drum plan from another line in PER_INQUIRY_LINE', () => {
    assert.throws(
      () =>
        selectEligibleConfirmedDrumPlans({
          deliveryAllocationMode: 'PER_INQUIRY_LINE',
          inquiryId,
          shipmentGroupInquiryLineId: 'line-1',
          lines: [line(1, 'CONFIRMED', 'plan-a'), line(2, 'CONFIRMED', 'plan-b')],
          clientDrumPlanId: 'plan-b',
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'VALIDATION_FAILED'
    );
  });

  it('does not sum independent cutting lengths into a drum-selection input', () => {
    const pins = [{ cuttingLengthM: 1000 }, { cuttingLengthM: 1500 }, { cuttingLengthM: 2000 }];
    assert.equal(assertCuttingLengthsNotAggregated(pins), 4500);
    assert.equal(pins[0].cuttingLengthM, 1000);
    assert.equal(pins[1].cuttingLengthM, 1500);
    assert.equal(pins[2].cuttingLengthM, 2000);
  });

  it('includes every requirement on a PER_INQUIRY_LINE commercial line', () => {
    const selected = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: 'PER_INQUIRY_LINE',
      inquiryId,
      shipmentGroupInquiryLineId: 'line-1',
      requirements: [
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId,
          requirementId: 'req-a',
          sequenceNo: 1,
          currentDrumPlanId: 'plan-a',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId,
          requirementId: 'req-b',
          sequenceNo: 2,
          currentDrumPlanId: 'plan-b',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-2',
          lineNumber: 2,
          inquiryId,
          requirementId: 'req-c',
          sequenceNo: 1,
          currentDrumPlanId: 'plan-c',
          currentDrumPlanStatus: 'CONFIRMED',
        },
      ],
    });
    assert.deepEqual(selected.currentDrumPlanIds, ['plan-a', 'plan-b']);
    assert.deepEqual(selected.requirementIds, ['req-a', 'req-b']);
  });

  it('ENTIRE_INQUIRY includes every requirement on every line (Cable A/B/C)', () => {
    const selected = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      inquiryId,
      requirements: [
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId,
          requirementId: 'a-cl01',
          sequenceNo: 1,
          currentDrumPlanId: 'plan-a1',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId,
          requirementId: 'a-cl02',
          sequenceNo: 2,
          currentDrumPlanId: 'plan-a2',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-2',
          lineNumber: 2,
          inquiryId,
          requirementId: 'b-cl01',
          sequenceNo: 1,
          currentDrumPlanId: 'plan-b1',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-3',
          lineNumber: 3,
          inquiryId,
          requirementId: 'c-cl01',
          sequenceNo: 1,
          currentDrumPlanId: 'plan-c1',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-3',
          lineNumber: 3,
          inquiryId,
          requirementId: 'c-cl02',
          sequenceNo: 2,
          currentDrumPlanId: 'plan-c2',
          currentDrumPlanStatus: 'CONFIRMED',
        },
      ],
    });
    assert.deepEqual(selected.currentDrumPlanIds, ['plan-a1', 'plan-a2', 'plan-b1', 'plan-c1', 'plan-c2']);
    assert.deepEqual(selected.requirementIds, ['a-cl01', 'a-cl02', 'b-cl01', 'c-cl01', 'c-cl02']);
    assert.deepEqual(selected.lineIds, ['line-1', 'line-2', 'line-3']);
  });

  it('DESTINATION_CLUSTER uses memberLineIds and excludes other inquiry lines', () => {
    const selected = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: 'DESTINATION_CLUSTER',
      inquiryId,
      memberLineIds: ['line-1', 'line-3'],
      lines: [line(1, 'CONFIRMED', 'plan-a'), line(2, 'CONFIRMED', 'plan-b'), line(3, 'CONFIRMED', 'plan-c')],
    });
    assert.deepEqual(selected.currentDrumPlanIds, ['plan-a', 'plan-c']);
    assert.deepEqual(selected.lineIds, ['line-1', 'line-3']);
  });

  it('fails closed when one requirement among many lacks a CONFIRMED plan', () => {
    assert.throws(
      () =>
        selectEligibleConfirmedDrumPlans({
          deliveryAllocationMode: 'ENTIRE_INQUIRY',
          inquiryId,
          requirements: [
            {
              lineId: 'line-1',
              lineNumber: 1,
              inquiryId,
              requirementId: 'a-cl01',
              sequenceNo: 1,
              currentDrumPlanId: 'plan-a1',
              currentDrumPlanStatus: 'CONFIRMED',
            },
            {
              lineId: 'line-1',
              lineNumber: 1,
              inquiryId,
              requirementId: 'a-cl02',
              sequenceNo: 2,
              currentDrumPlanId: 'plan-a2',
              currentDrumPlanStatus: 'SUPERSEDED',
            },
          ],
        }),
      (err: unknown) => err instanceof DomainError && /CONFIRMED/.test(err.message)
    );
  });
});
