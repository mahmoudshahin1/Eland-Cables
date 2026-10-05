import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendServerAudit, appendServerAuditTx, auditEventData } from './serverAudit';

describe('server audit abstraction', () => {
  it('uses one AuditEvent payload for transactional and non-transactional append', () => {
    const payload = auditEventData({
      actorId: 'u1',
      actorName: 'Ada',
      entity: 'ShipmentCostSnapshot',
      entityId: 's1',
      action: 'SHIPMENT_COST_SNAPSHOT_CREATED',
      newValue: { totalAmount: '100' },
      message: 'created',
    });
    assert.equal(payload.entity, 'ShipmentCostSnapshot');
    assert.equal(payload.entityId, 's1');
    assert.equal(payload.action, 'SHIPMENT_COST_SNAPSHOT_CREATED');
    assert.equal(payload.actorId, 'u1');
    assert.deepEqual(payload.newValue, { totalAmount: '100' });
  });

  it('appendServerAuditTx does not swallow create errors', async () => {
    await assert.rejects(
      () =>
        appendServerAuditTx(
          {
            auditEvent: {
              create: async () => {
                throw new Error('audit-write-failed');
              },
            },
          },
          { entity: 'ShipmentCostSnapshot', entityId: 's1', action: 'SHIPMENT_COST_SNAPSHOT_CREATED' }
        ),
      /audit-write-failed/
    );
  });

  it('appendServerAudit still swallows errors for non-transactional callers', async () => {
    await assert.doesNotReject(() =>
      appendServerAudit({
        entity: 'ShipmentCostSnapshot',
        entityId: 's1',
        action: 'SHIPMENT_COST_SNAPSHOT_CREATE_FAILED',
      })
    );
  });
});
