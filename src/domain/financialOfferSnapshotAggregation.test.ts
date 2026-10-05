import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalizePinSet,
  idListsMatch,
  isVipFastTrack,
  pinSetsEqual,
  assertHomogeneousOfferCurrency,
  VIP_SHIPMENT_NOT_CONFIGURED,
} from './financialOfferSnapshotAggregation';

describe('B4-D financial offer aggregation helpers', () => {
  it('canonicalizes pin sets independently of order', () => {
    const a = canonicalizePinSet({
      pricingSnapshotIds: ['b', 'a', 'a'],
      shipmentCostSnapshotIds: ['z', 'y'],
      currencyCode: 'USD',
    });
    const b = canonicalizePinSet({
      pricingSnapshotIds: ['a', 'b'],
      shipmentCostSnapshotIds: ['y', 'z'],
      currencyCode: 'USD',
    });
    assert.deepEqual(a.pricingSnapshotIds, ['a', 'b']);
    assert.equal(pinSetsEqual(a, b), true);
  });

  it('rejects mixed currencies without converting', () => {
    assert.equal(assertHomogeneousOfferCurrency(['USD', 'EUR']).ok, false);
    assert.deepEqual(assertHomogeneousOfferCurrency(['USD', 'USD']), { ok: true, currencyCode: 'USD' });
  });

  it('treats omitted caller pin lists as a match and explicit mismatches as stale', () => {
    assert.equal(idListsMatch(['p1'], undefined), true);
    assert.equal(idListsMatch(['p1'], ['p1']), true);
    assert.equal(idListsMatch(['p1'], ['p2']), false);
  });

  it('recognizes VIP process without making the warning customer-facing', () => {
    assert.equal(isVipFastTrack('VIP_FAST_TRACK'), true);
    assert.equal(isVipFastTrack('STANDARD_WORKFLOW'), false);
    assert.equal(VIP_SHIPMENT_NOT_CONFIGURED, 'VIP_SHIPMENT_NOT_CONFIGURED');
  });
});
