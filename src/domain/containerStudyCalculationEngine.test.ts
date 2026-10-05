import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateContainerStudy,
  usesPostAdjust6100Rule,
} from './containerStudyCalculationEngine';
import { goldenInput, G01_DRUMS, GOLDEN_CONTAINER_PINS } from './containerStudyGoldenFixtures';

function run(id: string, opts: Parameters<typeof goldenInput>[1]) {
  return calculateContainerStudy(goldenInput(id, opts));
}

function assertConservation(result: ReturnType<typeof calculateContainerStudy>, expanded: number) {
  assert.equal(result.summary.expandedDrumCount, expanded);
  assert.equal(
    result.allocations.length + result.unallocated.length,
    expanded,
    'every drum allocated or unallocated'
  );
  const keys = new Set<string>();
  for (const a of result.allocations) {
    assert.ok(!keys.has(a.physicalDrumKey), `duplicate allocation ${a.physicalDrumKey}`);
    keys.add(a.physicalDrumKey);
  }
  for (const u of result.unallocated) {
    assert.ok(!keys.has(u.physicalDrumKey), `duplicate unallocated ${u.physicalDrumKey}`);
    keys.add(u.physicalDrumKey);
  }
}

describe('Container Study Rolling engine (05I-DE)', () => {
  it('is deterministic across repeated runs', () => {
    const input = goldenInput('DET', {
      drums: [{ sourceLineId: 'A', quantity: 3, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1039 }],
    });
    const a = calculateContainerStudy(input);
    const b = calculateContainerStudy(input);
    assert.deepEqual(
      a.allocations.map((x) => x.physicalDrumKey),
      b.allocations.map((x) => x.physicalDrumKey)
    );
    assert.deepEqual(a.summary, b.summary);
    assert.deepEqual(a.decisionTrace, b.decisionTrace);
  });

  it('rejects Forklifting without Rolling fallback', () => {
    const result = run('G04', { stuffingMethod: 'Forklifting', drums: G01_DRUMS });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0]?.code, 'STUFFING_METHOD_NOT_IMPLEMENTED');
    assert.equal(result.allocations.length, 0);
  });

  it('B2300M — SaaS 40 STD @ 12000 (NOT Excel 20 STD / 5900 parity)', () => {
    assert.equal(usesPostAdjust6100Rule(), false);
    const result = run('B2300M-NOT-EXCEL-PARITY', {
      drums: [{ sourceLineId: 'B', quantity: 2, packedLengthMm: 2299, packedWidthMm: 1600, grossWeightKg: 2000 }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.containers[0]?.parityLabel, '40 STD');
    assert.equal(result.containers[0]?.usableLengthMm, 12000);
    assert.notEqual(result.containers[0]?.usableLengthMm, 5900);
  });

  it('classifies B2300P as 40 HQ', () => {
    const result = run('B2300P', {
      drums: [{ sourceLineId: 'B', quantity: 2, packedLengthMm: 2301, packedWidthMm: 1600, grossWeightKg: 2000 }],
    });
    assert.equal(result.summary.containerCount, 1);
    assert.equal(result.containers[0].parityLabel, '40 HQ');
    assert.equal(result.containers[0].remainingLengthMm, 7398);
  });

  it('classifies B2600M as 40 HQ and B2600P as 40 Open Top', () => {
    const m = run('B2600M', {
      drums: [{ sourceLineId: 'B', quantity: 2, packedLengthMm: 2599, packedWidthMm: 1600, grossWeightKg: 2000 }],
    });
    assert.equal(m.containers[0].parityLabel, '40 HQ');
    const p = run('B2600P', {
      drums: [{ sourceLineId: 'B', quantity: 2, packedLengthMm: 2601, packedWidthMm: 1600, grossWeightKg: 2000 }],
    });
    assert.equal(p.containers[0].parityLabel, '40 Open Top');
  });

  it('G10 weight gate yields unallocated WEIGHT_LIMIT', () => {
    const result = run('G10', {
      drums: [{ sourceLineId: 'G', quantity: 1, packedLengthMm: 1400, packedWidthMm: 1000, grossWeightKg: 27000 }],
    });
    assert.equal(result.summary.containerCount, 0);
    assert.equal(result.unallocated.length, 1);
    assert.equal(result.unallocated[0].reasonCode, 'WEIGHT_LIMIT');
    assertConservation(result, 1);
  });

  it('G10B length gate yields unallocated DIMENSION_LIMIT', () => {
    const result = run('G10B', {
      drums: [{ sourceLineId: 'G', quantity: 1, packedLengthMm: 13000, packedWidthMm: 1000, grossWeightKg: 1000 }],
    });
    assert.equal(result.summary.containerCount, 0);
    assert.equal(result.unallocated[0].reasonCode, 'DIMENSION_LIMIT');
  });

  it('G11A classifies 5900 mm drum as 40 Open Top without 6100 adjust', () => {
    const result = run('G11A', {
      drums: [{ sourceLineId: 'G', quantity: 1, packedLengthMm: 5900, packedWidthMm: 1000, grossWeightKg: 1000 }],
    });
    assert.equal(result.containers[0].parityLabel, '40 Open Top');
    assert.equal(result.containers[0].remainingLengthMm, 6100);
    assert.equal(result.containers[0].usableLengthMm, 12000);
  });

  it('G11B and G11C classify as 40 Open Top', () => {
    for (const len of [5901, 5899]) {
      const result = run(`G11-${len}`, {
        drums: [{ sourceLineId: 'G', quantity: 1, packedLengthMm: len, packedWidthMm: 1000, grossWeightKg: 1000 }],
      });
      assert.equal(result.containers[0].parityLabel, '40 Open Top');
    }
  });

  it('B1050M sets secondLayerEnabled in Africa without virtual allocations', () => {
    const result = run('B1050M', {
      region: 'Africa',
      drums: [{ sourceLineId: 'B', quantity: 4, packedLengthMm: 1049, packedWidthMm: 800, grossWeightKg: 400 }],
    });
    assert.equal(result.containers[0].secondLayerEnabled, true);
    assert.equal(result.allocations.every((a) => a.allocationKind === 'PHYSICAL'), true);
    assert.ok(result.warnings.some((w) => w.code === 'SECOND_LAYER_FLAG_NOT_LOADED'));
    assertConservation(result, 4);
  });

  it('SL50M does not set secondLayerEnabled when small share below 50%', () => {
    const result = run('SL50M', {
      region: 'Africa',
      drums: [
        { sourceLineId: 'L1', quantity: 2, packedLengthMm: 1600, packedWidthMm: 1000, grossWeightKg: 800 },
        { sourceLineId: 'L2', quantity: 1, packedLengthMm: 1000, packedWidthMm: 800, grossWeightKg: 400 },
      ],
    });
    assert.equal(result.containers[0].secondLayerEnabled, false);
  });

  it('G01 allocates all 185 drums with no silent loss', () => {
    const result = run('G01', { drums: G01_DRUMS });
    assert.equal(result.ok, true);
    assertConservation(result, 185);
    assert.ok(result.summary.containerCount > 0);
    assert.ok(result.decisionTrace.length > 0);
  });

  it('enforces payload and dimension invariants on allocations', () => {
    const result = run('G02', {
      drums: [
        { sourceLineId: 'x', quantity: 10, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1039 },
        { sourceLineId: 'y', quantity: 5, packedLengthMm: 1600, packedWidthMm: 1120, grossWeightKg: 1930 },
      ],
    });
    assertConservation(result, 15);
    for (const alloc of result.allocations) {
      const container = result.containers.find((c) => c.containerIndex === alloc.containerIndex)!;
      const pin = GOLDEN_CONTAINER_PINS.find((p) => p.parityLabel === container.parityLabel)!;
      assert.ok(container.loadedWeightKg <= pin.payloadCapacityKg);
      assert.ok(container.usableLengthMm - container.remainingLengthMm <= pin.usableLengthMm);
    }
  });

  it('G09 low max weight scenario uses snapshot pins only', () => {
    const input = goldenInput('G09', {
      drums: [{ sourceLineId: 'G', quantity: 6, packedLengthMm: 1049, packedWidthMm: 800, grossWeightKg: 400 }],
    });
    input.containerPins = input.containerPins.map((p) => ({
      ...p,
      payloadCapacityKg: 5000,
    }));
    const result = calculateContainerStudy(input);
    assertConservation(result, 6);
    assert.ok(result.summary.containerCount >= 1);
  });

  it('rejects blocked algorithm version codes', () => {
    const input = goldenInput('ALG', {
      drums: [{ sourceLineId: 'a', quantity: 1, packedLengthMm: 1000, packedWidthMm: 800, grossWeightKg: 500 }],
    });
    input.algorithmVersionCode = 'BIN_PACK_OPT_V1';
    const result = calculateContainerStudy(input);
    assert.equal(result.ok, false);
    assert.match(result.errors[0]?.message ?? '', /not implemented/i);
  });
});
