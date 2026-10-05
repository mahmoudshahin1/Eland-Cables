/**
 * Auth / security migration helpers for local → Supabase.
 * Pure (no Prisma I/O) so unit tests cover mapping, conflicts, session/reset
 * handling, orphan checks, and redaction without DB access.
 *
 * Security: never log or serialize passwordHash, refreshTokenHash, tokenHash,
 * JWTs, API keys, or DB passwords. Callers must redact before writing reports.
 */

import { buildCodeMasterMap, type CodeMasterMap, type FkRemapIssue } from './migrateLocalToSupabaseLib';

/** Auth/identity tables migrated additively after business Customer mapping. */
export const AUTH_TABLES = [
  'Permission',
  'Role',
  'RolePermission',
  'SecurityGroup',
  'SecurityGroupRole',
  'UserAccount',
  'UserRole',
  'SecurityGroupMember',
  'CustomerUser',
  'UserSession',
  'PasswordResetTicket',
  'UserNotification',
] as const;

export type AuthTable = (typeof AUTH_TABLES)[number];

/**
 * Safe FK insert order (Prisma graph):
 * Permission, Role → RolePermission;
 * SecurityGroup → SecurityGroupRole;
 * Customer (business) → UserAccount → UserRole / SecurityGroupMember / CustomerUser /
 * UserSession / PasswordResetTicket / UserNotification.
 */
export const AUTH_MIGRATION_ORDER: AuthTable[] = [
  'Permission',
  'Role',
  'RolePermission',
  'SecurityGroup',
  'SecurityGroupRole',
  'UserAccount',
  'UserRole',
  'SecurityGroupMember',
  'CustomerUser',
  'UserSession',
  'PasswordResetTicket',
  'UserNotification',
];

export const SYSTEM_ADMIN_ROLE_CODE = 'SYSTEM_ADMINISTRATOR';
export const DEFAULT_PRODUCTION_ADMIN_EMAIL = 'admin@energya.com';

/** Field names that must never appear in logs/reports. */
export const SENSITIVE_AUTH_FIELD_NAMES = [
  'passwordHash',
  'password',
  'refreshTokenHash',
  'refreshToken',
  'tokenHash',
  'token',
  'accessToken',
  'idToken',
  'jwt',
  'apiKey',
  'api_key',
  'databaseUrl',
  'DATABASE_URL',
  'TARGET_DATABASE_URL',
  'SOURCE_DATABASE_URL',
  'ADMIN_SEED_PASSWORD',
  'JWT_SECRET',
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SENSITIVE_KEY_RE = new RegExp(
  `\\b(${SENSITIVE_AUTH_FIELD_NAMES.map(escapeRegExp).join('|')})\\b`,
  'i'
);

/** Heuristic: bcrypt/argon-like hashes and long opaque tokens. */
const HASH_LIKE_RE =
  /(\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22,}|\$argon2(?:id|i|d)\$[^\s,"']{20,}|[A-Za-z0-9_\-]{40,})/g;

export function isSensitiveAuthFieldName(name: string): boolean {
  const n = name.trim();
  return SENSITIVE_AUTH_FIELD_NAMES.some((s) => s.toLowerCase() === n.toLowerCase());
}

export function redactSensitiveAuthValue(fieldName: string, value: unknown): unknown {
  if (isSensitiveAuthFieldName(fieldName)) return '[REDACTED]';
  if (typeof value === 'string' && HASH_LIKE_RE.test(value)) {
    HASH_LIKE_RE.lastIndex = 0;
    return '[REDACTED]';
  }
  HASH_LIKE_RE.lastIndex = 0;
  return value;
}

export function redactSensitiveAuthRecord(
  row: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = redactSensitiveAuthRecord(v as Record<string, unknown>);
    } else {
      out[k] = redactSensitiveAuthValue(k, v);
    }
  }
  return out;
}

