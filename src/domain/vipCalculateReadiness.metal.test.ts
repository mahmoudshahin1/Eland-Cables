import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateVipInquiryReadiness } from './vipCalculateReadiness';

const line = {
  lineId: 'line-1',
  lineNumber: 1,
  v2CurrentSnapshotId: 'snap-1',
  v2CurrentCuttingPlanId: 'cut-1',
  v2CurrentDrumPlanId: 'drum-1',
  configurationSnapshot: {
    id: 'snap-1',
    validationStatus: 'EXISTING_APPROVED',
    flowState: 'VALID',
    bomGovernanceBlocked: false,
    unresolvedBomConflictCount: 0,
    engineeringStatus: 'Released',
  },
  cuttingPlan: {
    id: 'cut-1',
    validationStatus: 'VALID',
    configurationSnapshotId: 'snap-1',
  },
  drumPlan: {
    id: 'drum-1',
    lifecycleStatus: 'CONFIRMED',
    validationStatus: 'VALID',
  },
};

describe('metal price gaps do not block engineering readiness', () => {
  it('warns for a missing copper price and still evaluates the cable line', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: { metalPriceDate: '2026-11-08' },
      copperPriceRate: '',
      aluminiumPriceRate: 2500,
      deliveryDestination: 'Rotterdam',
      incoterms: 'CIF',
      lines: [line],
    });
    assert.equal(result.ready, true);
    assert.equal(result.blockingReasons.length, 0);
    const copper = result.gates.find((gate) => gate.code === 'COPPER_PRICE_REQUIRED');
    assert.equal(copper?.status, 'WARN');
    assert.match(copper?.message || '', /2026-11-08/);
    assert.equal(result.gates.some((gate) => gate.code === 'ALUMINIUM_PRICE_REQUIRED'), false);
    assert.ok(result.gates.some((gate) => gate.gate === 'DRUM_PLAN' && gate.status === 'PASS'));
  });

  it('warns for a missing aluminium price without blocking a present copper price', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: { metalPriceDate: '2026-11-08' },
      copperPriceRate: 9000,
      aluminiumPriceRate: null,
      deliveryDestination: 'Rotterdam',
      incoterms: 'CIF',
      lines: [line],
    });
    assert.equal(result.ready, true);
    assert.equal(result.gates.find((gate) => gate.code === 'ALUMINIUM_PRICE_REQUIRED')?.status, 'WARN');
    assert.equal(result.gates.some((gate) => gate.code === 'COPPER_PRICE_REQUIRED'), false);
  });

  it('warns for both missing prices and does not treat that as an engineering block', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: {},
      deliveryDestination: 'Rotterdam',
      incoterms: 'CIF',
      lines: [line],
    });
    assert.equal(result.ready, true);
    assert.equal(result.gates.filter((gate) => gate.status === 'WARN' && gate.gate === 'HEADER_COMMERCIAL_CONFIG').length, 2);
    assert.equal(result.blockingReasons.some((reason) => reason.includes('Copper Price')), false);
  });

  it('keeps destination and engineering failures blocking when prices exist', () => {
    const missingDestination = evaluateVipInquiryReadiness({
      commercialMetadata: {},
      copperPriceRate: 9000,
      aluminiumPriceRate: 2500,
      incoterms: 'CIF',
      lines: [line],
    });
    assert.equal(missingDestination.ready, false);
    assert.ok(missingDestination.blockingReasons.some((reason) => reason.includes('Destination')));

    const unconfirmed = evaluateVipInquiryReadiness({
      commercialMetadata: {},
      copperPriceRate: 9000,
      aluminiumPriceRate: 2500,
      deliveryDestination: 'Rotterdam',
      incoterms: 'CIF',
      lines: [{ ...line, drumPlan: { ...line.drumPlan, lifecycleStatus: 'DRAFT' } }],
    });
    assert.equal(unconfirmed.ready, false);
    assert.ok(unconfirmed.blockingReasons.some((reason) => reason.includes('drum plan')));
  });

  it('reads copper from a Cu cable description when the conductor field is empty', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: {},
      copperPriceRate: 9000,
      aluminiumPriceRate: '',
      deliveryDestination: 'Lisbon',
      incoterms: 'CIF',
      lines: [{ ...line, cableDescription: 'Cu / XLPE / LSHF 0.6/1 kV' }],
    });
    assert.equal(result.gates.some((gate) => gate.code === 'ALUMINIUM_PRICE_REQUIRED'), false);
    assert.equal(result.gates.some((gate) => gate.code === 'COPPER_PRICE_REQUIRED'), false);
  });

  it('requires only copper when every cable conductor is copper', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: { metalPriceDate: '2026-11-08' },
      copperPriceRate: '',
      aluminiumPriceRate: '',
      deliveryDestination: 'Lisbon',
      incoterms: 'CIF',
      lines: [{ ...line, conductor: 'Copper', cableDescription: 'Cu / XLPE' }],
    });
    assert.equal(result.ready, true);
    assert.equal(result.gates.find((gate) => gate.code === 'COPPER_PRICE_REQUIRED')?.status, 'WARN');
    assert.equal(result.gates.some((gate) => gate.code === 'ALUMINIUM_PRICE_REQUIRED'), false);
  });

  it('requires only aluminium when the cable description says aluminium and conductor is empty', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: {},
      copperPriceRate: '',
      aluminiumPriceRate: 2500,
      deliveryDestination: 'Lisbon',
      incoterms: 'CIF',
      lines: [{ ...line, conductor: '', cableDescription: 'Al / XLPE 1 kV' }],
    });
    assert.equal(result.gates.some((gate) => gate.code === 'COPPER_PRICE_REQUIRED'), false);
    assert.equal(result.gates.some((gate) => gate.code === 'ALUMINIUM_PRICE_REQUIRED'), false);
  });

  it('requires both prices when the inquiry mixes copper and aluminium cables', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: { metalPriceDate: '2026-11-08' },
      deliveryDestination: 'Lisbon',
      incoterms: 'CIF',
      lines: [
        { ...line, conductor: 'Copper', cableDescription: 'Cu cable' },
        { ...line, lineId: 'line-2', lineNumber: 2, conductor: 'Aluminum', cableDescription: 'Al cable' },
      ],
    });
    assert.equal(result.gates.filter((gate) => gate.status === 'WARN' && gate.gate === 'HEADER_COMMERCIAL_CONFIG').length, 2);
  });
});
