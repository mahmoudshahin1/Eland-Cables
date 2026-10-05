import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateValidUntil,
  evaluateLineQuotationReadiness,
  evaluateQuotationReadiness,
  getDefaultQuotationValidityDays,
  isQuotationIssued,
  type V2LineReadinessInput,
} from '../domain/v2QuotationService';
import { DECISION5_STATUS } from '../domain/v2CostingRequestService';

describe('v2QuotationService', () => {
  it('defaults validity to 30 calendar days', () => {
    assert.equal(getDefaultQuotationValidityDays(), 30);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const until = calculateValidUntil(from, 30);
    assert.equal(until.toISOString().slice(0, 10), '2026-10-01');
  });

  it('blocks price when BOM Gate 2 is open', () => {
    const result = evaluateLineQuotationReadiness(
      {
        lineId: 'l1',
        lineNumber: 1,
        configurationSnapshot: {
          id: 'cfg',
          snapshotId: 'SNAP-1',
          versionNo: 1,
          validationStatus: 'EXISTING_APPROVED',
          bomGovernanceBlocked: true,
          unresolvedBomConflictCount: 81,
        },
        cuttingPlan: { id: 'cut', planId: 'CUT-1', versionNo: 1 },
        drumPlan: { id: 'd', planId: 'DRUM-1', versionNo: 1, lifecycleStatus: 'CONFIRMED' },
        costingCalculation: { id: 'cc', status: 'LOCKED', workflowChannel: 'V2_CONFIGURATION' },
        costingRun: { id: 'cr', materialCost: 1000 },
      },
      'PRICE'
    );
    assert.equal(result.ready, false);
    assert.match(result.blockingReasons.join(' '), /BOM Gate 2/);
  });

  it('blocks issue when Decision 5 is unsigned', () => {
    assert.equal(DECISION5_STATUS, 'PENDING_BUSINESS_SIGN_OFF');
    const result = evaluateQuotationReadiness(
      [
        {
          lineId: 'l1',
          lineNumber: 1,
          configurationSnapshot: {
            id: 'cfg',
            snapshotId: 'SNAP-1',
            versionNo: 1,
            validationStatus: 'EXISTING_APPROVED',
            bomGovernanceBlocked: false,
          },
          cuttingPlan: { id: 'cut', planId: 'CUT-1', versionNo: 1 },
          drumPlan: { id: 'd', planId: 'DRUM-1', versionNo: 1, lifecycleStatus: 'CONFIRMED' },
          handoff: {
            inquiryLineId: 'l1',
            drumPlanId: 'd',
            drumPlanIdString: 'DRUM-1',
            drumPlanVersionNo: 1,
            cuttingLengthPlanId: 'cut',
            cuttingLengthPlanIdString: 'CUT-1',
            configurationSnapshotId: 'cfg',
            configurationSnapshotIdString: 'SNAP-1',
            lifecycleStatus: 'CONFIRMED',
            validationStatus: 'VALID',
            selectionMethod: 'AUTOMATIC',
            cableTolerancePercent: 1,
            cableMaterialNumber: 'MAT-1',
            totalPlannedLengthM: 1000,
            drumCount: 1,
            remainderLengthM: 0,
            quantityReconciliationStatus: 'OK',
            quantityReconciliationMessages: [],
            capturedAt: new Date().toISOString(),
            lines: [
              {
                lineNo: 1,
                drumCode: 'D1',
                drumMasterId: null,
                numberOfDrums: 1,
                cuttingLengthM: 500,
                isRemainderDrum: false,
                plannedCableLengthM: 1000,
                clearanceMm: null,
                capacityM: null,
                maxLoadKg: null,
                cableWeightKg: null,
                grossLoadedDrumWeightKg: null,
                lengthUtilizationPercent: null,
                loadUtilizationPercent: null,
              },
            ],
          },
          costingCalculation: { id: 'cc', status: 'LOCKED', workflowChannel: 'V2_CONFIGURATION' },
          costingRun: { id: 'cr', materialCost: 1000 },
          pricingSnapshot: { id: 'ps', pricingStatus: 'PRICING_APPROVED' },
          attachments: [
            {
              id: 'a1',
              kind: 'TECHNICAL_OFFER',
              fileName: 'offer.pdf',
              mimeType: 'application/pdf',
              byteSize: 100,
              source: 'MANUAL_UPLOAD',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      'ISSUE'
    );
    assert.equal(result.ready, false);
    assert.match(result.blockingReasons.join(' '), /Decision 5/);
  });

  it('allows issue only when a recorded Decision 5 sign-off is passed in', () => {
    assert.equal(DECISION5_STATUS, 'PENDING_BUSINESS_SIGN_OFF');
    const line: V2LineReadinessInput = {
      lineId: 'l1',
      lineNumber: 1,
      configurationSnapshot: {
        id: 'cfg',
        snapshotId: 'SNAP-1',
        versionNo: 1,
        validationStatus: 'EXISTING_APPROVED',
        bomGovernanceBlocked: false,
      },
      cuttingPlan: { id: 'cut', planId: 'CUT-1', versionNo: 1 },
      drumPlan: { id: 'd', planId: 'DRUM-1', versionNo: 1, lifecycleStatus: 'CONFIRMED' },
      handoff: {
        inquiryLineId: 'l1',
        drumPlanId: 'd',
        drumPlanIdString: 'DRUM-1',
        drumPlanVersionNo: 1,
        cuttingLengthPlanId: 'cut',
        cuttingLengthPlanIdString: 'CUT-1',
        configurationSnapshotId: 'cfg',
        configurationSnapshotIdString: 'SNAP-1',
        lifecycleStatus: 'CONFIRMED',
        validationStatus: 'VALID',
        selectionMethod: 'AUTOMATIC',
        cableTolerancePercent: 1,
        cableMaterialNumber: 'MAT-1',
        totalPlannedLengthM: 1000,
        drumCount: 1,
        remainderLengthM: 0,
        quantityReconciliationStatus: 'OK',
        quantityReconciliationMessages: [],
        capturedAt: new Date().toISOString(),
        lines: [
          {
            lineNo: 1,
            drumCode: 'D1',
            drumMasterId: null,
            numberOfDrums: 1,
            cuttingLengthM: 500,
            isRemainderDrum: false,
            plannedCableLengthM: 1000,
            clearanceMm: null,
            capacityM: null,
            maxLoadKg: null,
            cableWeightKg: null,
            grossLoadedDrumWeightKg: null,
            lengthUtilizationPercent: null,
            loadUtilizationPercent: null,
          },
        ],
      },
      costingCalculation: { id: 'cc', status: 'LOCKED', workflowChannel: 'V2_CONFIGURATION' },
      costingRun: { id: 'cr', materialCost: 1000 },
      pricingSnapshot: { id: 'ps', pricingStatus: 'PRICING_APPROVED' },
      attachments: [
        {
          id: 'a1',
          kind: 'TECHNICAL_OFFER',
          fileName: 'offer.pdf',
          mimeType: 'application/pdf',
          byteSize: 100,
          source: 'MANUAL_UPLOAD',
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const unsigned = evaluateQuotationReadiness([line], 'ISSUE');
    assert.equal(unsigned.ready, false);
    assert.equal(unsigned.decision5Status, DECISION5_STATUS);
    const signed = evaluateQuotationReadiness([line], 'ISSUE', { decision5Signed: true });
    assert.equal(signed.ready, true);
    assert.equal(signed.decision5Status, 'SIGNED');
    assert.equal(signed.blockingReasons.some((reason) => reason.includes('Decision 5')), false);
  });

  it('detects issued quotations by issuedAt', () => {
    assert.equal(isQuotationIssued({ issuedAt: null }), false);
    assert.equal(isQuotationIssued({ issuedAt: new Date() }), true);
  });
});
