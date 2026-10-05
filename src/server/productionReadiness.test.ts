import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeProductionReadiness,
  NOT_PRODUCTION_READY,
  PRODUCTION_READY,
  unsignedDecision5,
  type ProductionReadinessComputeInput,
  type ProductionReadinessSummaryKpis,
} from './productionReadiness';

const GOLDEN = ['10009487', '10009488', '10009489', '10009490'] as const;

function emptySummary(partial: Partial<ProductionReadinessSummaryKpis> = {}): ProductionReadinessSummaryKpis {
  return {
    total: 0,
    ready: 0,
    blocked: 0,
    warning: 0,
    notChecked: 0,
    gate1Failures: 0,
    gate2Failures: 0,
    gate3Failures: 0,
    gate4Failures: 0,
    topBlockers: [],
    ...partial,
  };
}

function currentPlatformFixture(): ProductionReadinessComputeInput {
  return {
    summary: emptySummary({
      total: 435,
      ready: 2,
      blocked: 79,
      warning: 354,
      gate4Failures: 433,
    }),
    golden: GOLDEN.map((materialNumber, i) => ({
      materialNumber,
      governanceStatus: i < 2 ? 'READY_FOR_COSTING' : 'UNDER_REVIEW',
      engineStatus: 'NOT_READY',
    })),
    fxActiveCount: 3,
    scrapActiveCount: 10,
    decision5: unsignedDecision5(),
    ci: { tests: 'NOT_VERIFIED', typescript: 'NOT_VERIFIED' },
  };
}

function allGatesPass(): ProductionReadinessComputeInput {
  return {
    summary: emptySummary({
      total: 435,
      ready: 435,
    }),
    golden: GOLDEN.map((materialNumber) => ({
      materialNumber,
      governanceStatus: 'READY_FOR_COSTING',
      engineStatus: 'READY',
    })),
    fxActiveCount: 4,
    scrapActiveCount: 8,
    decision5: {
      signed: true,
      status: 'SIGNED',
      option: 'B',
      optionLabel: 'OPTION B — LME / BASE METAL ONLY',
      source: 'test',
    },
    ci: { tests: 'PASS', typescript: 'PASS' },
  };
}

describe('Production readiness control rules', () => {
  it('production readiness = blocked for current/fixture platform counts', () => {
    const result = computeProductionReadiness(currentPlatformFixture());
    assert.equal(result.overallStatus, NOT_PRODUCTION_READY);
    assert.equal(result.productionReady, false);
    assert.ok(result.blockers.some((b) => /433 cables have unresolved RM pricing/.test(b)));
    assert.ok(result.blockers.some((b) => /Decision 5 is UNSIGNED/.test(b)));
    assert.ok(result.blockers.some((b) => /Automated tests are NOT VERIFIED/.test(b)));
    assert.equal(
      result.checklist.find((c) => c.id === 'master_data')?.status,
      'FAIL'
    );
  });

  it('production readiness = ready when all mandatory gates pass and Decision 5 is signed', () => {
    const result = computeProductionReadiness(allGatesPass());
    assert.equal(result.overallStatus, PRODUCTION_READY);
    assert.equal(result.productionReady, true);
    assert.equal(result.blockers.length, 0);
    for (const item of result.checklist.filter((c) => c.mandatory)) {
      assert.equal(item.status, 'PASS', item.id);
    }
  });

  it('Decision 5 unsigned blocks READY even if master data and CI pass', () => {
    const result = computeProductionReadiness({
      ...allGatesPass(),
      decision5: unsignedDecision5(),
    });
    assert.equal(result.overallStatus, NOT_PRODUCTION_READY);
    assert.equal(result.productionReady, false);
    assert.equal(result.checklist.find((c) => c.id === 'decision5')?.status, 'UNSIGNED');
    assert.ok(result.blockers.some((b) => /Decision 5 is UNSIGNED/.test(b)));
  });

  it('one mandatory gate failing blocks READY', () => {
    const noFx = computeProductionReadiness({ ...allGatesPass(), fxActiveCount: 0 });
    assert.equal(noFx.overallStatus, NOT_PRODUCTION_READY);
    assert.equal(noFx.checklist.find((c) => c.id === 'fx_required')?.status, 'FAIL');

    const incompleteMaster = computeProductionReadiness({
      ...allGatesPass(),
      summary: emptySummary({ total: 435, ready: 434, blocked: 1, gate4Failures: 1 }),
    });
    assert.equal(incompleteMaster.overallStatus, NOT_PRODUCTION_READY);
    assert.equal(incompleteMaster.checklist.find((c) => c.id === 'master_data')?.status, 'FAIL');
  });

  it('does not report false PRODUCTION READY when tests/tsc are not verified', () => {
    const result = computeProductionReadiness({
      ...allGatesPass(),
      ci: { tests: 'NOT_VERIFIED', typescript: 'NOT_VERIFIED' },
    });
    assert.equal(result.overallStatus, NOT_PRODUCTION_READY);
    assert.equal(result.productionReady, false);
    assert.equal(result.checklist.find((c) => c.id === 'automated_tests')?.status, 'NOT_VERIFIED');
    assert.equal(result.checklist.find((c) => c.id === 'typescript')?.status, 'NOT_VERIFIED');
  });
});