/** Redact sensitive substrings from free-form log/report text. */
export function redactSensitiveAuthText(text: string): string {
  let out = text;
  for (const field of SENSITIVE_AUTH_FIELD_NAMES) {
    const re = new RegExp(
      `(${field}\\s*[=:]\\s*)([^\\s,;|"'\\]\\}]+)`,
      'gi'
    );
    out = out.replace(re, '$1[REDACTED]');
  }
  out = out.replace(HASH_LIKE_RE, '[REDACTED]');
  if (SENSITIVE_KEY_RE.test(out) && /[=:]/.test(out)) {
    // already partially handled
  }
  return out;
}

export type PermissionKeyRow = {
  id: string;
  module: string;
  resource: string;
  action: string;
};

export type PermissionMap = {
  sourceIdToTargetId: Map<string, string>;
  matched: Array<{ key: string; sourceId: string; targetId: string }>;
  toCreate: Array<{ key: string; sourceId: string }>;
  idRemaps: Array<{ key: string; sourceId: string; targetId: string }>;
  sourceDuplicateKeys: Array<{ key: string; sourceIds: string[] }>;
};

export function permissionNaturalKey(row: {
  module: string;
  resource: string;
  action: string;
}): string {
  return `${row.module}::${row.resource}::${row.action}`;
}

export function buildPermissionMap(
  sourceRows: PermissionKeyRow[],
  targetRows: PermissionKeyRow[]
): PermissionMap {
  const map: PermissionMap = {
    sourceIdToTargetId: new Map(),
    matched: [],
    toCreate: [],
    idRemaps: [],
    sourceDuplicateKeys: [],
  };

  const byKey = new Map<string, string[]>();
  const sourceKeyToId = new Map<string, string>();
  for (const row of sourceRows) {
    const key = permissionNaturalKey(row);
    const ids = byKey.get(key) || [];
    ids.push(row.id);
    byKey.set(key, ids);
    if (!sourceKeyToId.has(key)) sourceKeyToId.set(key, row.id);
  }
  for (const [key, ids] of byKey) {
    if (ids.length > 1) map.sourceDuplicateKeys.push({ key, sourceIds: ids });
  }

  const targetKeyToId = new Map<string, string>();
  for (const row of targetRows) {
    targetKeyToId.set(permissionNaturalKey(row), row.id);
  }

  for (const row of sourceRows) {
    const key = permissionNaturalKey(row);
    const targetId = targetKeyToId.get(key);
    if (targetId) {
      map.sourceIdToTargetId.set(row.id, targetId);
      const match = { key, sourceId: row.id, targetId };
      map.matched.push(match);
      if (row.id !== targetId) map.idRemaps.push(match);
    } else {
      map.sourceIdToTargetId.set(row.id, row.id);
      map.toCreate.push({ key, sourceId: row.id });
    }
  }

  return map;
}

export type UserAccountIdentity = {
  id: string;
  username: string;
  email: string;
  customerId?: string | null;
  userType?: string | null;
  status?: string | null;
  isActive?: boolean | null;
  isLocked?: boolean | null;
  /** Present only when loaded from target with role join — never includes passwordHash. */
  isProductionAdmin?: boolean;
};

export type UserAccountConflictKind =
  | 'email_match'
  | 'username_match'
  | 'email_username_cross'
  | 'id_collision_different_identity'
  | 'production_admin_preserved'
  | 'duplicate_source_email'
  | 'duplicate_source_username';

export type UserAccountConflict = {
  kind: UserAccountConflictKind;
  sourceId: string;
  targetId: string | null;
  email: string | null;
  username: string | null;
  detail: string;
  /** Always true for conflicts — never overwrite target auth state. */
  preserveTarget: true;
};

export type UserAccountMapAction =
  | 'create'
  | 'match_preserve_target'
  | 'match_preserve_production_admin';

export type UserAccountMapEntry = {
  sourceId: string;
  targetId: string;
  email: string;
  username: string;
  action: UserAccountMapAction;
};

export type UserAccountMap = {
  sourceIdToTargetId: Map<string, string>;
  entries: UserAccountMapEntry[];
  toCreate: UserAccountMapEntry[];
  matched: UserAccountMapEntry[];
  conflicts: UserAccountConflict[];
  productionAdminsPreserved: Array<{
    sourceId: string;
    targetId: string;
    email: string;
    username: string;
  }>;
  /** Source ids that exist on target under a different email/username — cannot create with source PK. */
  blockingIdCollisions: UserAccountConflict[];
};

