import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyContainerOptionSelection,
  assertCustomerInquiryIsolation,
  calculationDidNotMutateDrumPlan,
  confirmationBlockedByUnallocated,
  buildApprovedMasterSelectState,
  describeInquiryShipmentDestination,
  describeInquiryShipmentIncoterm,
  evaluateInquiryContainerStudyReadiness,
  presentCurrentInquiryIncoterm,
  resolveInquiryCanonicalDestination,
  computePhysicalDrumGrossWeightKg,
  enrichPhysicalDrumsForStudy,
  expandPhysicalDrumsFromPlanLines,
  expandPhysicalDrumsFromRequirements,
  formatPhysicalDrumLabel,
  formatUnresolvedDestinationPortLabel,
  formatVolume,
  mapContainerOptions,
  matchActiveMasterByCodeOrName,
  nextHistoricalResultIds,
  recommendContainerTypeFromResult,
  DESTINATION_PORT_NOT_CONFIGURED_MESSAGE,
  SHIPPING_COST_BLOCKED_UNTIL_CUSTOMER_DESTINATION_MESSAGE,
  totalNetWeightKg,
  UNRESOLVED_INCOTERM_MASTER_MESSAGE,
  type ContainerTypeMasterView,
  type CuttingLengthRequirementInput,
  type DrumPlanLineInput,
  type PhysicalDrumForStudy,
} from './inquiryContainerStudyPresentation';

