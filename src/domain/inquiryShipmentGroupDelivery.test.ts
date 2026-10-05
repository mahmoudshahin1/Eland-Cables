import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import {
  MISSING_SAVED_DELIVERY_COMBINATION,
  assertSavedDeliveryCombinationForAuthoritativeGroup,
  readSavedInquiryDeliveryCombination,
  resolveShipmentGroupDeliveryIdentity,
} from './inquiryShipmentGroupDelivery';

describe('inquiryShipmentGroupDelivery', () => {
  it('reads structured saved destinationPortCode + incoterm and ignores Alexandria free-text terms', () => {
    const saved = readSavedInquiryDeliveryCombination({
      incoterms: 'CIF',
      deliveryTerms: 'CIF Alexandria',
      commercialMetadata: {
        destinationPortCode: 'ROTTERDAM',
        deliveryDestination: 'NETHERLANDS / CIF / ROTTERDAM',
        incoterms: 'CIF',
      },
    });
    assert.deepEqual(saved, {
      destinationPortCode: 'ROTTERDAM',
      incotermCode: 'CIF',
      deliveryDestination: 'NETHERLANDS / CIF / ROTTERDAM',
    });
  });

  it('does not treat legacy Alexandria free-text as a saved combination', () => {
    const saved = readSavedInquiryDeliveryCombination({
      incoterms: 'FOB',
      deliveryTerms: 'CIF Alexandria',
      commercialMetadata: { deliveryDestination: 'Alexandria', incoterms: 'CIF' },
    });
    assert.equal(saved, null);
  });

  it('saved combination wins over unsaved UI destination, customer default, and client port', () => {
    const saved = readSavedInquiryDeliveryCombination({
      incoterms: 'CIF',
      commercialMetadata: { destinationPortCode: 'ROTTERDAM', incoterms: 'CIF' },
    });
    const resolved = resolveShipmentGroupDeliveryIdentity({
      saved,
      clientDestinationPortCode: 'ALEX',
      clientDestinationKey: 'Alexandria',
      clientIncotermCode: 'FOB',
      customerDefaultDestinationPortCode: 'DONCASTER',
      unsavedUiDestination: 'Alexandria',
    });
    assert.equal(resolved.destinationPortCode, 'ROTTERDAM');
    assert.equal(resolved.incotermCode, 'CIF');
  });

  it('never applies customer default when saved combination is missing', () => {
    const resolved = resolveShipmentGroupDeliveryIdentity({
      saved: null,
      customerDefaultDestinationPortCode: 'DONCASTER',
      clientDestinationPortCode: 'ALEX',
      clientIncotermCode: 'CIF',
    });
    assert.equal(resolved.destinationPortCode, 'ALEX');
    assert.notEqual(resolved.destinationPortCode, 'DONCASTER');
  });

  it('throws an explicit domain error when an authoritative group requires a saved combination', () => {
    assert.throws(
      () => assertSavedDeliveryCombinationForAuthoritativeGroup(null),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === 'VALIDATION_FAILED' &&
        (err.details as { issueCode?: string })?.issueCode === MISSING_SAVED_DELIVERY_COMBINATION
    );
  });
});
