import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Increment 12 pricing UI ownership', () => {
  it('keeps existing commercial pricing API routes unchanged', () => {
    const routes = readFileSync(join(root, 'src/server/commercialPricingRoutes.ts'), 'utf8');
    assert.match(routes, /app\.use|pricingMasterRouter\.get\('\/'/);
    assert.match(routes, /pricingMasterRouter\.post\('\/'/);
    assert.match(routes, /pricingMasterRouter\.get\('\/options'/);
    assert.match(routes, /pricingMasterRouter\.get\('\/:id\/history'/);
    assert.match(routes, /pricingMasterRouter\.post\('\/:id\/versions'/);
    assert.match(routes, /pricingMasterRouter\.post\('\/:id\/actions'/);
    assert.match(routes, /pricingMasterRouter\.get\('\/export'/);
    assert.match(routes, /commercialPricingRouter\.post\('\/calculate'/);
    assert.match(routes, /assertCanManagePricingRules/);
    assert.match(routes, /assertCanApprovePricingRules/);
  });

  it('hosts Pricing Rules in Costing and not in Technical Office', () => {
    const costingNav = readFileSync(join(root, 'src/components/costing/v3/costingV3Nav.ts'), 'utf8');
    const shell = readFileSync(join(root, 'src/components/costing/v3/CostingWorkspaceShell.tsx'), 'utf8');
    const technicalOffice = readFileSync(join(root, 'src/components/internal/TechnicalOffice.tsx'), 'utf8');
    assert.match(costingNav, /id: 'pricing_rules', label: 'Pricing Rules'/);
    assert.match(shell, /page === 'pricing_rules' && <PricingRulesPanel/);
    assert.equal(technicalOffice.includes('Commercial Pricing Rules'), false);
    assert.equal(technicalOffice.includes('TechnicalOfficePricingRulesQueue'), false);
  });
});
