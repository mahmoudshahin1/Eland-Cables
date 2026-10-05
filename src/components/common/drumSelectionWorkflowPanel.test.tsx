import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DrumSelectionWorkflowPanel,
  requestAutomaticDrumPlanFromPanel,
} from './DrumSelectionWorkflowPanel';
import { applyAutomaticPlanToCuttingRequirements } from '../../domain/drumOptimizationPresentation';
import { DRUM_PLAN_OPTIMIZE_PATH } from '../../api/drumPlanApi';

const originalFetch = globalThis.fetch;
const __dirname = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('DrumSelectionWorkflowPanel', () => {
  it('shows Drum Selection with Automatic Optimization and Manual Selection', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrumSelectionWorkflowPanel, {
        cableCode: '10009487',
        cableDescription: 'Test cable',
        cableDiameterMm: 10.9,
        approxWeightKgKm: 268,
        drums: [],
        rows: [
          {
            id: 'r1',
            drumCode: '',
            noOfDrums: 1,
            cuttingLengthM: '',
            drumTolerancePercent: '',
          },
        ],
        cableTolerancePercent: '1',
        onCableToleranceChange: () => undefined,
        onRowsChange: () => undefined,
        onPlanValidityChange: () => undefined,
        error: null,
      })
    );
    assert.match(html, /Drum Selection/);
    assert.match(html, /Automatic Optimization/);
    assert.match(html, /Manual Selection/);
  });

  it('1. Valid draft does not show a Confirm button and is NOT CONFIRMED until persist', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrumSelectionWorkflowPanel, {
        cableCode: '10009487',
        cableDescription: 'Test cable',
        cableDiameterMm: 10.9,
        approxWeightKgKm: 268,
        drums: [],
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows: [
          { id: 'r1', drumCode: 'EWD1250', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: '0' },
          { id: 'r2', drumCode: 'EWD1000', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: '0' },
          { id: 'r3', drumCode: 'EWD800', noOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: '0' },
        ],
        cableTolerancePercent: '1',
        onCableToleranceChange: () => undefined,
        onRowsChange: () => undefined,
        onPlanValidityChange: () => undefined,
        error: null,
      })
    );
    assert.match(html, /Drum Plan: NOT CONFIRMED/);
    assert.doesNotMatch(html, /data-confirm-drum-plan/);
    assert.doesNotMatch(html, /data-drum-plan-status="CONFIRMED"/);
  });

  it('2. Confirm is blocked when physical drum coverage is incomplete', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrumSelectionWorkflowPanel, {
        cableCode: '10009487',
        cableDescription: 'Test cable',
        cableDiameterMm: 10.9,
        approxWeightKgKm: 268,
        drums: [],
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows: [
          { id: 'r1', drumCode: 'EWD1250', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: '0' },
          { id: 'r2', drumCode: '', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: '0' },
          { id: 'r3', drumCode: 'EWD800', noOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: '0' },
        ],
        cableTolerancePercent: '1',
        onCableToleranceChange: () => undefined,
        onRowsChange: () => undefined,
        onPlanValidityChange: () => undefined,
        error: null,
      })
    );
    assert.match(html, /Drum Plan: NOT CONFIRMED/);
    assert.doesNotMatch(html, /data-confirm-drum-plan/);
    assert.match(html, /incomplete|no valid selected drum/i);
  });

  it('4. Confirmed plan shows CONFIRMED and hides Confirm Drum Plan', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrumSelectionWorkflowPanel, {
        cableCode: '10009487',
        cableDescription: 'Test cable',
        cableDiameterMm: 10.9,
        approxWeightKgKm: 268,
        drums: [],
        inquiryId: 'inq-1',
        lineId: 'line-1',
        initialLifecycleStatus: 'CONFIRMED',
        rows: [
          { id: 'r1', drumCode: 'EWD1250', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: '0' },
        ],
        cableTolerancePercent: '1',
        onCableToleranceChange: () => undefined,
        onRowsChange: () => undefined,
        onPlanValidityChange: () => undefined,
        error: null,
      })
    );
    assert.match(html, /Drum Plan: CONFIRMED/);
    assert.doesNotMatch(html, /data-confirm-drum-plan/);
    assert.doesNotMatch(html, /Drum Plan: NOT CONFIRMED/);
  });

  it('automatic path calls POST /api/master/drums/optimize instead of the local engine', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          plan: {
            method: 'AUTOMATIC',
            selectionMethod: 'AUTOMATIC',
            cableTolerancePercent: 1,
            totalLengthM: 1500,
            isValid: true,
            blockingReasons: [],
            rankingNotes: [],
            outcome: 'RECOMMENDED',
            lines: [
              {
                drumId: 'drm-1',
                drumCode: 'EWD1250',
                numberOfDrums: 1,
                cuttingLengthM: 1500,
                nominalCuttingLengthM: 1500,
                cableTolerancePercent: 1,
                drumTolerancePercent: 0,
                minimumAllowedLengthM: 1485,
                maximumAllowedLengthM: 1515,
                maximumUsableLengthM: 1800,
                lengthUtilizationPercent: 83,
                loadUtilizationPercent: 40,
                cableWeightKg: 400,
                emptyDrumNetWeightKg: 140,
                grossLoadedDrumWeightKg: 540,
                validationStatus: 'VALID',
                validationReasons: [],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const rows = [
      { id: 'r1', drumCode: '', noOfDrums: 1, cuttingLengthM: 1500, drumTolerancePercent: '0' },
    ];
    const plan = await requestAutomaticDrumPlanFromPanel({
      cable: { cableDiameterMm: 10.9, approxWeightKgKm: 268 },
      rows,
      cableTolerancePercent: 1,
      token: 'tok-panel',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, DRUM_PLAN_OPTIMIZE_PATH);
    assert.equal(calls[0].init?.method, 'POST');
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.requirements[0].totalOrderLengthM, 1500);
    assert.equal(body.requirements[0].requestedDrumCount, 1);
    assert.equal(plan.lines[0].drumCode, 'EWD1250');
    assert.equal(plan.isValid, true);

    const applied = applyAutomaticPlanToCuttingRequirements(rows, plan);
    assert.equal(applied[0].drumCode, 'EWD1250');
    assert.equal(applied[0].cuttingLengthM, 1500);
  });

  it('panel module does not import the Drum Optimization engine', () => {
    const source = readFileSync(join(__dirname, 'DrumSelectionWorkflowPanel.tsx'), 'utf8');
    assert.match(source, /from ['"]\.\.\/\.\.\/api\/drumPlanApi['"]/);
    assert.match(source, /requestAutomaticDrumPlanFromPanel|optimizeDrumPlanViaApi/);
    assert.doesNotMatch(source, /optimizeDrumPlanForSchedule/);
    assert.doesNotMatch(source, /evaluateDrumForCutting/);
    assert.doesNotMatch(source, /validateManualDrumPlan/);
    assert.doesNotMatch(source, /listDrumCandidatesByCuttingLengths/);
    assert.match(source, /autoConfirmInquiryDrumPlanFromSchedule/);
    assert.doesNotMatch(source, /from ['"][^'"]*domain\/drumOptimizationService['"]/);
  });
});
