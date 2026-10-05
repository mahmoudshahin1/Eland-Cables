import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import {
  resolveLineCableEngineering,
  resolveLineCableTolerancePercent,
  scheduleToRows,
} from './InquiryDrumPlanWorkflow';

const emptyLine: CommercialInquiryLineDto = {
  id: 'line-new',
  lineNumber: 1,
  materialNumber: null,
  cableDescription: 'New cable line',
  requestedQuantity: 1,
  requestedLengthMeters: 0,
};

const scheduledLine: CommercialInquiryLineDto = {
  id: 'line-sched',
  lineNumber: 2,
  materialNumber: '10009487',
  cableDescription: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2',
  requestedQuantity: 3,
  requestedLengthMeters: 1500,
  cuttingLengthMeters: 500,
  drumType: 'EWD630-0',
  cableTolerancePercent: 1,
  configurationPayload: { outerDiameterMm: 10.9, approxWeightKgKm: 268 },
  drumSchedule: {
    cableTolerancePercent: 1,
    lifecycleStatus: 'DRAFT',
    rows: [
      { drumCode: 'EWD630-0', noOfDrums: 1, cuttingLengthM: 500, drumTolerancePercent: 1 },
      { drumCode: 'EWD800-0', noOfDrums: 2, cuttingLengthM: 250, drumTolerancePercent: 0 },
    ],
  },
};

describe('InquiryDrumPlanWorkflow schedule loading', () => {
  it('empty new line keeps one blank cutting row and no invented length', () => {
    const rows = scheduleToRows(emptyLine);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].drumCode, '');
    assert.equal(rows[0].cuttingLengthM, '');
    assert.equal(rows[0].noOfDrums, 1);
    assert.equal(resolveLineCableTolerancePercent(emptyLine), '');
  });

  it('existing schedule loads each cutting length independently (does not sum)', () => {
    const rows = scheduleToRows(scheduledLine);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].drumCode, 'EWD630-0');
    assert.equal(rows[0].cuttingLengthM, 500);
    assert.equal(rows[0].noOfDrums, 1);
    assert.equal(rows[1].drumCode, 'EWD800-0');
    assert.equal(rows[1].cuttingLengthM, 250);
    assert.equal(rows[1].noOfDrums, 2);
    assert.equal(resolveLineCableTolerancePercent(scheduledLine), '1');
    const engineering = resolveLineCableEngineering(scheduledLine);
    assert.equal(engineering.cableDiameterMm, 10.9);
    assert.equal(engineering.approxWeightKgKm, 268);
  });
});
