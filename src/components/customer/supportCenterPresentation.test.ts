import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { caseStatusLabel, caseStatusTone, formatSupportDate, supportPageNumbers } from './supportCenterPresentation';

describe('Support center presentation', () => {
  it('labels and tones customer-facing case statuses', () => {
    assert.equal(caseStatusLabel('AWAITING_CUSTOMER'), 'Awaiting Your Response');
    assert.equal(caseStatusTone('RESOLVED'), 'success');
    assert.equal(caseStatusTone('IN_PROGRESS'), 'warning');
    assert.match(formatSupportDate('2026-09-18T00:00:00.000Z'), /2026/);
  });

  it('builds compact numbered pagination windows', () => {
    assert.deepEqual(supportPageNumbers(1, 5), [1, 2, 3, 4, 5]);
    assert.equal(supportPageNumbers(4, 20).length, 9);
    assert.equal(supportPageNumbers(4, 20)[0], 1);
  });
});
