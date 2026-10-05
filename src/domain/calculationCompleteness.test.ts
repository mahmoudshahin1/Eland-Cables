import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CALCULATION_STATUS,
  CUSTOMER_COSTING_CALCULATED_WITH_WARNINGS,
  CUSTOMER_COSTING_NOT_AVAILABLE,
  CUSTOMER_COSTING_READY,
  DATA_COMPLETENESS,
  DESCRIPTIVE_NOT_SET,
  blockedOutcome,
  customerCostingStatusIsInternalLeak,
  finalizeCalculatedOutcome,
  missingDescriptiveAsNotSet,
  missingNumericAsZero,
  optionalCostComponentAsZero,
  presentCustomerCostingFromLine,
  presentCustomerCostingStatus,
  presentNamedShippingCharges,
  shippingChargesUnavailableInformation,
} from './calculationCompleteness';
import {
  SHIPPING_COST_NOT_CONFIGURED,
  presentShippingBesidePacking,
  presentUnresolvedShippingAsCalculatedZero,
  resolveCustomerShippingCostFromRows,
  type CustomerShippingRateRow,
  type ShippingCostFinancialResult,
} from './customerShippingCost';
import {
  describeMissingPhysicalPackingInputs,
  projectCustomerContainerStudyGroup,
  projectCustomerFinancialOffer,
} from './financialOfferCustomerProjection';
import { VIP_SHIPMENT_NOT_CONFIGURED, SHIPPING_CHARGES_NOT_AVAILABLE } from './financialOfferSnapshotAggregation';

function notConfigured(partial: Partial<ShippingCostFinancialResult> = {}): ShippingCostFinancialResult {
  return {
    resolutionCode: SHIPPING_COST_NOT_CONFIGURED,
    amount: null,
    currency: null,
    shippingCostRateId: null,
    shippingRateVersion: null,
    deliveryPoint: partial.deliveryPoint ?? 'Rotterdam',
    incotermId: null,
    incotermCode: partial.incotermCode ?? 'CIF',
    containerType: partial.containerType ?? "40' SD/HC",
    appliedAt: null,
    blocksPacking: false,
  };
}

