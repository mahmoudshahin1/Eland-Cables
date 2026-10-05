import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError, issue } from './domainError';

describe('domainError', () => {
  it('does not map missing price to zero', () => {
    const err = issue('PRICE_NOT_CONFIGURED', 'Raw material A-EC01 has a blank price.');
    assert.equal(err.code, 'PRICE_NOT_CONFIGURED');
    assert.equal(err.message.includes('price 0'), false);
    assert.ok(err instanceof DomainError);
  });

  it('marks unsigned engineering rules as CONFIGURATION_REQUIRED', () => {
    const err = issue('CONFIGURATION_REQUIRED', 'Automatic EWD drum selection has no signed winding rule.');
    assert.equal(err.code, 'CONFIGURATION_REQUIRED');
  });
});
