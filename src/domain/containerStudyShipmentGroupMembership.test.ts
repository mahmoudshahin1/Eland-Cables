import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import {
  assertShipmentGroupIdentityMutable,
  assertShipmentIdentityHomogeneous,
  compatibilityInquiryLineId,
  resolveAuthoritativeMemberLineIds,
  resolveCreateMembership,
} from './containerStudyShipmentGroupMembership';

const all = ['line-1', 'line-2', 'line-3'];

describe('05I-DF-B4-A shipment group membership', () => {
  it('ENTIRE_INQUIRY materializes every inquiry line and rejects a subset', () => {
    assert.deepEqual(
      resolveCreateMembership({
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        allInquiryLineIds: all,
      }),
      all
    );
    assert.deepEqual(
      resolveCreateMembership({
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        allInquiryLineIds: [],
      }),
      []
    );
    assert.throws(
      () =>
        resolveCreateMembership({
          deliveryAllocationMode: 'ENTIRE_INQUIRY',
          inquiryLineIds: ['line-1', 'line-3'],
          allInquiryLineIds: all,
        }),
      (err: unknown) => err instanceof DomainError && /DESTINATION_CLUSTER/.test(String((err as Error).message))
    );
  });

  it('PER_INQUIRY_LINE contains exactly one line', () => {
    assert.deepEqual(
      resolveCreateMembership({
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: 'line-2',
        allInquiryLineIds: all,
      }),
      ['line-2']
    );
    assert.equal(
      compatibilityInquiryLineId('PER_INQUIRY_LINE', ['line-2']),
      'line-2'
    );
    assert.equal(compatibilityInquiryLineId('DESTINATION_CLUSTER', ['line-1', 'line-3']), null);
  });

  it('DESTINATION_CLUSTER requires two or more shared-identity lines', () => {
    assert.deepEqual(
      resolveCreateMembership({
        deliveryAllocationMode: 'DESTINATION_CLUSTER',
        inquiryLineIds: ['line-1', 'line-3'],
        allInquiryLineIds: all,
      }),
      ['line-1', 'line-3']
    );
    assert.throws(
      () =>
        resolveCreateMembership({
          deliveryAllocationMode: 'DESTINATION_CLUSTER',
          inquiryLineIds: ['line-2'],
          allInquiryLineIds: all,
        }),
      (err: unknown) => err instanceof DomainError && /two or more/.test(String((err as Error).message))
    );
  });

  it('rejects mixed shipment identity on member hints', () => {
    assert.throws(
      () =>
        assertShipmentIdentityHomogeneous(
          { destinationPortCode: 'ALEX', incotermCode: 'DAP' },
          [
            { inquiryLineId: 'line-1', destinationPortCode: 'ALEX' },
            { inquiryLineId: 'line-2', destinationPortCode: 'JEDDAH' },
          ]
        ),
      (err: unknown) =>
        err instanceof DomainError &&
        (err as DomainError).details &&
        Array.isArray((err as DomainError).details?.issues) &&
        ((err as DomainError).details?.issues as Array<{ code: string }>)[0]?.code === 'MIXED_SHIPMENT_IDENTITY'
    );
  });

  it('LOCKED group identity cannot be mutated', () => {
    assert.throws(
      () => assertShipmentGroupIdentityMutable('LOCKED'),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === 'CONFLICT' &&
        ((err as DomainError).details?.issues as Array<{ code: string }>)[0]?.code === 'SHIPMENT_GROUP_IDENTITY_LOCKED'
    );
    assert.doesNotThrow(() => assertShipmentGroupIdentityMutable('ACTIVE'));
  });

  it('legacy fallback uses inquiryLineId then ENTIRE_INQUIRY all-lines', () => {
    assert.deepEqual(
      resolveAuthoritativeMemberLineIds({
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        groupInquiryLineId: 'line-2',
        membershipLineIds: [],
        allInquiryLineIds: all,
      }),
      ['line-2']
    );
    assert.deepEqual(
      resolveAuthoritativeMemberLineIds({
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        membershipLineIds: ['line-1', 'line-3'],
        allInquiryLineIds: all,
      }),
      all
    );
    assert.deepEqual(
      resolveAuthoritativeMemberLineIds({
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        groupInquiryLineId: 'line-1',
        membershipLineIds: ['line-1'],
        allInquiryLineIds: all,
      }),
      all
    );
    assert.deepEqual(
      resolveAuthoritativeMemberLineIds({
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        membershipLineIds: [],
        allInquiryLineIds: all,
      }),
      all
    );
    assert.deepEqual(
      resolveAuthoritativeMemberLineIds({
        deliveryAllocationMode: 'DESTINATION_CLUSTER',
        groupInquiryLineId: 'line-2',
        membershipLineIds: ['line-1', 'line-3'],
        allInquiryLineIds: all,
      }),
      ['line-1', 'line-3']
    );
  });
});
