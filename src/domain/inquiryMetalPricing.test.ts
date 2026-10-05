import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInquiryMetalPricingFromMetadata,
  buildMetalPricingSnapshot,
  convertInquiryMetalPriceForConsumption,
  COPPER_MARKET_PRICE_REQUIRED_MESSAGE,
  ALUMINIUM_MARKET_PRICE_REQUIRED_MESSAGE,
  INQUIRY_COPPER_PRICE_REQUIRED,
  resolveMaterialUnitPrice,
} from './inquiryMetalPricing';
import {
  calculateCableManufacturingCost,
  CostingContext,
  CostingRequest,
  evaluateCostingGates,
} from './costingEngine';
import { StoredPriceRecord } from '../services/rawMaterialPriceGovernanceService';

const masterCopperPrice: StoredPriceRecord = {
  id: 'PR-CR01-01',
  rawMaterialCode: 'CR01',
  price: 9.5,
  currency: 'USD',
  uom: 'kg',
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: new Date('2026-12-31'),
  supplier: 'LME',
  source: 'Index',
  priceBasis: 'PER_KG',
  workflowStatus: 'APPROVED',
  isCurrent: true,
  revision: 1,
};

const masterAluminiumPrice: StoredPriceRecord = {
  id: 'PR-AL01-01',
  rawMaterialCode: 'AL01',
  price: 2.8,
  currency: 'USD',
  uom: 'kg',
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: new Date('2026-12-31'),
  supplier: 'LME',
  source: 'Index',
  priceBasis: 'PER_KG',
  workflowStatus: 'APPROVED',
  isCurrent: true,
  revision: 1,
};

const masterXl08Price: StoredPriceRecord = {
  id: 'PR-XL08-01',
  rawMaterialCode: 'XL08',
  price: 2.4,
  currency: 'USD',
  uom: 'kg',
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: new Date('2026-12-31'),
  supplier: 'Polymer Supplier',
  source: 'Contract',
  priceBasis: 'PER_KG',
  workflowStatus: 'APPROVED',
  isCurrent: true,
  revision: 1,
};

