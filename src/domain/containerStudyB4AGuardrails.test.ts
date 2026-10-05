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

describe('05I-DF-B4-A architectural guardrails', () => {
  it('does not introduce CALCULATED lifecycle or ShippingCostMaster', () => {
    assert.deepEqual([...CONTAINER_STUDY_STATUSES], ['DRAFT', 'VALIDATED', 'CONFIRMED', 'SUPERSEDED']);
    const schema = read('../../prisma/schema.prisma');
    assert.equal(schema.includes('model ShippingCostMaster'), false);
    assert.match(schema, /DESTINATION_CLUSTER/);
    assert.match(schema, /model ContainerShipmentGroupLine/);
  });

  it('LOCKED groups may receive successor snapshots; SUPERSEDED groups may not', () => {
    const src = read('../server/containerStudyB1Repository.ts');
    assert.equal(src.includes("Shipment group is locked; cannot capture a new input snapshot"), false);
    assert.match(src, /SUPERSEDED/);
    assert.match(src, /memberLineIds/);
  });

  it('keeps membership rules free of Prisma and HTTP', () => {
    const src = read('./containerStudyShipmentGroupMembership.ts');
    for (const token of ['getPrisma', '@prisma/client', 'express', 'localStorage', 'd365']) {
      assert.equal(src.includes(token), false, token);
    }
  });
});