function normIdentity(value: string): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * Build source→target UserAccount map by email/username natural keys.
 * Production admins on target are never overwritten (password/status remain usable).
 * Matched non-admin accounts also preserve target rows (additive skipDuplicates).
 */
export function buildUserAccountMap(
  sourceRows: UserAccountIdentity[],
  targetRows: UserAccountIdentity[],
  options?: {
    productionAdminEmails?: Iterable<string>;
    productionAdminUserIds?: Iterable<string>;
  }
): UserAccountMap {
  const map: UserAccountMap = {
    sourceIdToTargetId: new Map(),
    entries: [],
    toCreate: [],
    matched: [],
    conflicts: [],
    productionAdminsPreserved: [],
    blockingIdCollisions: [],
  };

  const adminEmails = new Set(
    [...(options?.productionAdminEmails || [DEFAULT_PRODUCTION_ADMIN_EMAIL])].map(normIdentity)
  );
  const adminIds = new Set([...(options?.productionAdminUserIds || [])].map(String));

  const targetById = new Map(targetRows.map((r) => [r.id, r]));
  const targetByEmail = new Map<string, UserAccountIdentity>();
  const targetByUsername = new Map<string, UserAccountIdentity>();
  for (const row of targetRows) {
    targetByEmail.set(normIdentity(row.email), row);
    targetByUsername.set(normIdentity(row.username), row);
    if (row.isProductionAdmin) adminIds.add(row.id);
    if (adminEmails.has(normIdentity(row.email))) adminIds.add(row.id);
  }

  const sourceEmails = new Map<string, string[]>();
  const sourceUsernames = new Map<string, string[]>();
  for (const row of sourceRows) {
    const e = normIdentity(row.email);
    const u = normIdentity(row.username);
    sourceEmails.set(e, [...(sourceEmails.get(e) || []), row.id]);
    sourceUsernames.set(u, [...(sourceUsernames.get(u) || []), row.id]);
  }
  for (const [email, ids] of sourceEmails) {
    if (ids.length > 1) {
      map.conflicts.push({
        kind: 'duplicate_source_email',
        sourceId: ids[0],
        targetId: null,
        email,
        username: null,
        detail: `Duplicate source email="${email}" across ids=${ids.join(',')}; first wins for mapping`,
        preserveTarget: true,
      });
    }
  }
  for (const [username, ids] of sourceUsernames) {
    if (ids.length > 1) {
      map.conflicts.push({
        kind: 'duplicate_source_username',
        sourceId: ids[0],
        targetId: null,
        email: null,
        username,
        detail: `Duplicate source username="${username}" across ids=${ids.join(',')}; first wins for mapping`,
        preserveTarget: true,
      });
    }
  }

  const seenSource = new Set<string>();
  for (const row of sourceRows) {
    if (seenSource.has(row.id)) continue;
    seenSource.add(row.id);

    const emailKey = normIdentity(row.email);
    const userKey = normIdentity(row.username);
    const byEmail = targetByEmail.get(emailKey);
    const byUsername = targetByUsername.get(userKey);

    let target: UserAccountIdentity | undefined;
    let kind: UserAccountConflictKind | null = null;

    if (byEmail && byUsername && byEmail.id !== byUsername.id) {
      // Prefer email match; report cross conflict
      target = byEmail;
      kind = 'email_username_cross';
      map.conflicts.push({
        kind,
        sourceId: row.id,
        targetId: byEmail.id,
        email: row.email,
        username: row.username,
        detail: `Source email matches target ${byEmail.id} but username matches different target ${byUsername.id}; using email match and preserving both targets`,
        preserveTarget: true,
      });
    } else if (byEmail) {
      target = byEmail;
      kind = 'email_match';
    } else if (byUsername) {
      target = byUsername;
      kind = 'username_match';
    }

    if (target) {
      const isAdmin =
        Boolean(target.isProductionAdmin) ||
        adminIds.has(target.id) ||
        adminEmails.has(normIdentity(target.email));
      const action: UserAccountMapAction = isAdmin
        ? 'match_preserve_production_admin'
        : 'match_preserve_target';
      const entry: UserAccountMapEntry = {
        sourceId: row.id,
        targetId: target.id,
        email: row.email,
        username: row.username,
        action,
      };
      map.sourceIdToTargetId.set(row.id, target.id);
      map.entries.push(entry);
      map.matched.push(entry);
      if (kind && kind !== 'email_username_cross') {
        map.conflicts.push({
          kind: isAdmin ? 'production_admin_preserved' : kind,
          sourceId: row.id,
          targetId: target.id,
          email: row.email,
          username: row.username,
          detail: isAdmin
            ? `Production admin matched by ${kind}; target id/password/status preserved — source row not inserted/overwritten`
            : `Matched existing target UserAccount by ${kind}; target preserved (additive, no overwrite)`,
          preserveTarget: true,
        });
      } else if (isAdmin) {
        map.conflicts.push({
          kind: 'production_admin_preserved',
          sourceId: row.id,
          targetId: target.id,
          email: row.email,
          username: row.username,
          detail:
            'Production admin matched; target id/password/status preserved — source row not inserted/overwritten',
          preserveTarget: true,
        });
      }
      if (isAdmin) {
        map.productionAdminsPreserved.push({
          sourceId: row.id,
          targetId: target.id,
          email: target.email,
          username: target.username,
        });
      }
      continue;
    }

    // No natural-key match — create if PK free, else blocking id collision
    const existing = targetById.get(row.id);
    if (existing) {
      const conflict: UserAccountConflict = {
        kind: 'id_collision_different_identity',
        sourceId: row.id,
        targetId: existing.id,
        email: row.email,
        username: row.username,
        detail: `Source id already on target with different identity (target email/username differ); cannot preserve source PK or invent a new id — skipped`,
        preserveTarget: true,
      };
      map.conflicts.push(conflict);
      map.blockingIdCollisions.push(conflict);
      // Dependents cannot remap this source user
      continue;
    }

    const entry: UserAccountMapEntry = {
      sourceId: row.id,
      targetId: row.id,
      email: row.email,
      username: row.username,
      action: 'create',
    };
    map.sourceIdToTargetId.set(row.id, row.id);
    map.entries.push(entry);
    map.toCreate.push(entry);
  }

  return map;
}

