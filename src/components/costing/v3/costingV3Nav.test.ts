import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COSTING_NAV, COSTING_NAV_GROUPS, COSTING_PAGE_TITLES, costingBreadcrumb, isCostingV3Page } from './costingV3Nav';

const here = dirname(fileURLToPath(import.meta.url));

describe('Costing navigation owns Pricing Rules', () => {
  it('exposes Pricing Rules under Costing with the Costing / Pricing Rules breadcrumb', () => {
    assert.equal(isCostingV3Page('pricing_rules'), true);
    assert.equal(
      COSTING_NAV.some((item) => item.id === 'pricing_rules' && item.label === 'Pricing Rules'),
      true
    );
    assert.equal(COSTING_PAGE_TITLES.pricing_rules, 'Pricing Rules');
    assert.equal(costingBreadcrumb('pricing_rules'), 'Costing / Pricing Rules');
    const group = COSTING_NAV_GROUPS.find((g) => g.title === 'COMMERCIAL PRICING');
    assert.ok(group);
    assert.equal(
      group?.items.some((item) => item.id === 'pricing_rules' && item.label === 'Pricing Rules'),
      true
    );
  });

  it('does not list Pricing Rules under Technical Office', () => {
    const technicalOffice = readFileSync(join(here, '../../internal/TechnicalOffice.tsx'), 'utf8');
    assert.equal(technicalOffice.includes('Commercial Pricing Rules'), false);
    assert.equal(technicalOffice.includes('TechnicalOfficePricingRulesQueue'), false);
    assert.equal(technicalOffice.includes("activeMainTab === 'pricing'"), false);
  });
});
