import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  displayInquiryNumber,
  inquiryCalculationFingerprint,
  inquiryLineFingerprint,
  legacyInquiryLineFingerprint,
  portalCanApprove,
  portalCanceledSubtitle,
  portalLifecycleFromInquiry,
  portalLifecycleLabel,
  portalVersionLabel,
  shouldForkCalculatedInquiry,
} from './inquiryPortalLifecycle';
import { projectCalculateResultForActor } from './calculateResultProjection';

describe('portal inquiry lifecycle', () => {
  it('maps the stored lifecycle and falls back to the existing status', () => {
    assert.equal(portalLifecycleFromInquiry({ status: 'DRAFT' }), 'OPEN');
    assert.equal(portalLifecycleFromInquiry({ status: 'QUOTED' }), 'NOT_SUBMITTED');
    assert.equal(portalLifecycleFromInquiry({ status: 'CANCELLED' }), 'CANCELED');
    assert.equal(portalLifecycleFromInquiry({ status: 'CLOSED' }), 'ACCEPTED');
    assert.equal(
      portalLifecycleFromInquiry({ status: 'DRAFT', commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED' } }),
      'NOT_SUBMITTED'
    );
    assert.equal(portalLifecycleLabel('OPEN'), 'Draft');
    assert.equal(portalLifecycleLabel('NOT_SUBMITTED'), 'Submitted');
    assert.equal(portalLifecycleLabel('CANCELED'), 'Canceled');
    assert.equal(portalLifecycleLabel('ACCEPTED'), 'Approved');
  });

  it('keeps an existing inquiry number and shows the short number when one was stored', () => {
    assert.equal(displayInquiryNumber({ inquiryNumber: 'INQ-20261110-YGZC' }), 'INQ-20261110-YGZC');
    assert.equal(
      displayInquiryNumber({
        inquiryNumber: 'INQ-26-001-V2',
        commercialMetadata: { displayInquiryNumber: 'INQ-26-001' },
      }),
      'INQ-26-001'
    );
    assert.equal(portalVersionLabel(2), 'V2');
  });

  it('forks only after a calculation when the cable lines changed', () => {
    const before = inquiryLineFingerprint([{ materialNumber: 'C1', requestedLengthMeters: 1000 }]);
    const after = inquiryLineFingerprint([{ materialNumber: 'C1', requestedLengthMeters: 1800 }]);
    assert.equal(
      shouldForkCalculatedInquiry({
        status: 'DRAFT',
        commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED', calculatedLineFingerprint: before },
        lineFingerprint: before,
      }),
      false
    );
    assert.equal(
      shouldForkCalculatedInquiry({
        status: 'DRAFT',
        commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED', calculatedLineFingerprint: before },
        lineFingerprint: after,
      }),
      true
    );
    assert.equal(
      shouldForkCalculatedInquiry({
        status: 'DRAFT',
        commercialMetadata: { portalLifecycle: 'OPEN' },
        lineFingerprint: after,
      }),
      false
    );
    assert.equal(
      shouldForkCalculatedInquiry({
        status: 'DRAFT',
        commercialMetadata: { portalLifecycle: 'ACCEPTED', calculatedLineFingerprint: before },
        lineFingerprint: after,
      }),
      true
    );
  });

  it('does not fork when only the drum-plan confirm timestamp changed', () => {
    const lines = [
      {
        materialNumber: 'C1',
        requestedLengthMeters: 2900,
        drumSchedule: {
          lifecycleStatus: 'CONFIRMED',
          versionNo: 4,
          confirmedAt: '2026-11-01T00:00:00.000Z',
          rows: [{ drumCode: 'EWD900-0', noOfDrums: 5, cuttingLengthM: 500, drumTolerancePercent: 5 }],
        },
      },
    ];
    const stored = legacyInquiryLineFingerprint(lines);
    const changedStamp = legacyInquiryLineFingerprint([
      {
        ...lines[0],
        drumSchedule: { ...lines[0].drumSchedule, confirmedAt: '2026-11-13T00:00:00.000Z', versionNo: 9 },
      },
    ]);
    assert.notEqual(stored, changedStamp);
    assert.equal(inquiryLineFingerprint(lines), inquiryLineFingerprint([
      {
        ...lines[0],
        drumSchedule: { ...lines[0].drumSchedule, confirmedAt: '2026-11-13T00:00:00.000Z', versionNo: 9 },
      },
    ]));
    const current = inquiryCalculationFingerprint({ lines, incoterms: 'FOB', currency: 'USD' });
    assert.equal(
      shouldForkCalculatedInquiry({
        status: 'DRAFT',
        commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED', calculatedLineFingerprint: stored },
        lineFingerprint: current,
        legacyLineFingerprint: stored,
      }),
      false
    );
    assert.equal(portalCanceledSubtitle({ cancelReason: 'SUPERSEDED', supersededByVersion: 2 }), 'Superseded by V2');
    assert.equal(portalCanceledSubtitle({ cancelReason: 'USER' }), 'By User');
  });

  it('enables approval only after a calculated quotation with a positive total', () => {
    const submitted = { status: 'DRAFT', commercialMetadata: { portalLifecycle: 'NOT_SUBMITTED' } };
    assert.equal(portalCanApprove({ ...submitted, hasQuotation: true, total: 36140.81 }), true);
    assert.equal(portalCanApprove({ ...submitted, hasQuotation: false, total: 36140.81 }), false);
    assert.equal(portalCanApprove({ ...submitted, hasQuotation: true, total: 0 }), false);
    assert.equal(
      portalCanApprove({
        status: 'DRAFT',
        commercialMetadata: { portalLifecycle: 'ACCEPTED' },
        hasQuotation: true,
        total: 100,
      }),
      false
    );
    assert.equal(
      portalCanApprove({
        status: 'CANCELLED',
        commercialMetadata: { portalLifecycle: 'CANCELED' },
        hasQuotation: true,
        total: 100,
      }),
      false
    );
  });

  it('hides unpriced material warnings from a customer and keeps them for internal users', () => {
    const result = {
      status: 'COMPLETED',
      unpricedMaterials: [{ rawMaterialCode: 'SV01', message: 'Price not configured. Excluded from the total.' }],
      partial: true,
    };
    const customer = projectCalculateResultForActor(result, { userType: 'customer' });
    assert.equal('unpricedMaterials' in customer, false);
    assert.equal('partial' in customer, false);
    assert.equal(customer.status, 'COMPLETED');
    const internal = projectCalculateResultForActor(result, { userType: 'internal' });
    assert.equal(internal.partial, true);
    assert.equal(internal.unpricedMaterials?.[0]?.rawMaterialCode, 'SV01');
  });
});
