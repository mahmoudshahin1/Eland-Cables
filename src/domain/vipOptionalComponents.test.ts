import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectVipOptionalWarnings,
  evaluateVipOptionalComponents,
} from './vipOptionalComponents';

describe('vipOptionalComponents (Task 05I-C zero-default)', () => {
  const baseMeta = {
    copperPriceRate: 9000,
    aluminiumPriceRate: 2500,
    deliveryDestination: 'Dubai',
    incoterms: 'CIF',
  };

  it('1. missing shipping → 0 + warning', () => {
    const components = evaluateVipOptionalComponents({
      commercialMetadata: { ...baseMeta, incoterms: 'CIF' },
      incoterms: 'CIF',
      currency: 'USD',
    });
    const shipping = components.find((c) => c.code === 'SHIPPING');
    assert.ok(shipping);
    assert.equal(shipping!.value, 0);
    assert.equal(shipping!.source, 'NOT_CONFIGURED');
    assert.equal(shipping!.reasonCode, 'SHIPPING_NOT_CONFIGURED');
    assert.equal(shipping!.hasWarning, true);
  });

  it('2. missing container data → 0 + warning (CONTAINER_DATA_NOT_CONFIGURED)', () => {
    const components = evaluateVipOptionalComponents({
      commercialMetadata: { ...baseMeta },
      incoterms: 'CIF',
      currency: 'USD',
    });
    const container = components.find((c) => c.code === 'CONTAINER_SHIPMENT');
    assert.ok(container);
    assert.equal(container!.value, 0);
    assert.equal(container!.reasonCode, 'CONTAINER_DATA_NOT_CONFIGURED');
    assert.equal(container!.hasWarning, true);
  });

  it('3. missing premium → 0 + warning', () => {
    const components = evaluateVipOptionalComponents({
      commercialMetadata: { ...baseMeta },
      incoterms: 'CIF',
      currency: 'USD',
    });
    const premium = components.find((c) => c.code === 'PREMIUM');
    assert.ok(premium);
    assert.equal(premium!.value, 0);
    assert.equal(premium!.reasonCode, 'PREMIUM_NOT_CONFIGURED');
    assert.equal(premium!.hasWarning, true);
  });

  it('4. not-applicable charge → 0 without warning', () => {
    const components = evaluateVipOptionalComponents({
      commercialMetadata: { ...baseMeta, incoterms: 'EXW' },
      incoterms: 'EXW',
      currency: 'USD',
    });
    const shipping = components.find((c) => c.code === 'SHIPPING');
    assert.ok(shipping);
    assert.equal(shipping!.value, 0);
    assert.equal(shipping!.source, 'NOT_APPLICABLE');
    assert.equal(shipping!.hasWarning, false);
    const warnings = collectVipOptionalWarnings(components);
    assert.ok(!warnings.some((w) => w.includes('Shipping')));
  });

  it('configured components have no warnings', () => {
    const components = evaluateVipOptionalComponents({
      commercialMetadata: {
        ...baseMeta,
        containerStudyReadiness: 'CONTAINER_STUDY_READY',
        shippingCost: 1200,
        metalPremium: 85,
        clearanceCost: 300,
        containerShipmentCost: 4500,
        commercialSurcharge: 50,
      },
      incoterms: 'CIF',
      currency: 'USD',
    });
    assert.equal(collectVipOptionalWarnings(components).length, 0);
    assert.equal(components.find((c) => c.code === 'SHIPPING')!.value, 1200);
    assert.equal(components.find((c) => c.code === 'CONTAINER_SHIPMENT')!.value, 4500);
  });
});
