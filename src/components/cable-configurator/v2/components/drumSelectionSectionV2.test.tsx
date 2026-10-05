import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DrumSelectionHandoffDto } from '../../../../services/v2CuttingLengthApiService';
import type { CableRecordV2 } from '../types';
import {
  DrumSelectionSectionV2,
  V2_DRUM_AUTOMATIC_CONTROL_LABEL,
  V2_DRUM_MANUAL_CONTROL_LABEL,
} from './DrumSelectionSectionV2';

const handoff: DrumSelectionHandoffDto = {
  planId: 'cut-1',
  planVersionNo: 1,
  configurationSnapshotId: 'snap-1',
  configurationSnapshotIdString: 'v2cfg-1',
  configurationSnapshotVersionNo: 1,
  cableMaterialNumber: '10009487',
  itemCode: null,
  customerCode: null,
  cuttingLengthMeters: 1000,
  cableTolerancePercent: 1,
  toleranceMode: 'SYMMETRIC',
  positiveTolerancePercent: 1,
  negativeTolerancePercent: 1,
  requestedDrumCount: 1,
  cuttingLengthRequirementId: null,
  minLengthM: 990,
  maxLengthM: 1010,
  cableDiameterMm: 10.9,
  cableWeightKgKm: 268,
  validationStatus: 'VALID',
  validationMessages: [],
  drumHandoffReady: true,
  notes: null,
  capturedAt: '2026-09-12T00:00:00.000Z',
};

const cable = { cableCode: '10009487' } as unknown as CableRecordV2;

describe('DrumSelectionSectionV2 controls', () => {
  it('renders both Automatic and Manual drum selection controls', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrumSelectionSectionV2, {
        resolvedCable: cable,
        handoff,
      })
    );
    assert.match(html, new RegExp(V2_DRUM_AUTOMATIC_CONTROL_LABEL));
    assert.match(html, new RegExp(V2_DRUM_MANUAL_CONTROL_LABEL));
    assert.match(html, /Automatic Drum Selection/);
    assert.match(html, /Manual Drum Selection/);
  });
});
