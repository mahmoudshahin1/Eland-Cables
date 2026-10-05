/**
 * Task 04B-4 — legacy client telemetry (NON_AUTHORITATIVE).
 * Authoritative audit history is server `AuditEvent` (PostgreSQL) via `appendServerAudit`.
 * Do not treat this store as proof of audit for governed mutations.
 */
export const AUDIT_STORAGE_KEY = 'energya_platform_audit_v1';
export const AUDIT_LS_CLASS = 'LEGACY_TELEMETRY' as const;
/** Client/browser audit telemetry must never be authoritative. */
export const AUDIT_LOCAL_IS_AUTHORITATIVE = false;

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'SUPERSEDE'
  | 'APPROVE'
  | 'REJECT'
  | 'SUBMIT'
  | 'CANCEL'
  | 'IMPORT'
  | 'PRICE_CHANGE'
  | 'BOM_CHANGE'
  | 'DRUM_CHANGE'
  | 'LOGIN';

export interface AuditLogEntry {
  id: string;
  at: string;
  actorId?: string;
  actorName?: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  message?: string;
}

const STORAGE_KEY = AUDIT_STORAGE_KEY;

function readStore(): AuditLogEntry[] {
  if (typeof window === 'undefined') return memoryStore;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let memoryStore: AuditLogEntry[] = [];

function writeStore(entries: AuditLogEntry[]): void {
  memoryStore = entries;
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Append-only legacy telemetry (browser localStorage or server memory in tests).
 * NOT authoritative — server `AuditEvent` is the audit source of truth.
 */
export function appendAudit(entry: Omit<AuditLogEntry, 'id' | 'at'> & { at?: string }): AuditLogEntry {
  const full: AuditLogEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at || new Date().toISOString(),
    actorId: entry.actorId,
    actorName: entry.actorName,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    message: entry.message,
  };
  const next = [full, ...readStore()].slice(0, 2000);
  writeStore(next);
  return full;
}

/** Legacy telemetry read — non-authoritative; prefer `/api/v2/audit/events` or domain audit APIs. */
export function listAudit(filter?: { entity?: string; entityId?: string }): AuditLogEntry[] {
  return readStore().filter((e) => {
    if (filter?.entity && e.entity !== filter.entity) return false;
    if (filter?.entityId && e.entityId !== filter.entityId) return false;
    return true;
  });
}

export function resetAuditForTests(): void {
  memoryStore = [];
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
}
