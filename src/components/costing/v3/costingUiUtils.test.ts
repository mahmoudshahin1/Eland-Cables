import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pendingApprovalIds, summarizeBulkApprove } from './costingUiUtils';

describe('costing v3 bulk approve helpers', () => {
  it('selects only submitted and under-review ids', () => {
    const ids = pendingApprovalIds([
      { id: 'a', workflowStatus: 'SUBMITTED' },
      { id: 'b', workflowStatus: 'DRAFT' },
      { id: 'c', workflowStatus: 'UNDER_REVIEW' },
      { id: 'd', workflowStatus: 'APPROVED' },
    ]);
    assert.deepEqual(ids, ['a', 'c']);
  });

  it('summarizes approved, failed, and skipped counts', () => {
    assert.equal(
      summarizeBulkApprove({
        approvedCount: 4,
        skippedCount: 1,
        failedCount: 1,
        failed: [{ error: 'overlapping period' }],
      }),
      'Approved 4. 1 failed (overlapping period). 1 skipped (not submitted)'
    );
  });
});
