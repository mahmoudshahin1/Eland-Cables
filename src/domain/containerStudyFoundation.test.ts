import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { physicalDrumKey, parsePhysicalDrumKey, plannedPhysicalDrumKeys } from './physicalDrumIdentity';
import { assertContainerStudyTransition } from './containerStudyLifecycle';
import { evaluateContainerStudyStructure, evaluateConfirmReadiness } from './containerStudyValidation';
import { refuseContainerStudyCalculation } from './containerStudyCalculationGuard';
import { DomainError } from '../platform/errors/domainError';

describe('Container Study domain foundation (05I-DD)', () => {
  it('builds deterministic physicalDrumKey without random UUIDs', () => {
    assert.equal(physicalDrumKey('line-A', 0), 'line-A:0');
    assert.deepEqual(parsePhysicalDrumKey('line-A:12'), { sourceLineId: 'line-A', instanceIndex: 12 });
    assert.deepEqual(plannedPhysicalDrumKeys('L1', 3), ['L1:0', 'L1:1', 'L1:2']);
  });

  it('rejects invalid lifecycle transitions', () => {
    assert.throws(
      () => assertContainerStudyTransition('CONFIRMED', 'DRAFT'),
      (err: unknown) => err instanceof DomainError && err.code === 'VALIDATION_FAILED'
    );
    assert.doesNotThrow(() => assertContainerStudyTransition('DRAFT', 'VALIDATED'));
  });

  it('blocks VALIDATED when dimensions are pending approval', () => {
    const result = evaluateContainerStudyStructure({
      shipmentGroupId: 'sg1',
      stuffingMethod: 'Rolling',
      algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
      configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
      configurationStatus: 'ACTIVE',
      drums: [{ sourceLineId: 'L1', quantity: 2, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1039 }],
      pinnedContainerTypes: [
        {
          code: '40HQ',
          parityLabel: '40 HQ',
          versionId: 'v1',
          versionNo: 1,
          usableLengthMm: null,
          internalWidthMm: null,
          payloadCapacityKg: null,
          dimensionsStatus: 'PENDING_APPROVAL',
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'DIMENSIONS_PENDING_APPROVAL'));
  });

  it('does not convert Forklifting to Rolling', () => {
    assert.throws(
      () => refuseContainerStudyCalculation('Forklifting'),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === 'BUSINESS_RULE_REQUIRED' &&
        String(err.message).includes('STUFFING_METHOD_NOT_IMPLEMENTED') &&
        !String(err.message).toLowerCase().includes('rolling')
    );
    assert.doesNotThrow(() => refuseContainerStudyCalculation('Rolling'));
    assert.equal(String(refuseContainerStudyCalculation.toString()).includes('NEXT TASK = 05I-DE'), false);
    assert.equal(String(refuseContainerStudyCalculation.toString()).includes('engine is not implemented'), false);
  });

  it('requires a calculation result before CONFIRMED', () => {
    const result = evaluateConfirmReadiness({
      shipmentGroupId: 'sg1',
      stuffingMethod: 'Rolling',
      algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
      configurationVersion: 'CFG-1',
      configurationStatus: 'ACTIVE',
      drums: [{ sourceLineId: 'L1', quantity: 1, packedLengthMm: 1000, packedWidthMm: 800, grossWeightKg: 500 }],
      pinnedContainerTypes: [
        {
          code: '40HQ',
          parityLabel: '40 HQ',
          versionId: 'v1',
          versionNo: 1,
          usableLengthMm: 12000,
          internalWidthMm: 2350,
          payloadCapacityKg: 26000,
          dimensionsStatus: 'APPROVED',
        },
      ],
      hasResult: false,
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === 'CALCULATION_RESULT_REQUIRED'));
  });

  it('rejects virtual physical allocations', () => {
    const result = evaluateContainerStudyStructure({
      shipmentGroupId: 'sg1',
      stuffingMethod: 'Rolling',
      algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
      configurationVersion: 'CFG-1',
      configurationStatus: 'ACTIVE',
      drums: [{ sourceLineId: 'L1', quantity: 1, packedLengthMm: 1000, packedWidthMm: 800, grossWeightKg: 500 }],
      pinnedContainerTypes: [
        {
          code: '40HQ',
          parityLabel: '40 HQ',
          versionId: 'v1',
          versionNo: 1,
          usableLengthMm: 12000,
          internalWidthMm: 2350,
          payloadCapacityKg: 26000,
          dimensionsStatus: 'APPROVED',
        },
      ],
      virtualAllocationCount: 1,
    });
    assert.ok(result.issues.some((i) => i.code === 'VIRTUAL_LAYER_NOT_SUPPORTED'));
  });
});
