import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyMarketMetalSourceOnUpdate,
  applySystemMarketMetalDefaultsOnCreate,
  MARKET_METAL_PRICE_UOM,
  parseMarketMetalPriceDefaultInput,
} from './marketMetalPriceDefaults';
import {
  buildInquiryMetalPricingFromMetadata,
  buildMetalPricingSnapshot,
  convertInquiryMetalPriceForConsumption,
  resolveMaterialUnitPrice,
} from './inquiryMetalPricing';
import { calculateCableManufacturingCost, CostingContext, CostingRequest } from './costingEngine';
import { StoredPriceRecord } from '../services/rawMaterialPriceGovernanceService';

const masterCopper: StoredPriceRecord = {
  id: 'PR-CR01',
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

const masterXl08: StoredPriceRecord = {
  id: 'PR-XL08',
  rawMaterialCode: 'XL08',
  price: 2.4,
  currency: 'USD',
  uom: 'kg',
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: new Date('2026-12-31'),
  supplier: 'Polymer',
  source: 'Contract',
  priceBasis: 'PER_KG',
  workflowStatus: 'APPROVED',
  isCurrent: true,
  revision: 1,
};

function contextWithHeaderMeta(meta: Record<string, unknown>): CostingContext {
  const base = contextWithHeader(Number(meta.copperPriceRate) || 14600);
  return {
    ...base,
    inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(meta, 'USD'),
  };
}

function contextWithHeader(copperRate: number, aluminiumRate = 3300): CostingContext {
  return {
    cable: { materialNumber: '10009487', description: 'Test' },
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
        consumption: 100,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
      {
        rawMaterialCode: 'XL08',
        rawMaterialDesc: 'XLPE',
        consumption: 10,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
    ],
    sourceBomLines: [],
    bomConflicts: [],
    rawMaterials: new Map([
      ['CR01', { code: 'CR01', description: 'Copper Rod', uom: 'kg', pricingCategory: 'MARKET_METAL_COPPER' }],
      ['XL08', { code: 'XL08', description: 'XLPE', uom: 'kg', pricingCategory: 'STANDARD_RAW_MATERIAL' }],
    ]),
    rawMaterialPricingCategories: new Map([
      ['CR01', 'MARKET_METAL_COPPER'],
      ['XL08', 'STANDARD_RAW_MATERIAL'],
    ]),
    inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
      {
        copperPriceRate: copperRate,
        copperPriceUom: MARKET_METAL_PRICE_UOM,
        aluminiumPriceRate: aluminiumRate,
        aluminiumPriceUom: MARKET_METAL_PRICE_UOM,
      },
      'USD'
    ),
    approvedPrices: [masterCopper, masterXl08],
  };
}

const req: CostingRequest = {
  materialNumber: '10009487',
  costingDate: new Date('2026-08-20'),
  quantity: 1,
  lengthMeters: 1000,
  currency: 'USD',
};

