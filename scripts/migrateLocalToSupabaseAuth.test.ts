import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTH_MIGRATION_ORDER,
  authOrderDependenciesOk,
  buildIdentitySummaryRows,
  buildPermissionMap,
  buildRoleMap,
  buildSecurityGroupMap,
  buildUserAccountMap,
  classifyAndPrepareResetTicket,
  classifyAndPrepareSession,
  collectAuthOrphans,
  DEFAULT_PRODUCTION_ADMIN_EMAIL,
  permissionNaturalKey,
  redactSensitiveAuthRecord,
  redactSensitiveAuthText,
  redactSensitiveAuthValue,
  remapAuthIdFields,
  summarizeResetTicketPlan,
  summarizeSessionPlan,
  SYSTEM_ADMIN_ROLE_CODE,
} from './migrateLocalToSupabaseAuth';
import { CUSTOMER_ID_COLUMNS, REQUIRED_CUSTOMER_COLUMNS } from './migrateLocalToSupabaseLib';

const ORDER_WITH_CUSTOMER = ['Customer', ...AUTH_MIGRATION_ORDER];

describe('migrateLocalToSupabase auth / security mapping', () => {
  it('1. UserAccount mapping by email/username with deterministic target preserve', () => {
    const map = buildUserAccountMap(
      [
        { id: 'src-1', email: 'a@ex.com', username: 'alice' },
        { id: 'src-2', email: 'b@ex.com', username: 'bob' },
        { id: 'src-new', email: 'new@ex.com', username: 'newbie' },
      ],
      [
        { id: 'tgt-1', email: 'a@ex.com', username: 'alice' },
        { id: 'tgt-2', email: 'other@ex.com', username: 'bob' },
      ]
    );

    assert.equal(map.sourceIdToTargetId.get('src-1'), 'tgt-1');
    assert.equal(map.sourceIdToTargetId.get('src-2'), 'tgt-2'); // username match
    assert.equal(map.sourceIdToTargetId.get('src-new'), 'src-new');
    assert.equal(map.toCreate.length, 1);
    assert.equal(map.matched.length, 2);
    assert.ok(map.conflicts.some((c) => c.kind === 'email_match'));
    assert.ok(map.conflicts.some((c) => c.kind === 'username_match'));
  });

  it('2. Customer ID remapping for UserAccount / CustomerUser via customer map', () => {
    const customerMap = new Map([
      ['c-src', 'c-tgt'],
      ['c-same', 'c-same'],
    ]);
    const ua = remapAuthIdFields(
      'UserAccount',
      { id: 'u1', customerId: 'c-src', email: 'x@ex.com' },
      { customer: customerMap }
    );
    assert.equal(ua.errors.length, 0);
    assert.equal(ua.row.customerId, 'c-tgt');
    assert.ok(ua.remapped.includes('customerId'));

    const missingNullable = remapAuthIdFields(
      'UserAccount',
      { id: 'u2', customerId: 'missing-cust' },
      { customer: customerMap }
    );
    assert.equal(missingNullable.errors.length, 0);
    assert.equal(missingNullable.row.customerId, null);

    assert.ok(CUSTOMER_ID_COLUMNS.UserAccount.includes('customerId'));
    assert.ok(CUSTOMER_ID_COLUMNS.CustomerUser.includes('customerId'));
    assert.ok(REQUIRED_CUSTOMER_COLUMNS.CustomerUser.includes('customerId'));
  });

  it('3. CustomerUser mapping remaps customerId + userAccountId without inventing ids', () => {
    const userMap = new Map([['u-src', 'u-tgt']]);
    const customerMap = new Map([['c-src', 'c-tgt']]);
    const cu = remapAuthIdFields(
      'CustomerUser',
      { id: 'cu1', customerId: 'c-src', userAccountId: 'u-src' },
      { userAccount: userMap, customer: customerMap }
    );
    assert.equal(cu.errors.length, 0);
    assert.equal(cu.row.customerId, 'c-tgt');
    assert.equal(cu.row.userAccountId, 'u-tgt');
    assert.equal(cu.row.id, 'cu1');
  });

  it('4. UserRole mapping remaps userId + roleId', () => {
    const userMap = new Map([['u-src', 'u-tgt']]);
    const roleMap = buildRoleMap(
      [{ id: 'r-src', code: 'SALES' }],
      [{ id: 'r-tgt', code: 'SALES' }]
    );
    const ur = remapAuthIdFields(
      'UserRole',
      { userId: 'u-src', roleId: 'r-src' },
      { userAccount: userMap, role: roleMap.sourceIdToTargetId }
    );
    assert.equal(ur.errors.length, 0);
    assert.equal(ur.row.userId, 'u-tgt');
    assert.equal(ur.row.roleId, 'r-tgt');
  });

  it('5. RolePermission mapping remaps roleId + permissionId', () => {
    const roleMap = buildRoleMap(
      [{ id: 'r-src', code: 'SALES' }],
      [{ id: 'r-tgt', code: 'SALES' }]
    );
    const permMap = buildPermissionMap(
      [{ id: 'p-src', module: 'ADMIN', resource: 'USER', action: 'READ' }],
      [{ id: 'p-tgt', module: 'ADMIN', resource: 'USER', action: 'READ' }]
    );
    assert.equal(
      permissionNaturalKey({ module: 'ADMIN', resource: 'USER', action: 'READ' }),
      'ADMIN::USER::READ'
    );
    const rp = remapAuthIdFields(
      'RolePermission',
      { roleId: 'r-src', permissionId: 'p-src' },
      { role: roleMap.sourceIdToTargetId, permission: permMap.sourceIdToTargetId }
    );
    assert.equal(rp.errors.length, 0);
    assert.equal(rp.row.roleId, 'r-tgt');
    assert.equal(rp.row.permissionId, 'p-tgt');
  });

  it('6. UserNotification mapping remaps userAccountId; nulls orphan when nullable', () => {
    const userMap = new Map([['u-src', 'u-tgt']]);
    const ok = remapAuthIdFields(
      'UserNotification',
      { id: 'n1', userAccountId: 'u-src', title: 'hi' },
      { userAccount: userMap }
    );
    assert.equal(ok.errors.length, 0);
    assert.equal(ok.row.userAccountId, 'u-tgt');

    const orphan = remapAuthIdFields(
      'UserNotification',
      { id: 'n2', userAccountId: 'missing' },
      { userAccount: userMap }
    );
    assert.equal(orphan.errors.length, 0);
    assert.equal(orphan.row.userAccountId, null);
  });

  it('7. SecurityGroup mapping + member/role junctions', () => {
    const groupMap = buildSecurityGroupMap(
      [{ id: 'g-src', code: 'OPS' }],
      [{ id: 'g-tgt', code: 'OPS' }]
    );
    assert.equal(groupMap.sourceIdToTargetId.get('g-src'), 'g-tgt');
    const userMap = new Map([['u-src', 'u-tgt']]);
    const roleMap = buildRoleMap(
      [{ id: 'r-src', code: 'SALES' }],
      [{ id: 'r-tgt', code: 'SALES' }]
    );

    const member = remapAuthIdFields(
      'SecurityGroupMember',
      { groupId: 'g-src', userId: 'u-src' },
      {
        securityGroup: groupMap.sourceIdToTargetId,
        userAccount: userMap,
      }
    );
    assert.equal(member.errors.length, 0);
    assert.equal(member.row.groupId, 'g-tgt');
    assert.equal(member.row.userId, 'u-tgt');

    const gRole = remapAuthIdFields(
      'SecurityGroupRole',
      { groupId: 'g-src', roleId: 'r-src' },
      {
        securityGroup: groupMap.sourceIdToTargetId,
        role: roleMap.sourceIdToTargetId,
      }
    );
    assert.equal(gRole.errors.length, 0);
    assert.equal(gRole.row.groupId, 'g-tgt');
    assert.equal(gRole.row.roleId, 'r-tgt');
  });

  it('8. PasswordResetTicket: keep historical; force-expire active; never invent tokens', () => {
    const now = new Date('2026-09-29T00:00:00.000Z');
    const used = classifyAndPrepareResetTicket(
      {
        id: 't1',
        userId: 'u',
        expiresAt: '2026-10-01T00:00:00.000Z',
        usedAt: '2026-09-01T00:00:00.000Z',
      },
      'u-tgt',
      now
    );
    assert.equal(used.action, 'historical_used');

    const expired = classifyAndPrepareResetTicket(
      {
        id: 't2',
        userId: 'u',
        expiresAt: '2026-01-01T00:00:00.000Z',
        usedAt: null,
      },
      'u-tgt',
      now
    );
    assert.equal(expired.action, 'historical_expired');

    const active = classifyAndPrepareResetTicket(
      {
        id: 't3',
        userId: 'u',
        expiresAt: '2026-10-01T00:00:00.000Z',
        usedAt: null,
      },
      'u-tgt',
      now
    );
    assert.equal(active.action, 'expire_active');
    assert.equal(active.safeFields.expiresAt.toISOString(), now.toISOString());
    assert.equal('tokenHash' in active.safeFields, false);

    const plan = summarizeResetTicketPlan(
      [
        { id: 't1', userId: 'u', expiresAt: '2026-10-01', usedAt: '2026-09-01' },
        { id: 't2', userId: 'u', expiresAt: '2026-01-01', usedAt: null },
        { id: 't3', userId: 'u', expiresAt: '2026-10-01', usedAt: null },
        { id: 't4', userId: 'missing', expiresAt: '2026-10-01', usedAt: null },
      ],
      new Map([['u', 'u-tgt']]),
      now
    );
    assert.equal(plan.historicalUsed, 1);
    assert.equal(plan.historicalExpired, 1);
    assert.equal(plan.activeExpiredOnMigrate, 1);
    assert.equal(plan.orphanUserSkipped, 1);
  });

  it('9. UserSession: invalidate active; preserve historical', () => {
    const now = new Date('2026-09-29T00:00:00.000Z');
    const userMap = new Map([['u-src', 'u-tgt']]);

    const active = classifyAndPrepareSession(
      {
        id: 's-active',
        userId: 'u-src',
        expiresAt: '2026-10-01T00:00:00.000Z',
        revokedAt: null,
      },
      'u-tgt',
      now
    );
    assert.equal(active.action, 'invalidate_active');
    assert.equal(active.safeFields.revokedAt?.toISOString(), now.toISOString());
    assert.equal(active.safeFields.userId, 'u-tgt');

    const historical = classifyAndPrepareSession(
      {
        id: 's-old',
        userId: 'u-src',
        expiresAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
      },
      'u-tgt',
      now
    );
    assert.equal(historical.action, 'historical');
    assert.equal(historical.safeFields.revokedAt, null);

    const plan = summarizeSessionPlan(
      [
        {
          id: 's-active',
          userId: 'u-src',
          expiresAt: '2026-10-01T00:00:00.000Z',
          revokedAt: null,
        },
        {
          id: 's-old',
          userId: 'u-src',
          expiresAt: '2026-01-01T00:00:00.000Z',
          revokedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 's-orphan',
          userId: 'missing',
          expiresAt: '2026-10-01T00:00:00.000Z',
          revokedAt: null,
        },
      ],
      userMap,
      now
    );
    assert.equal(plan.activeInvalidated, 1);
    assert.equal(plan.historical, 1);
    assert.equal(plan.orphanUserSkipped, 1);
    assert.match(plan.policy, /revokedAt/);
  });

  it('10. duplicate email conflict reported without inventing ids', () => {
    const map = buildUserAccountMap(
      [
        { id: 'a1', email: 'dup@ex.com', username: 'u1' },
        { id: 'a2', email: 'dup@ex.com', username: 'u2' },
      ],
      []
    );
    assert.ok(map.conflicts.some((c) => c.kind === 'duplicate_source_email'));
    assert.equal(map.toCreate.length, 2);
    assert.equal(map.sourceIdToTargetId.get('a1'), 'a1');
  });

  it('11. duplicate username conflict reported without inventing ids', () => {
    const map = buildUserAccountMap(
      [
        { id: 'a1', email: 'a@ex.com', username: 'same' },
        { id: 'a2', email: 'b@ex.com', username: 'same' },
      ],
      []
    );
    assert.ok(map.conflicts.some((c) => c.kind === 'duplicate_source_username'));
  });

  it('12. production admin protection — never overwrite target', () => {
    const map = buildUserAccountMap(
      [
        {
          id: 'local-admin',
          email: DEFAULT_PRODUCTION_ADMIN_EMAIL,
          username: 'admin',
          status: 'ACTIVE',
        },
        {
          id: 'local-other-admin',
          email: 'ops@energya.com',
          username: 'ops',
        },
      ],
      [
        {
          id: 'prod-admin',
          email: DEFAULT_PRODUCTION_ADMIN_EMAIL,
          username: 'admin',
          isProductionAdmin: true,
        },
        {
          id: 'prod-ops',
          email: 'ops@energya.com',
          username: 'ops',
          isProductionAdmin: true,
        },
      ],
      {
        productionAdminEmails: [DEFAULT_PRODUCTION_ADMIN_EMAIL, 'ops@energya.com'],
      }
    );

    assert.equal(map.productionAdminsPreserved.length, 2);
    assert.equal(map.toCreate.length, 0);
    for (const p of map.productionAdminsPreserved) {
      assert.notEqual(p.sourceId, p.targetId);
      assert.equal(map.sourceIdToTargetId.get(p.sourceId), p.targetId);
    }
    assert.ok(map.matched.every((e) => e.action === 'match_preserve_production_admin'));
    assert.equal(SYSTEM_ADMIN_ROLE_CODE, 'SYSTEM_ADMINISTRATOR');
  });

  it('13. orphan identity FK detection for required junctions', () => {
    const userMap = new Map([['u-src', 'u-tgt']]);
    const customerMap = new Map([['c-src', 'c-tgt']]);
    const orphanUser = remapAuthIdFields(
      'CustomerUser',
      { id: 'cu2', customerId: 'c-src', userAccountId: 'missing-user' },
      { userAccount: userMap, customer: customerMap }
    );
    assert.ok(orphanUser.errors.length > 0);
    assert.ok(!orphanUser.errors[0].includes('password'));

    const orphans = collectAuthOrphans({
      model: 'CustomerUser',
      preparedRows: [{ customerId: 'ghost', userAccountId: 'u-tgt' }],
      column: 'customerId',
      required: true,
      effectiveParentIds: new Set(['c-tgt']),
    });
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].severity, 'blocking');

    // id collision different identity — blocking, no invented id
    const map = buildUserAccountMap(
      [{ id: 'same-id', email: 'fresh@ex.com', username: 'fresh' }],
      [{ id: 'same-id', email: 'existing@ex.com', username: 'existing' }]
    );
    assert.ok(map.blockingIdCollisions.some((c) => c.kind === 'id_collision_different_identity'));
    assert.equal(map.sourceIdToTargetId.has('same-id'), false);
  });

  it('14. secret redaction of passwordHash / tokens from records and free text', () => {
    const row = redactSensitiveAuthRecord({
      id: 'u1',
      email: 'a@ex.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      refreshTokenHash: 'abcdef0123456789abcdef0123456789abcdef01',
      tokenHash: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      nested: { apiKey: 'sk-secret-key-value-with-enough-length-here' },
    });
    assert.equal(row.passwordHash, '[REDACTED]');
    assert.equal(row.refreshTokenHash, '[REDACTED]');
    assert.equal(row.tokenHash, '[REDACTED]');
    assert.equal((row.nested as Record<string, unknown>).apiKey, '[REDACTED]');
    assert.equal(row.email, 'a@ex.com');

    assert.equal(redactSensitiveAuthValue('passwordHash', 'x'), '[REDACTED]');
    const text = redactSensitiveAuthText(
      'user passwordHash=$2b$10$abcdefghijklmnopqrstuv tokenHash=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    );
    assert.ok(!text.includes('$2b$10$'));
    assert.ok(!text.includes('deadbeef'));
    assert.match(text, /\[REDACTED\]/);
  });

  it('auth FK dependency order places Customer and Permission before dependents', () => {
    const problems = authOrderDependenciesOk(ORDER_WITH_CUSTOMER);
    assert.deepEqual(problems, []);
  });

  it('identity summary rows cover all AUTH_MIGRATION_ORDER tables', () => {
    const tables = AUTH_MIGRATION_ORDER.map((model) => ({
      model,
      sourceCount: 1,
      targetCount: 0,
      estimatedInserts: 1,
      estimatedSkipped: 0,
    }));
    const rows = buildIdentitySummaryRows({
      tables,
      userAccount: { matched: 0, toCreate: 1 },
      role: { matched: 0, toCreate: 1 },
      permission: { matched: 0, toCreate: 1 },
      securityGroup: { matched: 0, toCreate: 0 },
      session: { historical: 0, activeInvalidated: 1 },
      reset: { historicalUsed: 0, historicalExpired: 0, activeExpiredOnMigrate: 1 },
      orphanCounts: { CustomerUser: 2 },
    });
    assert.equal(rows.length, AUTH_MIGRATION_ORDER.length);
    assert.equal(rows.find((r) => r.model === 'CustomerUser')?.orphaned, 2);
    assert.match(rows.find((r) => r.model === 'UserSession')?.notes || '', /activeInvalidated/);
  });
});
