import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCustomerInquiryJourney,
  mapInquiryStatusLabel,
} from '../services/customerInquiryJourneyService';
import type { V2InquiryDto } from '../services/v2InquiryConfigurationApiService';

function baseInquiry(overrides: Partial<V2InquiryDto> = {}): V2InquiryDto {
  return {
    id: 'inq-1',
    inquiryNumber: 'INQ-26-00001',
    customerId: 'cust-1',
    customerMasterId: 'cm-1',
    customerName: 'Test Customer',
    contactPerson: null,
    customerReference: null,
    inquiryDate: '2026-09-05',
    requestedDeliveryDate: null,
    currency: 'USD',
    status: 'DRAFT',
    projectName: 'Portal test',
    notes: null,
    workflowChannel: 'V2_CONFIGURATION',
    v2EngineeringSummary: null,
    createdBy: null,
    modifiedBy: null,
    versionNo: 1,
    isCurrent: true,
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    lines: [],
    ...overrides,
  };
}

describe('customerInquiryJourneyService', () => {
  it('maps inquiry statuses to customer-friendly labels', () => {
    assert.equal(mapInquiryStatusLabel('ENGINEERING_REVIEW'), 'Engineering Review');
    assert.equal(mapInquiryStatusLabel('QUOTED'), 'Quotation Issued');
  });

  it('guides draft inquiry toward configuration', () => {
    const journey = buildCustomerInquiryJourney(
      baseInquiry({
        lines: [
          {
            id: 'line-1',
            lineNumber: 1,
            materialNumber: null,
            customerCode: null,
            itemCode: null,
            cableDescription: 'Pending cable',
            requestedQuantity: 1,
            quantityUom: 'KM',
            requestedLengthMeters: 1000,
            cableAuthorityStatus: 'PENDING',
            technicalOfficeRequestId: null,
            status: 'DRAFT',
            notes: null,
            v2CurrentSnapshotId: null,
            v2CurrentCuttingPlanId: null,
            v2CurrentDrumPlanId: null,
            snapshots: [],
            currentCuttingPlan: null,
            currentDrumPlan: null,
          },
        ],
      })
    );
    assert.equal(journey.activeStageId, 'configuration');
    assert.match(journey.nextAction, /configuration snapshot/i);
  });

  it('marks quotation complete when issued', () => {
    const inquiry = baseInquiry({
      status: 'QUOTED',
      lines: [
        {
          id: 'line-1',
          lineNumber: 1,
          materialNumber: null,
          customerCode: null,
          itemCode: null,
          cableDescription: 'MV cable',
          requestedQuantity: 1,
          quantityUom: 'KM',
          requestedLengthMeters: 1000,
          cableAuthorityStatus: 'VALID',
          technicalOfficeRequestId: null,
          status: 'CABLE_VALIDATED',
          notes: null,
          v2CurrentSnapshotId: 'snap-1',
          v2CurrentCuttingPlanId: 'cut-1',
          v2CurrentDrumPlanId: 'drum-1',
          snapshots: [
            {
              snapshotId: 'v2cfg-1',
              versionNo: 1,
              inquiryLineId: 'line-1',
              cableMaterialNumber: 'MAT-1',
              itemCode: 'ITEM-1',
              customerCode: null,
              validationStatus: 'EXISTING_APPROVED',
              flowState: 'VALID',
              engineeringStatus: 'Released',
              summaryDescription: 'MV cable',
              catalogSource: 'POSTGRESQL',
              catalogAuthoritative: true,
              bomGovernanceBlocked: false,
              unresolvedBomConflictCount: 0,
              capturedAt: '2026-09-05T10:00:00.000Z',
            },
          ],
          currentCuttingPlan: {
            planId: 'cut-1',
            versionNo: 1,
            validationStatus: 'VALID',
            nominalLengthM: 500,
            tolerancePercent: 1,
          },
          currentDrumPlan: {
            planId: 'drum-1',
            versionNo: 1,
            lifecycleStatus: 'CONFIRMED',
            validationStatus: 'VALID',
            drumCount: 2,
            totalPlannedLengthM: 1000,
          },
        },
      ],
    });
    const journey = buildCustomerInquiryJourney(inquiry, {
      id: 'quo-1',
      quotationNumber: 'QUO-26-00001',
      versionNo: 1,
      status: 'SUBMITTED',
      issuedAt: '2026-09-05T12:00:00.000Z',
      validUntil: '2026-10-05T12:00:00.000Z',
      commercialPricingStatus: 'PRICING_APPROVED',
      technicalOfferStatus: 'ISSUED',
      commercialOfferStatus: 'ISSUED',
      sellingPrice: 120000,
      lines: [],
    });
    assert.equal(journey.quotationIssued, true);
    const quotationStage = journey.stages.find((s) => s.id === 'quotation');
    assert.equal(quotationStage?.state, 'complete');
  });

  it('shows fulfillment in progress when documents exist', () => {
    const inquiry = baseInquiry({
      status: 'QUOTED',
      lines: [
        {
          id: 'line-1',
          lineNumber: 1,
          materialNumber: null,
          customerCode: null,
          itemCode: null,
          cableDescription: 'MV cable',
          requestedQuantity: 1,
          quantityUom: 'KM',
          requestedLengthMeters: 1000,
          cableAuthorityStatus: 'VALID',
          technicalOfficeRequestId: null,
          status: 'CABLE_VALIDATED',
          notes: null,
          v2CurrentSnapshotId: 'snap-1',
          v2CurrentCuttingPlanId: 'cut-1',
          v2CurrentDrumPlanId: 'drum-1',
          snapshots: [],
          currentCuttingPlan: null,
          currentDrumPlan: { planId: 'drum-1', versionNo: 1, lifecycleStatus: 'CONFIRMED', validationStatus: 'VALID', drumCount: 1, totalPlannedLengthM: 1000 },
        },
      ],
    });
    const journey = buildCustomerInquiryJourney(
      inquiry,
      {
        id: 'quo-1',
        quotationNumber: 'QUO-26-00002',
        versionNo: 1,
        status: 'SUBMITTED',
        issuedAt: '2026-09-05T12:00:00.000Z',
        commercialPricingStatus: 'PRICING_APPROVED',
        technicalOfferStatus: 'ISSUED',
        commercialOfferStatus: 'ISSUED',
        lines: [],
      },
      { id: 'cmt-1', commitmentNumber: 'CMT-1', status: 'ACTIVE', fulfillmentType: 'DIRECT_ORDER' },
      { salesOrderCount: 1, agreementCount: 0, releaseCount: 0, hasActiveDocuments: true }
    );
    const fulfillmentStage = journey.stages.find((s) => s.id === 'fulfillment');
    assert.equal(fulfillmentStage?.state, 'in_progress');
    assert.match(journey.nextAction, /in progress/i);
  });

  it('imported catalog cable does not require a V2 configuration snapshot for engineering PASS', () => {
    const journey = buildCustomerInquiryJourney(
      baseInquiry({
        lines: [
          {
            id: 'line-1',
            lineNumber: 1,
            materialNumber: '88001001',
            customerCode: null,
            itemCode: null,
            cableDescription: 'Imported MV',
            requestedQuantity: 6,
            quantityUom: 'KM',
            requestedLengthMeters: 4650,
            cableAuthorityStatus: 'EXISTING_CABLE',
            technicalOfficeRequestId: null,
            status: 'COSTING_READY',
            notes: null,
            v2CurrentSnapshotId: null,
            v2CurrentCuttingPlanId: null,
            v2CurrentDrumPlanId: null,
            snapshots: [],
            currentCuttingPlan: null,
            currentDrumPlan: null,
          },
        ],
      })
    );
    const configuration = journey.stages.find((s) => s.id === 'configuration');
    const engineering = journey.stages.find((s) => s.id === 'engineering');
    assert.equal(configuration?.state, 'complete');
    assert.equal(configuration?.statusLabel, 'Imported Cable Master');
    assert.equal(engineering?.state, 'complete');
    assert.equal(engineering?.statusLabel, 'PASS');
    assert.doesNotMatch(journey.nextAction, /configuration snapshot/i);
  });
});