export type SessionClassifyInput = {
  id: string;
  userId: string;
  expiresAt: Date | string;
  revokedAt?: Date | string | null;
};

export type SessionMigrationAction = 'historical' | 'invalidate_active';

export type PreparedSession = {
  id: string;
  userId: string;
  action: SessionMigrationAction;
  /** Row fields excluding refreshTokenHash — caller merges token from source at apply time only. */
  safeFields: {
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt?: Date;
  };
};

/**
 * Prefer migrating historical sessions as-is; active (unexpired, unrevoked)
 * sessions are invalidated so local refresh tokens cannot become valid in production.
 * Accounts/passwords are untouched — users log in normally after migration.
 */
export function classifyAndPrepareSession(
  session: SessionClassifyInput,
  remappedUserId: string,
  now: Date = new Date()
): PreparedSession {
  const expiresAt = new Date(session.expiresAt);
  const revokedAt = session.revokedAt ? new Date(session.revokedAt) : null;
  const isActive = !revokedAt && expiresAt.getTime() > now.getTime();

  if (isActive) {
    return {
      id: session.id,
      userId: remappedUserId,
      action: 'invalidate_active',
      safeFields: {
        id: session.id,
        userId: remappedUserId,
        expiresAt,
        revokedAt: now,
      },
    };
  }

  return {
    id: session.id,
    userId: remappedUserId,
    action: 'historical',
    safeFields: {
      id: session.id,
      userId: remappedUserId,
      expiresAt,
      revokedAt,
    },
  };
}

