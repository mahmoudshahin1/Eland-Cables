import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateResultContainerQuantities } from './shipmentCostSnapshotQuantities';
import type { ContainerStudyCalculationOutput } from './containerStudyCalculationTypes';
import {
  CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE,
  DESTINATION_PORT_NOT_CONFIGURED_MESSAGE,
  containerStudyResultContainsShippingCost,
  describeInquiryShipmentDestination,
  evaluateDownstreamShippingConsumerReadiness,
  evaluateInquiryContainerStudyReadiness,
  expandPhysicalDrumsFromPlanLines,
  inquiryCalculateMustAutoCaptureSnapshot,
  mapContainerOptions,
  type ContainerTypeMasterView,
  type DrumPlanLineInput,
} from './inquiryContainerStudyPresentation';

const approvedType = (code: string, description: string): ContainerTypeMasterView => ({
  code,
  description,
  active: true,
  currentVersionId: `${code}-v1`,
  dimensionsStatus: 'APPROVED',
  usableLengthMm: 12032,
  internalWidthMm: 2350,
  payloadCapacityKg: 26500,
});

const planLine = (
  id: string,
  cuttingLengthM: number,
  numberOfDrums: number,
  extras: Partial<DrumPlanLineInput> = {}
): DrumPlanLineInput => ({
  id,
  drumPlanId: 'plan-1',
  inquiryLineId: 'line-1',
  requirementId: id,
  drumCode: `DRUM-${id}`,
  numberOfDrums,
  cuttingLengthM,
  grossLoadedDrumWeightKg: 1200,
  packedLengthMm: 1400,
  packedWidthMm: 900,
  ...extras,
});

const engineeringReady = {
  inquiryId: 'inq-1',
  customerScopeValid: true,
  confirmedDrumPlans: [{ id: 'p1', lifecycleStatus: 'CONFIRMED' as const }],
  physicalDrums: expandPhysicalDrumsFromPlanLines([planLine('l1', 1500, 1)]),
  approvedContainerTypes: [approvedType('T1', 'Ready')],
  algorithmSupported: true,
  configurationReady: true,
  region: 'Europe' as const,
};

const packingResult = {
  types: [approvedType('T1', 'Ready')],
  containers: [
    {
      typeCode: 'T1',
      containerIndex: 1,
      usableLengthMm: 12032,
      payloadCapacityKg: 26500,
      loadedWeightKg: 4000,
      utilizationWeightPct: 15,
      utilizationLengthPct: 20,
      drumCountQ3: 2,
    },
  ],
  unallocated: [],
};

const rate = {
  destinationPortCode: 'DONCASTER',
  incotermCode: 'CIF',
  containerTypeCode: 'T1',
  rateAmount: 900,
  currencyCode: 'USD',
};

function packingUnchanged(left: ReturnType<typeof mapContainerOptions>, right: ReturnType<typeof mapContainerOptions>) {
  assert.equal(left[0].requiredContainersLabel, right[0].requiredContainersLabel);
  assert.equal(left[0].allocationStatus, right[0].allocationStatus);
  assert.equal(left[0].utilizationLabel, right[0].utilizationLabel);
  assert.equal(left[0].selectable, right[0].selectable);
}

