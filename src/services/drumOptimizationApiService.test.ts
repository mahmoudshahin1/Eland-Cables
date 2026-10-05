import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRUM_API_TIMEOUT_MS,
  DrumApiError,
  isDrumApiAborted,
  isDrumApiTimeout,
} from './drumOptimizationApiService';

describe('drumOptimizationApiService', () => {
  it('exposes a ~10s API timeout bound', () => {
    assert.equal(DRUM_API_TIMEOUT_MS, 10_000);
  });

  it('distinguishes timeout vs aborted vs other failures', () => {
    const timeout = new DrumApiError('timeout', 'timed out');
    const aborted = new DrumApiError('aborted', 'cancelled');
    const http = new DrumApiError('http', 'bad', 500);
    assert.equal(isDrumApiTimeout(timeout), true);
    assert.equal(isDrumApiAborted(timeout), false);
    assert.equal(isDrumApiTimeout(aborted), false);
    assert.equal(isDrumApiAborted(aborted), true);
    assert.equal(isDrumApiTimeout(http), false);
    assert.equal(isDrumApiAborted(http), false);
  });
});