const req = (
  id: string,
  cuttingLengthM: number,
  requestedDrumCount: number,
  lineId = 'line-1'
): CuttingLengthRequirementInput => ({
  requirementId: id,
  inquiryLineId: lineId,
  sequenceNo: Number(id.replace(/\D/g, '') || 1),
  cuttingLengthM,
  requestedDrumCount,
  drumPlanId: `plan-${id}`,
  drumPlanStatus: 'CONFIRMED',
  drumCode: `D-${id}`,
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

describe('inquiryContainerStudyPresentation', () => {
  it('1. one confirmed drum expands to one physical drum', () => {
    const physical = expandPhysicalDrumsFromRequirements([req('r1', 1500, 1)]);
    assert.deepEqual(physical.map((d) => d.cuttingLengthM), [1500]);
  });

  it('2. multiple drums from one requirement stay independent', () => {
    const physical = expandPhysicalDrumsFromRequirements([req('r1', 1500, 2)]);
    assert.deepEqual(physical.map((d) => d.cuttingLengthM), [1500, 1500]);
  });

  it('3. multiple cutting-length requirements expand to six physical drums', () => {
    const physical = expandPhysicalDrumsFromRequirements([
      req('r1', 1500, 2),
      req('r2', 1000, 1),
      req('r3', 800, 3),
    ]);
    assert.deepEqual(
      physical.map((d) => d.cuttingLengthM),
      [1500, 1500, 1000, 800, 800, 800]
    );
    assert.equal(physical.length, 6);
  });

  it('4. physical drum population is preserved from plan lines and is not rebuilt from cable total', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      planLine('l1', 1500, 2),
      planLine('l2', 1000, 1),
      planLine('l3', 800, 3),
    ]);
    assert.equal(physical.length, 6);
    assert.deepEqual(
      physical.map((d) => d.cuttingLengthM),
      [1500, 1500, 1000, 800, 800, 800]
    );
    assert.equal(
      physical.reduce((sum, d) => sum + d.cuttingLengthM, 0),
      6400
    );
  });

  it('5. container calculation input uses each physical drum, not an aggregated length', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      planLine('l1', 1500, 2),
      planLine('l2', 1000, 1),
    ]);
    assert.equal(
      physical.some((d) => d.cuttingLengthM === 4000 || d.cuttingLengthM === 2500),
      false
    );
    assert.deepEqual(
      physical.map((d) => d.cuttingLengthM),
      [1500, 1500, 1000]
    );
  });

  it('6. calculation mapping does not alter the drum plan', () => {
    const drumPlan = [
      { id: 'l1', drumCode: 'A', numberOfDrums: 2, cuttingLengthM: 1500 },
      { id: 'l2', drumCode: 'B', numberOfDrums: 1, cuttingLengthM: 1000 },
    ];
    const before = structuredClone(drumPlan);
    mapContainerOptions({
      types: [approvedType('T1', 'Type 1')],
      containers: [
        {
          typeCode: 'T1',
          containerIndex: 1,
          usableLengthMm: 12000,
          payloadCapacityKg: 26000,
          loadedWeightKg: 4000,
          utilizationWeightPct: 20,
          utilizationLengthPct: 30,
          drumCountQ3: 3,
        },
      ],
      unallocated: [],
    });
    assert.equal(calculationDidNotMutateDrumPlan(before, drumPlan), true);
  });

  it('7. calculation mapping does not alter cutting lengths', () => {
    const cutting = [1500, 1500, 1000, 800, 800, 800];
    const before = [...cutting];
    expandPhysicalDrumsFromRequirements([req('r1', 1500, 2), req('r2', 1000, 1), req('r3', 800, 3)]);
    assert.deepEqual(cutting, before);
  });

  it('8. calculation does not delete any physical drum', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      planLine('l1', 1500, 2),
      planLine('l2', 1000, 1),
      planLine('l3', 800, 3),
    ]);
    assert.equal(physical.length, 6);
    assert.equal(new Set(physical.map((d) => d.physicalDrumKey)).size, 6);
  });

  it('physical drum label uses Drum Master description, not code-only', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      { ...planLine('l1', 1500, 1), drumCode: 'EWD900-0' },
    ]);
    const enriched = enrichPhysicalDrumsForStudy(
      physical,
      [{ drumCode: 'EWD900-0', description: 'Wood Reel 220', drumType: 'WOOD', emptyDrumNetWeightKg: 140 }],
      { 'line-1': 800 }
    );
    assert.equal(enriched[0].drumDescription, 'Wood Reel 220');
    assert.equal(formatPhysicalDrumLabel('EWD900-0', 'Wood Reel 220'), 'Wood Reel 220 (EWD900-0)');
    assert.equal(enriched[0].drumLabel, 'Wood Reel 220 (EWD900-0)');
    assert.notEqual(enriched[0].drumLabel, 'EWD900-0');
    assert.match(enriched[0].drumLabel, /Wood Reel 220/);
  });

  it('gross weight is cable weight for the cutting length plus empty drum weight', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      { ...planLine('l1', 1500, 1), drumCode: 'EWD900-0', grossLoadedDrumWeightKg: null },
    ]);
    const enriched = enrichPhysicalDrumsForStudy(
      physical,
      [{ drumCode: 'EWD900-0', description: 'Wood Reel 220', emptyDrumNetWeightKg: 140 }],
      { 'line-1': 800 }
    );
    assert.equal(computePhysicalDrumGrossWeightKg({
      cuttingLengthM: 1500,
      cableWeightKgPerKm: 800,
      emptyDrumNetWeightKg: 140,
    }), 1340);
    assert.equal(enriched[0].grossWeightKg, 1340);
  });

  it('gross weight stays Not Available when empty weight or cable weight is missing', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      { ...planLine('l1', 1500, 1), drumCode: 'EWD900-0', grossLoadedDrumWeightKg: null },
    ]);
    const missingEmpty = enrichPhysicalDrumsForStudy(
      physical,
      [{ drumCode: 'EWD900-0', description: 'Wood Reel 220', emptyDrumNetWeightKg: null }],
      { 'line-1': 800 }
    );
    const missingCable = enrichPhysicalDrumsForStudy(
      physical,
      [{ drumCode: 'EWD900-0', description: 'Wood Reel 220', emptyDrumNetWeightKg: 140 }],
      { 'line-1': null }
    );
    const missingMaster = enrichPhysicalDrumsForStudy(physical, [], { 'line-1': 800 });
    assert.equal(missingEmpty[0].grossWeightKg, null);
    assert.equal(missingCable[0].grossWeightKg, null);
    assert.equal(missingMaster[0].grossWeightKg, null);
    assert.equal(
      computePhysicalDrumGrossWeightKg({
        cuttingLengthM: 1500,
        cableWeightKgPerKm: 800,
        emptyDrumNetWeightKg: null,
      }),
      null
    );
  });

  it('9. unallocated drums are reported explicitly', () => {
    const rows = mapContainerOptions({
      types: [approvedType('T1', 'Type 1')],
      containers: [],
      unallocated: [
        {
          physicalDrumKey: 'l1#1',
          sourceLineId: 'l1',
          instanceIndex: 1,
          reasonCode: 'NO_FEASIBLE_CONTAINER',
          detail: 'Drum exceeds payload.',
        },
      ],
    });
    assert.equal(rows[0].allocationStatus, 'UNALLOCATED');
  });

  it('10. invalid container master data blocks calculation readiness', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-1',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'p1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: expandPhysicalDrumsFromPlanLines([planLine('l1', 1500, 1)]),
      approvedContainerTypes: [],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: 'EGALY',
      incotermCode: 'FOB',
      region: 'Europe',
    });
    assert.equal(readiness.ok, false);
    assert.ok(readiness.issues.some((i) => i.code === 'INCOMPLETE_CONTAINER_MASTER'));
  });

  it('11. recommendation comes from the calculation result, not a hardcoded type', () => {
    const recommended = recommendContainerTypeFromResult([
      {
        typeCode: 'T-SMALL',
        containerIndex: 1,
        usableLengthMm: 5900,
        payloadCapacityKg: 28000,
        loadedWeightKg: 20000,
        utilizationWeightPct: 80,
        utilizationLengthPct: 90,
        drumCountQ3: 1,
      },
      {
        typeCode: 'T-LARGE',
        containerIndex: 2,
        usableLengthMm: 12000,
        payloadCapacityKg: 26500,
        loadedWeightKg: 8000,
        utilizationWeightPct: 40,
        utilizationLengthPct: 50,
        drumCountQ3: 5,
      },
    ]);
    assert.equal(recommended, 'T-LARGE');
    assert.notEqual(recommended, '40HQ');
  });

  it('12. selecting a container does not change drum selection', () => {
    const drums: PhysicalDrumForStudy[] = expandPhysicalDrumsFromPlanLines([
      planLine('l1', 1500, 2),
      planLine('l2', 1000, 1),
    ]);
    const state = { drums, cuttingLengths: drums.map((d) => d.cuttingLengthM), selectedTypeCode: null as string | null };
    const next = applyContainerOptionSelection(state, 'T1');
    assert.equal(next.selectedTypeCode, 'T1');
    assert.deepEqual(
      next.drums.map((d) => ({ code: d.drumCode, cutting: d.cuttingLengthM })),
      state.drums.map((d) => ({ code: d.drumCode, cutting: d.cuttingLengthM }))
    );
    assert.deepEqual(next.cuttingLengths, [1500, 1500, 1000]);
  });

  it('13. customer isolation rejects a foreign inquiry', () => {
    assert.equal(
      assertCustomerInquiryIsolation({
        actorUserType: 'customer',
        actorCustomerKeys: ['C-ELAND'],
        inquiryCustomerId: 'C-OTHER',
        inquiryCustomerMasterId: 'other-master',
      }),
      false
    );
    assert.equal(
      assertCustomerInquiryIsolation({
        actorUserType: 'customer',
        actorCustomerKeys: ['C-ELAND'],
        inquiryCustomerId: 'C-ELAND',
      }),
      true
    );
  });

  it('14. historical result ids remain readable after a new result', () => {
    const history = nextHistoricalResultIds(['csr-1'], 'csr-2');
    assert.deepEqual(history, ['csr-1', 'csr-2']);
  });

  it('15. recalculation creates a new result id and does not delete the previous one', () => {
    const first = nextHistoricalResultIds([], 'csr-a');
    const second = nextHistoricalResultIds(first, 'csr-b');
    assert.equal(second.length, 2);
    assert.equal(second[0], 'csr-a');
    assert.equal(second[1], 'csr-b');
  });

  it('16. confirmation fails when drums are unallocated', () => {
    assert.equal(confirmationBlockedByUnallocated(1), true);
    assert.equal(confirmationBlockedByUnallocated(0), false);
  });

  it('17. no fabricated dimensions, volume, or cost', () => {
    const incomplete: ContainerTypeMasterView = {
      code: 'T-INCOMPLETE',
      description: 'Incomplete',
      active: true,
      dimensionsStatus: 'PENDING_APPROVAL',
      usableLengthMm: null,
      internalWidthMm: null,
      payloadCapacityKg: null,
    };
    const rows = mapContainerOptions({
      types: [incomplete, approvedType('T1', 'Ready')],
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
    });
    const blocked = rows.find((r) => r.typeCode === 'T-INCOMPLETE')!;
    assert.equal(blocked.internalDimensionsLabel, 'Not Available');
    assert.equal(blocked.volumeLabel, 'Not Available');
    assert.equal(blocked.maxPayloadLabel, 'Not Available');
    assert.equal(blocked.costLabel, null);
    assert.equal(blocked.allocationStatus, 'NOT_READY');
    assert.equal(blocked.selectable, false);
    assert.equal(formatVolume(approvedType('T1', 'Ready')), 'Not Available');
  });

  it('18. helpers do not perform database writes', () => {
    const physical = expandPhysicalDrumsFromRequirements([req('r1', 1500, 2), req('r2', 1000, 1)]);
    assert.equal(physical.length, 3);
    assert.equal(totalNetWeightKg(expandPhysicalDrumsFromPlanLines([planLine('l1', 1500, 2)])), 2400);
  });

  it('readiness requires confirmed drums and supported configuration, not destination', () => {
    const ready = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-1',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'p1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: expandPhysicalDrumsFromPlanLines([planLine('l1', 1500, 1)]),
      approvedContainerTypes: [approvedType('T1', 'Ready')],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: null,
      incotermCode: null,
      region: 'Africa',
    });
    assert.equal(ready.ok, true);
    const draft = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-1',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'p1', lifecycleStatus: 'DRAFT' }],
      physicalDrums: expandPhysicalDrumsFromPlanLines([planLine('l1', 1500, 1)]),
      approvedContainerTypes: [approvedType('T1', 'Ready')],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: 'EGALY',
      incotermCode: 'CFR',
      region: 'Africa',
    });
    assert.equal(draft.ok, false);
  });

  it('missing destination does not invent a DestinationPort and does not block packing', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      planLine('l1', 1500, 2),
      planLine('l2', 1000, 1),
      planLine('l3', 2000, 1),
    ]);
    const destination = describeInquiryShipmentDestination({
      requestedDestination: 'Alexandria',
      destinationPortCode: null,
    });
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-1',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'p1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: physical,
      approvedContainerTypes: [approvedType('T1', 'Ready')],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: null,
      unresolvedDestination: 'Alexandria',
      incotermCode: null,
      region: 'Europe',
    });
    assert.equal(physical.length, 4);
    assert.equal(destination.configured, false);
    assert.equal(destination.label, 'Alexandria — Not Configured');
    assert.equal(destination.message, DESTINATION_PORT_NOT_CONFIGURED_MESSAGE);
    assert.equal(destination.calculationBlocked, false);
    assert.equal(destination.shippingCostBlocked, true);
    assert.equal(SHIPPING_COST_BLOCKED_UNTIL_CUSTOMER_DESTINATION_MESSAGE, DESTINATION_PORT_NOT_CONFIGURED_MESSAGE);
    assert.equal(formatUnresolvedDestinationPortLabel('Alexandria'), 'Alexandria — Not Configured');
    assert.equal(readiness.ok, true);
    assert.equal(readiness.issues.some((issue) => issue.code === 'PHYSICAL_DRUMS_REQUIRED'), false);
    assert.equal(readiness.issues.some((issue) => issue.code === 'DESTINATION_PORT_NOT_CONFIGURED'), false);
    assert.equal(
      matchActiveMasterByCodeOrName('Alexandria', [{ code: 'EGALY', name: 'Alexandria Port', active: true }]),
      null
    );
    assert.equal(
      matchActiveMasterByCodeOrName('FOB - Free on Board', [{ code: 'FOB', name: 'Free on Board', active: true }])?.code,
      'FOB'
    );
    assert.equal(matchActiveMasterByCodeOrName('Alexandria', []), null);
  });

  it('global Incoterm master dropdown is not restricted by Eland delivery preferences', () => {
    const globalMaster = [
      { code: 'CIF', name: 'CIF', active: true },
      { code: 'DAP', name: 'DAP', active: true },
      { code: 'FOB', name: 'FOB', active: true },
    ];
    const dropdown = buildApprovedMasterSelectState({ currentValue: '', records: globalMaster });
    assert.equal(dropdown.options.some((opt) => opt.value === 'FOB'), true);
    assert.equal(dropdown.options.some((opt) => opt.value === 'DAP'), true);
    assert.equal(dropdown.options.some((opt) => opt.value === 'CIF'), true);
    const elandOnly = [
      { incotermCode: 'DAP', destinationPortCode: 'DONCASTER' },
      { incotermCode: 'CIF', destinationPortCode: 'ROTTERDAM' },
    ];
    const restricted = [...new Set(elandOnly.map((row) => row.incotermCode))];
    assert.equal(restricted.includes('FOB'), false);
    assert.equal(dropdown.options.length > restricted.length, true);
  });

  it('shipping cost stays blocked without a Customer Master destination even if packing rates exist', () => {
    const rows = mapContainerOptions({
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
      destinationPortCode: 'DONCASTER',
      incotermCode: 'DAP',
      customerMasterDestinationConfigured: false,
      shippingRates: [
        {
          destinationPortCode: 'DONCASTER',
          incotermCode: 'DAP',
          containerTypeCode: 'T1',
          rateAmount: 900,
          currencyCode: 'USD',
        },
      ],
    });
    assert.equal(rows[0].costLabel, null);
    assert.equal(rows[0].allocationStatus, 'ALLOCATED');
  });

  it('inquiry destination identity DONCASTER is displayed without Customer Master as a packing gate', () => {
    const destination = describeInquiryShipmentDestination({
      requestedDestination: 'DONCASTER',
      destinationPortCode: 'DONCASTER',
      customerMasterConfigured: false,
    });
    assert.equal(destination.label, 'DONCASTER');
    assert.equal(destination.configured, true);
    assert.equal(destination.calculationBlocked, false);
  });

  it('approved master selects never promote free-text Alexandria or FOB labels into master codes', () => {
    const dest = buildApprovedMasterSelectState({
      currentValue: 'Alexandria',
      records: [{ code: 'EGALY', name: 'El Dekheila', active: true }],
    });
    assert.equal(dest.configured, false);
    assert.equal(dest.selectedCode, '');
    assert.equal(dest.unresolvedCurrent, 'Alexandria');
    assert.equal(dest.options.some((opt) => opt.value === 'Alexandria'), false);
    const emptyDest = buildApprovedMasterSelectState({ currentValue: 'Alexandria', records: [] });
    assert.equal(emptyDest.options.length, 0);
    assert.equal(emptyDest.configured, false);
    const incoterm = describeInquiryShipmentIncoterm({ requestedIncoterm: 'FOB', incotermCode: null });
    assert.equal(incoterm.label, 'FOB — Not Configured');
    assert.equal(incoterm.message, UNRESOLVED_INCOTERM_MASTER_MESSAGE);
    const matched = buildApprovedMasterSelectState({
      currentValue: 'FOB - Free on Board',
      records: [{ code: 'FOB', name: 'Free on Board', active: true }],
    });
    assert.equal(matched.configured, true);
    assert.equal(matched.selectedCode, 'FOB');
  });

  const approvedIncoterms = [
    { code: 'CIF', name: 'CIF', active: true },
    { code: 'DAP', name: 'DAP', active: true },
  ];

  it('1. inquiry Incoterm CIF is displayed by Container Study as CIF', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      shipmentGroupIncoterm: 'DAP',
      snapshotIncoterm: 'DAP',
      incotermMaster: approvedIncoterms,
    });
    assert.equal(presented.label, 'CIF');
    assert.equal(presented.incotermCode, 'CIF');
    assert.equal(presented.configured, true);
  });

  it('2. inquiry Incoterm DAP is displayed by Container Study as DAP', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'DAP',
      shipmentGroupIncoterm: 'CIF',
      incotermMaster: approvedIncoterms,
    });
    assert.equal(presented.label, 'DAP');
    assert.equal(presented.incotermCode, 'DAP');
  });

  it('3. inquiry Incoterm FOB is displayed when FOB exists on the approved master', () => {
    const withFob = [...approvedIncoterms, { code: 'FOB', name: 'FOB', active: true }];
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'FOB',
      shipmentGroupIncoterm: 'DAP',
      incotermMaster: withFob,
    });
    assert.equal(presented.label, 'FOB');
    assert.equal(presented.incotermCode, 'FOB');
    const absent = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'FOB',
      incotermMaster: approvedIncoterms,
    });
    assert.equal(absent.incotermCode, null);
    assert.equal(absent.label, 'FOB — Not Configured');
  });

  it('4. changing inquiry Incoterm from DAP to CIF updates Container Study to CIF', () => {
    const before = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'DAP',
      shipmentGroupIncoterm: 'DAP',
      incotermMaster: approvedIncoterms,
    });
    const after = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      shipmentGroupIncoterm: 'DAP',
      incotermMaster: approvedIncoterms,
    });
    assert.equal(before.label, 'DAP');
    assert.equal(after.label, 'CIF');
    assert.equal(after.incotermCode, 'CIF');
  });

  it('5. Container Study never falls back to DAP when current inquiry value is CIF', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      metadataIncoterms: 'DAP',
      shipmentGroupIncoterm: 'DAP',
      snapshotIncoterm: 'DAP',
      localStorageIncoterm: 'DAP',
      customerPreferenceIncoterm: 'DAP',
      defaultIncoterm: 'DAP',
      incotermMaster: approvedIncoterms,
    });
    assert.equal(presented.label, 'CIF');
    assert.notEqual(presented.label, 'DAP');
    assert.equal(presented.incotermCode, 'CIF');
  });

  it('6. missing destination does not prevent physical packing calculation', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-1',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'p1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: expandPhysicalDrumsFromPlanLines([planLine('l1', 1500, 1)]),
      approvedContainerTypes: [approvedType('T1', 'Ready')],
      algorithmSupported: true,
      configurationReady: true,
      destinationPortCode: null,
      incotermCode: 'CIF',
      region: 'Europe',
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.issues.some((issue) => issue.field === 'destinationPortCode'), false);
  });

  it('7. Container Study presentation does not modify the inquiry Incoterm', () => {
    const inquiry = { incoterms: 'CIF' };
    presentCurrentInquiryIncoterm({
      inquiryIncoterms: inquiry.incoterms,
      shipmentGroupIncoterm: 'DAP',
      incotermMaster: approvedIncoterms,
    });
    assert.equal(inquiry.incoterms, 'CIF');
  });

  it('8. no localStorage value overrides the current inquiry Incoterm', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      localStorageIncoterm: 'DAP',
      incotermMaster: approvedIncoterms,
    });
    assert.equal(presented.label, 'CIF');
  });

  it('9. a stale ContainerStudyInputSnapshot is not the current display source', () => {
    const historicalSnapshot = Object.freeze({ incotermCode: 'DAP' });
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      snapshotIncoterm: historicalSnapshot.incotermCode,
      incotermMaster: approvedIncoterms,
    });
    assert.equal(presented.label, 'CIF');
    assert.equal(historicalSnapshot.incotermCode, 'DAP');
  });

  it('inactive master Incoterm remains readable on an existing inquiry', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      incotermMaster: [{ code: 'CIF', name: 'CIF', active: false }],
    });
    assert.equal(presented.incotermCode, 'CIF');
    assert.equal(presented.configured, true);
    const dropdown = buildApprovedMasterSelectState({
      currentValue: 'CIF',
      records: [
        { code: 'DAP', name: 'DAP', active: true },
        { code: 'CIF', name: 'CIF', active: false },
      ],
    });
    assert.equal(dropdown.selectedCode, 'CIF');
    assert.equal(dropdown.options.some((opt) => opt.value === 'DAP'), true);
  });

  const rotterdamMaster = [
    { code: 'DONCASTER', name: 'DONCASTER', active: true },
    { code: 'ROTTERDAM', name: 'Rotterdam', active: true },
    { code: 'SINES', name: 'Sines', active: true },
  ];
  const elandCombos = [
    {
      countryCode: 'UK',
      countryLabel: 'UK',
      incotermCode: 'DAP',
      destinationPortCode: 'DONCASTER',
      destinationPortName: 'DONCASTER',
      isDefault: false,
    },
    {
      countryCode: 'NL',
      countryLabel: 'NETHERLANDS',
      incotermCode: 'CIF',
      destinationPortCode: 'ROTTERDAM',
      destinationPortName: 'ROTTERDAM',
      isDefault: false,
    },
  ];

  it('B: saved destinationPortCode ROTTERDAM resolves CS destination Rotterdam, not Alexandria', () => {
    const resolved = resolveInquiryCanonicalDestination({
      destinationPortCode: 'ROTTERDAM',
      deliveryDestination: 'Alexandria',
      shipmentGroupDestinationPortCode: 'DONCASTER',
      customerDefaultDestinationPortCode: 'DONCASTER',
      destinationPortMaster: rotterdamMaster,
      deliveryCombinations: elandCombos,
      requestedIncoterm: 'CIF',
    });
    assert.equal(resolved.destinationPortCode, 'ROTTERDAM');
    assert.equal(resolved.displayName, 'Rotterdam');
    assert.equal(resolved.unmatchedRequested, null);
    const presented = describeInquiryShipmentDestination({
      requestedDestination: resolved.requestedDestination,
      destinationPortCode: resolved.destinationPortCode,
      destinationPortName: resolved.displayName,
    });
    assert.equal(presented.label, 'Rotterdam');
    assert.equal(presented.label.toLowerCase().includes('alexandria'), false);
  });

  it('C: Alexandria remains legacy free-text when no canonical destination is saved', () => {
    const resolved = resolveInquiryCanonicalDestination({
      destinationPortCode: null,
      deliveryDestination: 'Alexandria',
      shipmentGroupDestinationPortCode: 'ROTTERDAM',
      customerDefaultDestinationPortCode: 'ROTTERDAM',
      destinationPortMaster: rotterdamMaster,
      deliveryCombinations: elandCombos,
      requestedIncoterm: 'CIF',
    });
    assert.equal(resolved.destinationPortCode, null);
    assert.equal(resolved.unmatchedRequested, 'Alexandria');
    const presented = describeInquiryShipmentDestination({
      requestedDestination: resolved.requestedDestination,
      destinationPortCode: resolved.destinationPortCode,
    });
    assert.equal(presented.label, 'Alexandria — Not Configured');
    assert.equal(presented.calculationBlocked, false);
  });

  it('I: does not auto-select a default or first delivery combination', () => {
    const resolved = resolveInquiryCanonicalDestination({
      destinationPortCode: null,
      deliveryDestination: null,
      customerDefaultDestinationPortCode: 'ROTTERDAM',
      destinationPortMaster: rotterdamMaster,
      deliveryCombinations: elandCombos,
      requestedIncoterm: 'CIF',
    });
    assert.equal(resolved.destinationPortCode, null);
    assert.equal(resolved.unmatchedRequested, null);
  });
});
