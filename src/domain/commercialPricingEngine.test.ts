import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateBaseSellingPrice,
  calculateCommercialSellingPrice,
  calculateDiscountAndFinalPrice,
  resolvePricingRule,
  StoredPricingRule,
} from './commercialPricingEngine';

describe('Commercial Pricing Engine Domain Service Tests', () => {
  const sampleApprovedRules: StoredPricingRule[] = [
    {
      id: 'RULE-GLOBAL-01',
      ruleCode: 'PR-GLOBAL-20',
      ruleName: 'Global Standard 20% Gross Margin',
      scope: 'GLOBAL',
      ruleType: 'GROSS_MARGIN',
      customerId: null,
      customerTierCode: null,
      cableMaterialNumber: null,
      percentageValue: 20.0,
      currency: 'USD',
      priority: 20,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-12-31'),
      workflowStatus: 'APPROVED',
      isCurrent: true,
      revision: 1,
      minMarginThreshold: 15.0,
      maxDiscountAllowed: 10.0,
    },
    {
      id: 'RULE-TIER1-01',
      ruleCode: 'PR-TIER1-MARKUP',
      ruleName: 'Tier 1 Standard 20% Markup',
      scope: 'CUSTOMER_TIER',
      ruleType: 'MARKUP',
      customerId: null,
      customerTierCode: 'TIER_1',
      cableMaterialNumber: null,
      percentageValue: 20.0,
      currency: 'USD',
      priority: 40,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-12-31'),
      workflowStatus: 'APPROVED',
      isCurrent: true,
      revision: 1,
      minMarginThreshold: null,
      maxDiscountAllowed: 15.0,
    },
    {
      id: 'RULE-CUST-ELAND-01',
      ruleCode: 'PR-ELAND-SPECIAL',
      ruleName: 'ELAND Strategic Customer Override 25% Margin',
      scope: 'CUSTOMER_SPECIFIC',
      ruleType: 'GROSS_MARGIN',
      customerId: 'u-cust-eland',
      customerTierCode: null,
      cableMaterialNumber: null,
      percentageValue: 25.0,
      currency: 'USD',
      priority: 80,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-12-31'),
      workflowStatus: 'APPROVED',
      isCurrent: true,
      revision: 1,
      minMarginThreshold: 18.0,
      maxDiscountAllowed: 12.0,
    },
    {
      id: 'RULE-CUST-CABLE-01',
      ruleCode: 'PR-ELAND-10009487',
      ruleName: 'ELAND 10009487 Contracted 15% Markup',
      scope: 'CUSTOMER_CABLE_SPECIFIC',
      ruleType: 'MARKUP',
      customerId: 'u-cust-eland',
      customerTierCode: null,
      cableMaterialNumber: '10009487',
      percentageValue: 15.0,
      currency: 'USD',
      priority: 100,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-12-31'),
      workflowStatus: 'APPROVED',
      isCurrent: true,
      revision: 1,
      minMarginThreshold: 10.0,
      maxDiscountAllowed: 5.0,
    },
  ];

  it('calculates 20% Markup correctly (Cost = 100 -> Base = 120)', () => {
    const base = calculateBaseSellingPrice(100, 'MARKUP', 20.0);
    assert.equal(base, 120.0);
  });

  it('calculates 20% Gross Margin correctly (Cost = 100 -> Base = 125)', () => {
    const base = calculateBaseSellingPrice(100, 'GROSS_MARGIN', 20.0);
    assert.equal(base, 125.0);
  });

  it('verifies Markup != Gross Margin mathematically for identical percentage', () => {
    const markupPrice = calculateBaseSellingPrice(1000, 'MARKUP', 25.0); // 1250
    const marginPrice = calculateBaseSellingPrice(1000, 'GROSS_MARGIN', 25.0); // 1333.33
    assert.notEqual(markupPrice, marginPrice);
    assert.equal(markupPrice, 1250.0);
    assert.equal(marginPrice, 1333.33);
  });

  it('rejects invalid Gross Margin >= 100% or < 0%', () => {
    assert.throws(
      () => calculateBaseSellingPrice(100, 'GROSS_MARGIN', 100.0),
      (err: any) => err.code === 'INVALID_MARGIN_VALUE'
    );
    assert.throws(
      () => calculateBaseSellingPrice(100, 'GROSS_MARGIN', -5.0),
      (err: any) => err.code === 'INVALID_MARGIN_VALUE'
    );
  });

  it('rejects negative markup percentage', () => {
    assert.throws(
      () => calculateBaseSellingPrice(100, 'MARKUP', -10.0),
      (err: any) => err.code === 'INVALID_MARKUP_VALUE'
    );
  });

  it('calculates discount and final selling price correctly', () => {
    // Base = 125, Discount = 5% -> DiscountAmount = 6.25, Final = 118.75
    const res = calculateDiscountAndFinalPrice(125.0, 5.0);
    assert.equal(res.discountAmount, 6.25);
    assert.equal(res.finalSellingPrice, 118.75);
  });

  it('rejects discount > 100% or < 0%', () => {
    assert.throws(
      () => calculateDiscountAndFinalPrice(100, 105.0),
      (err: any) => err.code === 'INVALID_DISCOUNT_VALUE'
    );
    assert.throws(
      () => calculateDiscountAndFinalPrice(100, -2.0),
      (err: any) => err.code === 'INVALID_DISCOUNT_VALUE'
    );
  });

  it('resolves Customer-Specific + Cable-Specific rule as highest precedence (Level 1)', () => {
    const res = resolvePricingRule(
      {
        materialNumber: '10009487',
        customerId: 'u-cust-eland',
        customerTierCode: 'TIER_1',
        currency: 'USD',
        pricingDate: new Date('2026-08-20'),
      },
      sampleApprovedRules
    );

    assert.equal(res.code, 'PRICING_RULE_FOUND');
    assert.equal(res.rule?.ruleCode, 'PR-ELAND-10009487');
    assert.equal(res.rule?.ruleType, 'MARKUP');
    assert.equal(res.rule?.percentageValue, 15.0);
  });

  it('resolves Customer-Specific rule when cable-specific rule is not present (Level 2)', () => {
    const res = resolvePricingRule(
      {
        materialNumber: 'OTHER-CABLE-999',
        customerId: 'u-cust-eland',
        customerTierCode: 'TIER_1',
        currency: 'USD',
        pricingDate: new Date('2026-08-20'),
      },
      sampleApprovedRules
    );

    assert.equal(res.code, 'PRICING_RULE_FOUND');
    assert.equal(res.rule?.ruleCode, 'PR-ELAND-SPECIAL');
    assert.equal(res.rule?.ruleType, 'GROSS_MARGIN');
    assert.equal(res.rule?.percentageValue, 25.0);
  });

  it('resolves Customer Tier rule for generic customer belonging to TIER_1 (Level 4)', () => {
    const res = resolvePricingRule(
      {
        materialNumber: 'OTHER-CABLE-999',
        customerId: 'u-cust-dewa',
        customerTierCode: 'TIER_1',
        currency: 'USD',
        pricingDate: new Date('2026-08-20'),
      },
      sampleApprovedRules
    );

    assert.equal(res.code, 'PRICING_RULE_FOUND');
    assert.equal(res.rule?.ruleCode, 'PR-TIER1-MARKUP');
    assert.equal(res.rule?.ruleType, 'MARKUP');
  });

  it('resolves Global Default rule when customer and tier have no custom rules (Level 5)', () => {
    const res = resolvePricingRule(
      {
        materialNumber: 'OTHER-CABLE-999',
        customerId: 'u-cust-anonymous',
        customerTierCode: 'STANDARD',
        currency: 'USD',
        pricingDate: new Date('2026-08-20'),
      },
      sampleApprovedRules
    );

    assert.equal(res.code, 'PRICING_RULE_FOUND');
    assert.equal(res.rule?.ruleCode, 'PR-GLOBAL-20');
    assert.equal(res.rule?.ruleType, 'GROSS_MARGIN');
  });

  it('detects priority conflict when multiple active rules share identical scope and priority', () => {
    const conflictingRules: StoredPricingRule[] = [
      {
        ...sampleApprovedRules[0],
        id: 'RULE-CONF-A',
        priority: 50,
      },
      {
        ...sampleApprovedRules[0],
        id: 'RULE-CONF-B',
        ruleCode: 'PR-GLOBAL-CONFLICT',
        priority: 50,
      },
    ];

    const res = resolvePricingRule(
      {
        currency: 'USD',
        pricingDate: new Date('2026-08-20'),
      },
      conflictingRules
    );

    assert.equal(res.code, 'PRICING_RULE_CONFLICT');
  });

  it('detects expired pricing rule and returns PRICING_RULE_EXPIRED', () => {
    const expiredRules: StoredPricingRule[] = [
      {
        ...sampleApprovedRules[0],
        effectiveFrom: new Date('2025-01-01'),
        effectiveTo: new Date('2025-12-31'), // Expired relative to 2026-08-20
      },
    ];

    const res = resolvePricingRule(
      {
        currency: 'USD',
        pricingDate: new Date('2026-08-20'),
      },
      expiredRules
    );

    assert.equal(res.code, 'PRICING_RULE_EXPIRED');
  });

  it('blocks currency mismatch without automated FX conversion', () => {
    const res = resolvePricingRule(
      {
        currency: 'EUR', // Only USD rule available
        pricingDate: new Date('2026-08-20'),
      },
      [sampleApprovedRules[0]]
    );

    assert.equal(res.code, 'PRICING_CURRENCY_MISMATCH');
  });

  it('triggers PRICING_APPROVAL_REQUIRED when discount exceeds max allowed threshold', () => {
    // ELAND Rule has maxDiscountAllowed = 12.0%. Requesting 15% discount
    const res = calculateCommercialSellingPrice(
      {
        materialCost: 1000.0,
        currency: 'USD',
        customerId: 'u-cust-eland',
        pricingDate: new Date('2026-08-20'),
        requestedDiscountPercentage: 15.0,
      },
      { approvedPricingRules: sampleApprovedRules }
    );

    assert.equal(res.success, true);
    assert.equal(res.pricingStatus, 'PRICING_APPROVAL_REQUIRED');
    assert.equal(res.approvalRequired, true);
    assert.ok(res.approvalReason?.includes('exceeds maximum allowed threshold'));
  });
});
