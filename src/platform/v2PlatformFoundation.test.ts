import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getModuleById,
  listNavigableModules,
  listModules,
  PLATFORM_MODULE_REGISTRY,
  NAV_VISIBLE_STATUSES,
} from './moduleRegistry';
import { DATA_OWNERSHIP_MATRIX, ownershipForEntity } from './dataOwnershipMatrix';
import {
  evaluateEffectiveAccess,
  formatAccessExplanation,
} from './security/effectiveAccess';
import {
  assertNotEavTransactionStore,
  inquiryManifestAsMetadata,
  mergeFieldMetadata,
} from './metadata/metadataService';
import { formatSequenceValue } from '../server/numberSequenceService';
import { PERSISTENCE_MODE } from './modules';
import { preferPostgresMasterData, sotStatusForEntity } from './masterDataSoT';

describe('V2 module registry', () => {
  it('registers catalog modules 01–29 plus PLATFORM', () => {
    assert.ok(PLATFORM_MODULE_REGISTRY.length >= 30);
    assert.ok(getModuleById('COSTING'));
    assert.ok(getModuleById('INQUIRY_QUOTATION'));
    assert.equal(getModuleById('SALES')?.status, 'FROZEN');
    assert.equal(getModuleById('INVENTORY')?.status, 'NOT_IMPLEMENTED');
  });

  it('navigable modules exclude PLANNED/STUB/NOT_IMPLEMENTED fakes', () => {
    const nav = listNavigableModules();
    assert.ok(nav.length > 0);
    for (const m of nav) {
      assert.ok(NAV_VISIBLE_STATUSES.has(m.status));
      assert.ok(m.workspaceEntry);
      assert.ok(m.workspaceEntry!.startsWith('/v2'));
      assert.notEqual(m.status, 'PLANNED');
      assert.notEqual(m.status, 'STUB');
      assert.notEqual(m.status, 'NOT_IMPLEMENTED');
    }
    const planned = listModules({ status: 'PLANNED' });
    assert.ok(planned.every((m) => !m.navDefault || !m.workspaceEntry));
  });

  it('keeps single authorities — no duplicate customer/costing/pricing engines', () => {
    const customers = PLATFORM_MODULE_REGISTRY.filter((m) => m.moduleId === 'CUSTOMER');
    const costing = PLATFORM_MODULE_REGISTRY.filter((m) => m.moduleId === 'COSTING');
    const pricing = PLATFORM_MODULE_REGISTRY.filter((m) => m.moduleId === 'PRICING');
    assert.equal(customers.length, 1);
    assert.equal(costing.length, 1);
    assert.equal(pricing.length, 1);
    assert.ok(costing[0].invariants.some((i) => /Option B|Decision 5/i.test(i)));
  });

  it('preserves V1 legacy workspace entries alongside V2 IA paths', () => {
    assert.equal(getModuleById('CUSTOMER')?.legacyWorkspaceEntry, '/internal/administration');
    assert.equal(getModuleById('COSTING')?.legacyWorkspaceEntry, '/internal/costing');
    assert.equal(getModuleById('SALES')?.legacyWorkspaceEntry, '/internal/fulfillment');
  });
});

describe('Data ownership matrix', () => {
  it('is machine-readable and freezes fulfillment + metal component', () => {
    assert.ok(DATA_OWNERSHIP_MATRIX.length > 10);
    assert.equal(ownershipForEntity('EpcSalesOrder')?.frozen, true);
    assert.equal(ownershipForEntity('CostingMetalCostComponent')?.frozen, true);
    assert.equal(ownershipForEntity('CommercialInquiry')?.ownerModuleId, 'INQUIRY_QUOTATION');
  });
});

