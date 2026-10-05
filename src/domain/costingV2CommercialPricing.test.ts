import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  calculateBaseSellingPriceDecimal,
  calculateCommercialSellingPrice,
  resolvePricingRule,
  StoredPricingRule,
} from './commercialPricingEngine';

function rule(partial: Partial<StoredPricingRule> & Pick<StoredPricingRule, 'id' | 'scope' | 'ruleType' | 'percentageValue'>): StoredPricingRule {
  return {
    ruleCode: partial.ruleCode || partial.id,
    ruleName: partial.ruleName || partial.id,
    customerId: partial.customerId ?? null,
    customerGroupId: partial.customerGroupId ?? null,
    customerTierCode: partial.customerTierCode ?? null,
    cableMaterialNumber: partial.cableMaterialNumber ?? null,
    cableFamily: partial.cableFamily ?? null,
    currency: 'USD',
    priority: 20,
    effectiveFrom: partial.effectiveFrom ?? new Date('2026-01-01'),
    effectiveTo: partial.effectiveTo ?? new Date('2026-12-31'),
    workflowStatus: 'APPROVED',
    status: 'ACTIVE',
    isCurrent: true,
    revision: partial.revision ?? 1,
    minMarginThreshold: null,
    maxDiscountAllowed: 15,
    ...partial,
  };
}