export function summarizeSessionPlan(
  sessions: SessionClassifyInput[],
  userMap: Map<string, string>,
  now: Date = new Date()
): {
  total: number;
  historical: number;
  activeInvalidated: number;
  orphanUserSkipped: number;
  prepared: PreparedSession[];
  policy: string;
} {
  let historical = 0;
  let activeInvalidated = 0;
  let orphanUserSkipped = 0;
  const prepared: PreparedSession[] = [];
  for (const s of sessions) {
    const uid = userMap.get(s.userId);
    if (!uid) {
      orphanUserSkipped += 1;
      continue;
    }
    const p = classifyAndPrepareSession(s, uid, now);
    prepared.push(p);
    if (p.action === 'historical') historical += 1;
    else activeInvalidated += 1;
  }
  return {
    total: sessions.length,
    historical,
    activeInvalidated,
    orphanUserSkipped,
    prepared,
    policy:
      'Active sessions (expiresAt > now AND revokedAt IS NULL) are migrated with revokedAt=migrationNow so local refresh tokens cannot authenticate against production. Historical expired/revoked sessions migrate as-is with userId remapped. Existing target sessions are never deleted (skipDuplicates). UserAccount passwords are preserved for normal login.',
  };
}

export type ResetTicketClassifyInput = {
  id: string;
  userId: string;
  expiresAt: Date | string;
  usedAt?: Date | string | null;
};

export type ResetTicketMigrationAction = 'historical_used' | 'historical_expired' | 'expire_active';

export type PreparedResetTicket = {
  id: string;
  userId: string;
  action: ResetTicketMigrationAction;
  safeFields: {
    id: string;
    userId: string;
    expiresAt: Date;
    usedAt: Date | null;
  };
};

/**
 * Migrate reset tickets without inventing tokens. Active (unused + unexpired)
 * tickets are force-expired so local reset links cannot be used in production.
 * tokenHash is never returned here — apply merges it from source privately.
 */
export function classifyAndPrepareResetTicket(
  ticket: ResetTicketClassifyInput,
  remappedUserId: string,
  now: Date = new Date()
): PreparedResetTicket {
  const expiresAt = new Date(ticket.expiresAt);
  const usedAt = ticket.usedAt ? new Date(ticket.usedAt) : null;

  if (usedAt) {
    return {
      id: ticket.id,
      userId: remappedUserId,
      action: 'historical_used',
      safeFields: { id: ticket.id, userId: remappedUserId, expiresAt, usedAt },
    };
  }
  if (expiresAt.getTime() <= now.getTime()) {
    return {
      id: ticket.id,
      userId: remappedUserId,
      action: 'historical_expired',
      safeFields: { id: ticket.id, userId: remappedUserId, expiresAt, usedAt: null },
    };
  }
  return {
    id: ticket.id,
    userId: remappedUserId,
    action: 'expire_active',
    safeFields: {
      id: ticket.id,
      userId: remappedUserId,
      expiresAt: now,
      usedAt: null,
    },
  };
}

export function summarizeResetTicketPlan(
  tickets: ResetTicketClassifyInput[],
  userMap: Map<string, string>,
  now: Date = new Date()
): {
  total: number;
  historicalUsed: number;
  historicalExpired: number;
  activeExpiredOnMigrate: number;
  orphanUserSkipped: number;
  prepared: PreparedResetTicket[];
  policy: string;
} {
  let historicalUsed = 0;
  let historicalExpired = 0;
  let activeExpiredOnMigrate = 0;
  let orphanUserSkipped = 0;
  const prepared: PreparedResetTicket[] = [];
  for (const t of tickets) {
    const uid = userMap.get(t.userId);
    if (!uid) {
      orphanUserSkipped += 1;
      continue;
    }
    const p = classifyAndPrepareResetTicket(t, uid, now);
    prepared.push(p);
    if (p.action === 'historical_used') historicalUsed += 1;
    else if (p.action === 'historical_expired') historicalExpired += 1;
    else activeExpiredOnMigrate += 1;
  }
  return {
    total: tickets.length,
    historicalUsed,
    historicalExpired,
    activeExpiredOnMigrate,
    orphanUserSkipped,
    prepared,
    policy:
      'Historical used/expired PasswordResetTicket rows migrate with userId remapped. Active unused tickets are force-expired (expiresAt=migrationNow) so local reset tokens cannot be redeemed in production. Tokens are never invented or logged; tokenHash is copied only at apply time and redacted in all reports.',
  };
}

