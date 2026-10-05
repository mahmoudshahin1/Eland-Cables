import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import {
  assertCanWriteCableMaster,
  assertCanCalculateContainerStudy,
  assertCanCreateContainerStudy,
  assertCanViewContainerStudy,
  assertCanOperateInquiryContainerStudy,
  assertCanViewShipmentCost,
  assertCanManageShipmentCost,
  assertCanViewShipmentCostSnapshot,
  assertCanCreateShipmentCostSnapshot,
  assertCanViewFinancialOfferSnapshot,
  assertCanCreateFinancialOfferSnapshot,
  assertCanViewCustomerFinancialOffer,
  assertCanViewCustomerContainerStudy,
  assertCanViewPlatformDashboard,
  assertCanViewReports,
} from './rbac';

describe('Cable Master RBAC', () => {
  it('Test E: customer cannot modify Cable Master', () => {
    assert.throws(
      () =>
        assertCanWriteCableMaster({
          id: 'u-eland',
          userType: 'customer',
          email: 'david.smith@elandcables.com',
          permissions: { masterData: false },
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('Test F: internal authorized user may write/search Cable Master', () => {
    assert.doesNotThrow(() =>
      assertCanWriteCableMaster({
        id: 'u-admin-1',
        userType: 'internal',
        email: 'admin@energya.com',
        permissions: { masterData: true },
      })
    );
  });
});

describe('Container Study RBAC', () => {
  it('customer cannot create container studies', () => {
    assert.throws(
      () =>
        assertCanCreateContainerStudy({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:CREATE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('customer cannot calculate container studies', () => {
    assert.throws(
      () =>
        assertCanCalculateContainerStudy({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:CALCULATE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('customer may operate inquiry Container Study on their own inquiry', () => {
    assert.doesNotThrow(() =>
      assertCanOperateInquiryContainerStudy({
        id: 'u-cust',
        userType: 'customer',
        email: 'a@c.test',
        permissionCodes: ['LOGISTICS:CONTAINER_STUDY:VIEW'],
      })
    );
  });

  it('customer still cannot use logistics create/calculate asserts', () => {
    assert.throws(
      () =>
        assertCanCreateContainerStudy({
          id: 'u-cust',
          userType: 'customer',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:CREATE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('customer cannot view logistics Container Study APIs even with VIEW', () => {
    assert.throws(
      () =>
        assertCanViewContainerStudy({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:VIEW'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });
});

describe('Shipment Cost RBAC', () => {
  it('customer cannot view shipping cost master even with VIEW', () => {
    assert.throws(
      () =>
        assertCanViewShipmentCost({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['LOGISTICS:SHIPMENT_COST:VIEW'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('customer cannot manage shipping cost master even with MANAGE', () => {
    assert.throws(
      () =>
        assertCanManageShipmentCost({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['LOGISTICS:SHIPMENT_COST:MANAGE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('container-study permissions do not grant rate writes', () => {
    assert.throws(
      () =>
        assertCanManageShipmentCost({
          id: 'u-int',
          userType: 'internal',
          email: 'logistics@test.local',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:CREATE', 'LOGISTICS:CONTAINER_STUDY:VIEW'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('internal MANAGE may manage; VIEW may view', () => {
    assert.doesNotThrow(() =>
      assertCanManageShipmentCost({
        id: 'u-int',
        userType: 'internal',
        email: 'rates@test.local',
        permissionCodes: ['LOGISTICS:SHIPMENT_COST:MANAGE'],
      })
    );
    assert.doesNotThrow(() =>
      assertCanViewShipmentCost({
        id: 'u-int',
        userType: 'internal',
        email: 'rates@test.local',
        permissionCodes: ['LOGISTICS:SHIPMENT_COST:VIEW'],
      })
    );
  });
});

describe('Shipment Cost Snapshot RBAC', () => {
  it('customer cannot read or create snapshot APIs even with logistics codes', () => {
    assert.throws(
      () =>
        assertCanViewShipmentCostSnapshot({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:VIEW', 'LOGISTICS:SHIPMENT_COST:VIEW'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
    assert.throws(
      () =>
        assertCanCreateShipmentCostSnapshot({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:CONFIRM', 'LOGISTICS:SHIPMENT_COST:MANAGE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('CONTAINER_STUDY:CONFIRM may create; VIEW may read; study-create-only may not create', () => {
    assert.doesNotThrow(() =>
      assertCanCreateShipmentCostSnapshot({
        id: 'u-sm',
        userType: 'internal',
        email: 'salesmgr@test.local',
        permissionCodes: ['LOGISTICS:CONTAINER_STUDY:CONFIRM'],
      })
    );
    assert.doesNotThrow(() =>
      assertCanViewShipmentCostSnapshot({
        id: 'u-sr',
        userType: 'internal',
        email: 'sales@test.local',
        permissionCodes: ['LOGISTICS:CONTAINER_STUDY:VIEW'],
      })
    );
    assert.throws(
      () =>
        assertCanCreateShipmentCostSnapshot({
          id: 'u-sr',
          userType: 'internal',
          email: 'sales@test.local',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:VIEW', 'LOGISTICS:CONTAINER_STUDY:CREATE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });
});

describe('Financial Offer Snapshot RBAC', () => {
  it('customer cannot read or create financial offer APIs even with quotation codes', () => {
    assert.throws(
      () =>
        assertCanViewFinancialOfferSnapshot({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['COMMERCIAL:QUOTATION:VIEW', 'COMMERCIAL:QUOTATION:CREATE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
    assert.throws(
      () =>
        assertCanCreateFinancialOfferSnapshot({
          id: 'u-cust',
          userType: 'customer',
          email: 'a@c.test',
          permissionCodes: ['COMMERCIAL:QUOTATION:CREATE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('QUOTATION:CREATE may create; VIEW may read; logistics-only may not', () => {
    assert.doesNotThrow(() =>
      assertCanCreateFinancialOfferSnapshot({
        id: 'u-sm',
        userType: 'internal',
        email: 'salesmgr@test.local',
        permissionCodes: ['COMMERCIAL:QUOTATION:CREATE'],
      })
    );
    assert.doesNotThrow(() =>
      assertCanViewFinancialOfferSnapshot({
        id: 'u-sr',
        userType: 'internal',
        email: 'sales@test.local',
        permissionCodes: ['COMMERCIAL:QUOTATION:VIEW'],
      })
    );
    assert.throws(
      () =>
        assertCanCreateFinancialOfferSnapshot({
          id: 'u-to',
          userType: 'internal',
          email: 'to@test.local',
          permissionCodes: ['LOGISTICS:CONTAINER_STUDY:CONFIRM', 'LOGISTICS:SHIPMENT_COST:MANAGE'],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('customer may read customer-safe financial offer and shipment visibility, not create', () => {
    const customer = {
      id: 'u-cust',
      userType: 'customer' as const,
      email: 'a@c.test',
      customerId: 'cust-1',
      customerScopeKeys: ['cust-1'],
      customerMasterIds: ['cust-1'],
    };
    assert.doesNotThrow(() => assertCanViewCustomerFinancialOffer(customer));
    assert.doesNotThrow(() => assertCanViewCustomerContainerStudy(customer));
    assert.throws(
      () => assertCanCreateFinancialOfferSnapshot(customer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
    assert.throws(
      () => assertCanViewFinancialOfferSnapshot(customer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });
});

describe('Reporting / dashboard RBAC', () => {
  it('denies unauthenticated dashboard with sign-in message', () => {
    assert.throws(
      () => assertCanViewPlatformDashboard({}),
      (err: unknown) =>
        err instanceof DomainError && err.code === 'UNAUTHORIZED' && /sign in/i.test(err.message)
    );
  });

  it('customer cannot view internal platform KPIs or run internal reports', () => {
    const customer = {
      id: 'u-cust',
      userType: 'customer' as const,
      email: 'a@c.test',
      permissionCodes: ['REPORT:DASHBOARD:VIEW', 'REPORT:REPORT:VIEW'],
    };
    assert.throws(
      () => assertCanViewPlatformDashboard(customer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
    assert.throws(
      () => assertCanViewReports(customer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('internal reportsAnalytics role may view dashboards and reports', () => {
    assert.doesNotThrow(() =>
      assertCanViewPlatformDashboard({
        id: 'u-int',
        userType: 'internal',
        email: 'ops@energya.com',
        permissions: { reportsAnalytics: true },
      })
    );
    assert.doesNotThrow(() =>
      assertCanViewReports({
        id: 'u-int',
        userType: 'internal',
        email: 'ops@energya.com',
        permissions: { reportsAnalytics: true },
      })
    );
  });
});
