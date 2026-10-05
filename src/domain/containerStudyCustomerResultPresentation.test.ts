/**
 * Container Study business-rule correction — Tests A–J.
 * Shipment requirement (not VIP/Standard alone) controls CS requirement.
 * Monetary rates remain optional (0 + warning).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { containerStudyRequiredForCosting } from './costingContainerStudyPin';
import {
  CS_PRESENTATION,
  CS_CONTAINER_SELECTION_REQUIRED_MESSAGE,
  CS_NO_SHIPMENT_REQUIRED_MESSAGE,
  CS_REQUIRED_TITLE,
  customerContainerStudyContextBanner,
  customerProjectionContainsInternalSecrets,
  formatCustomerContainerChargePair,
  formatCustomerShipmentTotalPresentation,
  projectCustomerContainerStudyGroup,
  projectCustomerContainerStudyVisibility,
  resolveContainerStudyOptional,
  shipmentCalculationRequiredFromEvidence,
} from './financialOfferCustomerProjection';
import { deriveStandardShipmentCalculationRequired } from './standardContainerStudyWorkflowReadiness';

function group(input: {
  typeCodes?: string[];
  missing?: string[];
  snapshot?: Parameters<typeof projectCustomerContainerStudyGroup>[0]['snapshot'];
  currency?: string;
  destination?: string;
  incoterm?: string;
}) {
  return projectCustomerContainerStudyGroup({
    shipmentGroupId: 'g1',
    groupStatus: 'ACTIVE',
    studyStatus: 'DRAFT',
    destinationPortCode: input.destination ?? 'ROTTERDAM',
    incotermCode: input.incoterm ?? 'CIF',
    currencyCode: input.currency ?? 'EUR',
    packingContainers: (input.typeCodes || []).map((typeCode) => ({ typeCode })),
    missingPhysicalPackingInputs: input.missing,
    snapshot: input.snapshot ?? null,
  });
}

describe('Container Study shipment-gated requirement (A–J)', () => {
  it('A: shipment required + no container → BLOCK / SHIPMENT_CONFIGURATION_REQUIRED', () => {
    const view = group({
      typeCodes: [],
      missing: ['container type'],
    });
    assert.equal(view.presentationLabel, CS_PRESENTATION.SHIPMENT_CONFIGURATION_REQUIRED);
    assert.equal(view.calculationStatus, 'BLOCKED');
    assert.equal(view.containers.length, 0);
    assert.equal(view.shipmentTotal, null);
    assert.equal(view.information, CS_CONTAINER_SELECTION_REQUIRED_MESSAGE);
    assert.equal(
      formatCustomerContainerChargePair({ rate: null, total: null }),
      null
    );
    const banner = customerContainerStudyContextBanner({
      shipmentCalculationRequired: true,
      groups: [view],
    });
    assert.equal(banner?.title, CS_REQUIRED_TITLE);
  });

  it('B: shipment required + container + rate available → CALCULATED with actual price', () => {
    const view = group({
      typeCodes: ['40 STD', '40 STD'],
      snapshot: {
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
        totalAmount: '1800',
        currencyCode: 'EUR',
        lines: [
          {
            containerTypeCode: '40 STD',
            containerQuantity: 2,
            rateAmount: '900',
            lineTotal: '1800',
          },
        ],
      },
    });
    assert.equal(view.containers[0].containerType, '40 STD');
    assert.equal(view.containers[0].quantity, 2);
    assert.equal(view.shipmentTotal, '1800');
    assert.equal(view.presentationLabel, CS_PRESENTATION.CALCULATED);
    assert.equal(view.missingChargeCount, 0);
  });

  it('C: shipment required + container + rate missing → physical ok, price 0, CALCULATED WITH WARNINGS', () => {
    const view = group({ typeCodes: ['40 STD', '40 STD'], currency: 'GBP' });
    assert.equal(view.containers[0].quantity, 2);
    assert.equal(view.shipmentTotal, '0');
    assert.equal(view.currency, 'GBP');
    assert.equal(view.presentationLabel, CS_PRESENTATION.CALCULATED_WITH_WARNINGS);
    assert.ok(view.missingChargeCount >= 1);
    const shipment = formatCustomerShipmentTotalPresentation(view);
    assert.equal(shipment.amountLine, 'Shipment total 0 GBP');
    assert.match(shipment.reason || '', /rate not configured/i);
    // Downstream continues: presentation is CALCULATED (with warnings), not BLOCKED.
    assert.equal(view.calculationStatus, 'CALCULATED');
  });

  it('D: VIP + shipment not required → Container Study may be skipped', () => {
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'VIP_FAST_TRACK',
        logisticsScenarioActive: false,
      }),
      false
    );
    assert.equal(
      shipmentCalculationRequiredFromEvidence({
        processCode: 'VIP_FAST_TRACK',
        shipmentGroupCount: 0,
        containerStudyCount: 0,
      }),
      false
    );
    const visibility = projectCustomerContainerStudyVisibility({
      inquiryId: 'inq-vip-noship',
      processCode: 'VIP_FAST_TRACK',
      shipmentGroupCount: 0,
      groups: [],
    });
    assert.equal(visibility.containerStudyOptional, true);
    assert.equal(visibility.shipmentCalculationRequired, false);
    assert.equal(
      customerContainerStudyContextBanner({
        shipmentCalculationRequired: false,
        groups: [],
      })?.title,
      CS_NO_SHIPMENT_REQUIRED_MESSAGE
    );
  });

  it('E: VIP + shipment required → container + Container Study required', () => {
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'VIP_FAST_TRACK',
        logisticsScenarioActive: true,
      }),
      true
    );
    assert.equal(
      deriveStandardShipmentCalculationRequired({
        processCode: 'VIP_FAST_TRACK',
        shipmentGroupCount: 1,
        containerStudyCount: 0,
      }),
      true
    );
    const visibility = projectCustomerContainerStudyVisibility({
      inquiryId: 'inq-vip-ship',
      processCode: 'VIP_FAST_TRACK',
      shipmentGroupCount: 1,
      groups: [group({ typeCodes: [], missing: ['container type'] })],
    });
    assert.equal(visibility.containerStudyOptional, false);
    assert.equal(visibility.shipmentCalculationRequired, true);
    assert.equal(resolveContainerStudyOptional(true), false);
  });

  it('F: STANDARD + shipment required → container + Container Study required', () => {
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'STANDARD_WORKFLOW',
        logisticsScenarioActive: true,
      }),
      true
    );
    const visibility = projectCustomerContainerStudyVisibility({
      inquiryId: 'inq-std-ship',
      processCode: 'STANDARD_WORKFLOW',
      shipmentGroupCount: 2,
      groups: [group({ typeCodes: [], missing: ['container type'] })],
    });
    assert.equal(visibility.containerStudyOptional, false);
    assert.equal(visibility.groups[0].presentationLabel, CS_PRESENTATION.SHIPMENT_CONFIGURATION_REQUIRED);
  });

  it('G: STANDARD + shipment not required → Container Study may be skipped', () => {
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'STANDARD_WORKFLOW',
        logisticsScenarioActive: false,
      }),
      false
    );
    const visibility = projectCustomerContainerStudyVisibility({
      inquiryId: 'inq-std-noship',
      processCode: 'STANDARD_WORKFLOW',
      shipmentGroupCount: 0,
      groups: [],
    });
    assert.equal(visibility.containerStudyOptional, true);
    assert.equal(visibility.shipmentCalculationRequired, false);
  });

  it('H: multiple container types display from persisted packing result', () => {
    const view = group({ typeCodes: ['40 STD', '40 STD', '20 STD'] });
    assert.deepEqual(
      view.containers.map((row) => ({ type: row.containerType, qty: row.quantity })),
      [
        { type: '20 STD', qty: 1 },
        { type: '40 STD', qty: 2 },
      ]
    );
  });

  it('I: historical snapshot facts remain unchanged (immutable presentation)', () => {
    const historical = group({
      typeCodes: ['40 STD'],
      snapshot: {
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
        totalAmount: '2400',
        currencyCode: 'USD',
        lines: [
          {
            containerTypeCode: '40 STD',
            containerQuantity: 2,
            rateAmount: '1200',
            lineTotal: '2400',
          },
        ],
      },
    });
    assert.equal(historical.shipmentTotal, '2400');
    assert.equal(historical.containers[0].rate, '1200');
    assert.equal(historical.hasPersistedShipmentSnapshot, true);
    assert.equal(historical.presentationLabel, CS_PRESENTATION.CALCULATED);
  });

  it('J: no meaningless 0 / 0; VIP flag alone does not force optional; customer-safe', () => {
    const missingRate = group({ typeCodes: ['40 STD', '40 STD'] });
    assert.equal(missingRate.containers[0].rate, null);
    assert.equal(missingRate.containers[0].total, null);
    assert.equal(
      formatCustomerContainerChargePair({
        rate: missingRate.containers[0].rate,
        total: missingRate.containers[0].total,
      }),
      null
    );
    // VIP process with shipment groups must NOT be treated as optional.
    const vipWithShipment = projectCustomerContainerStudyVisibility({
      inquiryId: 'inq',
      processCode: 'VIP_FAST_TRACK',
      shipmentGroupCount: 1,
      groups: [missingRate],
    });
    assert.equal(vipWithShipment.containerStudyOptional, false);
    assert.equal(JSON.stringify(vipWithShipment).includes('Container study is optional on VIP'), false);
    assert.deepEqual(customerProjectionContainsInternalSecrets(vipWithShipment), []);
  });
});
