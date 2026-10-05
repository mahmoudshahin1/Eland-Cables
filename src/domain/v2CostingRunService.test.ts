import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildV2CostingRequestFromHandoff,
  DECISION5_STATUS,
  V2_COSTING_WORKFLOW_CHANNEL,
} from '../domain/v2CostingRequestService';
import type { DrumPlanHandoffDto } from '../domain/v2DrumPlanService';

function sampleHandoff(overrides?: Partial<DrumPlanHandoffDto>): DrumPlanHandoffDto {
  return {
    inquiryLineId: 'line-1',
    drumPlanId: 'dp-internal',
    drumPlanIdString: 'V2DRUM-001',
    drumPlanVersionNo: 1,
    cuttingLengthPlanId: 'cl-internal',
    cuttingLengthPlanIdString: 'V2CUT-001',
    configurationSnapshotId: 'cfg-internal',
    configurationSnapshotIdString: 'V2CFG-001',
    cableMaterialNumber: '10009487',
    selectionMethod: 'AUTOMATIC',
    cableTolerancePercent: 1,
    totalPlannedLengthM: 1500,
    drumCount: 2,
    remainderLengthM: 0,
    quantityReconciliationStatus: 'OK',
    quantityReconciliationMessages: [],
    validationStatus: 'VALID',
    lifecycleStatus: 'CONFIRMED',
    lines: [
      {
        lineNo: 1,
        drumCode: 'EWD-2600',
        drumMasterId: 'dm-1',
        numberOfDrums: 1,
        cuttingLengthM: 750,
        isRemainderDrum: false,
        plannedCableLengthM: 750,
        clearanceMm: 50,
        capacityM: 1000,
        maxLoadKg: 5000,
        cableWeightKg: 1200,
        grossLoadedDrumWeightKg: 5200,
        lengthUtilizationPercent: 75,
        loadUtilizationPercent: 24,
      },
    ],
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('v2CostingRunService — request builder', () => {
  it('buildV2CostingRequestFromHandoff uses totalPlannedLengthM not legacy cutting fields', () => {
    const handoff = sampleHandoff({ totalPlannedLengthM: 4321 });
    const req = buildV2CostingRequestFromHandoff(handoff, { currency: 'USD' }, 3, {
      previewOnly: true,
    });
    assert.ok(!('error' in req));
    assert.equal(req.lengthMeters, 4321);
    assert.equal(req.materialNumber, '10009487');
    assert.equal(req.quantity, 3);
    assert.equal(req.commercialMetadata?.workflowChannel, V2_COSTING_WORKFLOW_CHANNEL);
  });

  it('rejects non-CONFIRMED drum plan handoff', () => {
    const handoff = sampleHandoff({ lifecycleStatus: 'VALIDATED' });
    const req = buildV2CostingRequestFromHandoff(handoff, { currency: 'USD' }, 1);
    assert.ok('error' in req);
    assert.match(req.error, /CONFIRMED/);
  });

  it('rejects missing cable material number', () => {
    const handoff = sampleHandoff({ cableMaterialNumber: null });
    const req = buildV2CostingRequestFromHandoff(handoff, { currency: 'USD' }, 1);
    assert.ok('error' in req);
  });

  it('documents Decision 5 as pending business sign-off', () => {
    assert.equal(DECISION5_STATUS, 'PENDING_BUSINESS_SIGN_OFF');
  });

  it('does not import drum optimization modules', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../domain/v2CostingRequestService.ts', import.meta.url), 'utf8')
    );
    assert.ok(!source.includes('drumOptimizationService'));
    assert.ok(!source.includes('optimizeDrumPlan'));
  });
});