describe('calculation completeness — calculate with available data', () => {
  it('1. complete data stays CALCULATED + COMPLETE', () => {
    const dest = missingDescriptiveAsNotSet('ROTTERDAM', { code: 'DEST', message: 'dest' });
    const rate = missingNumericAsZero(1800, { code: 'RATE', message: 'rate' });
    const outcome = finalizeCalculatedOutcome([dest.warning, rate.warning].filter(Boolean) as never[]);
    assert.equal(dest.value, 'ROTTERDAM');
    assert.equal(rate.value, 1800);
    assert.equal(outcome.calculationStatus, CALCULATION_STATUS.CALCULATED);
    assert.equal(outcome.dataCompleteness, DATA_COMPLETENESS.COMPLETE);
    assert.equal(outcome.presentationLabel, 'CALCULATED');
    assert.equal(outcome.warnings.length, 0);
  });

  it('2. missing numeric → 0 + warning, still CALCULATED', () => {
    const rate = missingNumericAsZero(null, {
      code: 'SHIPPING_CHARGE_NOT_AVAILABLE',
      field: 'rate',
      message: 'Shipping charge was not available.',
    });
    assert.equal(rate.value, 0);
    assert.ok(rate.warning);
    const outcome = finalizeCalculatedOutcome([rate.warning!]);
    assert.equal(outcome.calculationStatus, CALCULATION_STATUS.CALCULATED);
    assert.equal(outcome.dataCompleteness, DATA_COMPLETENESS.WARNINGS);
    assert.equal(outcome.presentationLabel, 'CALCULATED WITH WARNINGS');
    assert.match(outcome.information || '', /1 charge value/);
    assert.equal(outcome.warnings[0].treatedAs, '0');
    assert.notEqual(outcome.presentationLabel, 'PENDING');
  });

  it('3. missing descriptive → Not Set + warning', () => {
    const dest = missingDescriptiveAsNotSet('  ', {
      code: 'DESTINATION_NOT_SET',
      field: 'destination',
      message: 'Destination was not set.',
    });
    assert.equal(dest.value, DESCRIPTIVE_NOT_SET);
    assert.ok(dest.warning);
    const outcome = finalizeCalculatedOutcome([dest.warning!]);
    assert.equal(outcome.calculationStatus, CALCULATION_STATUS.CALCULATED);
    assert.equal(outcome.presentationLabel, 'CALCULATED WITH WARNINGS');
  });

  it('4. multiple missing values collect every warning', () => {
    const a = missingNumericAsZero(null, { code: 'A', field: 'handling', message: 'handling' });
    const b = missingNumericAsZero(undefined, { code: 'B', field: 'freight', message: 'freight' });
    const c = missingDescriptiveAsNotSet(null, { code: 'C', field: 'incoterm', message: 'incoterm' });
    const outcome = finalizeCalculatedOutcome([a.warning!, b.warning!, c.warning!]);
    assert.equal(outcome.warnings.length, 3);
    assert.equal(outcome.missingNumericCount, 2);
    assert.match(outcome.information || '', /2 charge values/);
  });

  it('5. structurally impossible stays BLOCKED, not zeroed', () => {
    const outcome = blockedOutcome([
      {
        code: 'PHYSICAL_DRUMS_REQUIRED',
        field: 'physicalDrums',
        message: 'Confirmed physical drums are required before packing can be calculated.',
      },
    ]);
    assert.equal(outcome.calculationStatus, CALCULATION_STATUS.BLOCKED);
    assert.equal(outcome.presentationLabel, 'BLOCKED');
    assert.equal(outcome.missingNumericCount, 0);
  });

  it('6. customer costing readiness is READY or CALCULATED WITH WARNINGS only — never PENDING', () => {
    assert.equal(presentCustomerCostingStatus({ calculated: true }), CUSTOMER_COSTING_READY);
    assert.equal(
      presentCustomerCostingStatus({ calculated: true, hasWarnings: true }),
      CUSTOMER_COSTING_CALCULATED_WITH_WARNINGS
    );
    assert.equal(presentCustomerCostingStatus({ calculated: false, structurallyBlocked: true }), CUSTOMER_COSTING_NOT_AVAILABLE);
    assert.equal(presentCustomerCostingStatus({ calculated: true, hasWarnings: false }), CUSTOMER_COSTING_READY);
    assert.equal(presentCustomerCostingFromLine({ costingReadinessStatus: 'READY_FOR_COSTING' }).status, CUSTOMER_COSTING_READY);
    assert.equal(
      presentCustomerCostingFromLine({ costingReadinessStatus: 'CALCULATED_WITH_WARNINGS' }).status,
      CUSTOMER_COSTING_CALCULATED_WITH_WARNINGS
    );
    assert.equal(presentCustomerCostingFromLine({ costingReadinessStatus: 'NOT_READY' }).status, CUSTOMER_COSTING_NOT_AVAILABLE);
    assert.equal(presentCustomerCostingFromLine({ costingReadinessStatus: 'NOT_READY' }).status.includes('PENDING'), false);
    assert.equal(
      presentCustomerCostingFromLine({
        importedEngineeringReady: true,
        v2CurrentSnapshotId: null,
        costingReadinessStatus: 'READY_FOR_COSTING',
      }).status,
      CUSTOMER_COSTING_READY
    );
    assert.notEqual(
      presentCustomerCostingFromLine({
        importedEngineeringReady: true,
        v2CurrentSnapshotId: null,
        costingCalculationId: 'calc-1',
      }).status,
      CUSTOMER_COSTING_NOT_AVAILABLE
    );
    assert.equal(
      presentCustomerCostingFromLine({
        importedEngineeringReady: false,
        v2CurrentSnapshotId: null,
        costingReadinessStatus: 'NOT_READY',
      }).status,
      CUSTOMER_COSTING_NOT_AVAILABLE
    );
    assert.equal(customerCostingStatusIsInternalLeak(CUSTOMER_COSTING_READY), false);
    assert.equal(customerCostingStatusIsInternalLeak('Decision 5'), true);
    assert.equal(customerCostingStatusIsInternalLeak('margin'), true);
    assert.equal(customerCostingStatusIsInternalLeak('PENDING'), true);
    assert.equal(customerCostingStatusIsInternalLeak('Gate 2 BOM'), true);
  });

  it('7. customer projection never includes internal cost tokens', () => {
    const projected = projectCustomerFinancialOffer({
      id: 'fo1',
      inquiryId: 'inq1',
      versionNo: 1,
      currencyCode: 'USD',
      productsTotal: '1000',
      shipmentTotal: '0',
      inquiryTotal: '1000',
      warnings: [{ code: SHIPPING_CHARGES_NOT_AVAILABLE }],
      productLines: [
        {
          inquiryLineId: 'l1',
          description: 'LV Cable',
          lengthMeters: '1000',
          quantity: '1',
          unitPrice: '1000',
          lineTotal: '1000',
        },
      ],
      shipmentLines: [
        {
          destinationPortCode: 'ROTTERDAM',
          incotermCode: 'CIF',
          groupTotal: '0',
          shipmentCostSnapshotId: null,
          typeLines: [{ containerTypeCode: '40HQ', containerQuantity: 1, rateAmount: '0', lineTotal: '0' }],
        },
      ],
    });
    const text = JSON.stringify(projected);
    assert.equal(text.includes('materialCost'), false);
    assert.equal(text.includes('CostingRun'), false);
    assert.equal(text.includes('shippingCostRateId'), false);
    assert.equal(projected.shippingNotConfigured, true);
    assert.ok(projected.shippingNotice);
  });

  it('8. historical snapshot facts are not replaced by live zeros', () => {
    const group = projectCustomerContainerStudyGroup({
      shipmentGroupId: 'g1',
      groupStatus: 'LOCKED',
      studyStatus: 'CONFIRMED',
      destinationPortCode: 'ROTTERDAM',
      incotermCode: 'CIF',
      packingContainers: [{ typeCode: '40HQ' }],
      snapshot: {
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
        totalAmount: '2000',
        currencyCode: 'USD',
        lines: [{ containerTypeCode: '40HQ', containerQuantity: 1, rateAmount: '2000', lineTotal: '2000' }],
      },
    });
    assert.equal(group.hasPersistedShipmentSnapshot, true);
    assert.equal(group.containers[0].rate, '2000');
    assert.equal(group.shipmentTotal, '2000');
    assert.equal(group.presentationLabel, 'CALCULATED');
  });

  it('9. VIP missing snapshot is 0+warning; STANDARD missing rate is 0+warning; packing is not blocked', () => {
    const vip = projectCustomerFinancialOffer({
      id: 'fo-vip',
      inquiryId: 'inq-vip',
      versionNo: 1,
      currencyCode: 'USD',
      productsTotal: '500',
      shipmentTotal: '0',
      inquiryTotal: '500',
      warnings: [{ code: VIP_SHIPMENT_NOT_CONFIGURED }],
      productLines: [],
      shipmentLines: [],
    });
    assert.equal(vip.shippingTotal, '0');
    assert.equal(vip.shippingNotConfigured, true);

    const resolved = resolveCustomerShippingCostFromRows([], {
      customerId: 'cust',
      deliveryPoint: 'Rotterdam',
      incotermId: 'cif',
      containerType: "40' SD/HC",
      effectiveDate: '2026-09-23',
    });
    assert.equal(resolved.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(resolved.amount, null);
    const calculated = presentUnresolvedShippingAsCalculatedZero(notConfigured());
    assert.equal(calculated.amount, 0);
    assert.equal(calculated.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    const beside = presentShippingBesidePacking({ drums: 4 }, calculated);
    assert.equal(beside.packing.drums, 4);
    assert.equal(beside.shippingCostFinancial.blocksPacking, false);
    assert.equal(beside.shippingCostFinancial.amount, 0);

    const draft = projectCustomerContainerStudyGroup({
      shipmentGroupId: 'g-rot',
      groupStatus: 'ACTIVE',
      studyStatus: 'DRAFT',
      destinationPortCode: 'ROTTERDAM',
      incotermCode: 'CIF',
      currencyCode: 'EUR',
      packingContainers: [{ typeCode: '40HQ' }, { typeCode: '40HQ' }],
      snapshot: null,
    });
    assert.equal(draft.governedStatus, 'DRAFT');
    assert.equal(draft.hasPersistedShipmentSnapshot, false);
    assert.equal(draft.destination, 'ROTTERDAM');
    assert.equal(draft.incoterm, 'CIF');
    assert.equal(draft.containers.length, 1);
    assert.equal(draft.containers[0].quantity, 2);
    assert.equal(draft.containers[0].rate, null);
    assert.equal(draft.containers[0].total, null);
    assert.equal(draft.shipmentTotal, '0');
    assert.equal(draft.currency, 'EUR');
    assert.equal(draft.presentationLabel, 'CALCULATED WITH WARNINGS');
    assert.match(draft.information || '', /treated as 0/);
    assert.equal(draft.liveRatesShown, false);
  });

  it('structural missing drums does not fabricate packing charges', () => {
    const empty = projectCustomerContainerStudyGroup({
      shipmentGroupId: 'g-empty',
      groupStatus: 'ACTIVE',
      studyStatus: null,
      destinationPortCode: 'ROTTERDAM',
      incotermCode: 'CIF',
      packingContainers: [],
      snapshot: null,
    });
    assert.equal(empty.containers.length, 0);
    assert.equal(empty.shipmentTotal, null);
    assert.equal(empty.calculationStatus, CALCULATION_STATUS.BLOCKED);
    assert.equal(empty.presentationLabel, 'READY_TO_CALCULATE');
    assert.equal(empty.liveRatesShown, false);
    const noContainer = projectCustomerContainerStudyGroup({
      shipmentGroupId: 'g-empty',
      groupStatus: 'ACTIVE',
      studyStatus: 'DRAFT',
      destinationPortCode: 'ROTTERDAM',
      incotermCode: 'CIF',
      packingContainers: [],
      missingPhysicalPackingInputs: describeMissingPhysicalPackingInputs({
        hasConfirmedDrum: true,
        hasCuttingLength: true,
        hasQuantity: true,
        hasContainerType: false,
        hasDestination: true,
      }),
      snapshot: null,
    });
    assert.equal(noContainer.presentationLabel, 'SHIPMENT_CONFIGURATION_REQUIRED');
    assert.equal(noContainer.shipmentTotal, null);
    assert.match(noContainer.information || '', /container configuration/i);
    const diagnosed = projectCustomerContainerStudyGroup({
      shipmentGroupId: 'g-empty',
      groupStatus: 'ACTIVE',
      studyStatus: 'DRAFT',
      destinationPortCode: 'ROTTERDAM',
      incotermCode: 'CIF',
      packingContainers: [],
      missingPhysicalPackingInputs: describeMissingPhysicalPackingInputs({
        hasConfirmedDrum: false,
        hasCuttingLength: true,
        hasQuantity: true,
        hasContainerType: true,
        hasDestination: true,
      }),
      snapshot: null,
    });
    assert.match(diagnosed.information || '', /confirmed drum plan/);
    assert.equal(diagnosed.presentationLabel, 'BLOCKED');
    assert.doesNotMatch(diagnosed.information || '', /No container lines yet/);
  });

  it('shippingChargesUnavailableInformation counts missing charges', () => {
    assert.match(shippingChargesUnavailableInformation(3), /3 charge values/);
  });

  it('Rotterdam CIF missing ocean/handling stays CALCULATED WITH WARNINGS and keeps available charges', () => {
    const rotterdam = presentNamedShippingCharges({ ocean: null, handling: undefined, otherAvailable: 850 });
    assert.equal(rotterdam.ocean, 0);
    assert.equal(rotterdam.handling, 0);
    assert.equal(rotterdam.availableCharges, 850);
    assert.equal(rotterdam.total, 850);
    assert.equal(rotterdam.calculationStatus, CALCULATION_STATUS.CALCULATED);
    assert.equal(rotterdam.presentationLabel, 'CALCULATED WITH WARNINGS');
    assert.equal(rotterdam.missingNumericCount, 2);
    assert.match(rotterdam.information || '', /2 charge values/);
    const packing = optionalCostComponentAsZero(null, {
      code: 'PACKING_CHARGE_NOT_AVAILABLE',
      field: 'packing',
      message: 'Packing charge was not available.',
    });
    assert.equal(packing.value, 0);
    assert.equal(packing.warning?.treatedAs, '0');
  });
});
