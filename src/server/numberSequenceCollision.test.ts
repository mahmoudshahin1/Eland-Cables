import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SEQUENCE_COLLISION_STEP_CAP,
  resolveUniqueSequenceValue,
} from './numberSequenceService';

const quo = { format: '{PREFIX}{YY}-{#####}', prefix: 'QUO', nextSerial: 19 };
const on2026 = new Date('2026-11-12T00:00:00Z');

describe('number sequence collision skip', () => {
  it('returns the counter value when it is free', async () => {
    const resolved = await resolveUniqueSequenceValue(quo, async () => false, on2026);
    assert.deepEqual(resolved, { value: 'QUO26-00019', serial: 19 });
  });

  it('skips quotation numbers that already exist', async () => {
    const taken = new Set(['QUO26-00019', 'QUO26-00020']);
    const resolved = await resolveUniqueSequenceValue(quo, async (candidate) => taken.has(candidate), on2026);
    assert.deepEqual(resolved, { value: 'QUO26-00021', serial: 21 });
  });

  it('stops after the step cap instead of looping forever', async () => {
    await assert.rejects(
      () => resolveUniqueSequenceValue(quo, async () => true, on2026),
      new RegExp(`after ${SEQUENCE_COLLISION_STEP_CAP} steps starting at 19`)
    );
  });

  it('uses the year from the allocation date', async () => {
    const resolved = await resolveUniqueSequenceValue(
      { format: '{PREFIX}{YY}-{###}', prefix: 'INQ-', nextSerial: 5 },
      async () => false,
      new Date('2027-01-02T00:00:00Z')
    );
    assert.deepEqual(resolved, { value: 'INQ-27-005', serial: 5 });
  });
});
