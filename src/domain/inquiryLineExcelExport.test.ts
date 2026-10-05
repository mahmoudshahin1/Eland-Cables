import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandInquiryDrumScheduleRows,
  formatInquiryCuttingLengthDisplay,
  inquiryLineTotalLengthMeters,
} from './inquiryLineExcelExport';

describe('Inquiry line Excel cutting lengths', () => {
  it('keeps multiple cutting-length requirements instead of collapsing to total metres', () => {
    const line = {
      lineNumber: 1,
      requestedQuantity: 4,
      requestedLengthMeters: 6000,
      cuttingLengthMeters: 6000,
      drumSchedule: {
        cableTolerancePercent: 1,
        rows: [
          { drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 1 },
          { drumCode: 'EWD900-0', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 1 },
          { drumCode: 'EWD900-0', noOfDrums: 1, cuttingLengthM: 2000, drumTolerancePercent: 1 },
        ],
      },
    };
    assert.equal(formatInquiryCuttingLengthDisplay(line), '1500 × 2; 1000 × 1; 2000 × 1');
    assert.equal(inquiryLineTotalLengthMeters(line), 6000);
    assert.deepEqual(
      expandInquiryDrumScheduleRows(line).map((row) => `${row.cuttingLengthM} × ${row.noOfDrums}`),
      ['1500 × 2', '1000 × 1', '2000 × 1']
    );
  });
});
