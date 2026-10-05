import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrumMasterEngineeringGapReport,
  computeCuttingLengthToleranceBand,
  evaluateDrumForCutting,
  formatSuitableDrumOptionLabel,
  listDrumCandidates,
  listDrumCandidatesByCuttingLengths,
  maxNominalCuttingForUsableLength,
  optimizeDrumPlan,
  optimizeDrumPlanForSchedule,
  expandPhysicalDrumRequirements,
  patchDrumScheduleRow,
  applyAutomaticPlanToCuttingRequirements,
  cuttingLengthRequirementsFromSchedule,
  planCoversCuttingLengthRequirements,
  resolveAutomaticDrumRequirement,
  resolveAutomaticDrumRequirements,
  resolveManualCandidateListUiState,
  resolveManualFocusRow,
  summarizeUnsuitableReasons,
  totalCableLengthFromDrumSchedule,
  validateManualDrumPlan,
  type AuthoritativeDrumPlan,
  type DrumMasterForOptimization,
} from './drumOptimizationService';

function drum(over: Partial<DrumMasterForOptimization> = {}): DrumMasterForOptimization {
  return {
    id: 'drm-EWD1200',
    drumCode: 'EWD1200-T',
    description: 'Wooden Drum test',
    flange: 1200,
    barrel: 600,
    innerWidth: 800,
    clearanceMm: 15,
    maxWeight: 2500,
    emptyDrumNetWeightKg: 140,
    status: 'ACTIVE',
    ...over,
  };
}

const cableLight = { cableDiameterMm: 20, approxWeightKgKm: 1000 };
const cableHeavy = { cableDiameterMm: 55, approxWeightKgKm: 4000 };

