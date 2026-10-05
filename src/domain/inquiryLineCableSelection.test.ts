import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inquiryLineCableIdentityChanged,
  nextInquiryLineMaterialNumber,
  normalizeInquiryLineMaterialNumber,
} from './inquiryLineCableSelection';

describe('inquiry line cable selection', () => {
  it('clears a selected cable identity without inventing a material number', () => {
    assert.equal(nextInquiryLineMaterialNumber(null, '10009487'), null);
    assert.equal(nextInquiryLineMaterialNumber('', '10009487'), null);
    assert.equal(nextInquiryLineMaterialNumber('   ', '10009487'), null);
    assert.equal(normalizeInquiryLineMaterialNumber('10009487'), '10009487');
  });

  it('replaces a selected cable identity with another Cable Master number', () => {
    assert.equal(nextInquiryLineMaterialNumber('10009546', '10009487'), '10009546');
    assert.equal(inquiryLineCableIdentityChanged('10009487', '10009546'), true);
  });

  it('leaves the current cable unchanged when materialNumber is omitted', () => {
    assert.equal(nextInquiryLineMaterialNumber(undefined, '10009487'), '10009487');
    assert.equal(inquiryLineCableIdentityChanged('10009487', '10009487'), false);
  });
});
