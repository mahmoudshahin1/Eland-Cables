import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNIFIED_LOGIN_PATH } from '../auth/loginRoutes';
import { ModulePermissions, UserAccount } from '../types';
import {
  CUSTOMER_HOME_PATH,
  INTERNAL_HOME_PATH,
  V2_HOME_PATH,
  customerPathForTab,
  customerTabFromPath,
  customerInquiryIdFromPath,
  isCustomerInquiryDetailPath,
  defaultHomePath,
  internalPathForTab,
  internalTabFromPath,
  isV2AppPath,
  isV2CustomerProductPath,
  isV2InternalProductPath,
  isV2PlatformPath,
  postLoginPath,
  resolveAuthenticatedShellKind,
  resolvePostLoginDestination,
  resolveShellNavigation,
  V2_CUSTOMER_HOME_PATH,
  V2_INTERNAL_HOME_PATH,
} from './shellRoutes';

function user(partial: Partial<UserAccount> & Pick<UserAccount, 'userType'>): UserAccount {
  return {
    id: 'u-1',
    userName: 'user',
    fullName: 'Test User',
    email: 'user@example.com',
    department: 'QA',
    role: 'TEST',
    status: 'Active',
    permissions: {} as ModulePermissions,
    ...partial,
  };
}

describe('Application shell route map', () => {
  it('maps existing customer and internal tabs to URL paths', () => {
    assert.equal(customerPathForTab('dashboard'), '/customer');
    assert.equal(customerPathForTab('products'), '/customer/products');
    assert.equal(customerPathForTab('price_estimation'), '/customer/inquiries');
    assert.equal(customerPathForTab('support'), '/customer/support');
    assert.equal(internalPathForTab('overview'), '/internal');
    assert.equal(internalPathForTab('technical_office'), '/internal/technical-office');
    assert.equal(internalPathForTab('costing_pricing'), '/internal/costing');
    assert.equal(internalTabFromPath('/internal/costing'), 'costing_pricing');
    assert.equal(internalPathForTab('user_management'), '/internal/administration');
    assert.equal(customerTabFromPath('/customer/inquiries/'), 'price_estimation');
    assert.equal(customerTabFromPath('/customer/inquiries/inq-123'), 'price_estimation');
    assert.equal(internalTabFromPath('/internal/quotations'), 'sales_quotations');
    assert.equal(internalTabFromPath('/internal/sales-orders'), 'sales_orders');
    assert.equal(internalTabFromPath('/internal/sales-agreements'), 'sales_orders');
    assert.equal(internalTabFromPath('/internal/fulfillment'), 'sales_orders');
  });

  it('sends unauthenticated users to /login and keeps dedicated login paths', () => {
    assert.deepEqual(resolveShellNavigation({ isAuthenticated: false, pathname: '/internal/costing' }), {
      action: 'redirect',
      to: UNIFIED_LOGIN_PATH,
    });
    assert.deepEqual(resolveShellNavigation({ isAuthenticated: false, pathname: '/login/users' }), {
      action: 'allow',
    });
  });

  it('lands authenticated users on the correct portal home', () => {
    const customer = user({ userType: 'customer' });
    const internal = user({ userType: 'internal' });
    const admin = user({
      userType: 'internal',
      permissions: { userManagement: true } as ModulePermissions,
    });
    assert.equal(defaultHomePath(customer), CUSTOMER_HOME_PATH);
    assert.equal(defaultHomePath(internal), INTERNAL_HOME_PATH);
    assert.equal(CUSTOMER_HOME_PATH, '/customer');
    assert.deepEqual(resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/' }), {
      action: 'redirect',
      to: CUSTOMER_HOME_PATH,
    });
    assert.deepEqual(resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/login' }), {
      action: 'redirect',
      to: INTERNAL_HOME_PATH,
    });
    assert.equal(postLoginPath(internal), INTERNAL_HOME_PATH);
    assert.equal(postLoginPath(admin), INTERNAL_HOME_PATH);
    assert.equal(postLoginPath(customer), CUSTOMER_HOME_PATH);
    assert.equal(resolvePostLoginDestination(internal).ok, true);
    assert.equal(resolvePostLoginDestination(admin).ok, true);
    assert.equal(resolvePostLoginDestination(customer).ok, true);
  });

  it('does not use a login portal URL to choose Internal vs Customer after authentication', () => {
    const customer = user({ userType: 'customer' });
    const internal = user({ userType: 'internal' });
    const eland = user({
      userType: 'customer',
      companyName: 'ELAND Cables',
      email: 'david.smith@elandcables.com',
      customerMasterIds: ['cust-eland'],
    });
    assert.equal(postLoginPath(internal), '/internal');
    assert.equal(postLoginPath(customer), '/customer');
    assert.equal(postLoginPath(eland), '/customer');
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/login/admin' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/login/customer' }),
      { action: 'redirect', to: INTERNAL_HOME_PATH }
    );
  });

  it('keeps unassigned customer users on login instead of opening a generic customer portal', () => {
    const unassigned = user({ userType: 'customer', customerMasterIds: [] });
    const dest = resolvePostLoginDestination(unassigned);
    assert.equal(dest.ok, false);
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: unassigned, pathname: '/login' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: unassigned, pathname: '/customer' }),
      { action: 'redirect', to: UNIFIED_LOGIN_PATH }
    );
  });

  it('does not invent a context selector when a customer has multiple CustomerUser assignments', () => {
    const multi = user({ userType: 'customer', customerMasterIds: ['cust-a', 'cust-b'] });
    const dest = resolvePostLoginDestination(multi);
    assert.equal(dest.ok, false);
    if (!dest.ok) {
      assert.equal(dest.reason, 'ambiguous_customer');
    }
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: multi, pathname: '/customer' }),
      { action: 'redirect', to: UNIFIED_LOGIN_PATH }
    );
  });

  it('blocks customers from internal deep links without leaking those routes', () => {
    const customer = user({ userType: 'customer' });
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/internal/costing' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/customer/inquiries' }),
      { action: 'allow' }
    );
    assert.equal(customerInquiryIdFromPath('/customer/inquiries/inq-123'), 'inq-123');
    assert.equal(isCustomerInquiryDetailPath('/customer/inquiries/inq-123'), true);
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/customer/inquiries/inq-123' }),
      { action: 'allow' }
    );
  });

  it('allows internal users on internal paths and redirects them away from customer URLs', () => {
    const internal = user({ userType: 'internal' });
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/internal/technical-office' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/customer/support' }),
      { action: 'redirect', to: INTERNAL_HOME_PATH }
    );
  });

  it('sends logout and unknown authenticated URLs to a safe destination', () => {
    const customer = user({ userType: 'customer' });
    assert.equal(UNIFIED_LOGIN_PATH, '/login');
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/not-a-real-page' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: false, user: null, pathname: '/customer/inquiries' }),
      { action: 'redirect', to: UNIFIED_LOGIN_PATH }
    );
  });

  it('keeps ELAND customers on the allowed customer tabs', () => {
    const eland = user({
      userType: 'customer',
      companyName: 'ELAND Cables',
      email: 'david.smith@elandcables.com',
    });
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: eland, pathname: '/customer/drum-optimizer' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: eland, pathname: '/customer/support' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: eland, pathname: '/customer/sales-orders' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: eland, pathname: '/customer/documents' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: eland, pathname: '/customer/products' }),
      { action: 'allow' }
    );
  });

  it('allows portal profile routes and blocks the other portal profile', () => {
    const customer = user({ userType: 'customer' });
    const internal = user({ userType: 'internal' });
    const eland = user({
      userType: 'customer',
      companyName: 'ELAND Cables',
      email: 'david.smith@elandcables.com',
    });
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: false, pathname: '/customer/profile' }),
      { action: 'redirect', to: UNIFIED_LOGIN_PATH }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/customer/profile' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: eland, pathname: '/customer/profile' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/internal/profile' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/internal/profile' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/customer/profile' }),
      { action: 'redirect', to: INTERNAL_HOME_PATH }
    );
  });

  it('allows internal users on V2 platform paths and blocks customers from the platform navigator', () => {
    const customer = user({ userType: 'customer' });
    const internal = user({ userType: 'internal' });
    assert.equal(isV2AppPath('/v2'), true);
    assert.equal(isV2AppPath('/v2/security'), true);
    assert.equal(isV2AppPath('/v2/modules/customer/master/customers'), true);
    assert.equal(isV2AppPath('/v2/master-data'), true);
    assert.equal(V2_HOME_PATH, '/v2');
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/v2' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/v2/security' }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({
        isAuthenticated: true,
        user: internal,
        pathname: '/v2/modules/engineering/master/cables',
      }),
      { action: 'allow' }
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/v2' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH }
    );
  });

  it('distinguishes V2 product shells from /v2/modules/customer and the platform catch-all prefix', () => {
    assert.equal(isV2CustomerProductPath('/v2/customer'), true);
    assert.equal(isV2CustomerProductPath('/v2/customer/inquiries'), true);
    assert.equal(isV2CustomerProductPath('/v2/modules/customer'), false);
    assert.equal(isV2CustomerProductPath('/v2/modules/customer/master/customers'), false);
    assert.equal(isV2InternalProductPath('/v2/internal'), true);
    assert.equal(isV2InternalProductPath('/v2/internal/costing'), true);
    assert.equal(isV2PlatformPath('/v2'), true);
    assert.equal(isV2PlatformPath('/v2/security'), true);
    assert.equal(isV2PlatformPath('/v2/master-data'), true);
    assert.equal(isV2PlatformPath('/v2/modules/customer'), true);
    assert.equal(isV2PlatformPath('/v2/not-a-real-page'), true);
    assert.equal(isV2PlatformPath('/v2/customer'), false);
    assert.equal(isV2PlatformPath('/v2/internal'), false);
    assert.equal(resolveAuthenticatedShellKind('/v2/customer'), 'v2_customer');
    assert.equal(resolveAuthenticatedShellKind('/v2/customer/quotations'), 'v2_customer');
    assert.equal(resolveAuthenticatedShellKind('/v2/internal'), 'v2_internal');
    assert.equal(resolveAuthenticatedShellKind('/v2'), 'v2_platform');
    assert.equal(resolveAuthenticatedShellKind('/v2/not-a-real-page'), 'v2_platform');
    assert.equal(resolveAuthenticatedShellKind('/v2/modules/customer'), 'v2_platform');
    assert.equal(resolveAuthenticatedShellKind('/customer/inquiries'), 'v1');
    assert.equal(resolveAuthenticatedShellKind('/internal/costing'), 'v1');
  });

  it('enforces P1.5-03 customer and internal product-shell isolation', () => {
    const customer = user({ userType: 'customer' });
    const internal = user({ userType: 'internal' });

    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: V2_CUSTOMER_HOME_PATH }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: `${V2_CUSTOMER_HOME_PATH}/inquiries` }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: `${V2_CUSTOMER_HOME_PATH}/inquiries/inq-other` }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/v2' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/v2/modules/customer' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/v2/internal' }),
      { action: 'redirect', to: CUSTOMER_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: customer, pathname: '/customer/support' }),
      { action: 'allow' },
    );

    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: V2_INTERNAL_HOME_PATH }),
      { action: 'allow' },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: `${V2_INTERNAL_HOME_PATH}/costing` }),
      { action: 'allow' },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/v2' }),
      { action: 'allow' },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/v2/master-data' }),
      { action: 'allow' },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/v2/modules/engineering' }),
      { action: 'allow' },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: V2_CUSTOMER_HOME_PATH }),
      { action: 'redirect', to: V2_INTERNAL_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: `${V2_CUSTOMER_HOME_PATH}/inquiries` }),
      { action: 'redirect', to: V2_INTERNAL_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: `${V2_CUSTOMER_HOME_PATH}/inquiries/inq-other` }),
      { action: 'redirect', to: V2_INTERNAL_HOME_PATH },
    );
    assert.deepEqual(
      resolveShellNavigation({ isAuthenticated: true, user: internal, pathname: '/internal/costing' }),
      { action: 'allow' },
    );
  });
});
