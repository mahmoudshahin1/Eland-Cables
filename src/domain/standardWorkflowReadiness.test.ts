import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateStandardEngineering,
  evaluateStandardPostSubmitReadiness,
  lineRequiresTechnicalOffice,
  type StandardLineEvidence,
} from './standardWorkflowReadiness';

const validLine: StandardLineEvidence = {
  lineId: 'l1',
  lineNumber: 1,
  v2CurrentSnapshotId: 's1',
  v2CurrentCuttingPlanId: 'c1',
  v2CurrentDrumPlanId: 'd1',
  configurationSnapshot: {
    id: 's1',
    validationStatus: 'EXISTING_APPROVED',
    flowState: 'VALID',
    bomGovernanceBlocked: false,
    unresolvedBomConflictCount: 0,
    engineeringStatus: 'Released',
  },
  cuttingPlan: { id: 'c1', validationStatus: 'VALID' },
  drumPlan: { id: 'd1', lifecycleStatus: 'CONFIRMED', validationStatus: 'VALID' },
};

describe('STANDARD_WORKFLOW readiness', () => {
  it('auto-clears engineering when snapshot is existing approved / valid', () => {
    const result = evaluateStandardEngineering([validLine]);
    assert.equal(result.allApproved, true);
    assert.equal(result.toRequired, false);
  });

  it('requires TO on TECHNICALLY_VALID_NOT_MASTER exception', () => {
    const line = {
      ...validLine,
      configurationSnapshot: {
        ...validLine.configurationSnapshot!,
        validationStatus: 'TECHNICALLY_VALID_NOT_MASTER',
        flowState: 'VALID',
      },
    };
    assert.equal(lineRequiresTechnicalOffice(line), true);
    const result = evaluateStandardEngineering([line]);
    assert.equal(result.toRequired, true);
    assert.equal(result.allApproved, false);
  });

  it('imported catalog engineering is ready without a V2 snapshot', () => {
    const imported = {
      lineId: 'l2',
      lineNumber: 2,
      v2CurrentSnapshotId: null,
      v2CurrentCuttingPlanId: null,
      v2CurrentDrumPlanId: null,
      importedCable: {
        materialNumber: '88001002',
        cableMasterApprovalStatus: 'APPROVED',
        engineeringWorkflowStatus: 'APPROVED',
        bomLineCount: 5,
        unresolvedBomConflictCount: 0,
      },
      configurationSnapshot: null,
    };
    const result = evaluateStandardEngineering([imported]);
    assert.equal(result.allApproved, true);
    assert.equal(result.gates.some((g) => g.code === 'SNAPSHOT_REQUIRED'), false);
  });

  it('does not fabricate cutting/drum evidence — missing lineage blocks costing', () => {
    const result = evaluateStandardPostSubmitReadiness({
      containerStudyEvidence: {
        processCode: 'STANDARD_WORKFLOW',
        shipmentGroups: [],
        studies: [],
        drumPlansConfirmed: false,
      },
      lines: [
        {
          ...validLine,
          v2CurrentCuttingPlanId: null,
          cuttingPlan: null,
          v2CurrentDrumPlanId: null,
          drumPlan: null,
        },
      ],
    });
    assert.ok(result.lineageGates.some((g) => g.code === 'CUTTING_PLAN_REQUIRED' && g.status === 'BLOCK'));
    assert.ok(result.lineageGates.some((g) => g.code === 'DRUM_PLAN_REQUIRED' && g.status === 'BLOCK'));
    assert.equal(result.containerStudy.required, false);
    assert.equal(result.containerStudy.status === 'BLOCK', false);
  });
});
