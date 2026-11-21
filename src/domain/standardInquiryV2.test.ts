import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actorMayTransitionStep,
  auditActionForWorkflowMove,
  clarificationAdvanceCode,
  evaluateCustomerPo,
  forwardStageAction,
  stageOwnerLabel,
  responseTransitionCode,
  routeContainerStudy,
  stagesInvalidatedByChange,
} from './standardInquiryV2';

describe('STANDARD_INQUIRY_V2 decisions', () => {
  it('enters container study only when a logistics signal already exists', () => {
    assert.equal(routeContainerStudy({ shipmentGroupCount: 1, containerStudyCount: 0 }), 'ENTER');
    assert.equal(routeContainerStudy({ shipmentGroupCount: 0, containerStudyCount: 2 }), 'ENTER');
  });

  it('blocks an export customer with no shipment groups and skips everyone else', () => {
    assert.equal(
      routeContainerStudy({ shipmentGroupCount: 0, containerStudyCount: 0, customerSegmentCode: 'EXPORT' }),
      'BLOCK'
    );
    assert.equal(
      routeContainerStudy({ shipmentGroupCount: 0, containerStudyCount: 0, customerSegmentCode: 'LOCAL' }),
      'SKIP'
    );
  });

  it('rejects a PO dated after quotation validity and a value mismatch', () => {
    const validUntil = new Date('2026-01-31T00:00:00.000Z');
    const late = evaluateCustomerPo({
      customerPoDate: new Date('2026-02-02T00:00:00.000Z'),
      quotationValidUntil: validUntil,
    });
    assert.equal(late.matched, false);
    const value = evaluateCustomerPo({
      customerPoDate: new Date('2026-01-15T00:00:00.000Z'),
      quotationValidUntil: validUntil,
      poValue: 10,
      quotedValue: 12,
    });
    assert.equal(value.matched, false);
    const ok = evaluateCustomerPo({
      customerPoDate: new Date('2026-01-15T00:00:00.000Z'),
      quotationValidUntil: validUntil,
      poValue: 12,
      quotedValue: 12,
      poQuantity: 5,
      quotedQuantity: 5,
    });
    assert.equal(ok.matched, true);
  });

  it('lets only the owning role move a stage, with a system-admin override', () => {
    assert.equal(actorMayTransitionStep('FINANCIAL_RELEASE', ['SALES_MANAGER']), false);
    assert.equal(actorMayTransitionStep('FINANCIAL_RELEASE', ['FINANCE_MANAGER']), true);
    assert.equal(actorMayTransitionStep('TECHNICAL_RELEASE', ['PRODUCTION_PLANNER']), true);
    assert.equal(actorMayTransitionStep('TECHNICAL_RELEASE', ['TECHNICAL_OFFICE_ENGINEER']), false);
    assert.equal(actorMayTransitionStep('COSTING', ['SALES_REPRESENTATIVE']), false);
    assert.equal(actorMayTransitionStep('COSTING', ['SYSTEM_ADMINISTRATOR']), true);
  });

  it('does not reopen technical review for a price-only change', () => {
    assert.deepEqual(stagesInvalidatedByChange('PRICE').includes('TECHNICAL_REVIEW'), false);
    assert.deepEqual(stagesInvalidatedByChange('TECHNICAL').includes('COSTING'), true);
    assert.equal(responseTransitionCode('COSTING_RESPONSE'), 'COSTING_RESPONDED');
    assert.equal(clarificationAdvanceCode('PO_VALIDATION_NEEDS_INFORMATION'), 'PO_VALIDATION_TO_CLARIFICATION');
    assert.equal(forwardStageAction('COMMERCIAL_COMMITMENT')?.transitionCode, 'TO_SALES_ORDER');
    assert.equal(forwardStageAction('CONFIRMED_SALES_ORDER')?.label, 'Hand over to production');
    assert.equal(forwardStageAction('FINANCIAL_RELEASE'), null);
    assert.equal(stageOwnerLabel('PO_VALIDATION'), 'Sales Manager');
    assert.equal(stageOwnerLabel('CUSTOMER_DECISION'), 'Customer');
    assert.equal(stageOwnerLabel('PRODUCTION_HANDOVER'), 'Production Planner');
    assert.equal(
      auditActionForWorkflowMove({ fromStepCode: 'COSTING', toStepCode: 'COSTING_NEEDS_INFORMATION' }),
      'WORKFLOW_CHANGE_REQUEST_OPENED'
    );
  });
});
