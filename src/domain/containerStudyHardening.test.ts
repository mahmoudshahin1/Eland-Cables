import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { calculateContainerStudy } from './containerStudyCalculationEngine';
import { goldenInput } from './containerStudyGoldenFixtures';
import {
  buildPinnedAlgorithmParameters,
  readPinnedConfigurationStatus,
} from './containerStudySnapshotPins';

const enginePath = join(dirname(fileURLToPath(import.meta.url)), 'containerStudyCalculationEngine.ts');

describe('Container Study 05I-DE hardening', () => {
  it('keeps calculation engine free of IO and non-deterministic dependencies', () => {
    const src = readFileSync(enginePath, 'utf8');
    const forbidden = [
      '@prisma/client',
      'getPrisma',
      'express',
      'localStorage',
      'Date.now',
      'Math.random',
      'containerStudyRepository',
      'fetch(',
    ];
    for (const token of forbidden) {
      assert.equal(src.includes(token), false, `forbidden token in engine: ${token}`);
    }
  });

  it('pins and reads configuration status from snapshot parameters', () => {
    const pinned = buildPinnedAlgorithmParameters(
      [{ name: 'FLANGE_HQ_MIN', value: '2300', numericValue: 2300, unit: 'mm', scope: 'algorithm', ruleStatus: 'ENABLED' }],
      'ACTIVE'
    );
    assert.equal(readPinnedConfigurationStatus(pinned), 'ACTIVE');
  });

  it('B2300M — SaaS 40 STD @ 12000 (NOT Excel 20 STD parity)', () => {
    const result = calculateContainerStudy(
      goldenInput('B2300M-NOT-EXCEL-PARITY', {
        drums: [{ sourceLineId: 'B', quantity: 2, packedLengthMm: 2299, packedWidthMm: 1600, grossWeightKg: 2000 }],
      })
    );
    assert.equal(result.ok, true);
    assert.equal(result.containers[0]?.parityLabel, '40 STD');
    assert.equal(result.containers[0]?.usableLengthMm, 12000);
  });

  it('remainingLength >= 6100 does NOT convert container to 20 STD (6100 rule blocked)', () => {
    const result = calculateContainerStudy(
      goldenInput('G11A-6100-GUARD', {
        drums: [{ sourceLineId: 'G', quantity: 1, packedLengthMm: 5900, packedWidthMm: 1000, grossWeightKg: 1000 }],
      })
    );
    assert.equal(result.containers[0]?.parityLabel, '40 Open Top');
    assert.equal(result.containers[0]?.usableLengthMm, 12000);
    assert.equal(result.containers[0]?.remainingLengthMm, 6100);
    assert.notEqual(result.containers[0]?.parityLabel, '20 STD');
  });

  it('repository create path has no CONTAINER_STUDY number-sequence Date.now fallback', () => {
    const repoPath = join(dirname(fileURLToPath(import.meta.url)), '../server/containerStudyRepository.ts');
    const src = readFileSync(repoPath, 'utf8');
    assert.equal(src.includes('toString(36)'), false);
    assert.match(src, /CONFIGURATION_REQUIRED/);
  });

  it('failed engine output is not ok and produces no allocations', () => {
    const input = goldenInput('FAIL', {
      drums: [{ sourceLineId: 'x', quantity: 1, packedLengthMm: 1000, packedWidthMm: 800, grossWeightKg: 500 }],
    });
    input.algorithmVersionCode = 'BIN_PACK_OPT_V1';
    const result = calculateContainerStudy(input);
    assert.equal(result.ok, false);
    assert.equal(result.allocations.length, 0);
    assert.equal(result.containers.length, 0);
  });
});
