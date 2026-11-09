import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from './isolatedPrint';

describe('escapeHtml', () => {
  it('escapes characters that would break a print document', () => {
    assert.equal(escapeHtml(`<b class="x">A & B</b>`), '&lt;b class=&quot;x&quot;&gt;A &amp; B&lt;/b&gt;');
    assert.equal(escapeHtml(null), '');
  });
});