export type AuthFkColumnSpec = {
  model: AuthTable;
  column: string;
  parent: 'UserAccount' | 'Role' | 'Permission' | 'SecurityGroup' | 'Customer';
  required: boolean;
};

export const AUTH_FK_COLUMNS: AuthFkColumnSpec[] = [
  { model: 'RolePermission', column: 'roleId', parent: 'Role', required: true },
  { model: 'RolePermission', column: 'permissionId', parent: 'Permission', required: true },
  { model: 'SecurityGroupRole', column: 'groupId', parent: 'SecurityGroup', required: true },
  { model: 'SecurityGroupRole', column: 'roleId', parent: 'Role', required: true },
  { model: 'UserAccount', column: 'customerId', parent: 'Customer', required: false },
  { model: 'UserRole', column: 'userId', parent: 'UserAccount', required: true },
  { model: 'UserRole', column: 'roleId', parent: 'Role', required: true },
  { model: 'SecurityGroupMember', column: 'groupId', parent: 'SecurityGroup', required: true },
  { model: 'SecurityGroupMember', column: 'userId', parent: 'UserAccount', required: true },
  { model: 'CustomerUser', column: 'customerId', parent: 'Customer', required: true },
  { model: 'CustomerUser', column: 'userAccountId', parent: 'UserAccount', required: true },
  { model: 'UserSession', column: 'userId', parent: 'UserAccount', required: true },
  { model: 'PasswordResetTicket', column: 'userId', parent: 'UserAccount', required: true },
  { model: 'UserNotification', column: 'userAccountId', parent: 'UserAccount', required: false },
];

export function remapAuthIdFields(
  model: string,
  row: Record<string, unknown>,
  maps: {
    userAccount?: Map<string, string>;
    role?: Map<string, string>;
    permission?: Map<string, string>;
    securityGroup?: Map<string, string>;
    customer?: Map<string, string>;
  }
): { row: Record<string, unknown>; errors: string[]; remapped: string[] } {
  const errors: string[] = [];
  const remapped: string[] = [];
  const next = { ...row };
  const specs = AUTH_FK_COLUMNS.filter((s) => s.model === model);

  for (const spec of specs) {
    const val = next[spec.column];
    if (val == null || val === '') continue;
    const raw = String(val);
    const parentMap =
      spec.parent === 'UserAccount'
        ? maps.userAccount
        : spec.parent === 'Role'
          ? maps.role
          : spec.parent === 'Permission'
            ? maps.permission
            : spec.parent === 'SecurityGroup'
              ? maps.securityGroup
              : maps.customer;
    const mapped = parentMap?.get(raw);
    if (mapped) {
      if (mapped !== raw) remapped.push(spec.column);
      next[spec.column] = mapped;
      continue;
    }
    // Already a target id present as a map value
    if (parentMap && [...parentMap.values()].includes(raw)) {
      continue;
    }
    if (spec.required) {
      errors.push(
        `${model}.${spec.column}=[id:${raw.slice(0, 12)}…] has no ${spec.parent} remap (orphan)`
      );
    } else {
      next[spec.column] = null;
      remapped.push(spec.column);
    }
  }

  return { row: next, errors, remapped };
}

/** Strip sensitive fields before any JSON report serialization. */
export function stripSecretsForReport<T extends Record<string, unknown>>(row: T): T {
  return redactSensitiveAuthRecord(row) as T;
}

export function buildRoleMap(
  sourceRows: Array<{ id: string; code: string }>,
  targetRows: Array<{ id: string; code: string }>
): CodeMasterMap {
  return buildCodeMasterMap(sourceRows, targetRows);
}

