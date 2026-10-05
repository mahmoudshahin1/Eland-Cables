import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ModulePermissions, UserAccount } from '../types';
import { profileExposesInternalOnlyFields, visibleProfileFields } from './userProfileView';

function user(partial: Partial<UserAccount> & Pick<UserAccount, 'userType'>): UserAccount {
  return {
    id: 'u-1',
    userName: 'user',
    fullName: 'Test User',
    email: 'user@example.com',
    department: 'Costing & Pricing',
    role: 'COSTING_MANAGER',
    status: 'Active',
    permissions: { costingPricing: true } as ModulePermissions,
    employeeNumber: 'E-99',
    jobTitle: 'Costing Manager',
    mobile: '+20 100',
    companyName: 'ELAND Cables',
    customerCode: 'ELAND',
    lastLogin: '2026-08-27',
    roles: ['COSTING_MANAGER'],
    ...partial,
  };
}

describe('Authenticated profile field visibility', () => {
  it('shows company information to customers without internal-only fields or permissions', () => {
    const customer = user({ userType: 'customer', role: 'CUSTOMER_USER', roles: ['CUSTOMER_USER'] });
    const fields = visibleProfileFields(customer);
    const keys = fields.map((f) => f.key);
    assert.ok(keys.includes('fullName'));
    assert.ok(keys.includes('email'));
    assert.ok(keys.includes('companyName'));
    assert.equal(profileExposesInternalOnlyFields(customer), false);
    assert.equal(keys.includes('employeeNumber'), false);
    assert.equal(keys.includes('jobTitle'), false);
    assert.equal(keys.includes('department'), false);
    assert.equal(keys.includes('permissions'), false);
    assert.ok(!JSON.stringify(fields).includes('costingPricing'));
  });

  it('shows role and internal organization fields to internal users', () => {
    const internal = user({ userType: 'internal' });
    const fields = visibleProfileFields(internal);
    const keys = fields.map((f) => f.key);
    assert.equal(keys.includes('role'), true);
    assert.equal(keys.includes('department'), true);
    assert.equal(keys.includes('employeeNumber'), true);
    assert.equal(fields.find((f) => f.key === 'role')?.value, 'COSTING_MANAGER');
    assert.equal(keys.includes('permissions'), false);
  });
});
