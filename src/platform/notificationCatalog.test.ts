import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINIMUM_NOTIFICATION_EVENTS } from './notificationCatalog';

describe('Minimum notification catalog', () => {
  it('covers new inquiry, released order, readiness, approval/rejection, and issued offer', () => {
    const codes = MINIMUM_NOTIFICATION_EVENTS.map((e) => e.code);
    assert.ok(codes.includes('INQUIRY_SUBMITTED'));
    assert.ok(codes.includes('AGREEMENT_RELEASED'));
    assert.ok(codes.includes('STANDARD_TO_REQUIRED'));
    assert.ok(codes.includes('STANDARD_QUOTATION_RETURNED'));
    assert.ok(codes.includes('STANDARD_QUOTATION_ISSUED'));
    assert.equal(MINIMUM_NOTIFICATION_EVENTS.length, 5);
  });
});