export function buildSecurityGroupMap(
  sourceRows: Array<{ id: string; code: string }>,
  targetRows: Array<{ id: string; code: string }>
): CodeMasterMap {
  return buildCodeMasterMap(sourceRows, targetRows);
}

export function authOrderDependenciesOk(order: string[]): string[] {
  const problems: string[] = [];
  const idx = (name: string) => order.indexOf(name);
  const before = (parent: string, child: string) => {
    const p = idx(parent);
    const c = idx(child);
    if (p < 0 || c < 0 || p >= c) {
      problems.push(`${parent} must appear before ${child} in migration order`);
    }
  };
  before('Permission', 'RolePermission');
  before('Role', 'RolePermission');
  before('Role', 'UserRole');
  before('Role', 'SecurityGroupRole');
  before('SecurityGroup', 'SecurityGroupRole');
  before('SecurityGroup', 'SecurityGroupMember');
  before('UserAccount', 'UserRole');
  before('UserAccount', 'SecurityGroupMember');
  before('UserAccount', 'CustomerUser');
  before('UserAccount', 'UserSession');
  before('UserAccount', 'PasswordResetTicket');
  before('UserAccount', 'UserNotification');
  before('Customer', 'UserAccount');
  before('Customer', 'CustomerUser');
  return problems;
}

