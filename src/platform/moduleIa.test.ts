import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildModuleSurfaceNav,
  buildModuleWorkspaceContract,
  breadcrumbsForPath,
  isOperationalModule,
  listInformationalModules,
  listNavigableModulesByCategory,
  masterEntityLinksForModule,
  ownershipSurfaceRows,
  parseV2ModulePath,
  v2ModulePath,
} from './moduleIa';
import { getModuleById, listNavigableModules } from './moduleRegistry';
import {
  assertCustomerWriteOwner,
  BOM_MASTER_BOUNDARY,
  COSTING_MASTER_BOUNDARY,
  CUSTOMER_MASTER_BOUNDARY,
  ENGINEERING_MASTER_BOUNDARY,
  PRICING_MASTER_BOUNDARY,
} from './services';

describe('V2 Module IA (Task 03)', () => {
  it('groups navigable modules by category and excludes informational statuses', () => {
    const groups = listNavigableModulesByCategory();
    assert.ok(groups.length > 0);
    for (const g of groups) {
      for (const m of g.modules) {
        assert.ok(['LIVE', 'PARTIAL', 'FROZEN'].includes(m.status));
        assert.ok(m.workspaceEntry?.startsWith('/v2'));
      }
    }
    const info = listInformationalModules();
    assert.ok(info.every((m) => ['PLANNED', 'STUB', 'NOT_IMPLEMENTED'].includes(m.status)));
  });

  it('builds workspace contracts with ERP surfaces and honest KPIs', () => {
    const customer = buildModuleWorkspaceContract('CUSTOMER');
    assert.ok(customer);
    assert.equal(customer!.moduleId, 'CUSTOMER');
    assert.ok(customer!.surfaces.some((s) => s.surface === 'master'));
    assert.ok(customer!.masterEntities.some((e) => e.entityCode === 'Customer'));
    assert.ok(customer!.kpis.every((k) => k.availability === 'LIVE' || k.availability === 'NOT_AVAILABLE'));

    const inventory = buildModuleWorkspaceContract('INVENTORY');
    assert.ok(inventory);
    assert.equal(inventory!.status, 'NOT_IMPLEMENTED');
  });

  it('routes Engineering MD under Engineering — no separate Cable/Drum apps', () => {
    const links = masterEntityLinksForModule('ENGINEERING');
    assert.ok(links.some((l) => l.label === 'Cables'));
    assert.ok(links.some((l) => l.label === 'Drums'));
    assert.ok(links.some((l) => l.label === 'Parameters'));
    assert.ok(links.every((l) => l.path.includes('/v2/modules/')));
    const cable = getModuleById('CABLE_MASTER');
    assert.ok(cable?.notes?.toLowerCase().includes('not a separate top-level'));
    assert.ok(cable?.invariants.some((i) => /not a separate module/i.test(i)));
  });

  it('parses V2 module paths and breadcrumbs', () => {
    assert.deepEqual(parseV2ModulePath('/v2/modules/customer/master/customers'), {
      moduleId: 'CUSTOMER',
      surface: 'master',
      entitySlug: 'customers',
    });
    const crumbs = breadcrumbsForPath('/v2/modules/engineering/master/cables');
    assert.ok(crumbs.some((c) => c.label === 'Engineering'));
    assert.equal(v2ModulePath('COSTING', 'master', 'formulas'), '/v2/modules/costing/master/formulas');
  });

  it('exposes ownership surfaces with owner module and permissions', () => {
    const rows = ownershipSurfaceRows();
    const cust = rows.find((r) => r.entity === 'Customer');
    assert.equal(cust?.ownerModuleId, 'CUSTOMER');
    assert.ok(cust?.displayPath?.includes('/customer/master'));
    const metal = rows.find((r) => r.entity === 'CostingMetalCostComponent');
    assert.equal(metal?.frozen, true);
  });

  it('builds surface nav only for IMPLEMENTED/PARTIAL surfaces', () => {
    const sales = getModuleById('SALES')!;
    const nav = buildModuleSurfaceNav(sales);
    assert.ok(nav.every((s) => s.availability === 'IMPLEMENTED' || s.availability === 'PARTIAL'));
    assert.ok(!nav.some((s) => s.surface === 'reports'));
  });

  it('marks operational modules for LIVE/PARTIAL/FROZEN with navDefault', () => {
    assert.equal(isOperationalModule('CUSTOMER'), true);
    assert.equal(isOperationalModule('SALES'), true);
    assert.equal(isOperationalModule('INVENTORY'), false);
    assert.equal(listNavigableModules().every((m) => m.workspaceEntry?.startsWith('/v2')), true);
  });
});

describe('Master data service boundaries', () => {
  it('keeps single authorities for Customer/Costing/Pricing/BOM/Engineering', () => {
    assert.equal(CUSTOMER_MASTER_BOUNDARY.moduleId, 'CUSTOMER');
    assert.equal(assertCustomerWriteOwner('CUSTOMER'), true);
    assert.equal(assertCustomerWriteOwner('SALES'), false);
    assert.equal(COSTING_MASTER_BOUNDARY.moduleId, 'COSTING');
    assert.ok(COSTING_MASTER_BOUNDARY.freezes.some((f) => /Option B|Decision 5/i.test(f)));
    assert.equal(PRICING_MASTER_BOUNDARY.moduleId, 'PRICING');
    assert.equal(BOM_MASTER_BOUNDARY.moduleId, 'BOM');
    assert.equal(ENGINEERING_MASTER_BOUNDARY.cableMasterModuleId, 'CABLE_MASTER');
  });
});
