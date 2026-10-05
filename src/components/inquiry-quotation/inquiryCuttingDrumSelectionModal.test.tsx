import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import {
  CUTTING_LENGTH_AND_DRUM_SELECTION_TITLE,
  InquiryCuttingDrumSelectionModal,
} from './InquiryCuttingDrumSelectionModal';

const scheduledLine: CommercialInquiryLineDto = {
  id: 'line-sched',
  lineNumber: 1,
  materialNumber: '10009487',
  cableDescription: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1',
  requestedQuantity: 1,
  requestedLengthMeters: 500,
  cuttingLengthMeters: 500,
  drumType: 'EWD630-0',
  cableTolerancePercent: 1,
  drumSchedule: {
    cableTolerancePercent: 1,
    rows: [{ drumCode: 'EWD630-0', noOfDrums: 1, cuttingLengthM: 500, drumTolerancePercent: 1 }],
  },
};

const emptyLine: CommercialInquiryLineDto = {
  id: 'line-new',
  lineNumber: 2,
  materialNumber: '10009487',
  cableDescription: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1',
  requestedQuantity: 1,
  requestedLengthMeters: 0,
};

describe('InquiryCuttingDrumSelectionModal', () => {
  it('opens Cutting Length and Drum Selection with Manual and Automatic modes', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryCuttingDrumSelectionModal, {
        isOpen: true,
        onClose: () => undefined,
        inquiryId: 'inq-1',
        line: emptyLine,
        drums: [],
      })
    );
    assert.match(html, new RegExp(CUTTING_LENGTH_AND_DRUM_SELECTION_TITLE));
    assert.match(html, /Manual Selection/);
    assert.match(html, /Automatic Optimization/);
    assert.match(html, /Add Drum Line/);
    assert.match(html, /Drum Plan: NOT CONFIRMED/);
    assert.doesNotMatch(html, /Cutting Schedule & Multi-Drum Configuration/);
    assert.doesNotMatch(html, /Save Schedule/);
  });

  it('pre-fills the current drum schedule rows', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryCuttingDrumSelectionModal, {
        isOpen: true,
        onClose: () => undefined,
        inquiryId: 'inq-1',
        line: scheduledLine,
        drums: [],
      })
    );
    assert.match(html, /EWD630-0/);
    assert.match(html, /500/);
    assert.match(html, /Manual Selection/);
    assert.match(html, /Automatic Optimization/);
  });
});
