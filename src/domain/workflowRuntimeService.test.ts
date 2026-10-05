import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertTransitionAllowed,
  evaluateTransitionCondition,
  listOutgoingTransitions,
  parseTransitionCondition,
  STANDARD_INQUIRY_TEMPLATE_CODE,
  WORKFLOW_TO_INQUIRY_STATUS_HINT,
} from './workflowRuntimeService';

const template = {
  id: 'tpl',
  code: STANDARD_INQUIRY_TEMPLATE_CODE,
  version: 1,
  name: 'Standard',
  inquiryProcessCode: 'STANDARD_WORKFLOW' as const,
  steps: [
    { stepCode: 'SUBMITTED', name: 'Submitted', sortOrder: 10, isTerminal: false, allowCustomerAction: false, requiredPermission: null },
    { stepCode: 'TECHNICAL_REVIEW', name: 'Technical Review', sortOrder: 20, isTerminal: false, allowCustomerAction: false, requiredPermission: null },
    { stepCode: 'CUSTOMER_RESPONSE', name: 'Customer Response', sortOrder: 50, isTerminal: false, allowCustomerAction: true, requiredPermission: null },
    { stepCode: 'FULFILLMENT', name: 'Fulfillment', sortOrder: 140, isTerminal: true, allowCustomerAction: false, requiredPermission: null },
  ],
  transitions: [
    { transitionCode: 'START', fromStepCode: 'SUBMITTED', toStepCode: 'TECHNICAL_REVIEW', label: 'Start', conditionJson: { type: 'inquiryProcessCode' as const, value: 'STANDARD_WORKFLOW' as const } },
    { transitionCode: 'REQ_INFO', fromStepCode: 'TECHNICAL_REVIEW', toStepCode: 'NEEDS_INFORMATION', label: 'Info', conditionJson: null },
    { transitionCode: 'CUSTOMER_RESPONDED', fromStepCode: 'CUSTOMER_RESPONSE', toStepCode: 'TECHNICAL_REVIEW', label: 'Responded', conditionJson: { type: 'taskResult' as const, value: 'RESPONDED' } },
    { transitionCode: 'COMPLETE', fromStepCode: 'FULFILLMENT', toStepCode: 'FULFILLMENT', label: 'Done', conditionJson: { type: 'terminal' as const, value: true } },
  ],
};

describe('workflowRuntimeService — domain', () => {
  it('parses governed transition conditions', () => {
    assert.deepEqual(parseTransitionCondition({ type: 'taskResult', value: 'APPROVED' }), {
      type: 'taskResult',
      value: 'APPROVED',
    });
    assert.equal(parseTransitionCondition({ type: 'unknown' }), null);
  });

  it('evaluates inquiryProcessCode and taskResult conditions', () => {
    assert.equal(
      evaluateTransitionCondition({ type: 'inquiryProcessCode', value: 'STANDARD_WORKFLOW' }, {
        inquiryProcessCode: 'STANDARD_WORKFLOW',
      }),
      true
    );
    assert.equal(
      evaluateTransitionCondition({ type: 'taskResult', value: 'RESPONDED' }, { taskResult: 'DECLINED' }),
      false
    );
  });

  it('lists outgoing transitions for current step', () => {
    const outgoing = listOutgoingTransitions(template, 'TECHNICAL_REVIEW', {});
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].transitionCode, 'REQ_INFO');
  });

  it('assertTransitionAllowed rejects invalid transition', () => {
    assert.throws(
      () => assertTransitionAllowed(template, 'SUBMITTED', 'REQ_INFO', {}),
      (err: Error & { code?: string }) => err.code === 'INVALID_WORKFLOW_TRANSITION'
    );
  });

  it('assertTransitionAllowed enforces inquiry process condition on START', () => {
    assert.throws(
      () =>
        assertTransitionAllowed(template, 'SUBMITTED', 'START', {
          inquiryProcessCode: 'VIP_FAST_TRACK',
        }),
      (err: Error & { code?: string }) => err.code === 'WORKFLOW_CONDITION_FAILED'
    );
  });

  it('documents workflow-to-inquiry status mapping hints', () => {
    assert.equal(WORKFLOW_TO_INQUIRY_STATUS_HINT.TECHNICAL_REVIEW, 'ENGINEERING_REVIEW');
    assert.equal(WORKFLOW_TO_INQUIRY_STATUS_HINT.FULFILLMENT, 'CLOSED');
  });
});
