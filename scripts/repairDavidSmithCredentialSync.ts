/**
 * One-off production repair: sync david.smith@elandcables.com passwordHash
 * from local (DATABASE_URL) → Supabase (TARGET_DATABASE_URL).
 *
 * Copies ONLY local passwordHash to production; clears lock counters;
 * revokes active UserSessions; writes AuditEvent. Does not touch
 * email/username/userType/customerId/roles/CustomerUser (except status→ACTIVE).
 *
 * Default is dry-run (read-only). Writes require explicit --apply.
 *
 * Usage:
 *   npx tsx scripts/repairDavidSmithCredentialSync.ts
 *   npx tsx scripts/repairDavidSmithCredentialSync.ts --apply
 *
 * Security: never prints DATABASE_URL, TARGET_DATABASE_URL, passwords,
 * password hashes, tokens, or secrets. Hash reports = prefix + length only.
 */
import dotenv from 'dotenv';
import { PrismaClient, IdentityStatus } from '@prisma/client';

dotenv.config();

const EXPECTED_EMAIL = 'david.smith@elandcables.com';
const ACTOR_NAME = 'repair:david-smith-credential-sync';
const AUDIT_ACTION = 'SYNC_CREDENTIAL';
const AUDIT_MESSAGE =
  'Admin-authorized credential sync: local passwordHash copied to production; lock cleared; sessions revoked.';

type HashMeta = {
  prefix: string;
  length: number;
  bcryptCompatible: boolean;
};

function requireEnv(name: 'DATABASE_URL' | 'TARGET_DATABASE_URL'): string {
  const url = process.env[name];
  if (!url) {
    throw new Error(`${name} is not set.`);
  }
  return url;
}

function createClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
  });
}

/** Report-safe bcrypt metadata — never returns the full hash. */
function hashMeta(passwordHash: string | null | undefined): HashMeta {
  if (!passwordHash) {
    return { prefix: '(missing)', length: 0, bcryptCompatible: false };
  }
  const match = passwordHash.match(/^(\$2[aby]\$\d{2}\$)/);
  const bcryptCompatible =
    passwordHash.startsWith('$2a$') ||
    passwordHash.startsWith('$2b$') ||
    passwordHash.startsWith('$2y$');
  return {
    prefix: match?.[1] ?? '(non-bcrypt)',
    length: passwordHash.length,
    bcryptCompatible,
  };
}

function emailsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const userSelect = {
  id: true,
  email: true,
  username: true,
  userType: true,
  customerId: true,
  status: true,
  isActive: true,
  isLocked: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  passwordHash: true,
  roles: { select: { roleId: true, role: { select: { code: true } } } },
  customerUsers: {
    select: {
      id: true,
      customerId: true,
      status: true,
    },
  },
} as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY' : 'DRY-RUN';

  const sourceUrl = requireEnv('DATABASE_URL');
  const targetUrl = requireEnv('TARGET_DATABASE_URL');
  const source = createClient(sourceUrl);
  const target = createClient(targetUrl);

  try {
    console.log(`[${mode}] Credential sync for ${EXPECTED_EMAIL}`);
    console.log('Sources: DATABASE_URL (local) → TARGET_DATABASE_URL (production)');
    console.log('Env URLs loaded (values redacted).');

    const [localUser, prodUser] = await Promise.all([
      source.userAccount.findUnique({
        where: { email: EXPECTED_EMAIL },
        select: userSelect,
      }),
      target.userAccount.findUnique({
        where: { email: EXPECTED_EMAIL },
        select: userSelect,
      }),
    ]);

    if (!localUser) {
      throw new Error(`Local UserAccount not found for ${EXPECTED_EMAIL}`);
    }
    if (!prodUser) {
      throw new Error(`Production UserAccount not found for ${EXPECTED_EMAIL}`);
    }
    if (!emailsEqual(localUser.email, EXPECTED_EMAIL) || !emailsEqual(prodUser.email, EXPECTED_EMAIL)) {
      throw new Error('Email mismatch against expected address.');
    }
    if (!emailsEqual(localUser.email, prodUser.email)) {
      throw new Error(
        `Source/target email mismatch: local=${localUser.email} target=${prodUser.email}`
      );
    }
    if (!localUser.passwordHash || !prodUser.passwordHash) {
      throw new Error('Both source and target passwordHash must be present.');
    }

    const sourceHash = hashMeta(localUser.passwordHash);
    const targetHash = hashMeta(prodUser.passwordHash);
    if (!sourceHash.bcryptCompatible || !targetHash.bcryptCompatible) {
      throw new Error(
        `passwordHash must be bcrypt-compatible ($2a/$2b/$2y). source=${sourceHash.prefix} target=${targetHash.prefix}`
      );
    }

    const activeSessions = await target.userSession.findMany({
      where: { userId: prodUser.id, revokedAt: null },
      select: { id: true, expiresAt: true, createdAt: true },
    });

    const hashesEqual = localUser.passwordHash === prodUser.passwordHash;
    const plannedUserChanges: Record<string, { from: unknown; to: unknown }> = {};

    if (!hashesEqual) {
      plannedUserChanges.passwordHash = {
        from: { prefix: targetHash.prefix, length: targetHash.length },
        to: { prefix: sourceHash.prefix, length: sourceHash.length, note: 'copy from local' },
      };
    }
    if (prodUser.failedLoginAttempts !== 0) {
      plannedUserChanges.failedLoginAttempts = { from: prodUser.failedLoginAttempts, to: 0 };
    }
    if (prodUser.isLocked !== false) {
      plannedUserChanges.isLocked = { from: prodUser.isLocked, to: false };
    }
    if (prodUser.lockedUntil !== null) {
      plannedUserChanges.lockedUntil = { from: prodUser.lockedUntil, to: null };
    }
    if (prodUser.status !== IdentityStatus.ACTIVE) {
      plannedUserChanges.status = { from: prodUser.status, to: IdentityStatus.ACTIVE };
    }

    const preserved = {
      email: prodUser.email,
      username: prodUser.username,
      userType: prodUser.userType,
      customerId: prodUser.customerId,
      roles: prodUser.roles.map((r) => r.role.code),
      customerUsers: prodUser.customerUsers,
      statusIfAlreadyActive: prodUser.status === IdentityStatus.ACTIVE ? IdentityStatus.ACTIVE : undefined,
    };

    const needsUserUpdate = Object.keys(plannedUserChanges).length > 0;
    const sessionsToRevoke = activeSessions.length;
    const alreadySynced = hashesEqual && !needsUserUpdate && sessionsToRevoke === 0;

    console.log(
      JSON.stringify(
        {
          mode,
          targetUserAccountId: prodUser.id,
          sourceUserAccountId: localUser.id,
          email: EXPECTED_EMAIL,
          sourceHash: sourceHash,
          targetHash: targetHash,
          hashesEqual,
          alreadySynced,
          sessionsThatWouldBeRevoked: sessionsToRevoke,
          plannedUserAccountFieldChanges: plannedUserChanges,
          preservedFields: preserved,
          auditEvent: {
            entity: 'UserAccount',
            entityId: prodUser.id,
            action: AUDIT_ACTION,
            actorName: ACTOR_NAME,
            message: AUDIT_MESSAGE,
            oldValue: {
              failedLoginAttempts: prodUser.failedLoginAttempts,
              isLocked: prodUser.isLocked,
              lockedUntil: prodUser.lockedUntil,
              status: prodUser.status,
              passwordHashMeta: { prefix: targetHash.prefix, length: targetHash.length },
            },
            newValue: {
              failedLoginAttempts: 0,
              isLocked: false,
              lockedUntil: null,
              status: IdentityStatus.ACTIVE,
              passwordHashMeta: {
                prefix: sourceHash.prefix,
                length: sourceHash.length,
                syncedFrom: 'local',
              },
              revokedSessionCount: sessionsToRevoke,
            },
          },
          note: 'CustomerUser, roles, email, username, userType, customerId are not modified.',
        },
        null,
        2
      )
    );

    if (!apply) {
      console.log(
        `\nDRY-RUN complete. No writes performed. To apply:\n  npx tsx scripts/repairDavidSmithCredentialSync.ts --apply`
      );
      return;
    }

    if (alreadySynced) {
      console.log('Already synced — no UserAccount fields to change and no active sessions. Skipping writes.');
      return;
    }

    const now = new Date();
    await target.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: prodUser.id },
        data: {
          passwordHash: localUser.passwordHash,
          failedLoginAttempts: 0,
          isLocked: false,
          lockedUntil: null,
          status: IdentityStatus.ACTIVE,
          // email, username, userType, customerId intentionally omitted
        },
      });

      const revokeResult = await tx.userSession.updateMany({
        where: { userId: prodUser.id, revokedAt: null },
        data: { revokedAt: now },
      });

      // Mirrors identityService.writeAudit shape (target DB only; no password/hash in payload).
      await tx.auditEvent.create({
        data: {
          actorId: null,
          actorName: ACTOR_NAME,
          entity: 'UserAccount',
          entityId: prodUser.id,
          action: AUDIT_ACTION,
          oldValue: {
            failedLoginAttempts: prodUser.failedLoginAttempts,
            isLocked: prodUser.isLocked,
            lockedUntil: prodUser.lockedUntil,
            status: prodUser.status,
            passwordHashMeta: { prefix: targetHash.prefix, length: targetHash.length },
          },
          newValue: {
            failedLoginAttempts: 0,
            isLocked: false,
            lockedUntil: null,
            status: IdentityStatus.ACTIVE,
            passwordHashMeta: {
              prefix: sourceHash.prefix,
              length: sourceHash.length,
              syncedFrom: 'local',
            },
            revokedSessionCount: revokeResult.count,
          },
          message: AUDIT_MESSAGE,
        },
      });
    });

    console.log(
      JSON.stringify(
        {
          mode: 'APPLY',
          status: 'ok',
          targetUserAccountId: prodUser.id,
          sessionsRevoked: sessionsToRevoke,
          userFieldsUpdated: needsUserUpdate || !hashesEqual,
        },
        null,
        2
      )
    );
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  // Avoid dumping connection strings if Prisma embeds them in errors.
  const redacted = msg
    .replace(/postgresql:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/postgres:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]');
  console.error(redacted);
  process.exitCode = 1;
});
