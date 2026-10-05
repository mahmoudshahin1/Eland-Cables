import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { CONTAINER_STUDY_STATUSES } from './containerStudyLifecycle';
import { usesPostAdjust6100Rule } from './containerStudyCalculationEngine';
import { ALLOCATION_KIND_PHYSICAL } from './containerStudyValidation';

const dir = dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(join(dir, rel), 'utf8');
}

describe('05I-DF-B2 architectural guardrails', () => {
  it('does not introduce CALCULATED lifecycle', () => {
    assert.deepEqual([...CONTAINER_STUDY_STATUSES], ['DRAFT', 'VALIDATED', 'CONFIRMED', 'SUPERSEDED']);
    const lifecycle = read('./containerStudyLifecycle.ts');
    assert.equal(lifecycle.includes("'CALCULATED'"), false);
  });

  it('keeps the Rolling engine free of I/O, clocks, and randomness', () => {
    const src = read('./containerStudyCalculationEngine.ts');
    for (const token of [
      'getPrisma',
      '@prisma/client',
      'express',
      'localStorage',
      'd365',
      'D365',
      'Date.now',
      'Math.random',
      'fetch(',
      'axios',
    ]) {
      assert.equal(src.includes(token), false, token);
    }
    assert.equal(usesPostAdjust6100Rule(), false);
    assert.equal(src.includes("allocationKind: 'PHYSICAL'"), true);
    assert.equal(src.includes("allocationKind: 'VIRTUAL'"), false);
  });

  it('aggregation rules are pure and do not invent Forklifting or 6100', () => {
    const src = read('./containerStudyEntireInquiryAggregation.ts');
    assert.equal(src.includes('getPrisma'), false);
    assert.equal(src.toLowerCase().includes('forklift'), false);
    assert.equal(src.includes('6100'), false);
    assert.equal(src.includes('V2CuttingLengthRequirement') || src.includes('requirementId'), true);
    assert.match(src, /assertLinePointerIsNotAuthoritativeMultiRequirementSource/);
  });

  it('snapshot capture rejects client drum populations and does not call D365', () => {
    const src = read('../server/containerStudyB1Repository.ts');
    assert.match(src, /Client-supplied drum geometry is not accepted/);
    assert.equal(src.toLowerCase().includes('d365'), false);
    assert.match(src, /v2CuttingLengthRequirement/);
  });

  it('calculation mapper has no Prisma or HTTP', () => {
    const src = read('./containerStudySnapshotMapper.ts');
    assert.equal(src.includes('getPrisma'), false);
    assert.equal(src.includes('express'), false);
    assert.equal(src.includes('fetch('), false);
  });

  it('physical allocations stay PHYSICAL', () => {
    assert.equal(ALLOCATION_KIND_PHYSICAL, 'PHYSICAL');
  });
});