describe('Container Study physical packing independence (C01–C08)', () => {
  it('C01: dest DONCASTER + incoterm CIF calculates', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.issues.some((issue) => issue.field === 'destinationPortCode'), false);
    const destination = describeInquiryShipmentDestination({
      requestedDestination: 'DONCASTER',
      destinationPortCode: 'DONCASTER',
    });
    assert.equal(destination.label, 'DONCASTER');
    assert.equal(destination.calculationBlocked, false);
  });

  it('C02: dest NULL + CIF calculates', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      destinationPortCode: null,
      incotermCode: 'CIF',
    });
    assert.equal(readiness.ok, true);
    const destination = describeInquiryShipmentDestination({
      requestedDestination: null,
      destinationPortCode: null,
    });
    assert.equal(destination.calculationBlocked, false);
    assert.equal(destination.label, DESTINATION_PORT_NOT_CONFIGURED_MESSAGE);
  });

  it('C03: dest invalid/unconfigured + CIF calculates', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      destinationPortCode: null,
      unresolvedDestination: 'NOT-A-PORT',
      incotermCode: 'CIF',
    });
    assert.equal(readiness.ok, true);
    const destination = describeInquiryShipmentDestination({
      requestedDestination: 'NOT-A-PORT',
      destinationPortCode: null,
    });
    assert.equal(destination.configured, false);
    assert.equal(destination.destinationPortCode, null);
    assert.equal(destination.calculationBlocked, false);
    assert.equal(destination.label, 'NOT-A-PORT — Not Configured');
  });

  it('C04: dest NULL + incoterm NULL calculates when drum/engineering gates are valid', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      destinationPortCode: null,
      incotermCode: null,
      unresolvedIncoterm: null,
    });
    assert.equal(readiness.ok, true);
    const blocked = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      confirmedDrumPlans: [],
      physicalDrums: [],
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.issues.some((issue) => issue.code === 'PHYSICAL_DRUMS_REQUIRED'), true);
    assert.equal(
      blocked.issues.some((issue) => issue.message === 'No physical drum schedule is available for this inquiry.'),
      true
    );
    const afterSnapshot = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      confirmedDrumPlans: [],
      physicalDrums: [],
      destinationPortCode: 'ALEXANDRIA',
      incotermCode: 'FOB',
      hasImmutableInputSnapshot: true,
    });
    assert.equal(afterSnapshot.ok, true);
  });

  it('C05: dest exists but no ShippingCostRate calculates', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
    });
    assert.equal(readiness.ok, true);
    const rows = mapContainerOptions({
      ...packingResult,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
      customerMasterDestinationConfigured: true,
      shippingRates: [],
    });
    assert.equal(rows[0].allocationStatus, 'ALLOCATED');
    assert.equal(rows[0].costLabel, null);
  });

  it('C06: ShippingCostRate exists — packing unchanged and still no shipping cost', () => {
    const withoutRate = mapContainerOptions({
      ...packingResult,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
      customerMasterDestinationConfigured: true,
      shippingRates: [],
    });
    const withRate = mapContainerOptions({
      ...packingResult,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
      customerMasterDestinationConfigured: true,
      shippingRates: [rate],
    });
    packingUnchanged(withoutRate, withRate);
    assert.equal(withRate[0].costLabel, null);
    assert.equal(containerStudyResultContainsShippingCost(withRate[0]), false);
  });

  it('C07: Container Study result contains no shipping cost', () => {
    const rows = mapContainerOptions({
      ...packingResult,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
      customerMasterDestinationConfigured: true,
      shippingRates: [rate],
    });
    assert.equal(containerStudyResultContainsShippingCost(rows[0]), false);
    const outputKeys: Array<keyof ContainerStudyCalculationOutput> = [
      'ok',
      'algorithmVersionCode',
      'configurationVersion',
      'containers',
      'allocations',
      'unallocated',
      'summary',
      'warnings',
      'errors',
      'decisionTrace',
      'containerMasterPinJson',
      'packingProfilePinJson',
    ];
    const forbidden = ['shippingCost', 'freightCost', 'shippingCostRateId', 'rateAmount', 'costLabel', 'shipmentCostSnapshotId'];
    for (const key of forbidden) {
      assert.equal(outputKeys.includes(key as keyof ContainerStudyCalculationOutput), false);
    }
    assert.equal(inquiryCalculateMustAutoCaptureSnapshot(null), true);
    assert.equal(inquiryCalculateMustAutoCaptureSnapshot('css-1'), false);
    assert.match(CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE, /confirmed Drum Plan/);
    assert.equal(CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE.includes('Capture an input snapshot'), false);
  });

  it('C08: financial/shipping calculation can consume confirmed CS result later', () => {
    const packingOnly = evaluateDownstreamShippingConsumerReadiness({
      containerStudyStatus: 'CONFIRMED',
      currentResultId: 'csr-1',
      unallocatedCount: 0,
      destinationPortCode: null,
      incotermCode: null,
    });
    assert.equal(packingOnly.packingResultConsumable, true);
    assert.equal(packingOnly.shippingCalculationReady, false);
    const later = evaluateDownstreamShippingConsumerReadiness({
      containerStudyStatus: 'CONFIRMED',
      currentResultId: 'csr-1',
      unallocatedCount: 0,
      destinationPortCode: 'DONCASTER',
      incotermCode: 'CIF',
    });
    assert.equal(later.packingResultConsumable, true);
    assert.equal(later.shippingCalculationReady, true);
    const snapshotDest = evaluateDownstreamShippingConsumerReadiness({
      containerStudyStatus: 'CONFIRMED',
      currentResultId: 'csr-1',
      unallocatedCount: 0,
      destinationPortCode: 'ALEXANDRIA',
      incotermCode: 'FOB',
      snapshotDestinationPortCode: 'ROTTERDAM',
      snapshotIncotermCode: 'CIF',
    });
    assert.equal(snapshotDest.shippingCalculationReady, true);
    const quantities = aggregateResultContainerQuantities([{ typeCode: 'T1' }, { typeCode: 'T1' }]);
    assert.equal(quantities.ok, true);
    if (quantities.ok) {
      assert.deepEqual(quantities.lines, [{ containerTypeCode: 'T1', containerQuantity: 2 }]);
    }
  });

  it('H: missing shipping and missing destination do not block packing', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      ...engineeringReady,
      destinationPortCode: null,
      unresolvedDestination: 'Alexandria',
      incotermCode: 'CIF',
    });
    assert.equal(readiness.ok, true);
    const rows = mapContainerOptions({
      ...packingResult,
      destinationPortCode: null,
      incotermCode: 'CIF',
      shippingRates: [],
    });
    assert.equal(rows[0].allocationStatus, 'ALLOCATED');
    assert.equal(rows[0].costLabel, null);
    assert.equal(containerStudyResultContainsShippingCost(rows[0]), false);
  });
});