export function collectAuthOrphans(input: {
  model: string;
  preparedRows: Record<string, unknown>[];
  column: string;
  required: boolean;
  effectiveParentIds: Set<string>;
}): FkRemapIssue[] {
  const issues: FkRemapIssue[] = [];
  const counts = new Map<string, number>();
  for (const row of input.preparedRows) {
    const val = row[input.column];
    if (val == null || val === '') continue;
    const raw = String(val);
    if (input.effectiveParentIds.has(raw)) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  for (const [sourceValue, rowCount] of counts) {
    issues.push({
      model: input.model,
      column: input.column,
      sourceValue: `[id:${sourceValue.slice(0, 12)}…]`,
      severity: input.required ? 'blocking' : 'warning',
      reason: input.required
        ? `Prepared ${input.model}.${input.column} does not resolve to a target parent`
        : `Prepared ${input.model}.${input.column} orphan cleared/left unresolved (nullable)`,
      rowCount,
    });
  }
  return issues;
}

export type IdentityTableSummaryRow = {
  model: AuthTable;
  source: number | null;
  target: number | null;
  matched: number | null;
  newOrInserts: number | null;
  skippedOrPreserved: number | null;
  orphaned: number | null;
  notes: string;
};

export type ProductionAdminDetail = {
  policy: string;
  sourceAdmin: {
    exists: boolean;
    id: string | null;
    email: string | null;
    username: string | null;
    customerId: string | null;
    status: string | null;
    roleCodes: string[];
  };
  targetAdmin: {
    exists: boolean;
    id: string | null;
    email: string | null;
    username: string | null;
    status: string | null;
    isLocked: boolean | null;
    roleCodes: string[];
  };
  mapping: {
    action: string;
    sourceId: string | null;
    targetId: string | null;
    preserveTargetPasswordAndStatus: true;
    productionAdminRemainsUsable: true;
  };
};

export type AuthReconciliationSummary = {
  included: true;
  migrationOrder: AuthTable[];
  /** Section 11 IDENTITY SUMMARY — per-table dry-run plan. */
  identitySummary: IdentityTableSummaryRow[];
  tables: Array<{
    model: AuthTable;
    sourceCount: number | null;
    targetCount: number | null;
    estimatedInserts: number | null;
    estimatedSkipped: number | null;
  }>;
  maps: {
    userAccount: {
      matched: number;
      toCreate: number;
      conflicts: number;
      productionAdminsPreserved: number;
      blockingIdCollisions: number;
      matchingEmail: number;
      matchingUsername: number;
      matchingIdSameIdentity: number;
      duplicateSourceEmails: number;
      duplicateSourceUsernames: number;
      idRemapSample: Array<{ sourceId: string; targetId: string; action: string; email: string }>;
    };
    role: {
      matched: number;
      toCreate: number;
      idRemaps: number;
    };
    permission: {
      matched: number;
      toCreate: number;
      idRemaps: number;
    };
    securityGroup: {
      matched: number;
      toCreate: number;
      idRemaps: number;
    };
    customer: {
      note: string;
      remapsViaCustomerCode: true;
      customerUserCustomerRemaps: number | null;
      customerUserUnresolved: number | null;
      userAccountCustomerRemaps: number | null;
      userAccountCustomerClearedOrUnresolved: number | null;
    };
  };
  productionAdminHandling: {
    policy: string;
    preserved: Array<{ sourceId: string; targetId: string; email: string; username: string }>;
    detail: ProductionAdminDetail;
  };
  sessionHandling: {
    policy: string;
    total: number | null;
    historical: number | null;
    activeInvalidated: number | null;
    orphanUserSkipped: number | null;
    mechanism: string;
  };
  passwordResetHandling: {
    policy: string;
    total: number | null;
    historicalUsed: number | null;
    historicalExpired: number | null;
    activeExpiredOnMigrate: number | null;
    orphanUserSkipped: number | null;
    tokenEnvironmentIndependence: string;
  };
  passwordHandling: {
    policy: string;
    algorithm: string;
    sourceTargetCompatible: true;
  };
  conflicts: UserAccountConflict[];
  orphanFkIssues: FkRemapIssue[];
  dependencyProblems: string[];
  redaction: {
    policy: string;
    sensitiveFieldsNeverLogged: string[];
  };
};

/** Build the section-11 identity summary rows from inventory + maps + orphan counts. */
export function buildIdentitySummaryRows(input: {
  tables: Array<{
    model: AuthTable;
    sourceCount: number | null;
    targetCount: number | null;
    estimatedInserts: number | null;
    estimatedSkipped: number | null;
  }>;
  userAccount: {
    matched: number;
    toCreate: number;
  };
  role: { matched: number; toCreate: number };
  permission: { matched: number; toCreate: number };
  securityGroup: { matched: number; toCreate: number };
  session: {
    historical: number | null;
    activeInvalidated: number | null;
  };
  reset: {
    historicalUsed: number | null;
    historicalExpired: number | null;
    activeExpiredOnMigrate: number | null;
  };
  orphanCounts: Partial<Record<AuthTable, number>>;
}): IdentityTableSummaryRow[] {
  return input.tables.map((t) => {
    const orphaned = input.orphanCounts[t.model] ?? 0;
    let matched: number | null = null;
    let notes = '';
    switch (t.model) {
      case 'UserAccount':
        matched = input.userAccount.matched;
        notes = 'Match by email/username; matched preserve target (incl. production admin)';
        break;
      case 'Role':
        matched = input.role.matched;
        notes = 'Match by Role.code';
        break;
      case 'Permission':
        matched = input.permission.matched;
        notes = 'Match by module::resource::action';
        break;
      case 'SecurityGroup':
        matched = input.securityGroup.matched;
        notes = 'Match by SecurityGroup.code';
        break;
      case 'UserSession':
        matched = null;
        notes = `historical=${input.session.historical ?? 'n/a'}; activeInvalidated=${input.session.activeInvalidated ?? 'n/a'}`;
        break;
      case 'PasswordResetTicket':
        matched = null;
        notes = `used=${input.reset.historicalUsed ?? 'n/a'}; expired=${input.reset.historicalExpired ?? 'n/a'}; activeForceExpire=${input.reset.activeExpiredOnMigrate ?? 'n/a'}`;
        break;
      case 'RolePermission':
      case 'UserRole':
      case 'SecurityGroupMember':
      case 'SecurityGroupRole':
      case 'CustomerUser':
      case 'UserNotification':
        notes = 'Additive insert with FK remap; skipDuplicates on apply';
        break;
      default:
        notes = '';
    }
    return {
      model: t.model,
      source: t.sourceCount,
      target: t.targetCount,
      matched,
      newOrInserts: t.estimatedInserts,
      skippedOrPreserved: t.estimatedSkipped,
      orphaned,
      notes,
    };
  });
}
