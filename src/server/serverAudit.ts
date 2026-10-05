/**
 * Server-authoritative audit append helper.
 * Client `auditLogService` (localStorage) = LEGACY_TELEMETRY only — retained, not deleted.
 *
 * Two call sites, one AuditEvent construction:
 * - `appendServerAudit` — fire-and-forget; swallows errors so non-transactional
 *   callers are not aborted. Used for optional failure trails.
 * - `appendServerAuditTx` — same payload; participates in the caller transaction;
 *   does not swallow. Used when audit must be atomic with the business write.
 */

import { getPrisma } from './db';
import {
  AUDIT_LOCAL_IS_AUTHORITATIVE,
  AUDIT_LS_CLASS,
  AUDIT_STORAGE_KEY,
} from '../platform/audit/auditLogService';

export { AUDIT_LOCAL_IS_AUTHORITATIVE, AUDIT_LS_CLASS, AUDIT_STORAGE_KEY };

export type ServerAuditAction = string;

export interface ServerAuditInput {
  actorId?: string | null;
  actorName?: string | null;
  entity: string;
  entityId: string;
  action: ServerAuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  message?: string | null;
}

/** Minimal Prisma surface: TransactionClient or PrismaClient. */
export type ServerAuditDb = {
  auditEvent: {
    create: (args: { data: ReturnType<typeof auditEventData> }) => Promise<unknown>;
  };
};

export function auditEventData(input: ServerAuditInput) {
  return {
    actorId: input.actorId ?? null,
    actorName: input.actorName ?? null,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    oldValue: input.oldValue === undefined ? undefined : (input.oldValue as object),
    newValue: input.newValue === undefined ? undefined : (input.newValue as object),
    message: input.message ?? null,
  };
}

/**
 * Authoritative transactional audit. Same AuditEvent schema as `appendServerAudit`.
 * Does not swallow: if insert fails, the caller transaction must roll back.
 */
export async function appendServerAuditTx(tx: ServerAuditDb, input: ServerAuditInput): Promise<void> {
  if (!tx?.auditEvent?.create) {
    throw new Error('appendServerAuditTx requires a Prisma client or transaction.');
  }
  await tx.auditEvent.create({ data: auditEventData(input) });
}

export async function appendServerAudit(input: ServerAuditInput): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await appendServerAuditTx(prisma, input);
  } catch (err) {
    // Audit must not break primary operations; log and continue.
    console.error('[serverAudit] failed to append', err);
  }
}

export async function listServerAuditEvents(filter?: {
  entity?: string;
  entityId?: string;
  actorId?: string;
  limit?: number;
}) {
  const prisma = getPrisma();
  if (!prisma) return [];
  return prisma.auditEvent.findMany({
    where: {
      ...(filter?.entity ? { entity: filter.entity } : {}),
      ...(filter?.entityId ? { entityId: filter.entityId } : {}),
      ...(filter?.actorId ? { actorId: filter.actorId } : {}),
    },
    orderBy: { at: 'desc' },
    take: Math.min(filter?.limit ?? 100, 500),
  });
}

/** Documented migration posture for dual-audit cutover (Task 04B-4). */
export const AUDIT_MIGRATION_NOTE = {
  authoritative: 'AuditEvent (PostgreSQL) — AUTHORITATIVE_SERVER_AUDIT',
  compatibility: `${AUDIT_STORAGE_KEY} (${AUDIT_LS_CLASS})`,
  localIsAuthoritative: AUDIT_LOCAL_IS_AUTHORITATIVE,
  migratePath: [
    '1. All server mutations call appendServerAudit / appendServerAuditTx (same AuditEvent construction)',
    '2. Admin/UI reads use /api/v2/audit/events or domain audit APIs — never LS as authority',
    '3. Empty PostgreSQL audit history does not resurrect legacy telemetry',
    '4. Retire client appendAudit for domain events only after explicit cleanup decision',
  ],
};

/**
 * Read authority: PostgreSQL audit wins including empty arrays.
 * Legacy telemetry is fallback only when PG is unavailable (non-authoritative).
 */
export function preferPostgresAudit<T>(
  pg: { ok: true; data: T[] } | { ok: false; error?: string },
  legacyTelemetry: T[]
): {
  data: T[];
  source: 'POSTGRESQL' | 'LEGACY_TELEMETRY_FALLBACK';
  staleLegacyIgnored: boolean;
  authoritative: boolean;
} {
  if (pg.ok) {
    return {
      data: pg.data,
      source: 'POSTGRESQL',
      staleLegacyIgnored: true,
      authoritative: true,
    };
  }
  return {
    data: legacyTelemetry,
    source: 'LEGACY_TELEMETRY_FALLBACK',
    staleLegacyIgnored: false,
    authoritative: false,
  };
}
