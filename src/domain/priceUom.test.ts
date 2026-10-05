import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalizePriceUom,
  convertPriceForConsumptionUom,
  equivalentPricePerKg,
} from './priceUom';

describe('priceUom', () => {
  it('canonicalizes KG, MT, PCS, and M', () => {
    assert.equal(canonicalizePriceUom('kg'), 'KG');
    assert.equal(canonicalizePriceUom('MT'), 'MT');
    assert.equal(canonicalizePriceUom('ton'), 'MT');
    assert.equal(canonicalizePriceUom('PCS'), 'PCS');
    assert.equal(canonicalizePriceUom('m'), 'M');
    assert.equal(canonicalizePriceUom(''), null);
  });

  it('normalizes 14600 USD/MT to 14.6 USD/kg', () => {
    const res = convertPriceForConsumptionUom(14600, 'MT', 'kg');
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.price, 14.6);
  });

  it('normalizes 4100 EUR/MT to 4.1 EUR/kg', () => {
    const res = convertPriceForConsumptionUom(4100, 'EUR/MT', 'kg');
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.price, 4.1);
  });

  it('normalizes 2600 EUR/MT to 2.6 EUR/kg', () => {
    const res = convertPriceForConsumptionUom(2600, 'MT', 'kg');
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.price, 2.6);
  });

  it('blocks PCS to KG conversion', () => {
    const res = convertPriceForConsumptionUom(200000, 'PCS', 'kg');
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'PRICE_UOM_INCOMPATIBLE');
  });

  it('requires a price UOM', () => {
    const res = convertPriceForConsumptionUom(4100, '', 'kg');
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'PRICE_UOM_REQUIRED');
  });

  it('shows equivalent per kg for UI', () => {
    const eq = equivalentPricePerKg(4100, 'MT', 'EUR');
    assert.ok(eq);
    assert.equal(eq!.value, 4.1);
    assert.equal(eq!.label, '4.1000 EUR/kg');
  });
});