function metalContext(overrides: Partial<CostingContext> = {}): CostingContext {
  return {
    cable: { materialNumber: '10009487', description: 'Test Cable' },
    engineeringMapping: {
      status: 'APPROVED',
      revision: 1,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: '16',
      cores: '1',
      insulation: 'XLPE',
    },
    governedBomLines: [
      {
        rawMaterialCode: 'CR01',
        rawMaterialDesc: 'Copper Rod',
        consumption: 135.23,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
      {
        rawMaterialCode: 'XL08',
        rawMaterialDesc: 'XLPE Compound',
        consumption: 11.92,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
    ],
    sourceBomLines: [],
    bomConflicts: [],
    rawMaterials: new Map([
      ['CR01', { code: 'CR01', description: 'Copper Rod', uom: 'kg', pricingCategory: 'MARKET_METAL_COPPER' }],
      ['XL08', { code: 'XL08', description: 'XLPE Compound', uom: 'kg', pricingCategory: 'STANDARD_RAW_MATERIAL' }],
    ]),
    rawMaterialPricingCategories: new Map([
      ['CR01', 'MARKET_METAL_COPPER'],
      ['XL08', 'STANDARD_RAW_MATERIAL'],
    ]),
    inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
      { copperPriceRate: 10250, copperPriceUom: 'MT', aluminiumPriceRate: 2850, aluminiumPriceUom: 'MT' },
      'USD'
    ),
    approvedPrices: [masterCopperPrice, masterXl08Price],
    ...overrides,
  };
}

const costingReq: CostingRequest = {
  materialNumber: '10009487',
  costingDate: new Date('2026-08-20'),
  quantity: 1,
  lengthMeters: 1000,
  currency: 'USD',
};

describe('Inquiry metal pricing', () => {
  it('normalizes 14600 USD/MT inquiry copper to 14.6 USD/kg', () => {
    const converted = convertInquiryMetalPriceForConsumption(14600, 'MT', 'kg');
    assert.ok(!('error' in converted));
    if ('error' in converted) return;
    assert.equal(converted.price, 14.6);
  });

  it('uses approved standard RM price in MT against kg BOM', () => {
    const resolved = resolveMaterialUnitPrice({
      rawMaterialCode: 'HF27',
      pricingCategory: 'STANDARD_RAW_MATERIAL',
      consumptionUom: 'kg',
      costingCurrency: 'USD',
      costingDate: new Date('2026-08-20'),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
        { copperPriceRate: 14600, copperPriceUom: 'MT' },
        'USD'
      ),
      approvedPrices: [
        {
          ...masterXl08Price,
          id: 'PR-HF27-01',
          rawMaterialCode: 'HF27',
          price: 4100,
          currency: 'EUR',
          uom: 'MT',
          priceBasis: 'PER_TON',
        },
      ],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.pricingSource, 'RAW_MATERIAL_MASTER');
    assert.equal(resolved.appliedPrice, 4100);
    assert.equal(resolved.appliedUom, 'MT');
  });

  it('converts MT header price to kg consumption UOM', () => {
    const converted = convertInquiryMetalPriceForConsumption(10250, 'MT', 'kg');
    assert.ok(!('error' in converted));
    if ('error' in converted) return;
    assert.equal(converted.price, 10.25);
    assert.equal(converted.priceUom, 'kg');
  });

  it('uses inquiry header copper price instead of master price', () => {
    const resolved = resolveMaterialUnitPrice({
      rawMaterialCode: 'CR01',
      pricingCategory: 'MARKET_METAL_COPPER',
      consumptionUom: 'kg',
      costingCurrency: 'USD',
      costingDate: new Date('2026-08-20'),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
        { copperPriceRate: 10250, copperPriceUom: 'MT' },
        'USD'
      ),
      approvedPrices: [masterCopperPrice],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.pricingSource, 'INQUIRY_HEADER');
    assert.equal(resolved.appliedPrice, 10.25);
    assert.equal(resolved.masterPrice, 9.5);
    assert.equal(resolved.inquiryHeaderPrice, 10250);
  });

  it('keeps inquiry-header copper in USD when the inquiry currency is EUR', () => {
    const resolved = resolveMaterialUnitPrice({
      rawMaterialCode: 'CR01',
      pricingCategory: 'MARKET_METAL_COPPER',
      consumptionUom: 'kg',
      costingCurrency: 'EUR',
      costingDate: new Date('2026-08-20'),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
        { copperPriceRate: 14600, copperPriceUom: 'MT', copperPriceCurrency: 'USD' },
        'EUR'
      ),
      approvedPrices: [masterCopperPrice],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.appliedCurrency, 'USD');
    assert.equal(resolved.appliedPrice, 14.6);
  });

  it('uses inquiry header aluminium price instead of master price', () => {
    const resolved = resolveMaterialUnitPrice({
      rawMaterialCode: 'AL01',
      pricingCategory: 'MARKET_METAL_ALUMINIUM',
      consumptionUom: 'kg',
      costingCurrency: 'USD',
      costingDate: new Date('2026-08-20'),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
        { aluminiumPriceRate: 2850, aluminiumPriceUom: 'MT' },
        'USD'
      ),
      approvedPrices: [masterAluminiumPrice],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.pricingSource, 'INQUIRY_HEADER');
    assert.equal(resolved.appliedPrice, 2.85);
    assert.equal(resolved.masterPrice, 2.8);
  });

  it('blocks costing when copper header price is missing', () => {
    const context = metalContext({
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata({ aluminiumPriceRate: 2850 }, 'USD'),
    });
    const gate = evaluateCostingGates('10009487', new Date('2026-08-20'), 'USD', context);
    assert.equal(gate.ready, false);
    assert.ok(gate.blockingReasons.some((r) => r.includes(COPPER_MARKET_PRICE_REQUIRED_MESSAGE)));
    assert.equal(gate.errorCode, INQUIRY_COPPER_PRICE_REQUIRED);
  });

  it('blocks costing when aluminium header price is missing for aluminium BOM line', () => {
    const context = metalContext({
      governedBomLines: [
        {
          rawMaterialCode: 'AL01',
          rawMaterialDesc: 'Aluminium Rod',
          consumption: 80,
          uom: 'kg',
          bomVersion: 1,
          status: 'APPROVED',
        },
      ],
      rawMaterials: new Map([
        ['AL01', { code: 'AL01', description: 'Aluminium Rod', uom: 'kg', pricingCategory: 'MARKET_METAL_ALUMINIUM' }],
      ]),
      rawMaterialPricingCategories: new Map([['AL01', 'MARKET_METAL_ALUMINIUM']]),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata({ copperPriceRate: 10250 }, 'USD'),
      approvedPrices: [masterAluminiumPrice],
    });
    const gate = evaluateCostingGates('10009487', new Date('2026-08-20'), 'USD', context);
    assert.equal(gate.ready, false);
    assert.ok(gate.blockingReasons.some((r) => r.includes(ALUMINIUM_MARKET_PRICE_REQUIRED_MESSAGE)));
  });

  it('continues using raw material master for non-market materials', () => {
    const resolved = resolveMaterialUnitPrice({
      rawMaterialCode: 'XL08',
      pricingCategory: 'STANDARD_RAW_MATERIAL',
      consumptionUom: 'kg',
      costingCurrency: 'USD',
      costingDate: new Date('2026-08-20'),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
        { copperPriceRate: 10250, aluminiumPriceRate: 2850 },
        'USD'
      ),
      approvedPrices: [masterXl08Price],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.pricingSource, 'RAW_MATERIAL_MASTER');
    assert.equal(resolved.appliedPrice, 2.4);
  });

  it('calculates cable material cost with inquiry copper override', () => {
    const res = calculateCableManufacturingCost(costingReq, metalContext());
    assert.equal(res.success, true);
    const copperLine = res.costingLines.find((l) => l.rawMaterialCode === 'CR01');
    assert.ok(copperLine);
    assert.equal(copperLine!.pricingSource, 'INQUIRY_HEADER');
    assert.equal(copperLine!.price, 10.25);
    assert.equal(copperLine!.masterPrice, 9.5);
    assert.equal(copperLine!.inquiryHeaderPrice, 10250);
    // 135.23 kg @ 10.25 = 1386.11; XL08 11.92 @ 2.4 = 28.61 => 1414.72
    assert.equal(res.materialCost, 1414.72);
  });

  it('snapshots inquiry header metal prices for costing runs', () => {
    const pricing = buildInquiryMetalPricingFromMetadata(
      { copperPriceRate: 10250, copperPriceUom: 'MT', aluminiumPriceRate: 2850, aluminiumPriceUom: 'MT' },
      'USD'
    );
    const snapshot = buildMetalPricingSnapshot(pricing);
    assert.deepEqual(snapshot, {
      inquiryCurrency: 'USD',
      copperPrice: 10250,
      copperPriceUom: 'MT',
      copperPriceCurrency: 'USD',
      copperPriceSource: null,
      aluminiumPrice: 2850,
      aluminiumPriceUom: 'MT',
      aluminiumPriceCurrency: 'USD',
      aluminiumPriceSource: null,
    });
  });

  it('produces different material cost when inquiry copper price changes', () => {
    const first = calculateCableManufacturingCost(
      costingReq,
      metalContext({
        inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
          { copperPriceRate: 10250, copperPriceUom: 'MT', aluminiumPriceRate: 2850, aluminiumPriceUom: 'MT' },
          'USD'
        ),
      })
    );
    const second = calculateCableManufacturingCost(
      costingReq,
      metalContext({
        inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
          { copperPriceRate: 11000, copperPriceUom: 'MT', aluminiumPriceRate: 2850, aluminiumPriceUom: 'MT' },
          'USD'
        ),
      })
    );
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.notEqual(first.materialCost, second.materialCost);
    assert.equal(second.costingLines.find((l) => l.rawMaterialCode === 'CR01')!.inquiryHeaderPrice, 11000);
  });
});
