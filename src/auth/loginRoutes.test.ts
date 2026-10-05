import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNIFIED_LOGIN_PATH,
  canAccessPlatformMode,
  getLoginPortalFromPath,
  isLoginPath,
  platformModeForUser,
  resolveUnauthenticatedPath,
} from './loginRoutes';
import { ModulePermissions, UserAccount } from '../types';
import { postLoginPath, resolvePostLoginDestination } from '../app/shellRoutes';

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

describe('Login routing and portal guards', () => {
  it('treats /login as the unauthenticated entry path', () => {
    assert.equal(isLoginPath('/login'), true);
    assert.equal(isLoginPath('/login/'), true);
    assert.equal(getLoginPortalFromPath('/login'), null);
    assert.equal(resolveUnauthenticatedPath('/'), UNIFIED_LOGIN_PATH);
    assert.equal(resolveUnauthenticatedPath('/internal'), UNIFIED_LOGIN_PATH);
    assert.equal(resolveUnauthenticatedPath('/login/users'), '/login/users');
  });

  it('keeps dedicated customer, users, and admin paths as aliases of /login', () => {
    assert.equal(getLoginPortalFromPath('/login/customer'), 'customer');
    assert.equal(getLoginPortalFromPath('/login/users'), 'users');
    assert.equal(getLoginPortalFromPath('/login/admin'), 'admin');
    assert.equal(isLoginPath('/login/admin'), true);
    assert.equal(isLoginPath('/dashboard'), false);
  });

  it('routes Customer vs Internal from authenticated userType, not a login portal flag', () => {
    assert.equal(platformModeForUser(user({ userType: 'customer' })), 'customer');
    assert.equal(platformModeForUser(user({ userType: 'internal' })), 'internal');
    assert.equal(canAccessPlatformMode(user({ userType: 'customer' }), 'internal'), false);
    assert.equal(canAccessPlatformMode(user({ userType: 'internal' }), 'customer'), false);
    assert.equal(canAccessPlatformMode(user({ userType: 'customer' }), 'customer'), true);
  });

  it('sends internal and customer accounts to their dashboards regardless of login URL alias', () => {
    const customer = user({ userType: 'customer', customerMasterIds: ['cust-eland'] });
    const sales = user({ userType: 'internal', permissions: { userManagement: false } as ModulePermissions });
    const admin = user({ userType: 'internal', permissions: { userManagement: true } as ModulePermissions });
    const eland = user({
      userType: 'customer',
      email: 'david.smith@elandcables.com',
      companyName: 'ELAND Cables',
      customerMasterIds: ['cust-eland'],
    });

    assert.equal(postLoginPath(sales), '/internal');
    assert.equal(postLoginPath(admin), '/internal');
    assert.equal(postLoginPath(customer), '/customer');
    assert.equal(postLoginPath(eland), '/customer');
    assert.equal(resolvePostLoginDestination(sales).ok, true);
    assert.equal(resolvePostLoginDestination(customer).ok, true);
  });

  it('blocks a customer account with no CustomerUser association after credentials succeed', () => {
    const unassigned = user({ userType: 'customer', customerMasterIds: [] });
    const dest = resolvePostLoginDestination(unassigned);
    assert.equal(dest.ok, false);
    if (!dest.ok) {
      assert.equal(dest.reason, 'no_customer_association');
      assert.match(dest.message, /no customer has been assigned/i);
    }
  });
});
