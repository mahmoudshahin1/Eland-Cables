import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getJwtExpiryMs, REMEMBER_SESSION_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './tokenStorage';

describe('JWT client expiry helper', () => {
  it('reads exp from a JWT payload', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_700_000_000 }), 'utf8').toString('base64url');
    const token = `header.${payload}.sig`;
    assert.equal(getJwtExpiryMs(token), 1_700_000_000 * 1000);
  });

  it('returns null for invalid or missing tokens', () => {
    assert.equal(getJwtExpiryMs(null), null);
    assert.equal(getJwtExpiryMs('not-a-jwt'), null);
  });

  it('keeps remember-me on the same client storage keys', () => {
    assert.equal(ACCESS_TOKEN_KEY, 'jwt_access_token');
    assert.equal(REFRESH_TOKEN_KEY, 'jwt_refresh_token');
    assert.equal(REMEMBER_SESSION_KEY, 'jwt_remember');
  });
});