describe('drumOptimizationService', () => {
  it('preserves nominal cutting length and cable tolerance band (not average)', () => {
    const band = computeCuttingLengthToleranceBand(900, 1);
    assert.equal(band.nominalCuttingLengthM, 900);
    assert.equal(band.minimumAllowedLengthM, 891);
    assert.equal(band.maximumAllowedLengthM, 909);
  });

  it('manual selection marks valid drum', () => {
    const plan = validateManualDrumPlan({
      drums: [drum()],
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: [{ drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 500, drumTolerancePercent: 2 }],
    });
    assert.equal(plan.method, 'MANUAL');
    assert.equal(plan.selectionMethod, 'MANUAL');
    assert.equal(plan.isValid, true);
    assert.equal(plan.lines[0].validationStatus, 'VALID');
    assert.equal(plan.lines[0].nominalCuttingLengthM, 500);
    assert.ok((plan.lines[0].maximumUsableLengthM || 0) >= plan.lines[0].maximumAllowedLengthM);
    assert.ok(plan.lines[0].lengthUtilizationPercent != null);
    assert.ok(plan.lines[0].loadUtilizationPercent != null);
    assert.equal(plan.lines[0].emptyDrumNetWeightKg, 140);
    assert.ok(plan.lines[0].grossLoadedDrumWeightKg != null);
  });

  it('manual selection rejects insufficient capacity with explicit reason', () => {
    const small = drum({
      id: 'small',
      drumCode: 'EWD630-T06',
      flange: 630,
      barrel: 315,
      innerWidth: 335,
      maxWeight: 200,
      clearanceMm: 20,
    });
    const plan = validateManualDrumPlan({
      drums: [small],
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: [{ drumCode: 'EWD630-T06', numberOfDrums: 1, cuttingLengthM: 900, drumTolerancePercent: 0 }],
    });
    assert.equal(plan.isValid, false);
    assert.equal(plan.lines[0].validationStatus, 'NOT_SUITABLE');
    assert.ok(
      plan.lines[0].validationReasons.some(
        (r) =>
          /Maximum usable length/i.test(r) ||
          /Insufficient/i.test(r) ||
          /clearance|MaxLoad|windings|layers/i.test(r)
      )
    );
  });

  it('filters suitable vs incomplete vs unsuitable candidates', () => {
    const good = drum();
    const missingLoad = drum({ id: 'x', drumCode: 'EWD-NOLOAD', maxWeight: null });
    const tooSmall = drum({
      id: 's',
      drumCode: 'EWD-SMALL',
      flange: 630,
      barrel: 315,
      innerWidth: 335,
      maxWeight: 200,
      clearanceMm: 20,
    });
    const { suitable, incomplete, unsuitable } = listDrumCandidates({
      drums: [good, missingLoad, tooSmall],
      cable: cableLight,
      cuttingLengthM: 400,
      cableTolerancePercent: 1,
    });
    assert.ok(suitable.some((c) => c.drum.drumCode === 'EWD1200-T'));
    assert.equal(
      suitable.find((c) => c.drum.drumCode === 'EWD1200-T')?.evaluationStatus,
      'SUITABLE'
    );
    assert.ok(incomplete.some((c) => c.drum.drumCode === 'EWD-NOLOAD'));
    assert.equal(
      incomplete.find((c) => c.drum.drumCode === 'EWD-NOLOAD')?.evaluationStatus,
      'INCOMPLETE_ENGINEERING_DATA'
    );
    assert.ok(
      incomplete
        .find((c) => c.drum.drumCode === 'EWD-NOLOAD')
        ?.rejectionReasons.some((r) => /Missing drum MaxLoad/i.test(r))
    );
    assert.ok(unsuitable.some((c) => c.drum.drumCode === 'EWD-SMALL'));
    assert.equal(
      unsuitable.find((c) => c.drum.drumCode === 'EWD-SMALL')?.evaluationStatus,
      'UNSUITABLE'
    );
  });

  it('missing maxWeight is INCOMPLETE not UNSUITABLE (Capacity alone on master is not MaxLoad until mapped)', () => {
    const withExcelCapacityOnly = drum({
      id: 'cap',
      drumCode: 'EWD-CAP-ONLY',
      capacity: 650,
      maxWeight: null,
    });
    const evaluated = evaluateDrumForCutting({
      drum: withExcelCapacityOnly,
      cable: cableLight,
      cuttingLengthM: 100,
      cableTolerancePercent: 0,
    });
    assert.equal(evaluated.suitableForCutting, false);
    assert.equal(evaluated.evaluationStatus, 'INCOMPLETE_ENGINEERING_DATA');
    assert.equal(evaluated.capacity.status, 'MISSING_MAX_LOAD');
    assert.ok(evaluated.missingFields.includes('maxWeight (MaxLoad)'));
  });

  it('automatic optimization recommends a single-drum plan when length fits', () => {
    const plan = optimizeDrumPlan({
      drums: [
        drum(),
        drum({ id: 'b', drumCode: 'EWD1800', flange: 1800, barrel: 900, innerWidth: 1100, maxWeight: 4000 }),
      ],
      cable: cableLight,
      totalOrderLengthM: 500,
      cableTolerancePercent: 1,
    });
    assert.equal(plan.method, 'AUTOMATIC');
    assert.equal(plan.selectionMethod, 'AUTOMATIC');
    assert.equal(plan.isValid, true);
    assert.equal(plan.totalLengthM, 500);
    assert.equal(plan.lines.length, 1);
    assert.equal(plan.lines[0].numberOfDrums * plan.lines[0].cuttingLengthM, 500);
    assert.ok(plan.rankingNotes.length > 0);
    assert.ok(/load utilization/i.test(plan.rankingNotes[0]));
  });

  it('automatic optimization builds multi-drum plan for large orders', () => {
    const medium = drum({ maxWeight: 800 });
    const plan = optimizeDrumPlan({
      drums: [medium],
      cable: cableLight,
      totalOrderLengthM: 2000,
      cableTolerancePercent: 0,
    });
    assert.equal(plan.method, 'AUTOMATIC');
    assert.equal(plan.totalLengthM, 2000);
    assert.ok(plan.lines.length >= 1);
    const aggregate = plan.lines.reduce((a, l) => a + l.numberOfDrums * l.cuttingLengthM, 0);
    assert.equal(aggregate, 2000);
  });

  it('manual and automatic produce the same authoritative plan field shape', () => {
    const drums = [drum()];
    const manual = validateManualDrumPlan({
      drums,
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: [{ drumCode: 'EWD1200-T', numberOfDrums: 2, cuttingLengthM: 400, drumTolerancePercent: 1 }],
    });
    const auto = optimizeDrumPlan({
      drums,
      cable: cableLight,
      totalOrderLengthM: 800,
      cableTolerancePercent: 1,
      drumTolerancePercent: 1,
    });
    const keys = Object.keys(manual.lines[0]).sort();
    assert.deepEqual(Object.keys(auto.lines[0]).sort(), keys);
    assert.equal(manual.totalLengthM, 800);
    assert.equal(auto.totalLengthM, 800);
    assert.equal(manual.selectionMethod, 'MANUAL');
    assert.equal(auto.selectionMethod, 'AUTOMATIC');
  });

  it('manual and automatic use the same capacity engine for the same drum+length', () => {
    const drums = [drum()];
    const manual = validateManualDrumPlan({
      drums,
      cable: cableLight,
      cableTolerancePercent: 0,
      rows: [{ drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 400, drumTolerancePercent: 0 }],
    });
    const auto = optimizeDrumPlan({
      drums,
      cable: cableLight,
      totalOrderLengthM: 400,
      cableTolerancePercent: 0,
    });
    assert.equal(manual.lines[0].maximumUsableLengthM, auto.lines[0].maximumUsableLengthM);
    assert.equal(manual.lines[0].cableWeightKg, auto.lines[0].cableWeightKg);
    assert.equal(manual.lines[0].emptyDrumNetWeightKg, auto.lines[0].emptyDrumNetWeightKg);
  });

  it('supports multiple schedule rows with different cutting lengths', () => {
    const plan = validateManualDrumPlan({
      drums: [
        drum(),
        drum({ id: 'd2', drumCode: 'EWD1800', flange: 1800, barrel: 900, innerWidth: 1100, maxWeight: 5000 }),
      ],
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: [
        { drumCode: 'EWD1800', numberOfDrums: 3, cuttingLengthM: 1000, drumTolerancePercent: 1 },
        { drumCode: 'EWD1200-T', numberOfDrums: 2, cuttingLengthM: 500, drumTolerancePercent: 2 },
      ],
    });
    assert.equal(plan.totalLengthM, 4000);
    assert.equal(plan.lines.length, 2);
    assert.equal(plan.lines[0].validationStatus, 'VALID');
    assert.equal(plan.lines[1].validationStatus, 'VALID');
  });

  it('validates multi-row independently — one incomplete row does not invent suitability for the other', () => {
    const plan = validateManualDrumPlan({
      drums: [drum(), drum({ id: 'bad', drumCode: 'EWD-NOLOAD', maxWeight: null })],
      cable: cableLight,
      cableTolerancePercent: 0,
      rows: [
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 300, drumTolerancePercent: 0 },
        { drumCode: 'EWD-NOLOAD', numberOfDrums: 1, cuttingLengthM: 300, drumTolerancePercent: 0 },
      ],
    });
    assert.equal(plan.isValid, false);
    assert.equal(plan.lines[0].validationStatus, 'VALID');
    assert.equal(plan.lines[1].validationStatus, 'INCOMPLETE');
  });

  it('handles cable diameter > 50 without clearance field', () => {
    const evaluated = evaluateDrumForCutting({
      drum: drum({ clearanceMm: null, flange: 2600, barrel: 1400, innerWidth: 1500, maxWeight: 10000 }),
      cable: cableHeavy,
      cuttingLengthM: 200,
      cableTolerancePercent: 0,
    });
    assert.equal(evaluated.capacity.status, 'OK');
  });

  it('maxNominalCuttingForUsableLength respects rounded tolerance band', () => {
    const maxCut = maxNominalCuttingForUsableLength(920, 1);
    const band = computeCuttingLengthToleranceBand(maxCut, 1);
    assert.ok(band.maximumAllowedLengthM <= 920);
    const tooMuch = computeCuttingLengthToleranceBand(maxCut + 1, 1);
    assert.ok(tooMuch.maximumAllowedLengthM > 920 || maxCut + 1 > maxCut);
  });

  it('editing number of drums updates aggregate total', () => {
    const one = validateManualDrumPlan({
      drums: [drum()],
      cable: cableLight,
      cableTolerancePercent: 0,
      rows: [{ drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 400, drumTolerancePercent: 0 }],
    });
    const two = validateManualDrumPlan({
      drums: [drum()],
      cable: cableLight,
      cableTolerancePercent: 0,
      rows: [{ drumCode: 'EWD1200-T', numberOfDrums: 3, cuttingLengthM: 400, drumTolerancePercent: 0 }],
    });
    assert.equal(one.totalLengthM, 400);
    assert.equal(two.totalLengthM, 1200);
  });

  it('rejects proceed semantics when plan invalid', () => {
    const plan = validateManualDrumPlan({
      drums: [drum({ maxWeight: null })],
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: [{ drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 100, drumTolerancePercent: 0 }],
    });
    assert.equal(plan.isValid, false);
    assert.ok(plan.blockingReasons.length > 0);
  });

  it('empty drum weight is logistics-only and never rejects technical suitability', () => {
    const withEmpty = evaluateDrumForCutting({
      drum: drum({ emptyDrumNetWeightKg: 500, maxWeight: 1000 }),
      cable: cableLight,
      cuttingLengthM: 200,
      cableTolerancePercent: 0,
    });
    assert.equal(withEmpty.capacity.permittedCablePayloadKg, 1000);
    assert.equal(withEmpty.capacity.loadLimitedCapacityMeters, 1000);
    assert.equal(withEmpty.capacity.emptyDrumNetWeightKg, 500);
    assert.ok(withEmpty.grossLoadedDrumWeightKg != null);
    assert.equal(withEmpty.grossLoadedDrumWeightKg, (withEmpty.cableWeightKg || 0) + 500);

    const withoutEmpty = evaluateDrumForCutting({
      drum: drum({ emptyDrumNetWeightKg: null, maxWeight: 1000 }),
      cable: cableLight,
      cuttingLengthM: 200,
      cableTolerancePercent: 0,
    });
    assert.equal(withoutEmpty.evaluationStatus, 'SUITABLE');
    assert.equal(withoutEmpty.capacity.status, 'OK');
    assert.equal(withoutEmpty.grossLoadedDrumWeightKg, null);
    assert.ok(withoutEmpty.warnings.some((w) => /Empty drum weight not configured/i.test(w)));
  });

  it('formats suitable dropdown labels with metrics', () => {
    const label = formatSuitableDrumOptionLabel({
      drumCode: 'EWD1200-T',
      drumType: 'Wooden',
      maximumUsableLengthM: 920,
      requestedLengthM: 500,
      lengthUtilizationPercent: 54.3,
      loadUtilizationPercent: 20,
    });
    assert.match(label, /EWD1200-T/);
    assert.match(label, /Wooden/);
    assert.match(label, /920 m max/);
    assert.match(label, /500 m req/);
    assert.match(label, /Suitable/);
  });

  describe('manual candidate UI states (no premature empty message)', () => {
    it('STATE A: need cutting length before evaluation', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: false,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: false,
        suitableCount: 0,
      });
      assert.equal(s.kind, 'NEED_INPUT');
      assert.match(s.message, /Enter cutting length/i);
      assert.doesNotMatch(s.message, /^No suitable drums$/i);
    });

    it('STATE B: calculating', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: true,
        evaluationComplete: false,
        suitableCount: 0,
      });
      assert.equal(s.kind, 'CALCULATING');
      assert.match(s.message, /Finding suitable drums/i);
    });

    it('STATE C: suitable found', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: true,
        suitableCount: 3,
      });
      assert.equal(s.kind, 'SUITABLE_FOUND');
      assert.match(s.message, /3 suitable drums available/i);
    });

    it('STATE D: full eval with zero suitable and no incomplete', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: true,
        suitableCount: 0,
        unsuitableCount: 12,
        incompleteCount: 0,
      });
      assert.equal(s.kind, 'NONE_SUITABLE');
      assert.match(s.message, /rejected for capacity or geometry/i);
      assert.equal(s.unsuitableCount, 12);
    });

    it('STATE D2: zero suitable with incomplete engineering data', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: true,
        suitableCount: 0,
        unsuitableCount: 0,
        incompleteCount: 107,
      });
      assert.equal(s.kind, 'NONE_SUITABLE_WITH_INCOMPLETE');
      assert.match(s.message, /incomplete engineering data/i);
      assert.equal(s.incompleteCount, 107);
    });

    it('STATE G: timeout is not none-suitable', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: true,
        suitableCount: 0,
        fetchFailureKind: 'timeout',
        fetchFailureMessage: 'Drum calculation timed out after 10s. Try again.',
      });
      assert.equal(s.kind, 'TIMEOUT');
      assert.match(s.message, /timed out/i);
      assert.notEqual(s.kind, 'NONE_SUITABLE');
    });

    it('STATE H: API failure is not none-suitable', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: true,
        suitableCount: 0,
        fetchFailureKind: 'error',
        fetchFailureMessage: 'Drum candidate evaluation failed.',
      });
      assert.equal(s.kind, 'FAILED');
      assert.match(s.message, /failed/i);
    });

    it('STATE E: selected valid', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: true,
        suitableCount: 2,
        selectedDrumCode: 'EWD1200-T',
        selectedIsSuitable: true,
      });
      assert.equal(s.kind, 'SELECTED_VALID');
      assert.match(s.message, /Drum suitable/i);
    });

    it('STATE F: selected invalid with reason', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: true,
        suitableCount: 1,
        selectedDrumCode: 'EWD-NOLOAD',
        selectedIsSuitable: false,
        selectedReasons: ['Missing MaxLoad'],
      });
      assert.equal(s.kind, 'SELECTED_INVALID');
      assert.match(s.message, /not suitable/i);
      assert.equal(s.reason, 'Missing MaxLoad');
    });

    it('does not claim none-suitable before evaluation completes', () => {
      const s = resolveManualCandidateListUiState({
        hasCuttingLength: true,
        cableToleranceReady: true,
        isCalculating: false,
        evaluationComplete: false,
        suitableCount: 0,
      });
      assert.equal(s.kind, 'CALCULATING');
      assert.notEqual(s.message, 'No technically suitable drums found.');
    });
  });

  it('full evaluation with only incomplete drums yields empty suitable and empty unsuitable', () => {
    const { suitable, incomplete, unsuitable } = listDrumCandidates({
      drums: [
        drum({ id: 'a', drumCode: 'A', maxWeight: null }),
        drum({ id: 'b', drumCode: 'B', clearanceMm: null, maxWeight: 1000 }),
      ],
      cable: cableLight,
      cuttingLengthM: 200,
      cableTolerancePercent: 0,
    });
    assert.equal(suitable.length, 0);
    assert.equal(incomplete.length, 2);
    assert.equal(unsuitable.length, 0);
    assert.ok(incomplete.every((c) => c.evaluationStatus === 'INCOMPLETE_ENGINEERING_DATA'));
  });

  it('summarizes incomplete/unsuitable reasons for Why isn’t my drum available', () => {
    const { incomplete, unsuitable } = listDrumCandidates({
      drums: [
        drum({ id: 'a', drumCode: 'A', maxWeight: null }),
        drum({ id: 'b', drumCode: 'B', maxWeight: null }),
        drum({ id: 'c', drumCode: 'C', clearanceMm: null, maxWeight: 1000 }),
      ],
      cable: cableLight,
      cuttingLengthM: 200,
      cableTolerancePercent: 0,
    });
    const summary = summarizeUnsuitableReasons([...incomplete, ...unsuitable]);
    assert.ok(summary.length >= 1);
    assert.ok(summary.some((row) => row.count >= 2 && /MaxLoad/i.test(row.reason)));
  });

  it('reproduces Ø10.9 mm / 1500 m scenario: incomplete engineering → zero suitable, auto NO_SUITABLE_WITH_INCOMPLETE', () => {
    const incompleteMasters: DrumMasterForOptimization[] = [
      drum({ id: '1', drumCode: 'EWD1000', flange: 1000, barrel: 500, innerWidth: 600, clearanceMm: null, maxWeight: null }),
      drum({ id: '2', drumCode: 'EWD1200', flange: 1200, barrel: 600, innerWidth: 800, clearanceMm: null, maxWeight: null }),
    ];
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const { suitable, incomplete, unsuitable } = listDrumCandidates({
      drums: incompleteMasters,
      cable,
      cuttingLengthM: 1500,
      cableTolerancePercent: 1,
    });
    assert.equal(suitable.length, 0);
    assert.equal(incomplete.length, 2);
    assert.equal(unsuitable.length, 0);
    assert.ok(incomplete.every((c) => c.rejectionReasons.length > 0));
    assert.ok(
      incomplete.every((c) =>
        c.rejectionReasons.some((r) => /Missing drum clearance for cable diameter ≤50 mm/i.test(r))
      )
    );
    const auto = optimizeDrumPlan({
      drums: incompleteMasters,
      cable,
      totalOrderLengthM: 1500,
      cableTolerancePercent: 1,
    });
    assert.equal(auto.isValid, false);
    assert.equal(auto.outcome, 'NO_SUITABLE_WITH_INCOMPLETE_CANDIDATES');
    assert.ok(auto.blockingReasons.length > 0);
    assert.match(auto.blockingReasons[0], /incomplete engineering data/i);
  });

  it('with TO-normalized masters (clearance 50, MaxLoad=Capacity), Ø10.9 mm / 1500 m finds suitable candidates', () => {
    const normalized: DrumMasterForOptimization[] = [
      drum({
        id: '1',
        drumCode: 'EWD2600-K26',
        flange: 2600,
        barrel: 1400,
        innerWidth: 1500,
        capacity: 8000,
        clearanceMm: 50,
        maxWeight: 8000,
        emptyDrumNetWeightKg: null,
      }),
      drum({
        id: '2',
        drumCode: 'EWD1200-0',
        flange: 1200,
        barrel: 600,
        innerWidth: 800,
        capacity: 1500,
        clearanceMm: 50,
        maxWeight: 1500,
        emptyDrumNetWeightKg: null,
      }),
      drum({
        id: '3',
        drumCode: 'EWD-NO-CAP',
        flange: 1800,
        barrel: 900,
        innerWidth: 1100,
        capacity: null,
        clearanceMm: 50,
        maxWeight: null,
      }),
    ];
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const { suitable, incomplete, unsuitable } = listDrumCandidates({
      drums: normalized,
      cable,
      cuttingLengthM: 1500,
      cableTolerancePercent: 1,
    });
    assert.ok(suitable.length >= 1, 'expected ≥1 suitable after Clearance=50 / MaxLoad=Capacity');
    assert.ok(suitable.every((c) => c.evaluationStatus === 'SUITABLE'));
    assert.ok(suitable.every((c) => c.warnings.some((w) => /Empty drum weight not configured/i.test(w))));
    assert.ok(incomplete.some((c) => c.drum.drumCode === 'EWD-NO-CAP'));
    assert.equal(
      incomplete.find((c) => c.drum.drumCode === 'EWD-NO-CAP')?.evaluationStatus,
      'INCOMPLETE_ENGINEERING_DATA'
    );
    void unsuitable;
    const auto = optimizeDrumPlan({
      drums: normalized,
      cable,
      totalOrderLengthM: 1500,
      cableTolerancePercent: 1,
    });
    assert.equal(auto.isValid, true);
    assert.equal(auto.outcome, 'RECOMMENDED');
    assert.ok(auto.lines.length >= 1);
  });

  it('exposes Why unavailable diagnostic payload for every candidate', () => {
    const evaluated = evaluateDrumForCutting({
      drum: drum({ clearanceMm: null, maxWeight: null }),
      cable: { cableDiameterMm: 10.9, approxWeightKgKm: 268 },
      cuttingLengthM: 1500,
      cableTolerancePercent: 1,
    });
    assert.equal(evaluated.diagnostic.evaluationStatus, 'INCOMPLETE_ENGINEERING_DATA');
    assert.ok(evaluated.diagnostic.missingFields.includes('clearanceMm'));
    assert.ok(evaluated.diagnostic.missingFields.includes('maxWeight (MaxLoad)'));
    assert.equal(evaluated.diagnostic.geometry.clearanceRequired, true);
    assert.ok(evaluated.diagnostic.decision.includes('INCOMPLETE_ENGINEERING_DATA'));
  });

  it('reports master-data gap; TO Capacity→MaxLoad rule flagged', () => {
    const gap = buildDrumMasterEngineeringGapReport({
      drums: [
        drum({ clearanceMm: null, maxWeight: null, capacity: 650 }),
        drum({
          drumCode: 'EWD700-3',
          clearanceMm: null,
          maxWeight: null,
          capacity: 800,
        }),
      ],
      cableDiameterMm: 10.9,
    });
    assert.equal(gap.rootCause, 'MASTER_DATA_COMPLETENESS');
    assert.equal(gap.activeDrumCount, 2);
    assert.equal(gap.populated.maxLoadKg, 0);
    assert.equal(gap.populated.clearanceMm, 0);
    assert.equal(gap.populated.capacity, 2);
    assert.equal(gap.capacityMapsToMaxLoadPerToRule, true);
    assert.ok(gap.minimumMasterDataUpdate.some((m) => /Max Load Kg/i.test(m)));
    assert.ok(gap.minimumMasterDataUpdate.some((m) => /Clearance Mm/i.test(m)));
    assert.ok(gap.importTemplateColumns.includes('Max Load Kg'));
  });

  it('requestedDrumCount does not change selected drum type or per-drum cutting length (1 vs 3 vs 5)', () => {
    const drums = [
      drum(),
      drum({
        id: 'b',
        drumCode: 'EWD1800',
        flange: 1800,
        barrel: 900,
        innerWidth: 1100,
        maxWeight: 4000,
      }),
    ];
    const base = {
      drums,
      cable: cableLight,
      totalOrderLengthM: 500,
      cableTolerancePercent: 1,
    };
    const plan1 = optimizeDrumPlan({ ...base, requestedDrumCount: 1 });
    const plan3 = optimizeDrumPlan({ ...base, requestedDrumCount: 3 });
    const plan5 = optimizeDrumPlan({ ...base, requestedDrumCount: 5 });
    assert.equal(plan1.isValid, true);
    assert.equal(plan3.isValid, true);
    assert.equal(plan5.isValid, true);
    assert.deepEqual(
      plan1.lines.map((l) => l.drumCode),
      plan3.lines.map((l) => l.drumCode)
    );
    assert.deepEqual(
      plan1.lines.map((l) => l.drumCode),
      plan5.lines.map((l) => l.drumCode)
    );
    assert.deepEqual(
      plan1.lines.map((l) => l.cuttingLengthM),
      plan3.lines.map((l) => l.cuttingLengthM)
    );
    assert.deepEqual(
      plan1.lines.map((l) => l.cuttingLengthM),
      plan5.lines.map((l) => l.cuttingLengthM)
    );
    const drums1 = plan1.lines.reduce((n, l) => n + l.numberOfDrums, 0);
    const drums3 = plan3.lines.reduce((n, l) => n + l.numberOfDrums, 0);
    const drums5 = plan5.lines.reduce((n, l) => n + l.numberOfDrums, 0);
    assert.equal(drums1, 1);
    assert.equal(drums3, 3);
    assert.equal(drums5, 5);
    assert.equal(plan1.totalLengthM, 500);
    assert.equal(plan3.totalLengthM, 1500);
    assert.equal(plan5.totalLengthM, 2500);
  });

  it('constrained capacity splits one cutting-length instance, then requestedDrumCount multiplies that pattern', () => {
    const medium = drum({ maxWeight: 800 });
    const splitArgs = {
      drums: [medium],
      cable: cableLight,
      totalOrderLengthM: 2000,
      cableTolerancePercent: 0,
    };
    const once = optimizeDrumPlan({ ...splitArgs, requestedDrumCount: 1 });
    const thrice = optimizeDrumPlan({ ...splitArgs, requestedDrumCount: 3 });
    assert.equal(once.isValid, true);
    assert.equal(thrice.isValid, true);
    assert.ok(once.lines.length >= 1);
    const physicalOnce = once.lines.reduce((n, l) => n + l.numberOfDrums, 0);
    const physicalThrice = thrice.lines.reduce((n, l) => n + l.numberOfDrums, 0);
    assert.ok(physicalOnce > 1, 'one 2000 m instance must split across more than one physical drum');
    assert.equal(physicalThrice, physicalOnce * 3);
    assert.deepEqual(
      once.lines.map((l) => l.drumCode),
      thrice.lines.map((l) => l.drumCode)
    );
    assert.deepEqual(
      once.lines.map((l) => l.cuttingLengthM),
      thrice.lines.map((l) => l.cuttingLengthM)
    );
    assert.equal(once.totalLengthM, 2000);
    assert.equal(thrice.totalLengthM, 6000);
    // Existing greedy split (weight-limited at 800 kg / 1000 kg/km = 800 m): 800+800+400.
    // requestedDrumCount multiplies that pattern. No new remainder rule.
    assert.deepEqual(
      once.lines.map((l) => ({ drumCode: l.drumCode, numberOfDrums: l.numberOfDrums, cuttingLengthM: l.cuttingLengthM })),
      [
        { drumCode: 'EWD1200-T', numberOfDrums: 2, cuttingLengthM: 800 },
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 400 },
      ]
    );
    assert.deepEqual(
      thrice.lines.map((l) => ({ drumCode: l.drumCode, numberOfDrums: l.numberOfDrums, cuttingLengthM: l.cuttingLengthM })),
      [
        { drumCode: 'EWD1200-T', numberOfDrums: 6, cuttingLengthM: 800 },
        { drumCode: 'EWD1200-T', numberOfDrums: 3, cuttingLengthM: 400 },
      ]
    );
  });

  it('1500m × 2 is two physical 1500m requirements, not one 3000m requirement', () => {
    const rows = [{ noOfDrums: 2, cuttingLengthM: 1500 }];
    const physical = expandPhysicalDrumRequirements(rows);
    const requirement = resolveAutomaticDrumRequirement(rows);
    assert.deepEqual(
      physical.map((p) => p.cuttingLengthM),
      [1500, 1500]
    );
    assert.equal(physical.some((p) => p.cuttingLengthM === 3000), false);
    assert.equal(requirement.perDrumCuttingLengthM, 1500);
    assert.equal(requirement.requestedDrumCount, 2);
    assert.equal(requirement.totalCableLengthM, 3000);
    assert.notEqual(requirement.perDrumCuttingLengthM, requirement.totalCableLengthM);
  });

  it('1500m × 3 is three physical 1500m requirements', () => {
    const rows = [{ numberOfDrums: 3, cuttingLengthM: 1500 }];
    const physical = expandPhysicalDrumRequirements(rows);
    const requirement = resolveAutomaticDrumRequirement(rows);
    assert.deepEqual(
      physical.map((p) => p.cuttingLengthM),
      [1500, 1500, 1500]
    );
    assert.equal(requirement.perDrumCuttingLengthM, 1500);
    assert.equal(requirement.requestedDrumCount, 3);
    assert.equal(requirement.totalCableLengthM, 4500);
  });

  it('manual 1500 + 1500 keeps two independently selected physical drums', () => {
    const plan = validateManualDrumPlan({
      drums: [drum()],
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: [
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 1500, drumTolerancePercent: 0 },
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 1500, drumTolerancePercent: 0 },
      ],
    });
    assert.equal(plan.lines.length, 2);
    assert.deepEqual(
      plan.lines.map((l) => l.cuttingLengthM),
      [1500, 1500]
    );
    assert.equal(plan.lines.some((l) => l.cuttingLengthM === 3000), false);
    assert.equal(plan.totalLengthM, 3000);
  });

  it('manual 1500 + 1500 + 1000 keeps three physical drums with those exact lengths', () => {
    const plan = validateManualDrumPlan({
      drums: [drum()],
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: [
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 1500, drumTolerancePercent: 0 },
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 1500, drumTolerancePercent: 0 },
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 0 },
      ],
    });
    assert.deepEqual(
      expandPhysicalDrumRequirements([
        { noOfDrums: 1, cuttingLengthM: 1500 },
        { noOfDrums: 1, cuttingLengthM: 1500 },
        { noOfDrums: 1, cuttingLengthM: 1000 },
      ]).map((p) => p.cuttingLengthM),
      [1500, 1500, 1000]
    );
    assert.deepEqual(
      plan.lines.map((l) => l.cuttingLengthM),
      [1500, 1500, 1000]
    );
    assert.equal(plan.lines.some((l) => l.cuttingLengthM === 4000), false);
    assert.equal(plan.totalLengthM, 4000);
  });

  it('changing the number of drums does not mutate the cutting length', () => {
    const rows = [{ id: 'r1', noOfDrums: 1, cuttingLengthM: 1500 }];
    const next = patchDrumScheduleRow(rows, 'r1', { noOfDrums: 2 });
    assert.equal(next[0].cuttingLengthM, 1500);
    assert.equal(next[0].noOfDrums, 2);
    const requirement = resolveAutomaticDrumRequirement(next);
    assert.equal(requirement.perDrumCuttingLengthM, 1500);
    assert.equal(requirement.requestedDrumCount, 2);
  });

  it('changing one physical drum cutting length does not mutate the other drum', () => {
    const rows = [
      { id: 'a', noOfDrums: 1, cuttingLengthM: 1500 },
      { id: 'b', noOfDrums: 1, cuttingLengthM: 1500 },
    ];
    const next = patchDrumScheduleRow(rows, 'a', { cuttingLengthM: 1000 });
    assert.equal(next[0].cuttingLengthM, 1000);
    assert.equal(next[1].cuttingLengthM, 1500);
    const plan = validateManualDrumPlan({
      drums: [drum()],
      cable: cableLight,
      cableTolerancePercent: 1,
      rows: next.map((r) => ({
        drumCode: 'EWD1200-T',
        numberOfDrums: Number(r.noOfDrums),
        cuttingLengthM: Number(r.cuttingLengthM),
        drumTolerancePercent: 0,
      })),
    });
    assert.deepEqual(
      plan.lines.map((l) => l.cuttingLengthM),
      [1000, 1500]
    );
  });

  it('total cable length is SUM of per-drum cutting lengths and is not used as a single-drum cutting length', () => {
    const rows = [
      { noOfDrums: 2, cuttingLengthM: 1500 },
      { noOfDrums: 1, cuttingLengthM: 1000 },
    ];
    assert.equal(totalCableLengthFromDrumSchedule(rows), 4000);
    const requirement = resolveAutomaticDrumRequirement([{ noOfDrums: 2, cuttingLengthM: 1500 }]);
    assert.equal(requirement.totalCableLengthM, 3000);
    assert.equal(requirement.perDrumCuttingLengthM, 1500);
  });

  it('automatic optimization does not select a drum based on the aggregated total length', () => {
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const small = drum({
      id: 'small-1500',
      drumCode: 'EWD-SMALL',
      flange: 1200,
      barrel: 600,
      innerWidth: 800,
      clearanceMm: 50,
      maxWeight: 500,
    });
    const large = drum({
      id: 'large-3000',
      drumCode: 'EWD-LARGE',
      flange: 2600,
      barrel: 1400,
      innerWidth: 1500,
      clearanceMm: 50,
      maxWeight: 8000,
    });
    const drums = [small, large];
    const requirement = resolveAutomaticDrumRequirement([{ noOfDrums: 2, cuttingLengthM: 1500 }]);
    const correct = optimizeDrumPlan({
      drums,
      cable,
      totalOrderLengthM: requirement.perDrumCuttingLengthM,
      requestedDrumCount: requirement.requestedDrumCount,
      cableTolerancePercent: 1,
    });
    const aggregated = optimizeDrumPlan({
      drums,
      cable,
      totalOrderLengthM: requirement.totalCableLengthM,
      cableTolerancePercent: 1,
    });
    assert.equal(correct.isValid, true);
    assert.ok(correct.lines.every((l) => l.drumCode === 'EWD-SMALL'));
    assert.ok(correct.lines.every((l) => l.cuttingLengthM === 1500));
    assert.equal(
      correct.lines.reduce((acc, l) => acc + l.numberOfDrums, 0),
      2
    );
    assert.equal(correct.totalLengthM, 3000);
    assert.equal(correct.lines.some((l) => l.cuttingLengthM === 3000), false);
    assert.ok(aggregated.lines.some((l) => l.drumCode === 'EWD-LARGE' || l.cuttingLengthM === 3000));
  });

  it('1500m + 1000m is two automatic requirements, not one 2500m requirement', () => {
    const rows = [
      { noOfDrums: 1, cuttingLengthM: 1500 },
      { noOfDrums: 1, cuttingLengthM: 1000 },
    ];
    const requirements = resolveAutomaticDrumRequirements(rows);
    assert.deepEqual(requirements, [
      { perDrumCuttingLengthM: 1500, requestedDrumCount: 1 },
      { perDrumCuttingLengthM: 1000, requestedDrumCount: 1 },
    ]);
    assert.equal(totalCableLengthFromDrumSchedule(rows), 2500);
    assert.equal(requirements.some((r) => r.perDrumCuttingLengthM === 2500), false);
    assert.deepEqual(
      expandPhysicalDrumRequirements(rows).map((p) => p.cuttingLengthM),
      [1500, 1000]
    );
  });

  it('2×1500 plus a second line of 1000 keeps both cutting lengths', () => {
    const rows = [
      { noOfDrums: 2, cuttingLengthM: 1500 },
      { noOfDrums: 1, cuttingLengthM: 1000 },
    ];
    assert.deepEqual(resolveAutomaticDrumRequirements(rows), [
      { perDrumCuttingLengthM: 1500, requestedDrumCount: 2 },
      { perDrumCuttingLengthM: 1000, requestedDrumCount: 1 },
    ]);
    assert.equal(totalCableLengthFromDrumSchedule(rows), 4000);
  });

  it('adding a second drum line does not mutate the first line cutting length', () => {
    const first = [{ id: 'a', drumCode: '', noOfDrums: 2, cuttingLengthM: 1500 }];
    const next = [
      ...first,
      { id: 'b', drumCode: '', noOfDrums: 1, cuttingLengthM: 1000 },
    ];
    assert.equal(next[0].cuttingLengthM, 1500);
    assert.equal(next[1].cuttingLengthM, 1000);
    const patched = patchDrumScheduleRow(next, 'b', { cuttingLengthM: 800 });
    assert.equal(patched[0].cuttingLengthM, 1500);
    assert.equal(patched[1].cuttingLengthM, 800);
  });

  it('manual focus prefers the next empty line that already has its own cutting length', () => {
    const focus = resolveManualFocusRow([
      { id: '1', drumCode: 'EWD-SMALL', cuttingLengthM: 1500 },
      { id: '2', drumCode: '', cuttingLengthM: 1000 },
    ]);
    assert.equal(focus?.id, '2');
  });

  it('automatic schedule optimization evaluates each cutting length independently', () => {
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const small = drum({
      id: 'small-1500',
      drumCode: 'EWD-SMALL',
      flange: 1200,
      barrel: 600,
      innerWidth: 800,
      clearanceMm: 50,
      maxWeight: 500,
    });
    const large = drum({
      id: 'large-3000',
      drumCode: 'EWD-LARGE',
      flange: 2600,
      barrel: 1400,
      innerWidth: 1500,
      clearanceMm: 50,
      maxWeight: 8000,
    });
    const rows = [
      { noOfDrums: 1, cuttingLengthM: 1500 },
      { noOfDrums: 1, cuttingLengthM: 1000 },
    ];
    const plan = optimizeDrumPlanForSchedule({
      drums: [small, large],
      cable,
      rows,
      cableTolerancePercent: 1,
    });
    const aggregated = optimizeDrumPlan({
      drums: [small, large],
      cable,
      totalOrderLengthM: 2500,
      cableTolerancePercent: 1,
    });
    assert.equal(plan.isValid, true);
    assert.ok(plan.lines.some((l) => l.cuttingLengthM === 1500));
    assert.ok(plan.lines.some((l) => l.cuttingLengthM === 1000));
    assert.equal(plan.lines.some((l) => l.cuttingLengthM === 2500), false);
    assert.equal(plan.totalLengthM, 2500);
    assert.ok(aggregated.lines.some((l) => l.drumCode === 'EWD-LARGE' || l.cuttingLengthM === 2500));
  });

  it('manual candidates are evaluated per cutting length, not against an aggregated total', () => {
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const small = drum({
      id: 'small-1500',
      drumCode: 'EWD-SMALL',
      flange: 1200,
      barrel: 600,
      innerWidth: 800,
      clearanceMm: 50,
      maxWeight: 500,
    });
    const large = drum({
      id: 'large-3000',
      drumCode: 'EWD-LARGE',
      flange: 2600,
      barrel: 1400,
      innerWidth: 1500,
      clearanceMm: 50,
      maxWeight: 8000,
    });
    const byLength = listDrumCandidatesByCuttingLengths({
      drums: [small, large],
      cable,
      cuttingLengthsM: [1500, 1000],
      cableTolerancePercent: 1,
    });
    assert.ok(byLength[1500]);
    assert.ok(byLength[1000]);
    assert.ok(byLength[1500].suitable.some((c) => c.drum.drumCode === 'EWD-SMALL'));
    assert.ok(byLength[1000].suitable.some((c) => c.drum.drumCode === 'EWD-SMALL'));
    const aggregated = listDrumCandidates({
      drums: [small, large],
      cable,
      cuttingLengthM: 2500,
      cableTolerancePercent: 1,
    });
    assert.equal(
      aggregated.suitable.some((c) => c.drum.drumCode === 'EWD-SMALL'),
      false
    );
  });

  const threeRequirementRows = [
    { id: 'r1', drumCode: '', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: '0' },
    { id: 'r2', drumCode: '', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: '0' },
    { id: 'r3', drumCode: '', noOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: '0' },
  ];

  it('one requirement 1500 × 2 expands to two physical 1500 m drums', () => {
    const rows = [{ noOfDrums: 2, cuttingLengthM: 1500 }];
    assert.deepEqual(
      expandPhysicalDrumRequirements(rows).map((p) => p.cuttingLengthM),
      [1500, 1500]
    );
    assert.deepEqual(cuttingLengthRequirementsFromSchedule(rows), [
      { sourceIndex: 0, cuttingLengthM: 1500, requestedDrumCount: 2 },
    ]);
  });

  it('two requirements 1500 × 2 and 1000 × 1 expand to 1500, 1500, 1000', () => {
    const rows = [
      { noOfDrums: 2, cuttingLengthM: 1500 },
      { noOfDrums: 1, cuttingLengthM: 1000 },
    ];
    assert.deepEqual(
      expandPhysicalDrumRequirements(rows).map((p) => p.cuttingLengthM),
      [1500, 1500, 1000]
    );
  });

  it('three requirements 1500 × 2, 1000 × 1, 800 × 3 expand to six physical drums', () => {
    assert.deepEqual(
      expandPhysicalDrumRequirements(threeRequirementRows).map((p) => p.cuttingLengthM),
      [1500, 1500, 1000, 800, 800, 800]
    );
    assert.deepEqual(
      cuttingLengthRequirementsFromSchedule(threeRequirementRows).map((r) => ({
        cuttingLengthM: r.cuttingLengthM,
        requestedDrumCount: r.requestedDrumCount,
      })),
      [
        { cuttingLengthM: 1500, requestedDrumCount: 2 },
        { cuttingLengthM: 1000, requestedDrumCount: 1 },
        { cuttingLengthM: 800, requestedDrumCount: 3 },
      ]
    );
    assert.equal(totalCableLengthFromDrumSchedule(threeRequirementRows), 6400);
  });

  it('automatic calculation does not remove requirements 2 and 3', () => {
    const firstOnlyPlan = {
      lines: [
        {
          drumCode: 'EWD-SMALL',
          numberOfDrums: 2,
          cuttingLengthM: 1500,
          drumTolerancePercent: 0,
        },
      ],
    } as Pick<AuthoritativeDrumPlan, 'lines'>;
    const applied = applyAutomaticPlanToCuttingRequirements(threeRequirementRows, firstOnlyPlan);
    assert.equal(applied.length, 3);
    assert.equal(planCoversCuttingLengthRequirements(firstOnlyPlan, threeRequirementRows), false);
    assert.equal(applied[1].id, 'r2');
    assert.equal(applied[1].cuttingLengthM, 1000);
    assert.equal(applied[1].noOfDrums, 1);
    assert.equal(applied[2].id, 'r3');
    assert.equal(applied[2].cuttingLengthM, 800);
    assert.equal(applied[2].noOfDrums, 3);
  });

  it('a physical-drum plan of six lines still preserves the three cutting-length requirements', () => {
    const physicalPlan = {
      lines: [
        { drumCode: 'A', cuttingLengthM: 1500 },
        { drumCode: 'A', cuttingLengthM: 1500 },
        { drumCode: 'B', cuttingLengthM: 1000 },
        { drumCode: 'C', cuttingLengthM: 800 },
        { drumCode: 'C', cuttingLengthM: 800 },
        { drumCode: 'C', cuttingLengthM: 800 },
      ],
    } as Pick<AuthoritativeDrumPlan, 'lines'>;
    assert.equal(planCoversCuttingLengthRequirements(physicalPlan, threeRequirementRows), true);
    const applied = applyAutomaticPlanToCuttingRequirements(threeRequirementRows, physicalPlan);
    assert.deepEqual(
      applied.map((r) => ({ id: r.id, noOfDrums: r.noOfDrums, cuttingLengthM: r.cuttingLengthM })),
      [
        { id: 'r1', noOfDrums: 2, cuttingLengthM: 1500 },
        { id: 'r2', noOfDrums: 1, cuttingLengthM: 1000 },
        { id: 'r3', noOfDrums: 3, cuttingLengthM: 800 },
      ]
    );
  });

  it('calculation of requirement 1 does not mutate requirement 2 or 3', () => {
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const master = drum({
      id: 'small-1500',
      drumCode: 'EWD-SMALL',
      flange: 1200,
      barrel: 600,
      innerWidth: 800,
      clearanceMm: 50,
      maxWeight: 500,
    });
    const plan = optimizeDrumPlanForSchedule({
      drums: [master],
      cable,
      rows: threeRequirementRows,
      cableTolerancePercent: 1,
    });
    assert.equal(planCoversCuttingLengthRequirements(plan, threeRequirementRows), true);
    assert.deepEqual(
      plan.lines.map((l) => l.cuttingLengthM),
      [1500, 1000, 800]
    );
    assert.deepEqual(
      plan.lines.map((l) => l.numberOfDrums),
      [2, 1, 3]
    );
    const applied = applyAutomaticPlanToCuttingRequirements(threeRequirementRows, plan);
    assert.equal(applied[0].cuttingLengthM, 1500);
    assert.equal(applied[0].noOfDrums, 2);
    assert.equal(applied[1].cuttingLengthM, 1000);
    assert.equal(applied[1].noOfDrums, 1);
    assert.equal(applied[2].cuttingLengthM, 800);
    assert.equal(applied[2].noOfDrums, 3);
    assert.equal(applied[0].id, 'r1');
    assert.equal(applied[1].id, 'r2');
    assert.equal(applied[2].id, 'r3');
  });

  it('changing one cutting-length requirement does not change another', () => {
    const next = patchDrumScheduleRow(threeRequirementRows, 'r3', { cuttingLengthM: 700 });
    assert.equal(next[0].cuttingLengthM, 1500);
    assert.equal(next[0].noOfDrums, 2);
    assert.equal(next[1].cuttingLengthM, 1000);
    assert.equal(next[1].noOfDrums, 1);
    assert.equal(next[2].cuttingLengthM, 700);
    assert.equal(next[2].noOfDrums, 3);
  });

  it('total cable length is SUM(numberOfDrums × cuttingLengthM) for three requirements', () => {
    assert.equal(totalCableLengthFromDrumSchedule(threeRequirementRows), 2 * 1500 + 1 * 1000 + 3 * 800);
    assert.equal(totalCableLengthFromDrumSchedule(threeRequirementRows), 6400);
  });

  it('drum suitability receives each physical drum cutting length, not an aggregate', () => {
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const small = drum({
      id: 'small-1500',
      drumCode: 'EWD-SMALL',
      flange: 1200,
      barrel: 600,
      innerWidth: 800,
      clearanceMm: 50,
      maxWeight: 500,
    });
    const large = drum({
      id: 'large-agg',
      drumCode: 'EWD-LARGE',
      flange: 2600,
      barrel: 1400,
      innerWidth: 1500,
      clearanceMm: 50,
      maxWeight: 8000,
    });
    const physical = expandPhysicalDrumRequirements(threeRequirementRows);
    for (const item of physical) {
      const { suitable } = listDrumCandidates({
        drums: [small, large],
        cable,
        cuttingLengthM: item.cuttingLengthM,
        cableTolerancePercent: 1,
      });
      assert.ok(suitable.some((c) => c.drum.drumCode === 'EWD-SMALL'));
    }
    const aggregated = listDrumCandidates({
      drums: [small, large],
      cable,
      cuttingLengthM: 6400,
      cableTolerancePercent: 1,
    });
    assert.equal(
      aggregated.suitable.some((c) => c.drum.drumCode === 'EWD-SMALL'),
      false
    );
  });

  it('manual selection preserves all three cutting-length requirements', () => {
    const plan = validateManualDrumPlan({
      drums: [drum({ clearanceMm: 50, maxWeight: 5000 })],
      cable: { cableDiameterMm: 10.9, approxWeightKgKm: 268 },
      cableTolerancePercent: 1,
      rows: [
        { drumCode: 'EWD1200-T', numberOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 0 },
        { drumCode: 'EWD1200-T', numberOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 0 },
        { drumCode: 'EWD1200-T', numberOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: 0 },
      ],
    });
    assert.equal(plan.lines.length, 3);
    assert.deepEqual(
      plan.lines.map((l) => l.cuttingLengthM),
      [1500, 1000, 800]
    );
    assert.deepEqual(
      plan.lines.map((l) => l.numberOfDrums),
      [2, 1, 3]
    );
  });

  it('a second automatic calculation is deterministic and does not duplicate or delete physical drums', () => {
    const cable = { cableDiameterMm: 10.9, approxWeightKgKm: 268 };
    const master = drum({
      id: 'small-1500',
      drumCode: 'EWD-SMALL',
      flange: 1200,
      barrel: 600,
      innerWidth: 800,
      clearanceMm: 50,
      maxWeight: 500,
    });
    const args = {
      drums: [master],
      cable,
      rows: threeRequirementRows,
      cableTolerancePercent: 1,
    };
    const first = optimizeDrumPlanForSchedule(args);
    const second = optimizeDrumPlanForSchedule(args);
    assert.deepEqual(
      first.lines.map((l) => ({ drumCode: l.drumCode, numberOfDrums: l.numberOfDrums, cuttingLengthM: l.cuttingLengthM })),
      second.lines.map((l) => ({ drumCode: l.drumCode, numberOfDrums: l.numberOfDrums, cuttingLengthM: l.cuttingLengthM }))
    );
    const once = applyAutomaticPlanToCuttingRequirements(threeRequirementRows, first);
    const twice = applyAutomaticPlanToCuttingRequirements(once, second);
    assert.equal(twice.length, 3);
    assert.deepEqual(
      twice.map((r) => ({ id: r.id, noOfDrums: r.noOfDrums, cuttingLengthM: r.cuttingLengthM })),
      once.map((r) => ({ id: r.id, noOfDrums: r.noOfDrums, cuttingLengthM: r.cuttingLengthM }))
    );
  });
});
