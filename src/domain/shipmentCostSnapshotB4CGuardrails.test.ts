import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const dir = dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(join(dir, rel), 'utf8');
}

describe('05I-DF-B4-C architectural guardrails', () => {
  it('adds an immutable snapshot without a status machine or CostingRun FK', () => {
    const schema = read('../../prisma/schema.prisma');
    assert.match(schema, /model ShipmentCostSnapshot \{/);
    assert.match(schema, /model ShipmentCostSnapshotLine \{/);
    assert.match(schema, /containerStudyResultId\s+String\s+@unique/);
    assert.match(schema, /shipmentCostSnapshotId\s+String[\s\S]*onDelete: Cascade/);
    assert.match(schema, /shippingCostRateId\s+String[\s\S]*onDelete: Restrict/);
    const snapshotBlock = schema.slice(schema.indexOf('model ShipmentCostSnapshot {'), schema.indexOf('model ShipmentCostSnapshotLine {'));
    const lineBlock = schema.slice(schema.indexOf('model ShipmentCostSnapshotLine {'));
    assert.equal(/status\s+/.test(snapshotBlock), false);
    assert.equal(snapshotBlock.includes('CostingRun'), false);
    assert.equal(snapshotBlock.includes('workflowStatus'), false);
    assert.equal(snapshotBlock.includes('costingRunId'), false);
    assert.equal(lineBlock.includes('costingRunId'), false);
  });

  it('keeps snapshot persistence free of FX, costing engine, and live drum-plan re-eval', () => {
    const src = read('../server/shipmentCostSnapshotRepository.ts');
    for (const token of [
      'costingEngine',
      'CostingExchangeRate',
      'CostingRun',
      'DEFAULT_INCOTERM_CHARGE_PERCENT',
      'CostingMetalCostComponent',
      'assertSnapshotDrumPlansCurrent',
      'STALE_DRUM_PLAN',
      'localStorage',
      'd365',
    ]) {
      assert.equal(src.includes(token), false, token);
    }
    assert.match(src, /\$transaction/);
    assert.match(src, /appendServerAuditTx/);
    assert.equal(src.includes('tx.auditEvent.create'), false);
    assert.match(src, /SHIPMENT_COST_SNAPSHOT_CREATED/);
    assert.match(src, /SHIPMENT_COST_SNAPSHOT_CREATE_FAILED/);
    assert.match(src, /resolveShippingCostRateOn/);
  });

  it('exposes create/read APIs without PATCH or DELETE', () => {
    const src = read('../server/shipmentCostSnapshotRoutes.ts');
    assert.match(src, /post\('\/shipment-cost-snapshots'/);
    assert.match(src, /get\('\/shipment-cost-snapshots\/:id'/);
    assert.equal(src.includes('.patch('), false);
    assert.equal(src.includes('.delete('), false);
  });

  it('does not leak shipment cost into the costing engine freeze surface', () => {
    const engine = read('./costingEngine.ts');
    assert.equal(engine.includes('ShipmentCostSnapshot'), false);
    assert.equal(engine.includes('customerShipmentTotal'), false);
  });
});
