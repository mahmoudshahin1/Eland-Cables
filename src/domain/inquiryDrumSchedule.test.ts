import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInquiryDrumSchedule,
  computeCableOrderLengthRange,
  computeDrumScheduleRowMetrics,
  expandPhysicalDrumsFromInquirySchedule,
  inquiryDrumScheduleHasPhysicalPopulation,
  parseInquiryDrumSchedule,
} from './inquiryDrumSchedule';

describe('inquiryDrumSchedule', () => {
  it('computes nominal line range from drum tolerance', () => {
    const metrics = computeDrumScheduleRowMetrics(
      { noOfDrums: 3, cuttingLengthM: 2000, drumTolerancePercent: 3 },
      3580,
      650
    );
    assert.equal(metrics.nominalLineM, 6000);
    assert.equal(metrics.minLineM, 5820);
    assert.equal(metrics.maxLineM, 6180);
    assert.ok(metrics.cableWeightPerDrumKg > 0);
    assert.equal(metrics.totalLineWeightKg, metrics.cableWeightPerDrumKg * 3);
  });

  it('computes cable order length range from cable tolerance', () => {
    const range = computeCableOrderLengthRange(11000, 5);
    assert.equal(range.minM, 10450);
    assert.equal(range.maxM, 11550);
  });

  it('round-trips drum schedule JSON', () => {
    const schedule = buildInquiryDrumSchedule(
      [{ drumCode: 'EWD630-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 5 }],
      3
    );
    const parsed = parseInquiryDrumSchedule(schedule);
    assert.equal(parsed?.cableTolerancePercent, schedule.cableTolerancePercent);
    assert.deepEqual(parsed?.rows, schedule.rows);
  });

  it('treats unconfirmed Version A rows as a current physical population', () => {
    const schedule = buildInquiryDrumSchedule(
      [{ drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 5 }],
      3
    );
    assert.equal(inquiryDrumScheduleHasPhysicalPopulation(schedule), true);
    assert.equal(inquiryDrumScheduleHasPhysicalPopulation({ ...schedule, lifecycleStatus: 'CONFIRMED' }), true);
    assert.equal(inquiryDrumScheduleHasPhysicalPopulation({ ...schedule, rows: [] }), false);
  });

  it('expands 2×1500 m as two physical drum instances, not one 3000 m drum', () => {
    const schedule = buildInquiryDrumSchedule(
      [{ drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 5 }],
      3
    );
    const physical = expandPhysicalDrumsFromInquirySchedule(schedule, 'line-1');
    assert.equal(physical.length, 2);
    assert.deepEqual(
      physical.map((drum) => ({ cuttingLengthM: drum.cuttingLengthM, instanceIndex: drum.instanceIndex, drumCode: drum.drumCode })),
      [
        { cuttingLengthM: 1500, instanceIndex: 1, drumCode: 'EWD900-0' },
        { cuttingLengthM: 1500, instanceIndex: 2, drumCode: 'EWD900-0' },
      ]
    );
  });

  it('expands 1500×2 + 1000×1 + 800×3 into 6 physical drums totaling 6400 m', () => {
    const schedule = buildInquiryDrumSchedule(
      [
        { drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 1 },
        { drumCode: 'EWD800-9', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 1 },
        { drumCode: 'EWD630-0', noOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: 1 },
      ],
      1
    );
    const physical = expandPhysicalDrumsFromInquirySchedule(schedule, 'line-1');
    assert.equal(physical.length, 6);
    assert.deepEqual(
      physical.map((drum) => drum.cuttingLengthM),
      [1500, 1500, 1000, 800, 800, 800]
    );
    assert.equal(physical.reduce((sum, drum) => sum + drum.cuttingLengthM, 0), 6400);
  });
});
