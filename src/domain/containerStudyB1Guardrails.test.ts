import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { CONTAINER_STUDY_STATUSES } from './containerStudyLifecycle';

const dir = dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(join(dir, rel), 'utf8');
}

describe('05I-DF-B1 architectural guardrails', () => {
  it('does not introduce CALCULATED lifecycle', () => {
    assert.deepEqual([...CONTAINER_STUDY_STATUSES], ['DRAFT', 'VALIDATED', 'CONFIRMED', 'SUPERSEDED']);
  });

  it('keeps the calculation engine free of Prisma and HTTP', () => {
    const src = read('./containerStudyCalculationEngine.ts');
    for (const token of ['getPrisma', '@prisma/client', 'express', 'localStorage', 'd365', 'D365']) {
      assert.equal(src.includes(token), false, token);
    }
  });

  it('B1 snapshot mapper does not invent Forklifting or 6100 behavior', () => {
    const src = read('./containerStudyDrumPlanSnapshot.ts');
    assert.equal(src.toLowerCase().includes('forklift'), false);
    assert.equal(src.includes('6100'), false);
    assert.equal(src.includes('localStorage'), false);
    assert.equal(src.includes('getPrisma'), false);
  });

  it('B1 repository does not call D365 or treat container preference as suitability', () => {
    const src = read('../server/containerStudyB1Repository.ts');
    assert.equal(src.toLowerCase().includes('d365'), false);
    assert.equal(src.includes('localStorage'), false);
    assert.match(src, /CONFIRMED/);
    assert.match(src, /lineageProvenanceJson/);
  });
});
