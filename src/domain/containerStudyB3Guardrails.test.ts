import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { CONTAINER_STUDY_STATUSES } from './containerStudyLifecycle';
import { calculateContainerStudy } from './containerStudyCalculationEngine';
import { goldenInput } from './containerStudyGoldenFixtures';
import { mapSnapshotToCalculationInput } from './containerStudySnapshotMapper';
import { selectEligibleConfirmedDrumPlans } from './containerStudyEntireInquiryAggregation';
import { assertLinePointerIsNotAuthoritativeMultiRequirementSource } from './v2RequirementAuthority';
import { DomainError } from '../platform/errors/domainError';

const dir = dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(join(dir, rel), 'utf8');
}

describe('05I-DF-B3 architectural guardrails', () => {
  it('does not introduce CALCULATED lifecycle', () => {
    assert.deepEqual([...CONTAINER_STUDY_STATUSES], ['DRAFT', 'VALIDATED', 'CONFIRMED', 'SUPERSEDED']);
    assert.equal(read('./containerStudyLifecycle.ts').includes("'CALCULATED'"), false);
    assert.equal(read('../server/containerStudyRepository.ts').includes("'CALCULATED'"), false);
  });

  it('keeps the integrity checker and mapper free of I/O, clocks, and randomness', () => {
    for (const file of [
      './containerStudyResultIntegrity.ts',
      './containerStudyInputHardening.ts',
      './containerStudyUnallocatedExplanation.ts',
      './containerStudyLineage.ts',
      './containerStudySnapshotMapper.ts',
      './containerStudyCalculationEngine.ts',
    ]) {
      const src = read(file);
      for (const token of ['getPrisma', '@prisma/client', 'express', 'Date.now', 'Math.random', 'fetch(']) {
        assert.equal(src.includes(token), false, `${file} ${token}`);
      }
    }
  });

  it('closes the public client-drum snapshot route', () => {
    const src = read('../server/containerStudyRoutes.ts');
    assert.match(src, /CLIENT_DRUM_SNAPSHOT_NOT_ALLOWED/);
    assert.equal(src.includes('captureInputSnapshot(req.params.id'), false);
  });

  it('adds uniqueness for physical drum identity without a CALCULATED status', () => {
    const schema = read('../../prisma/schema.prisma');
    assert.match(schema, /model ContainerStudyInputDrum[\s\S]*?@@unique\(\[snapshotId, sourceLineId\]\)/);
    assert.match(schema, /model ContainerStudyResultAllocation[\s\S]*?@@unique\(\[resultId, physicalDrumKey\]\)/);
    assert.match(schema, /model ContainerStudyResultUnallocated[\s\S]*?@@unique\(\[resultId, physicalDrumKey\]\)/);
    const statusEnum = schema.match(/enum ContainerStudyStatus \{[^}]+\}/)?.[0] ?? '';
    assert.match(statusEnum, /DRAFT/);
    assert.match(statusEnum, /VALIDATED/);
    assert.match(statusEnum, /CONFIRMED/);
    assert.match(statusEnum, /SUPERSEDED/);
    assert.equal(statusEnum.includes('CALCULATED'), false);
  });

  it('line pointer alone cannot establish a multi-requirement population', () => {
    assert.throws(
      () =>
        assertLinePointerIsNotAuthoritativeMultiRequirementSource({
          lineCurrentDrumPlanId: 'plan-last-touched',
          selectedDrumPlanIds: ['plan-last-touched'],
          requirementCurrentDrumPlanIds: ['plan-a', 'plan-last-touched'],
        }),
      (err: unknown) => err instanceof DomainError && /not authoritative/.test(err.message)
    );
    const selected = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      inquiryId: 'inq-1',
      lines: [
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId: 'inq-1',
          currentDrumPlanId: 'plan-last-touched',
          currentDrumPlanStatus: 'CONFIRMED',
        },
      ],
      requirements: [
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId: 'inq-1',
          requirementId: 'req-1',
          sequenceNo: 1,
          currentDrumPlanId: 'plan-a',
          currentDrumPlanStatus: 'CONFIRMED',
        },
        {
          lineId: 'line-1',
          lineNumber: 1,
          inquiryId: 'inq-1',
          requirementId: 'req-2',
          sequenceNo: 2,
          currentDrumPlanId: 'plan-last-touched',
          currentDrumPlanStatus: 'CONFIRMED',
        },
      ],
    });
    assert.deepEqual(selected.currentDrumPlanIds, ['plan-a', 'plan-last-touched']);
    assert.equal(selected.currentDrumPlanIds.length === 1, false);
  });

  it('does not claim the calculation engine is unimplemented', () => {
    const repo = read('../server/containerStudyRepository.ts');
    const guard = read('./containerStudyCalculationGuard.ts');
    const validation = read('./containerStudyValidation.ts');
    for (const src of [repo, guard, validation]) {
      assert.equal(src.includes('NEXT TASK = 05I-DE'), false);
      assert.equal(src.includes('The calculation engine is not implemented'), false);
    }
  });

  it('same snapshot and shuffled drum rows produce the same Rolling allocation', () => {
    const drums = [
      { sourceLineId: 'B', quantity: 1, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1000 },
      { sourceLineId: 'A', quantity: 2, packedLengthMm: 2301, packedWidthMm: 982, grossWeightKg: 1100 },
    ];
    const a = calculateContainerStudy(goldenInput('DET-B3', { drums }));
    const b = calculateContainerStudy(goldenInput('DET-B3', { drums: [...drums].reverse() }));
    assert.equal(a.ok, true);
    assert.deepEqual(
      a.allocations.map((x) => x.physicalDrumKey),
      b.allocations.map((x) => x.physicalDrumKey)
    );
    assert.deepEqual(a.summary, b.summary);
  });

  it('mapper fails closed instead of coalescing null geometry to zero', () => {
    assert.throws(
      () =>
        mapSnapshotToCalculationInput({
          snapshotId: 's',
          stuffingMethod: 'Rolling',
          region: 'Europe',
          algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
          configurationVersion: 'CFG',
          containerMasterPinJson: [],
          algorithmParameterPinJson: [],
          packingProfilePinJson: [],
          drums: [{ sourceLineId: 'L1', quantity: 1, packedLengthMm: null, packedWidthMm: 800, grossWeightKg: 500 }],
          containerPins: [
            {
              containerTypeVersionId: 'v',
              code: '40HQ',
              parityLabel: '40 HQ',
              usableLengthMm: 12000,
              internalWidthMm: 2350,
              payloadCapacityKg: 26000,
              dimensionsStatus: 'APPROVED',
            },
          ],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'VALIDATION_FAILED'
    );
  });
});
