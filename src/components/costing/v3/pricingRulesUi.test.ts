import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PRICING_RULE_SCOPES,
  buildPricingRuleName,
  emptyPricingRuleForm,
  pricingMethodLabel,
  scopeFields,
  scopeLabel,
  showsScopeField,
  validatePricingRuleForm,
} from './pricingRulesUi';

describe('Costing Pricing Rules UI helpers', () => {
  it('exposes existing backend scopes without inventing new ones', () => {
    const values = PRICING_RULE_SCOPES.map((s) => s.value);
    assert.deepEqual(values, [
      'CUSTOMER_CABLE_SPECIFIC',
      'CUSTOMER_GROUP_CABLE',
      'CUSTOMER_FAMILY',
      'CUSTOMER_GROUP_FAMILY',
      'CABLE_FAMILY',
      'GLOBAL',
      'CUSTOMER_SPECIFIC',
      'CUSTOMER_TIER',
      'CABLE_SPECIFIC',
    ]);
  });

  it('shows Customer + Cable fields for CUSTOMER_CABLE_SPECIFIC', () => {
    assert.deepEqual(scopeFields('CUSTOMER_CABLE_SPECIFIC'), ['customer', 'cable']);
    assert.equal(showsScopeField('CUSTOMER_CABLE_SPECIFIC', 'customerGroup'), false);
    assert.equal(showsScopeField('CUSTOMER_CABLE_SPECIFIC', 'cableFamily'), false);
    assert.equal(scopeLabel('CUSTOMER_CABLE_SPECIFIC'), 'Customer + Cable');
  });

  it('shows Customer Group + Cable Family fields for CUSTOMER_GROUP_FAMILY', () => {
    assert.deepEqual(scopeFields('CUSTOMER_GROUP_FAMILY'), ['customerGroup', 'cableFamily']);
    assert.equal(showsScopeField('CUSTOMER_GROUP_FAMILY', 'customer'), false);
    assert.equal(showsScopeField('CUSTOMER_GROUP_FAMILY', 'cable'), false);
    assert.equal(scopeLabel('CUSTOMER_GROUP_FAMILY'), 'Customer Group + Cable Family');
  });

  it('displays Markup / Margin for existing method enum values', () => {
    assert.equal(pricingMethodLabel('MARKUP'), 'Markup');
    assert.equal(pricingMethodLabel('GROSS_MARGIN'), 'Margin');
  });

  it('validates required scope fields, non-negative percent, and margin < 100', () => {
    const form = emptyPricingRuleForm('2026-09-24');
    assert.equal(validatePricingRuleForm(form), 'Scope is required.');
    form.scope = 'CUSTOMER_CABLE_SPECIFIC';
    assert.equal(validatePricingRuleForm(form), 'Customer is required for this scope.');
    form.customerId = 'cust-1';
    form.cableMaterialNumber = '10009487';
    form.percentageValue = '-1';
    assert.equal(validatePricingRuleForm(form), 'Percentage must be 0 or greater.');
    form.ruleType = 'GROSS_MARGIN';
    form.percentageValue = '100';
    assert.equal(validatePricingRuleForm(form), 'Margin must be less than 100%.');
    form.percentageValue = '18';
    assert.equal(validatePricingRuleForm(form), null);
  });

  it('builds a rule name from selected master rows', () => {
    const form = emptyPricingRuleForm('2026-09-24');
    form.scope = 'CUSTOMER_GROUP_FAMILY';
    form.customerGroupId = 'g1';
    form.cableFamily = 'LV';
    const name = buildPricingRuleName(
      form,
      {
        customers: [],
        groups: [{ id: 'g1', code: 'EU', name: 'Europe' }],
        families: ['LV'],
      },
      []
    );
    assert.match(name, /Customer Group \+ Cable Family/);
    assert.match(name, /EU — Europe/);
    assert.match(name, /LV/);
  });
});