describe('EFFECTIVE ACCESS', () => {
  it('denies unauthenticated with 401', () => {
    const result = evaluateEffectiveAccess({
      actor: {},
      module: 'CABLE',
      resource: 'CABLE_MASTER',
      action: 'VIEW',
    });
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'DENY_UNAUTHENTICATED');
    assert.equal(result.httpStatus, 401);
  });

  it('denies missing permission with 403', () => {
    const result = evaluateEffectiveAccess({
      actor: { id: 'u1', email: 'a@b.c', permissionCodes: ['REPORT:REPORT:VIEW'] },
      module: 'CABLE',
      resource: 'CABLE_MASTER',
      action: 'VIEW',
    });
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'DENY_PERMISSION');
    assert.equal(result.httpStatus, 403);
  });

  it('allows when permission present', () => {
    const result = evaluateEffectiveAccess({
      actor: {
        id: 'u1',
        email: 'a@b.c',
        permissionCodes: ['CABLE:CABLE_MASTER:VIEW'],
      },
      module: 'CABLE',
      resource: 'CABLE_MASTER',
      action: 'VIEW',
    });
    assert.equal(result.allowed, true);
    assert.equal(result.code, 'ALLOW');
    assert.match(formatAccessExplanation(result), /ALLOWED/);
  });

  it('enforces customer scope', () => {
    const result = evaluateEffectiveAccess({
      actor: {
        id: 'u1',
        email: 'c@b.c',
        userType: 'customer',
        permissionCodes: ['COMMERCIAL:INQUIRY:VIEW'],
        customerId: 'CUST-A',
        customerScopeKeys: ['cust-a'],
      },
      module: 'COMMERCIAL',
      resource: 'INQUIRY',
      action: 'VIEW',
      record: { customerId: 'CUST-B' },
    });
    assert.equal(result.allowed, false);
    assert.equal(result.code, 'DENY_SCOPE');
  });
});

describe('Metadata foundation (no EAV)', () => {
  it('merges PlatformFieldDefinition over inquiry manifest', () => {
    const manifest = inquiryManifestAsMetadata();
    assert.ok(manifest.some((f) => f.fieldCode === 'customerName'));
    const merged = mergeFieldMetadata(manifest, [
      {
        entityCode: 'INQUIRY',
        fieldCode: 'customerName',
        label: 'Customer (platform)',
        dataType: 'string',
        visible: false,
        required: true,
        displayOrder: 1,
        tab: 'Header',
      },
    ]);
    const row = merged.find((f) => f.entityCode === 'INQUIRY' && f.fieldCode === 'customerName');
    assert.equal(row?.label, 'Customer (platform)');
    assert.equal(row?.visible, false);
    assert.equal(row?.source, 'PLATFORM_FIELD_DEFINITION');
    assert.equal(assertNotEavTransactionStore().eavForTransactions, false);
  });
});

describe('Number sequence format', () => {
  it('formats prefix/year/serial tokens', () => {
    const value = formatSequenceValue('{PREFIX}{YY}-{#####}', 'PO', 42, new Date('2026-09-04T00:00:00Z'));
    assert.equal(value, 'PO26-00042');
  });
});

describe('Task 04A Master Data SoT (stale localStorage loses to PostgreSQL)', () => {
  it('marks Customer as SoT and governed masters as PostgreSQL-primary without LS authority', () => {
    assert.equal(PERSISTENCE_MODE, 'POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT');
    assert.equal(sotStatusForEntity('Customer')?.postgresSoT, true);
    assert.equal(sotStatusForEntity('Customer')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('CableMaster')?.postgresSoT, true);
    assert.equal(sotStatusForEntity('CableMaster')?.localStorageAuthority, false);
    assert.equal(sotStatusForEntity('RawMaterialPrice')?.postgresSoT, true);
    assert.equal(ownershipForEntity('CostingMetalCostComponent')?.frozen, true);
    const stale = [{ id: '1', cableCode: 'STALE' }];
    const resolved = preferPostgresMasterData({ ok: true, data: [] as typeof stale }, stale);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.deepEqual(resolved.data, []);
    assert.equal(resolved.staleLocalIgnored, true);
    assert.equal(resolved.authoritative, true);
    const offline = preferPostgresMasterData({ ok: false, error: '503' }, stale);
    assert.equal(offline.authoritative, false);
  });
});