describe('Costing V2 commercial pricing — markup/margin Decimal resolver', () => {
  const customerId = 'cv2-test-customer';
  const customerGroupId = 'cv2-test-group';
  const cableId = 'CV2-TEST-CABLE';
  const family = 'LV';

  it('1. Cost 100 USD, Customer + Cable Family LV, MARGIN 20% → selling price 125 USD exact Decimal', () => {
    const price = calculateBaseSellingPriceDecimal(new Prisma.Decimal(100), 'GROSS_MARGIN', new Prisma.Decimal(20));
    assert.equal(price.equals(new Prisma.Decimal(125)), true);
    assert.equal(price.toFixed(2), '125.00');

    const result = calculateCommercialSellingPrice(
      {
        materialCost: new Prisma.Decimal(100),
        currency: 'USD',
        customerId,
        cableFamily: family,
        pricingDate: new Date('2026-09-23'),
      },
      {
        approvedPricingRules: [
          rule({
            id: 'RULE-CUST-FAM-MARGIN-20',
            scope: 'CUSTOMER_FAMILY',
            ruleType: 'GROSS_MARGIN',
            percentageValue: 20,
            customerId,
            cableFamily: family,
          }),
        ],
      }
    );
    assert.equal(result.success, true);
    assert.equal(result.pricingStatus, 'PRICING_CALCULATED');
    assert.equal(result.pricingRuleId, 'RULE-CUST-FAM-MARGIN-20');
    assert.equal(result.pricingRuleScope, 'CUSTOMER_FAMILY');
    assert.equal(result.pricingRuleType, 'GROSS_MARGIN');
    assert.ok(new Prisma.Decimal(result.finalSellingPriceExact!).equals(new Prisma.Decimal(125)));
  });

  it('2. Customer+Family MARGIN 20% plus more specific Customer+Cable MARKUP 25%; cost 100 → Customer+Cable wins, price 125', () => {
    const rules = [
      rule({
        id: 'RULE-D-CUST-FAM',
        scope: 'CUSTOMER_FAMILY',
        ruleType: 'GROSS_MARGIN',
        percentageValue: 20,
        customerId,
        cableFamily: family,
      }),
      rule({
        id: 'RULE-F-CUST-CABLE',
        scope: 'CUSTOMER_CABLE_SPECIFIC',
        ruleType: 'MARKUP',
        percentageValue: 25,
        customerId,
        cableMaterialNumber: cableId,
      }),
    ];
    const result = calculateCommercialSellingPrice(
      {
        materialCost: 100,
        currency: 'USD',
        customerId,
        cableFamily: family,
        materialNumber: cableId,
        pricingDate: new Date('2026-09-23'),
      },
      { approvedPricingRules: rules }
    );
    assert.equal(result.pricingRuleId, 'RULE-F-CUST-CABLE');
    assert.equal(result.pricingRuleScope, 'CUSTOMER_CABLE_SPECIFIC');
    assert.equal(result.pricingRuleType, 'MARKUP');
    assert.equal(result.percentageValue, 25);
    assert.ok(new Prisma.Decimal(result.finalSellingPriceExact!).equals(new Prisma.Decimal(125)));
  });

  it('3. Full precedence A Global, B Family, C Group+Family, D Customer+Family, E Group+Cable, F Customer+Cable', () => {
    const rules = [
      rule({ id: 'RULE-A-GLOBAL', scope: 'GLOBAL', ruleType: 'MARKUP', percentageValue: 10 }),
      rule({ id: 'RULE-B-FAMILY', scope: 'CABLE_FAMILY', ruleType: 'MARKUP', percentageValue: 12, cableFamily: family }),
      rule({
        id: 'RULE-C-GROUP-FAM',
        scope: 'CUSTOMER_GROUP_FAMILY',
        ruleType: 'MARKUP',
        percentageValue: 14,
        customerGroupId,
        cableFamily: family,
      }),
      rule({
        id: 'RULE-D-CUST-FAM',
        scope: 'CUSTOMER_FAMILY',
        ruleType: 'GROSS_MARGIN',
        percentageValue: 16,
        customerId,
        cableFamily: family,
      }),
      rule({
        id: 'RULE-E-GROUP-CABLE',
        scope: 'CUSTOMER_GROUP_CABLE',
        ruleType: 'MARKUP',
        percentageValue: 18,
        customerGroupId,
        cableMaterialNumber: cableId,
      }),
      rule({
        id: 'RULE-F-CUST-CABLE',
        scope: 'CUSTOMER_CABLE_SPECIFIC',
        ruleType: 'MARKUP',
        percentageValue: 25,
        customerId,
        cableMaterialNumber: cableId,
      }),
    ];

    const cases = [
      {
        name: 'A Global',
        req: { customerId: 'other', customerGroupId: 'other-group', cableFamily: 'MV', materialNumber: 'OTHER' },
        id: 'RULE-A-GLOBAL',
        scope: 'GLOBAL',
        method: 'MARKUP',
        pct: 10,
        price: '110',
      },
      {
        name: 'B Cable Family',
        req: { customerId: 'other', customerGroupId: 'other-group', cableFamily: family, materialNumber: 'OTHER' },
        id: 'RULE-B-FAMILY',
        scope: 'CABLE_FAMILY',
        method: 'MARKUP',
        pct: 12,
        price: '112',
      },
      {
        name: 'C Group+Family',
        req: { customerId: 'other', customerGroupId, cableFamily: family, materialNumber: 'OTHER' },
        id: 'RULE-C-GROUP-FAM',
        scope: 'CUSTOMER_GROUP_FAMILY',
        method: 'MARKUP',
        pct: 14,
        price: '114',
      },
      {
        name: 'D Customer+Family',
        req: { customerId, customerGroupId, cableFamily: family, materialNumber: 'OTHER' },
        id: 'RULE-D-CUST-FAM',
        scope: 'CUSTOMER_FAMILY',
        method: 'GROSS_MARGIN',
        pct: 16,
        price: '119.05',
      },
      {
        name: 'E Group+Cable',
        req: { customerId: 'other', customerGroupId, cableFamily: family, materialNumber: cableId },
        id: 'RULE-E-GROUP-CABLE',
        scope: 'CUSTOMER_GROUP_CABLE',
        method: 'MARKUP',
        pct: 18,
        price: '118',
      },
      {
        name: 'F Customer+Cable',
        req: { customerId, customerGroupId, cableFamily: family, materialNumber: cableId },
        id: 'RULE-F-CUST-CABLE',
        scope: 'CUSTOMER_CABLE_SPECIFIC',
        method: 'MARKUP',
        pct: 25,
        price: '125',
      },
    ] as const;

    for (const row of cases) {
      const result = calculateCommercialSellingPrice(
        {
          materialCost: 100,
          currency: 'USD',
          pricingDate: new Date('2026-09-23'),
          ...row.req,
        },
        { approvedPricingRules: rules }
      );
      assert.equal(result.pricingRuleId, row.id, row.name);
      assert.equal(result.pricingRuleScope, row.scope, row.name);
      assert.equal(result.pricingRuleType, row.method, row.name);
      assert.equal(result.percentageValue, row.pct, row.name);
      assert.ok(
        new Prisma.Decimal(result.finalSellingPriceExact!).equals(new Prisma.Decimal(row.price)),
        `${row.name} price ${result.finalSellingPriceExact} != ${row.price}`
      );
    }
  });

  it('6. Margin 100% and >100% validation failure. No Infinity/NaN', () => {
    assert.throws(
      () => calculateBaseSellingPriceDecimal(100, 'GROSS_MARGIN', 100),
      (err: any) => err.code === 'INVALID_MARGIN_VALUE'
    );
    assert.throws(
      () => calculateBaseSellingPriceDecimal(100, 'GROSS_MARGIN', 105),
      (err: any) => err.code === 'INVALID_MARGIN_VALUE'
    );
    const conflict = resolvePricingRule({ currency: 'USD', pricingDate: new Date('2026-09-23') }, [
      rule({ id: 'A', scope: 'GLOBAL', ruleType: 'GROSS_MARGIN', percentageValue: 20, revision: 1 }),
      rule({ id: 'B', scope: 'GLOBAL', ruleType: 'MARKUP', percentageValue: 25, revision: 1 }),
    ]);
    assert.equal(conflict.code, 'PRICING_RULE_CONFLICT');
  });

  it('7. Valid Costing V2 cost, no applicable rule → Costing valid conceptually, Pricing NOT_CONFIGURED, no fake selling price', () => {
    const result = calculateCommercialSellingPrice(
      {
        materialCost: new Prisma.Decimal(100),
        currency: 'USD',
        customerId,
        customerGroupId,
        cableFamily: family,
        materialNumber: cableId,
        pricingDate: new Date('2026-09-23'),
      },
      { approvedPricingRules: [] }
    );
    assert.equal(result.success, false);
    assert.equal(result.pricingStatus, 'PRICING_NOT_CONFIGURED');
    assert.equal(result.errorCode, 'PRICING_NOT_CONFIGURED');
    assert.equal(result.finalSellingPrice, null);
    assert.equal(result.baseSellingPrice, null);
    assert.equal(result.finalSellingPriceExact, null);
    assert.equal(result.materialCostExact, '100');
  });
});
