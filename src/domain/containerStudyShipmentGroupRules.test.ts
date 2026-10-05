import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import {
  assertContainerPreferenceIsNotAuthority,
  assertShipmentGroupCreateInput,
  parseDeliveryAllocationMode,
} from './containerStudyShipmentGroupRules';

describe('containerStudyShipmentGroupRules', () => {
  it('allows physical packing shipment groups without destination or incoterm', () => {
    const packing = assertShipmentGroupCreateInput({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
    });
    assert.equal(packing.destinationPortCode, null);
    assert.equal(packing.incotermCode, null);
    const withIncoterm = assertShipmentGroupCreateInput({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      incotermCode: 'CIF',
    });
    assert.equal(withIncoterm.destinationPortCode, null);
    assert.equal(withIncoterm.incotermCode, 'CIF');
  });

  it('requires inquiryLineId for PER_INQUIRY_LINE', () => {
    assert.throws(
      () =>
        assertShipmentGroupCreateInput({
          deliveryAllocationMode: 'PER_INQUIRY_LINE',
          destinationPortCode: 'ALEX',
          incotermCode: 'CIF',
        }),
      (err: unknown) => err instanceof DomainError && String(err.message).includes('inquiryLineId')
    );
  });

  it('requires an explicit destination for PER_INQUIRY_LINE and does not invent one', () => {
    assert.throws(
      () =>
        assertShipmentGroupCreateInput({
          deliveryAllocationMode: 'PER_INQUIRY_LINE',
          inquiryLineId: 'line-1',
          incotermCode: 'CIF',
        }),
      (err: unknown) => err instanceof DomainError && String(err.message).includes('destinationPortCode')
    );
  });

  it('rejects client-declared container suitability', () => {
    assert.throws(
      () => assertContainerPreferenceIsNotAuthority({ technicallySuitable: true }),
      (err: unknown) => err instanceof DomainError && err.code === 'VALIDATION_FAILED'
    );
    assert.doesNotThrow(() => assertContainerPreferenceIsNotAuthority({}));
  });

  it('parses allocation modes', () => {
    assert.equal(parseDeliveryAllocationMode(undefined), 'ENTIRE_INQUIRY');
    assert.equal(parseDeliveryAllocationMode('PER_INQUIRY_LINE'), 'PER_INQUIRY_LINE');
    assert.equal(parseDeliveryAllocationMode('DESTINATION_CLUSTER'), 'DESTINATION_CLUSTER');
    assert.throws(() => parseDeliveryAllocationMode('MIXED'));
  });
});
