import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateCableManufacturingCost,
  calculateMaterialLineCost,
  CostingContext,
  CostingRequest,
} from './costingEngine';

describe('CostingEngine Domain Unit Tests', () => {
  const sampleContext: CostingContext = {
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
      ['CR01', { code: 'CR01', description: 'Copper Rod', uom: 'kg' }],
      ['XL08', { code: 'XL08', description: 'XLPE Compound', uom: 'kg' }],
    ]),
    approvedPrices: [
      {
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
      },
      {
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
      },
    ],
  };

  it('calculates material line cost correctly for 1 km', () => {
    // 135.23 kg/km * 1 km * 1 qty @ 9.50 USD/kg = 1284.685 -> 1284.69 USD
    const line = calculateMaterialLineCost(135.23, 1000, 1, 'kg', 9.5, 'kg', 'PER_KG');
    assert.equal(line.lineCost, 1284.69);
    assert.equal(line.totalConsumption, 135.23);
  });

  it('calculates material cost with ton-to-kg conversion when basis is PER_TON', () => {
    const line = calculateMaterialLineCost(135.23, 1000, 1, 'kg', 9500, 'ton', 'PER_TON');
    assert.equal(line.lineCost, 1284.69);
  });

  it('normalizes 14600 USD/MT to 14.6 USD/kg for kg BOM consumption', () => {
    const line = calculateMaterialLineCost(135.23, 1000, 1, 'kg', 14600, 'MT', 'PER_TON');
    assert.equal(line.lineCost, 1974.36);
  });

  it('normalizes 4100 EUR/MT to 4.1 EUR/kg', () => {
    const line = calculateMaterialLineCost(72.9, 1000, 1, 'kg', 4100, 'MT', 'PER_TON');
    assert.equal(line.lineCost, 298.89);
  });

  it('blocks PCS price against kg BOM', () => {
    assert.throws(
      () => calculateMaterialLineCost(135.23, 1000, 1, 'kg', 10, 'PCS', 'PER_PCS'),
      (err: Error & { code?: string }) => err.code === 'PRICE_UOM_INCOMPATIBLE'
    );
  });

  it('does not apply scrap to Direct RM cost', () => {
    const withoutScrap = calculateMaterialLineCost(135.23, 1000, 1, 'kg', 14600, 'MT', 'PER_TON');
    const withScrapIfApplied = Math.round(135.23 * 1.015 * 14.6 * 100) / 100;
    assert.equal(withoutScrap.lineCost, 1974.36);
    assert.notEqual(withoutScrap.lineCost, withScrapIfApplied);
  });

  it('does not 1000× inflate an MT list price stored against kg consumption', () => {
    const inflated = calculateMaterialLineCost(11.92, 1000, 1, 'kg', 1900, 'kg', 'PER_KG');
    const normalized = calculateMaterialLineCost(11.92, 1000, 1, 'kg', 1900, 'MT', 'PER_TON');
    assert.equal(normalized.lineCost, 22.65);
    assert.ok(inflated.lineCost / normalized.lineCost > 900);
  });

  it('calculates multi-material total manufacturing material cost correctly', () => {
    const req: CostingRequest = {
      materialNumber: '10009487',
      costingDate: new Date('2026-08-20'),
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
    };

    const res = calculateCableManufacturingCost(req, sampleContext);
    assert.equal(res.success, true);
    assert.equal(res.costingStatus, 'INCOMPLETE');
    // CR01: 135.23 * 9.50 = 1284.69
    // XL08: 11.92 * 2.40 = 28.61
    // Total: 1313.30 USD
    assert.equal(res.materialCost, 1313.3);
    assert.equal(res.costingLines.length, 2);
    assert.equal(res.processCostStatus, 'NOT_CONFIGURED');
    assert.equal(res.overheadCostStatus, 'NOT_CONFIGURED');
    assert.equal(res.manufacturingCost, null);
  });

  it('does not add Premium, Shipping or Clearance into Direct RM Cost (Option B — LME/Base only)', () => {
    const req: CostingRequest = {
      materialNumber: '10009487',
      costingDate: new Date('2026-08-20'),
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
    };
    const withUnusedLanded = {
      ...sampleContext,
      metalCostComponents: [
        { metal: 'COPPER', componentType: 'PREMIUM', value: 555 },
        { metal: 'COPPER', componentType: 'SHIPPING', value: 80 },
        { metal: 'COPPER', componentType: 'CLEARANCE', value: 40 },
      ],
    } as CostingContext;
    const baseline = calculateCableManufacturingCost(req, sampleContext);
    const withMaster = calculateCableManufacturingCost(req, withUnusedLanded);
    assert.equal(baseline.materialCost, 1313.3);
    assert.equal(withMaster.materialCost, baseline.materialCost);
    assert.equal(withMaster.costingLines[0].lineCost, 1284.69);
  });

  it('costs PCS BOM lines with an approved PER_PCS price and does not treat them as kg', () => {
    const pcsContext: CostingContext = {
      ...sampleContext,
      governedBomLines: [
        {
          rawMaterialCode: 'TAG-01',
          rawMaterialDesc: 'Identification tag',
          consumption: 2,
          uom: 'PCS',
          bomVersion: 1,
          status: 'APPROVED',
        },
      ],
      rawMaterials: new Map([
        ['TAG-01', { code: 'TAG-01', description: 'Identification tag', uom: 'PCS' }],
      ]),
      approvedPrices: [
        {
          id: 'PR-TAG-PCS',
          rawMaterialCode: 'TAG-01',
          price: 200000,
          currency: 'LE',
          uom: 'PCS',
          effectiveFrom: null,
          effectiveTo: null,
          supplier: null,
          source: null,
          priceBasis: 'PER_PCS',
          workflowStatus: 'APPROVED',
          isCurrent: true,
          revision: 1,
        },
      ],
    };

    const res = calculateCableManufacturingCost(
      { materialNumber: '10009487', currency: 'LE', quantity: 1, lengthMeters: 1000 },
      pcsContext
    );
    assert.equal(res.success, true);
    assert.equal(res.costingLines[0].lineCost, 400000);
    assert.equal(res.costingLines[0].consumptionUom, 'PCS');
    assert.equal(res.costingLines[0].priceBasis, 'PER_PCS');
  });

  it('excludes end-cap packing from Direct Raw Material Cost even when a PCS price exists', () => {
    const pcsContext: CostingContext = {
      ...sampleContext,
      governedBomLines: [
        {
          rawMaterialCode: 'A-ECAP10',
          rawMaterialDesc: 'End cap',
          consumption: 2,
          uom: 'PCS',
          bomVersion: 1,
          status: 'APPROVED',
        },
      ],
      rawMaterials: new Map([
        ['A-ECAP10', { code: 'A-ECAP10', description: 'End Cap 10 mm', uom: 'PCS' }],
      ]),
      approvedPrices: [],
    };
    const res = calculateCableManufacturingCost(
      { materialNumber: '10009487', currency: 'LE', quantity: 1, lengthMeters: 1000 },
      pcsContext
    );
    assert.equal(res.success, true);
    assert.equal(res.materialCost, 0);
    assert.equal(res.costingLines[0].lineCost, 0);
    assert.match(String(res.costingLines[0].calculationNotes), /packing/i);
  });

  it('blocks calculation if engineering mapping is not APPROVED', () => {
    const unapprovedCtx: CostingContext = {
      ...sampleContext,
      engineeringMapping: { ...sampleContext.engineeringMapping!, status: 'DRAFT' },
    };

    const res = calculateCableManufacturingCost(
      { materialNumber: '10009487', currency: 'USD' },
      unapprovedCtx
    );
    assert.equal(res.success, false);
    assert.equal(res.costingStatus, 'BLOCKED');
    assert.ok(res.blockingReasons.some((r) => r.includes('Gate 1 Failed')));
  });

  it('blocks calculation if BOM has unresolved conflict', () => {
    const conflictCtx: CostingContext = {
      ...sampleContext,
      bomConflicts: [{ conflictId: 'BOM-CONF-001', rawMaterialCode: 'CR01', investigationStatus: 'BUSINESS_DECISION_REQUIRED' }],
    };

    const res = calculateCableManufacturingCost(
      { materialNumber: '10009487', currency: 'USD' },
      conflictCtx
    );
    assert.equal(res.success, false);
    assert.equal(res.costingStatus, 'BLOCKED');
    assert.ok(res.blockingReasons.some((r) => r.includes('Gate 2 Failed')));
  });
});
