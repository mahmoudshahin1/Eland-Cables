import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const dir = dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return readFileSync(join(dir, rel), 'utf8');
}

describe('05I-DF-B4-B architectural guardrails', () => {
  it('adds DestinationPort, Incoterm, and ShippingCostRate as B4-B masters', () => {
    const schema = read('../../prisma/schema.prisma');
    assert.match(schema, /model DestinationPort/);
    assert.match(schema, /model Incoterm/);
    assert.match(schema, /model ShippingCostRate/);
    assert.match(schema, /destinationPortCode\s+String\?/);
    assert.match(schema, /incotermCode\s+String\?/);
  });

  it('keeps the resolver free of Prisma, FX, costing, and snapshots', () => {
    const src = read('./shippingCostResolver.ts');
    for (const token of [
      'getPrisma',
      '@prisma/client',
      'CostingExchangeRate',
      'costingEngine',
      'ShipmentCostSnapshot',
      'localStorage',
      'd365',
    ]) {
      assert.equal(src.includes(token), false, token);
    }
  });

  it('does not reuse costing logistics or metal shipping in the rate repository', () => {
    const src = read('../server/shippingCostRepository.ts');
    for (const token of [
      'CostingLogisticsRule',
      'CostingMetalCostComponent',
      'DEFAULT_INCOTERM_CHARGE_PERCENT',
      'costingEngine',
      'CostingExchangeRate',
      'ShipmentCostSnapshot',
    ]) {
      assert.equal(src.includes(token), false, token);
    }
    assert.match(src, /RATE_OVERLAP/);
    assert.match(src, /SHIPPING_COST_RATE_CREATED/);
  });
});
