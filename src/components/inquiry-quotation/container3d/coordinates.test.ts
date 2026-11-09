import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { containerHeightMeters, drumWorldPosition, mmToMeters } from './coordinates';

describe('container 3d coordinates', () => {
  it('converts millimetres to meters', () => {
    assert.equal(mmToMeters(5900), 5.9);
    assert.equal(mmToMeters(2350), 2.35);
    assert.ok(Math.abs(mmToMeters(5270) - 5.27) < 1e-9);
  });

  it('reads container height from the catalog dimension string', () => {
    assert.equal(containerHeightMeters('5.90 × 2.35 × 2.39 m'), 2.39);
    assert.equal(containerHeightMeters('12.03 × 2.35 × 2.70 m'), 2.7);
    assert.equal(containerHeightMeters(''), 2.39);
  });

  it('maps floor-plan x/y millimetres onto world x/z with the drum sitting on the floor', () => {
    const position = drumWorldPosition({ xMm: 1000, yMm: 1175, flangeMm: 2000 });
    assert.equal(position.x, 1);
    assert.equal(position.z, 1.175);
    assert.equal(position.y, 1);
  });

  it('stacks a second-layer drum on top of one flange diameter', () => {
    const position = drumWorldPosition({ xMm: 0, yMm: 0, flangeMm: 1000, isSecondLayer: true });
    assert.equal(position.y, 1.5);
  });
});
