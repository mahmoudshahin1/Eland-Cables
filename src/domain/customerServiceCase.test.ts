import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPLAINT_CATEGORY_SEED, CUSTOMER_SERVICE_CASE_SEQUENCE } from './complaintCategorySeed';
import {
  customerCanConfirmResolution,
  customerCanRequestReopen,
  customerCanSeeComment,
  filterCommentsForActor,
  nextStatusAfterCustomerComment,
  resolveCommentVisibilityForActor,
  statusForCaseTab,
} from './customerServiceCase';

describe('Customer service case domain', () => {
  it('documents a controlled category master and CS-YY-##### sequence', () => {
    assert.equal(COMPLAINT_CATEGORY_SEED.length, 15);
    assert.equal(COMPLAINT_CATEGORY_SEED[0].name, 'Product / Cable Quality');
    assert.equal(COMPLAINT_CATEGORY_SEED[COMPLAINT_CATEGORY_SEED.length - 1].code, 'OTHER');
    assert.equal(CUSTOMER_SERVICE_CASE_SEQUENCE.code, 'CUSTOMER_SERVICE_CASE');
    assert.equal(CUSTOMER_SERVICE_CASE_SEQUENCE.format, '{PREFIX}-{YY}-{#####}');
    assert.equal(CUSTOMER_SERVICE_CASE_SEQUENCE.prefix, 'CS');
  });

  it('maps list tabs to statuses and hides internal comments from customers', () => {
    assert.equal(statusForCaseTab('all'), undefined);
    assert.equal(statusForCaseTab('awaiting_customer'), 'AWAITING_CUSTOMER');
    assert.equal(customerCanSeeComment('CUSTOMER'), true);
    assert.equal(customerCanSeeComment('INTERNAL'), false);
    const rows = filterCommentsForActor(
      [
        { id: '1', visibility: 'CUSTOMER' },
        { id: '2', visibility: 'INTERNAL' },
      ],
      'customer'
    );
    assert.deepEqual(rows.map((r) => r.id), ['1']);
    assert.equal(filterCommentsForActor(rows, 'internal').length, 1);
  });

  it('forces customer comments to CUSTOMER visibility', () => {
    assert.equal(resolveCommentVisibilityForActor('customer', 'INTERNAL'), 'CUSTOMER');
    assert.equal(resolveCommentVisibilityForActor('internal', 'INTERNAL'), 'INTERNAL');
  });

  it('allows confirm/reopen only from resolved or closed', () => {
    assert.equal(customerCanConfirmResolution('RESOLVED'), true);
    assert.equal(customerCanConfirmResolution('OPEN'), false);
    assert.equal(customerCanRequestReopen('CLOSED'), true);
    assert.equal(customerCanRequestReopen('IN_PROGRESS'), false);
    assert.equal(nextStatusAfterCustomerComment('AWAITING_CUSTOMER'), 'IN_PROGRESS');
    assert.equal(nextStatusAfterCustomerComment('OPEN'), null);
  });
});