describe('Market metal price defaults — domain', () => {
  it('parses ACTIVE copper/aluminium defaults as USD/MT', () => {
    const copper = parseMarketMetalPriceDefaultInput({
      metalType: 'COPPER',
      priceRate: 14600,
      status: 'ACTIVE',
      effectiveFrom: '2026-01-01',
    });
    assert.equal(copper.metalType, 'COPPER');
    assert.equal(copper.priceRate, 14600);
    assert.equal(copper.priceUom, MARKET_METAL_PRICE_UOM);

    const aluminium = parseMarketMetalPriceDefaultInput({
      metalType: 'ALUMINIUM',
      priceRate: 3300,
      status: 'ACTIVE',
      effectiveFrom: '2026-01-01',
    });
    assert.equal(aluminium.metalType, 'ALUMINIUM');
    assert.equal(aluminium.priceRate, 3300);
  });

  it('copies active system defaults onto new inquiry metadata', () => {
    const meta = applySystemMarketMetalDefaultsOnCreate(
      {},
      {
        copper: {
          id: 'def-cu',
          metalType: 'COPPER',
          priceRate: 14600,
          priceUom: MARKET_METAL_PRICE_UOM,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
        aluminium: {
          id: 'def-al',
          metalType: 'ALUMINIUM',
          priceRate: 3300,
          priceUom: MARKET_METAL_PRICE_UOM,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
      }
    );
    assert.equal(meta.copperPriceRate, 14600);
    assert.equal(meta.aluminiumPriceRate, 3300);
    assert.equal(meta.copperPriceSource, 'SYSTEM_DEFAULT');
    assert.equal(meta.aluminiumPriceSource, 'SYSTEM_DEFAULT');
    assert.equal(meta.copperPriceUom, MARKET_METAL_PRICE_UOM);
    const original = meta.originalSystemDefault as { copper: { priceRate: number }; aluminium: { priceRate: number } };
    assert.equal(original.copper.priceRate, 14600);
    assert.equal(original.aluminium.priceRate, 3300);
  });

  it('does not overwrite explicit create-time rates (inquiry override)', () => {
    const meta = applySystemMarketMetalDefaultsOnCreate(
      { copperPriceRate: 16000, aluminiumPriceRate: 3500 },
      {
        copper: {
          id: 'def-cu',
          metalType: 'COPPER',
          priceRate: 14600,
          priceUom: MARKET_METAL_PRICE_UOM,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
        aluminium: {
          id: 'def-al',
          metalType: 'ALUMINIUM',
          priceRate: 3300,
          priceUom: MARKET_METAL_PRICE_UOM,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
      }
    );
    assert.equal(meta.copperPriceRate, 16000);
    assert.equal(meta.aluminiumPriceRate, 3500);
    assert.equal(meta.copperPriceSource, 'INQUIRY_OVERRIDE');
    assert.equal(meta.aluminiumPriceSource, 'INQUIRY_OVERRIDE');
  });

  it('marks INQUIRY_OVERRIDE on update when rate differs from create-time snapshot', () => {
    const existing = applySystemMarketMetalDefaultsOnCreate(
      {},
      {
        copper: {
          id: 'def-cu',
          metalType: 'COPPER',
          priceRate: 14600,
          priceUom: MARKET_METAL_PRICE_UOM,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
        aluminium: null,
      }
    );
    const updated = applyMarketMetalSourceOnUpdate(existing, { copperPriceRate: 16000 });
    assert.equal(updated.copperPriceSource, 'INQUIRY_OVERRIDE');
    assert.equal(updated.copperPriceRate, 16000);
    const original = updated.originalSystemDefault as { copper: { priceRate: number } };
    assert.equal(original.copper.priceRate, 14600);
  });

  it('7 costing uses inquiry override 16000 not system default', () => {
    const res = calculateCableManufacturingCost(req, contextWithHeader(16000));
    assert.equal(res.success, true);
    const copper = res.costingLines.find((l) => l.rawMaterialCode === 'CR01');
    assert.ok(copper);
    assert.equal(copper!.pricingSource, 'INQUIRY_HEADER');
    assert.equal(copper!.inquiryHeaderPrice, 16000);
    assert.equal(copper!.price, 16);
  });

  it('8 costing uses inherited header 14600 when no override', () => {
    const res = calculateCableManufacturingCost(req, contextWithHeader(14600));
    assert.equal(res.success, true);
    const copper = res.costingLines.find((l) => l.rawMaterialCode === 'CR01');
    assert.equal(copper!.inquiryHeaderPrice, 14600);
    assert.equal(copper!.price, 14.6);
  });

  it('9 market metal does not use RawMaterialPrice when header present', () => {
    const resolved = resolveMaterialUnitPrice({
      rawMaterialCode: 'CR01',
      pricingCategory: 'MARKET_METAL_COPPER',
      consumptionUom: 'kg',
      costingCurrency: 'USD',
      costingDate: new Date('2026-08-20'),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
        { copperPriceRate: 14600, copperPriceUom: 'USD/MT' },
        'USD'
      ),
      approvedPrices: [masterCopper],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.pricingSource, 'INQUIRY_HEADER');
    assert.equal(resolved.appliedPrice, 14.6);
    assert.equal(resolved.masterPrice, 9.5);
  });

  it('10 non-market RM still uses RawMaterialPrice master', () => {
    const resolved = resolveMaterialUnitPrice({
      rawMaterialCode: 'XL08',
      pricingCategory: 'STANDARD_RAW_MATERIAL',
      consumptionUom: 'kg',
      costingCurrency: 'USD',
      costingDate: new Date('2026-08-20'),
      inquiryMetalPricing: buildInquiryMetalPricingFromMetadata(
        { copperPriceRate: 14600, aluminiumPriceRate: 3300 },
        'USD'
      ),
      approvedPrices: [masterXl08],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.pricingSource, 'RAW_MATERIAL_MASTER');
    assert.equal(resolved.appliedPrice, 2.4);
  });

  it('11 USD/MT converts to kg for consumption (14600 → 14.6)', () => {
    const converted = convertInquiryMetalPriceForConsumption(14600, 'USD/MT', 'kg');
    assert.ok(!('error' in converted));
    if ('error' in converted) return;
    assert.equal(converted.price, 14.6);
  });

  it('12 Direct RM uses header metal price only (no premium/shipping/clearance in line)', () => {
    const res = calculateCableManufacturingCost(req, contextWithHeader(14600));
    assert.equal(res.success, true);
    const copper = res.costingLines.find((l) => l.rawMaterialCode === 'CR01')!;
    assert.equal(copper.price, 14.6);
    assert.equal(copper.lineCost, 1460);
    assert.equal(copper.pricingSource, 'INQUIRY_HEADER');
  });

  it('R traceability — inherited system default is labelled INQUIRY_SYSTEM_DEFAULT', () => {
    const res = calculateCableManufacturingCost(
      req,
      contextWithHeaderMeta({
        copperPriceRate: 14600,
        copperPriceUom: MARKET_METAL_PRICE_UOM,
        copperPriceSource: 'SYSTEM_DEFAULT',
      })
    );
    assert.equal(res.success, true);
    const copper = res.costingLines.find((l) => l.rawMaterialCode === 'CR01')!;
    assert.equal(copper.pricingSource, 'INQUIRY_SYSTEM_DEFAULT');
    assert.equal(copper.price, 14.6);
  });

  it('R traceability — inquiry override is labelled INQUIRY_OVERRIDE', () => {
    const res = calculateCableManufacturingCost(
      req,
      contextWithHeaderMeta({
        copperPriceRate: 16000,
        copperPriceUom: MARKET_METAL_PRICE_UOM,
        copperPriceSource: 'INQUIRY_OVERRIDE',
      })
    );
    assert.equal(res.success, true);
    const copper = res.costingLines.find((l) => l.rawMaterialCode === 'CR01')!;
    assert.equal(copper.pricingSource, 'INQUIRY_OVERRIDE');
    assert.equal(copper.price, 16);
  });

  it('R traceability — missing header source falls back to INQUIRY_HEADER; standard RM stays RAW_MATERIAL_MASTER', () => {
    const res = calculateCableManufacturingCost(
      req,
      contextWithHeaderMeta({ copperPriceRate: 14600, copperPriceUom: MARKET_METAL_PRICE_UOM })
    );
    assert.equal(res.success, true);
    const copper = res.costingLines.find((l) => l.rawMaterialCode === 'CR01')!;
    const xlpe = res.costingLines.find((l) => l.rawMaterialCode === 'XL08')!;
    assert.equal(copper.pricingSource, 'INQUIRY_HEADER');
    assert.equal(xlpe.pricingSource, 'RAW_MATERIAL_MASTER');
  });

  it('13 snapshot preserves applied inquiry metal price', () => {
    const pricing = buildInquiryMetalPricingFromMetadata(
      { copperPriceRate: 14600, copperPriceUom: 'USD/MT', aluminiumPriceRate: 3300, aluminiumPriceUom: 'USD/MT' },
      'USD'
    );
    const snapshot = buildMetalPricingSnapshot(pricing);
    assert.equal(snapshot.copperPrice, 14600);
    assert.equal(snapshot.aluminiumPrice, 3300);
    assert.equal(snapshot.copperPriceUom, 'MT');
  });
});
