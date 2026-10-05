import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DrumMasterRecord } from '../types';
import {
  buildInquiryDrumLineSummary,
  formatInquiryDrumLineSummaryDrums,
  formatInquiryDrumLineSummaryEntry,
} from './inquiryDrumLineSummary';

const drumMaster: DrumMasterRecord[] = [
  {
    id: '1',
    drumCode: 'EWD220',
    description: 'Wooden Reel 220',
    flange: 220,
    barrel: 120,
    innerWidth: 80,
    outerWidth: 100,
    capacity: 1500,
    dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
    capacityUom: 'CONFIGURATION_REQUIRED',
    status: 'ACTIVE',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

describe('inquiryDrumLineSummary', () => {
  it('derives drum count and total length from drum schedule rows', () => {
    const summary = buildInquiryDrumLineSummary(
      {
        cableDescription: 'XLPE 3C x 185mm²',
        requestedQuantity: 1,
        requestedLengthMeters: 0,
        drumSchedule: {
          cableTolerancePercent: 1,
          rows: [
            { drumCode: 'EWD220', noOfDrums: 2, cuttingLengthM: 500, drumTolerancePercent: 1 },
            { drumCode: 'EWD220', noOfDrums: 1, cuttingLengthM: 400, drumTolerancePercent: 1 },
          ],
        },
      },
      drumMaster
    );

    assert.equal(summary.cableDescription, 'XLPE 3C x 185mm²');
    assert.equal(summary.drumCount, 3);
    assert.equal(summary.totalLengthM, 1400);
    assert.equal(summary.drumEntries.length, 1);
    assert.equal(summary.drumEntries[0].drumCode, 'EWD220');
    assert.equal(summary.drumEntries[0].description, 'Wooden Reel 220');
    assert.equal(summary.drumEntries[0].drumCount, 3);
  });

  it('falls back to drum master match when no schedule exists', () => {
    const summary = buildInquiryDrumLineSummary(
      {
        cableDescription: 'PVC 2C x 16mm²',
        requestedQuantity: 4,
        requestedLengthMeters: 2000,
        cuttingLengthMeters: 500,
        drumType: 'EWD220',
      },
      drumMaster
    );

    assert.equal(summary.drumCount, 4);
    assert.equal(summary.totalLengthM, 2000);
    assert.deepEqual(summary.drumEntries, [{ drumCode: 'EWD220', description: 'Wooden Reel 220' }]);
  });

  it('formats drum code and description for display', () => {
    assert.equal(
      formatInquiryDrumLineSummaryEntry({ drumCode: 'EWD220', description: 'Wooden Reel 220' }),
      'EWD220 — Wooden Reel 220'
    );
    assert.equal(
      formatInquiryDrumLineSummaryDrums([
        { drumCode: 'EWD220', description: 'Wooden Reel 220', drumCount: 2 },
        { drumCode: 'EWD630', description: 'Steel Reel 630', drumCount: 1 },
      ]),
      'EWD220 — Wooden Reel 220 (2) · EWD630 — Steel Reel 630 (1)'
    );
  });
});
