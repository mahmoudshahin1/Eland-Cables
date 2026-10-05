import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyPricingRuleFilters, emptyPricingRuleForm } from '../pricingRulesUi';
import { PricingRulesAdminView } from './PricingRulesPanel';

const here = dirname(fileURLToPath(import.meta.url));
const noop = () => undefined;

const options = {
  customers: [{ id: 'cust-1', code: 'ELAND', name: 'ELAND Cables' }],
  groups: [{ id: 'grp-1', code: 'EU', name: 'Europe' }],
  families: ['LV', 'MV'],
};

const cables = [{ materialNumber: '10009487', description: 'Cu/XLPE 1X16', family: 'LV' }];

function render(overrides: Partial<React.ComponentProps<typeof PricingRulesAdminView>> = {}) {
  return renderToStaticMarkup(
    React.createElement(PricingRulesAdminView, {
      rules: [
        {
          id: 'r1',
          ruleCode: 'PR-RULE-TEST',
          ruleName: 'Customer + Cable — ELAND / 10009487',
          scope: 'CUSTOMER_CABLE_SPECIFIC',
          ruleType: 'GROSS_MARGIN',
          percentageValue: 18,
          currency: 'USD',
          customerId: 'cust-1',
          customerGroupId: null,
          cableMaterialNumber: '10009487',
          cableFamily: 'LV',
          effectiveFrom: '2026-09-01',
          effectiveTo: null,
          workflowStatus: 'APPROVED',
          revision: 2,
        },
      ],
      options,
      cables,
      currencies: [{ code: 'USD', name: 'US Dollar' }],
      filters: emptyPricingRuleFilters(),
      onFiltersChange: noop,
      form: emptyPricingRuleForm('2026-09-24'),
      onFormChange: noop,
      versionForm: { percentageValue: '', effectiveFrom: '' },
      onVersionFormChange: noop,
      onRefresh: noop,
      onExport: noop,
      onOpenCreate: noop,
      onCloseDialog: noop,
      onView: noop,
      onOpenVersion: noop,
      onOpenHistory: noop,
      onCreate: noop,
      onCreateVersion: noop,
      onWorkflow: noop,
      ...overrides,
    })
  );
}

describe('Pricing Rules ERP table', () => {
  it('renders the master-data table columns and Markup / Margin method display', () => {
    const html = render();
    assert.match(html, /New Pricing Rule/);
    assert.match(html, /Export/);
    assert.match(html, /Refresh/);
    assert.match(html, />Scope</);
    assert.match(html, />Customer</);
    assert.match(html, />Customer Group</);
    assert.match(html, />Cable Family</);
    assert.match(html, />Cable</);
    assert.match(html, />Method</);
    assert.match(html, />Percentage</);
    assert.match(html, />Currency</);
    assert.match(html, />Effective From</);
    assert.match(html, />Effective To</);
    assert.match(html, />Status</);
    assert.match(html, />Revision</);
    assert.match(html, />Actions</);
    assert.match(html, /Customer \+ Cable/);
    assert.match(html, /ELAND — ELAND Cables/);
    assert.match(html, />Margin</);
    assert.doesNotMatch(html, />GROSS_MARGIN</);
    assert.doesNotMatch(html, /DashboardStatCard|Propose Rule|Pricing Rule Catalog/);
  });

  it('renders filter dropdowns including Cable Family from existing master data', () => {
    const html = render();
    assert.match(html, /placeholder="Search"/);
    assert.match(html, /Customer Group \[ All \]/);
    assert.match(html, /Customer \[ All \]/);
    assert.match(html, /Cable Family \[ All \]/);
    assert.match(html, /Cable \[ All \]/);
    assert.match(html, /Method \[ All \]/);
    assert.match(html, /Status \[ All \]/);
    assert.match(html, /aria-label="Effective Date"/);
    assert.match(html, /<option value="LV">LV<\/option>/);
    assert.match(html, /<option value="MV">MV<\/option>/);
    assert.match(html, /<option value="MARKUP">Markup<\/option>/);
    assert.match(html, /<option value="GROSS_MARGIN">Margin<\/option>/);
  });

  it('renders the Scope dropdown on New Pricing Rule', () => {
    const html = render({
      dialog: { kind: 'create' },
      form: emptyPricingRuleForm('2026-09-24'),
    });
    assert.match(html, /New Pricing Rule/);
    assert.match(html, /aria-label="Scope"/);
    assert.match(html, /<option value=""[^>]*>Select<\/option>/);
    assert.match(html, /Customer \+ Cable/);
    assert.match(html, /Customer Group \+ Cable Family/);
    assert.match(html, /value="CUSTOMER_CABLE_SPECIFIC"/);
    assert.match(html, /value="CUSTOMER_GROUP_FAMILY"/);
    assert.match(html, /value="GLOBAL"/);
    assert.match(html, /value="CUSTOMER_SPECIFIC"/);
  });

  it('shows Customer and Cable when scope is Customer + Cable', () => {
    const form = emptyPricingRuleForm('2026-09-24');
    form.scope = 'CUSTOMER_CABLE_SPECIFIC';
    const html = render({ dialog: { kind: 'create' }, form });
    assert.match(html, /aria-label="Rule Customer"/);
    assert.match(html, /aria-label="Rule Cable"/);
    assert.match(html, /aria-label="Rule Method"/);
    assert.match(html, /aria-label="Rule Percentage"/);
    assert.match(html, /aria-label="Rule Currency"/);
    assert.match(html, /aria-label="Rule Effective From"/);
    assert.doesNotMatch(html, /aria-label="Rule Customer Group"/);
    assert.doesNotMatch(html, /aria-label="Rule Cable Family"/);
    assert.match(html, /10009487 — Cu\/XLPE 1X16/);
  });

  it('shows Customer Group and Cable Family when scope is Customer Group + Cable Family', () => {
    const form = emptyPricingRuleForm('2026-09-24');
    form.scope = 'CUSTOMER_GROUP_FAMILY';
    const html = render({ dialog: { kind: 'create' }, form });
    assert.match(html, /aria-label="Rule Customer Group"/);
    assert.match(html, /aria-label="Rule Cable Family"/);
    assert.match(html, /<option value="LV">LV<\/option>/);
    assert.doesNotMatch(html, /aria-label="Rule Customer"/);
    assert.doesNotMatch(html, /aria-label="Rule Cable"/);
  });

  it('keeps existing commercial pricing API routes unchanged', () => {
    const routes = readFileSync(join(here, '../../../../server/commercialPricingRoutes.ts'), 'utf8');
    assert.match(routes, /pricingMasterRouter\.get\('\/'/);
    assert.match(routes, /pricingMasterRouter\.post\('\/'/);
    assert.match(routes, /pricingMasterRouter\.get\('\/options'/);
    assert.match(routes, /pricingMasterRouter\.get\('\/:id\/history'/);
    assert.match(routes, /pricingMasterRouter\.post\('\/:id\/versions'/);
    assert.match(routes, /pricingMasterRouter\.post\('\/:id\/actions'/);
    assert.match(routes, /pricingMasterRouter\.get\('\/export'/);
    assert.match(routes, /commercialPricingRouter\.post\('\/calculate'/);
  });
});
