import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import {
  computeDirectedToleranceBounds,
  lengthIsWithinToleranceBand,
  parseCuttingLengthToleranceMode,
  resolveCuttingLengthTolerance,
} from './cuttingLengthTolerance';

describe('cuttingLengthTolerance', () => {
  it('+2% permits 1000–1020 and rejects 999', () => {
    const b = computeDirectedToleranceBounds({
      nominalLengthM: 1000,
      mode: 'POSITIVE',
      positivePercent: 2,
    });
    assert.equal(b.minLengthM, 1000);
    assert.equal(b.maxLengthM, 1020);
    assert.equal(lengthIsWithinToleranceBand(1000, b.minLengthM, b.maxLengthM), true);
    assert.equal(lengthIsWithinToleranceBand(1020, b.minLengthM, b.maxLengthM), true);
    assert.equal(lengthIsWithinToleranceBand(999, b.minLengthM, b.maxLengthM), false);
  });

  it('-2% permits 980–1000 and rejects 1001', () => {
    const b = computeDirectedToleranceBounds({
      nominalLengthM: 1000,
      mode: 'NEGATIVE',
      negativePercent: 2,
    });
    assert.equal(b.minLengthM, 980);
    assert.equal(b.maxLengthM, 1000);
    assert.equal(lengthIsWithinToleranceBand(980, b.minLengthM, b.maxLengthM), true);
    assert.equal(lengthIsWithinToleranceBand(1000, b.minLengthM, b.maxLengthM), true);
    assert.equal(lengthIsWithinToleranceBand(1001, b.minLengthM, b.maxLengthM), false);
  });

  it('±2% permits 980–1020 and rejects 979 and 1021', () => {
    const b = computeDirectedToleranceBounds({
      nominalLengthM: 1000,
      mode: 'SYMMETRIC',
      positivePercent: 2,
      negativePercent: 2,
    });
    assert.equal(b.minLengthM, 980);
    assert.equal(b.maxLengthM, 1020);
    assert.equal(lengthIsWithinToleranceBand(980, b.minLengthM, b.maxLengthM), true);
    assert.equal(lengthIsWithinToleranceBand(1020, b.minLengthM, b.maxLengthM), true);
    assert.equal(lengthIsWithinToleranceBand(979, b.minLengthM, b.maxLengthM), false);
    assert.equal(lengthIsWithinToleranceBand(1021, b.minLengthM, b.maxLengthM), false);
  });

  it('NONE does not create an artificial tolerance', () => {
    const b = computeDirectedToleranceBounds({ nominalLengthM: 1000, mode: 'NONE' });
    assert.equal(b.minLengthM, 1000);
    assert.equal(b.maxLengthM, 1000);
    assert.equal(b.positivePercent, 0);
    assert.equal(b.negativePercent, 0);
    assert.equal(lengthIsWithinToleranceBand(1000, b.minLengthM, b.maxLengthM), true);
    assert.equal(lengthIsWithinToleranceBand(1000.001, b.minLengthM, b.maxLengthM), false);
  });

  it('legacy tolerancePercent maps to SYMMETRIC', () => {
    const r = resolveCuttingLengthTolerance({ tolerancePercent: 1 });
    assert.equal(r.mode, 'SYMMETRIC');
    assert.equal(r.positivePercent, 1);
    assert.equal(r.negativePercent, 1);
  });

  it('rejects unknown toleranceMode', () => {
    assert.throws(
      () => parseCuttingLengthToleranceMode('BOTH'),
      (err: unknown) => err instanceof DomainError
    );
  });
});
