import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { appendAudit, listAudit, resetAuditForTests, AUDIT_LOCAL_IS_AUTHORITATIVE, AUDIT_LS_CLASS, AUDIT_STORAGE_KEY } from './auditLogService';

describe('auditLogService', () => {
  beforeEach(() => {
    resetAuditForTests();
  });

  it('appends immutable entries with who/what/when', () => {
    appendAudit({
      actorName: 'admin@energya.com',
      entity: 'DrumMaster',
      entityId: 'EWD630-0',
      action: 'CREATE',
      newValue: { drumCode: 'EWD630-0' },
    });
    const rows = listAudit({ entity: 'DrumMaster' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'CREATE');
    assert.ok(rows[0].at);
    assert.equal(rows[0].entityId, 'EWD630-0');
  });

  it('does not overwrite previous entries when appending', () => {
    appendAudit({ entity: 'Quotation', entityId: 'QT-1', action: 'CREATE' });
    appendAudit({ entity: 'Quotation', entityId: 'QT-1', action: 'UPDATE', oldValue: { v: 1 }, newValue: { v: 2 } });
    const rows = listAudit({ entityId: 'QT-1' });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].action, 'UPDATE');
    assert.equal(rows[1].action, 'CREATE');
  });

  it('exposes legacy telemetry constants (non-authoritative)', () => {
    assert.equal(AUDIT_STORAGE_KEY, 'energya_platform_audit_v1');
    assert.equal(AUDIT_LS_CLASS, 'LEGACY_TELEMETRY');
    assert.equal(AUDIT_LOCAL_IS_AUTHORITATIVE, false);
  });
});
