import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyDemoUserLogin, isDemoAuthenticationAllowed } from './demoAuth';
import { isDemoUserSeedAllowed } from '../server/identityService';

describe('Demo authentication production gate', () => {
  it('allows demo login only outside production', () => {
    assert.equal(isDemoAuthenticationAllowed('development'), true);
    assert.equal(isDemoAuthenticationAllowed('test'), true);
    assert.equal(isDemoAuthenticationAllowed(undefined), true);
    assert.equal(isDemoAuthenticationAllowed('production'), false);
  });

  it('does not simulate an authenticated identity in production', () => {
    const user = { id: 'u-demo', email: 'admin@energya.com', role: 'SYSTEM_ADMINISTRATOR' };
    assert.deepEqual(applyDemoUserLogin(user, 'development'), user);
    assert.equal(applyDemoUserLogin(user, 'production'), null);
  });

  it('requires explicit ALLOW_DEMO_USERS or DEMO_SEED for persona seed', () => {
    assert.equal(isDemoUserSeedAllowed(undefined), false);
    assert.equal(isDemoUserSeedAllowed('false'), false);
    assert.equal(isDemoUserSeedAllowed('true'), true);
  });
});
