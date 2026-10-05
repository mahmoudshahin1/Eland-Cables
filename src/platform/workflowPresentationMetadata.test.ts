import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WORKFLOW_TO_INQUIRY_STATUS_HINT } from '../domain/workflowRuntimeService';
import {
  isGenericWorkflowEngineEnabled,
  presentationForWorkflowStep,
  presentationHintsMatchRuntimeMap,
  STANDARD_WORKFLOW_STEP_PRESENTATION,
  vipUsesStandardInquiryTemplate,
  workflowQueues,
} from './workflow/workflowPresentationMetadata';

describe('Phase 11 workflow presentation metadata', () => {
  it('does not enable a generic workflow engine', () => {
    assert.equal(isGenericWorkflowEngineEnabled(), false);
  });

  it('keeps VIP off the STANDARD_INQUIRY_V1 template', () => {
    assert.equal(vipUsesStandardInquiryTemplate(), false);
  });

  it('covers STANDARD stages with labels and queues', () => {
    const codes = STANDARD_WORKFLOW_STEP_PRESENTATION.map((s) => s.stepCode);
    assert.ok(codes.includes('TECHNICAL_REVIEW'));
    assert.ok(codes.includes('CONTAINER_STUDY'));
    assert.ok(codes.includes('COSTING'));
    assert.ok(workflowQueues().includes('TECHNICAL_OFFICE'));
    assert.equal(presentationForWorkflowStep('COSTING')?.label, 'Costing');
  });

  it('stays aligned with runtime inquiry status hints', () => {
    assert.equal(presentationHintsMatchRuntimeMap(), true);
    assert.equal(WORKFLOW_TO_INQUIRY_STATUS_HINT.FULFILLMENT, 'CLOSED');
  });
});
