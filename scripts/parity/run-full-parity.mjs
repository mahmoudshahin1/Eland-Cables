import { seedAuthDatabases } from './seed-auth.mjs';
import { normalizePayload, deepEqual } from './parityHarness.mjs';
import { PrismaClient as LegacyPrisma } from '../../node_modules/@prisma/client/index.js';
import { PrismaClient as TargetPrisma } from '../../energya-backend/node_modules/@prisma/client/index.js';

const legacyBase = process.env.LEGACY_URL || 'http://127.0.0.1:3847';
const targetBase = process.env.TARGET_URL || 'http://127.0.0.1:3000';

async function fetchBoth(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const body = options.body ? JSON.stringify(options.body) : undefined;

  const legHeaders = { ...headers };
  const tgtHeaders = { ...headers };
  if (options.legacyToken) legHeaders.Authorization = `Bearer ${options.legacyToken}`;
  if (options.targetToken) tgtHeaders.Authorization = `Bearer ${options.targetToken}`;

  const legUrl = `${legacyBase}${options.legacyPath || path}`;
  const tgtUrl = `${targetBase}${options.targetPath || path}`;

  const [res1, res2] = await Promise.all([
    fetch(legUrl, { method, headers: legHeaders, body }).catch(e => ({ status: 500, json: async () => ({ error: e.message }) })),
    fetch(tgtUrl, { method, headers: tgtHeaders, body }).catch(e => ({ status: 500, json: async () => ({ error: e.message }) }))
  ]);

  const [data1, data2] = await Promise.all([res1.json().catch(() => ({})), res2.json().catch(() => ({}))]);
  return {
    path,
    method,
    status1: res1.status,
    status2: res2.status,
    data1,
    data2,
    statusMatch: res1.status === res2.status,
    bodyMatch: deepEqual(normalizePayload(data1), normalizePayload(data2))
  };
}

export async function runFullSequentialParity() {
  console.log('\n======================================================');
  console.log(' 🚀 Starting Comprehensive Phase 1 Parity Verification');
  console.log('======================================================\n');

  // Step 1: Automated DB Seed Reset
  console.log('1️⃣ Automated Database Seed Reset...');
  await seedAuthDatabases();

  const legacyPrisma = new LegacyPrisma({ datasources: { db: { url: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_legacy?schema=public' } } });
  const targetPrisma = new TargetPrisma({ datasources: { db: { url: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public' } } });

  // Obtain admin tokens
  const adminLogin = { email: 'admin@energya.com', password: 'Password123!' };
  const l1 = await fetch(`${legacyBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adminLogin) });
  const l2 = await fetch(`${targetBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adminLogin) });
  const adminLegToken = (await l1.json()).accessToken;
  const adminTgtToken = (await l2.json()).accessToken;

  // Obtain user tokens
  const uLogin = { email: 'admin@parity.test', password: 'Password123!' };
  const ul1 = await fetch(`${legacyBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uLogin) });
  const ul2 = await fetch(`${targetBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uLogin) });
  const parityLegData = await ul1.json();
  const parityTgtData = await ul2.json();

  const results = [];
  function assertParity(testName, result) {
    const ok = result.statusMatch && result.bodyMatch;
    console.log(`  ${ok ? '✅' : '❌'} [${result.method}] ${testName} (Status: ${result.status1} vs ${result.status2}, Body: ${result.bodyMatch ? 'MATCH' : 'DIFF'})`);
    if (!ok) {
      console.log('     Legacy:', JSON.stringify(normalizePayload(result.data1)));
      console.log('     Target:', JSON.stringify(normalizePayload(result.data2)));
    }
    results.push({ name: testName, ok, ...result });
    return ok;
  }

  // -------------------------------------------------------------
  // Special Scenarios
  // -------------------------------------------------------------
  console.log('\n2️⃣ Special Scenarios: Login, Refresh, Reset, Change Password & Tenant Isolation');

  // Happy Path Login Shape
  const loginNorm1 = normalizePayload(parityLegData);
  const loginNorm2 = normalizePayload(parityTgtData);
  const loginMatch = deepEqual(loginNorm1, loginNorm2);
  assertParity('Happy Path Login Payload Shape', {
    method: 'POST',
    status1: ul1.status,
    status2: ul2.status,
    data1: loginNorm1,
    data2: loginNorm2,
    statusMatch: ul1.status === ul2.status,
    bodyMatch: loginMatch
  });

  // Valid Refresh Token
  const refRes = await fetchBoth('/api/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken: parityLegData.refreshToken }
  });
  // Execute target with target's token
  const tgtRef = await fetch(`${targetBase}/api/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: parityTgtData.refreshToken })
  });
  refRes.status2 = tgtRef.status;
  refRes.data2 = await tgtRef.json();
  refRes.statusMatch = refRes.status1 === refRes.status2;
  refRes.bodyMatch = deepEqual(normalizePayload(refRes.data1), normalizePayload(refRes.data2));
  assertParity('Refresh Token with Valid Token (Rotation)', refRes);

  // Expired / Invalid Refresh Token
  const expRef = await fetchBoth('/api/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken: 'invalid_expired_hex_opaque_99999' }
  });
  assertParity('Refresh Token with Invalid/Expired Token (401)', expRef);

  // Change Password
  const cpRes = await fetchBoth('/api/auth/change-password', {
    method: 'POST',
    legacyToken: adminLegToken,
    targetToken: adminTgtToken,
    body: { currentPassword: 'Password123!', newPassword: 'Password123!' }
  });
  assertParity('Change Password with Valid Credentials (200)', cpRes);

  // Reset Password with Invalid/Expired Token
  const rpRes = await fetchBoth('/api/auth/reset-password', {
    method: 'POST',
    body: { token: 'rst_nonexistent_token_123', newPassword: 'NewPassword123!' }
  });
  assertParity('Reset Password with Invalid Token (400)', rpRes);

  // Customer A attempting to access Customer B / Admin data (Tenant Isolation)
  const caLogin = { email: 'custA@parity.test', password: 'Password123!' };
  const ca1 = await fetch(`${legacyBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caLogin) });
  const ca2 = await fetch(`${targetBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caLogin) });
  const caToken1 = (await ca1.json()).accessToken;
  const caToken2 = (await ca2.json()).accessToken;

  const isoRes1 = await fetchBoth('/api/admin/customers', {
    method: 'GET',
    legacyToken: caToken1,
    targetToken: caToken2
  });
  assertParity('Customer A accessing Admin Customers (403 Isolation)', isoRes1);

  const isoRes2 = await fetchBoth('/api/admin/customer-users', {
    method: 'GET',
    legacyToken: caToken1,
    targetToken: caToken2
  });
  assertParity('Customer A accessing Admin Customer Users (403 Isolation)', isoRes2);

  // Account Lockout after LOGIN_LOCK_THRESHOLD (5 attempts)
  console.log('\n3️⃣ Account Lockout Lifecycle Verification...');
  const lockEmail = 'lockout_seq@parity.test';
  await legacyPrisma.userAccount.deleteMany({ where: { email: lockEmail } });
  await targetPrisma.userAccount.deleteMany({ where: { email: lockEmail } });

  const hash = '$2a$10$wB5E8U2L9w1iKxO1j7yK7u6ZqZpYx8s4tXh5qV0Y5nU6XkZ5tL1uG'; // Password123!
  await legacyPrisma.userAccount.create({ data: { email: lockEmail, username: lockEmail, fullName: 'Lock User', passwordHash: hash, userType: 'internal', isActive: true, isLocked: false, failedLoginAttempts: 0 } });
  await targetPrisma.userAccount.create({ data: { email: lockEmail, username: lockEmail, fullName: 'Lock User', passwordHash: hash, userType: 'internal', isActive: true, isLocked: false, failedLoginAttempts: 0 } });

  // 5 failed attempts
  for (let i = 0; i < 5; i++) {
    await fetch(`${legacyBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: lockEmail, password: 'wrong' }) });
    await fetch(`${targetBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: lockEmail, password: 'wrong' }) });
  }

  // 6th attempt: should return 401 "Account is locked."
  const lockedRes = await fetchBoth('/api/auth/login', {
    method: 'POST',
    body: { email: lockEmail, password: 'Password123!' }
  });
  assertParity('Login after 5 failed attempts returns Account is locked (401)', lockedRes);

  const dbUser1 = await legacyPrisma.userAccount.findUnique({ where: { email: lockEmail } });
  const dbUser2 = await targetPrisma.userAccount.findUnique({ where: { email: lockEmail } });
  console.log(`  📊 Database Lock State: Legacy(isLocked=${dbUser1.isLocked}, attempts=${dbUser1.failedLoginAttempts}), Target(isLocked=${dbUser2.isLocked}, attempts=${dbUser2.failedLoginAttempts})`);
  assertParity('Database Lock Flag Synchronized', {
    method: 'DB',
    status1: dbUser1.isLocked ? 1 : 0,
    status2: dbUser2.isLocked ? 1 : 0,
    data1: { isLocked: dbUser1.isLocked, attempts: dbUser1.failedLoginAttempts },
    data2: { isLocked: dbUser2.isLocked, attempts: dbUser2.failedLoginAttempts },
    statusMatch: dbUser1.isLocked === dbUser2.isLocked,
    bodyMatch: dbUser1.isLocked === true && dbUser2.isLocked === true
  });

  // -------------------------------------------------------------
  // Sequential Admin CRUD Lifecycles
  // -------------------------------------------------------------
  console.log('\n4️⃣ Sequential Admin Lifecycles: Real Objects, Real IDs on Both DBs');

  const rand = Date.now().toString().slice(-5);

  // USER CRUD
  const newEmail = `seq_user_${rand}@parity.test`;
  const createUserRes = await fetchBoth('/api/admin/users', {
    method: 'POST',
    legacyToken: adminLegToken,
    targetToken: adminTgtToken,
    body: { email: newEmail, username: newEmail, fullName: 'Seq Lifecycle User', password: 'Password123!', userType: 'internal' }
  });
  assertParity('POST /api/admin/users (Create User)', createUserRes);

  const legUserId = createUserRes.data1.user?.id;
  const tgtUserId = createUserRes.data2.user?.id;

  if (legUserId && tgtUserId) {
    const getUserRes = await fetchBoth('/api/admin/users/:id', {
      method: 'GET',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}`,
      targetPath: `/api/admin/users/${tgtUserId}`
    });
    assertParity('GET /api/admin/users/:id (Real ID)', getUserRes);

    const patchUserRes = await fetchBoth('/api/admin/users/:id', {
      method: 'PATCH',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}`,
      targetPath: `/api/admin/users/${tgtUserId}`,
      body: { fullName: 'Updated Lifecycle Name' }
    });
    assertParity('PATCH /api/admin/users/:id (Update Name)', patchUserRes);

    const lockUserRes = await fetchBoth('/api/admin/users/:id/lock', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}/lock`,
      targetPath: `/api/admin/users/${tgtUserId}/lock`
    });
    assertParity('POST /api/admin/users/:id/lock (Lock User)', lockUserRes);

    const unlockUserRes = await fetchBoth('/api/admin/users/:id/unlock', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}/unlock`,
      targetPath: `/api/admin/users/${tgtUserId}/unlock`
    });
    assertParity('POST /api/admin/users/:id/unlock (Unlock User)', unlockUserRes);

    const deactUserRes = await fetchBoth('/api/admin/users/:id/deactivate', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}/deactivate`,
      targetPath: `/api/admin/users/${tgtUserId}/deactivate`
    });
    assertParity('POST /api/admin/users/:id/deactivate (Deactivate User)', deactUserRes);

    const actUserRes = await fetchBoth('/api/admin/users/:id/activate', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}/activate`,
      targetPath: `/api/admin/users/${tgtUserId}/activate`
    });
    assertParity('POST /api/admin/users/:id/activate (Activate User)', actUserRes);

    const resetUserRes = await fetchBoth('/api/admin/users/:id/reset-password', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}/reset-password`,
      targetPath: `/api/admin/users/${tgtUserId}/reset-password`
    });
    assertParity('POST /api/admin/users/:id/reset-password (Issue Reset Ticket)', resetUserRes);
  }

  // ROLE CRUD
  const roleCode = `SEQ_ROLE_${rand}`;
  const createRoleRes = await fetchBoth('/api/admin/roles', {
    method: 'POST',
    legacyToken: adminLegToken,
    targetToken: adminTgtToken,
    body: { code: roleCode, name: 'Seq Role', description: 'Testing role lifecycle' }
  });
  assertParity('POST /api/admin/roles (Create Role)', createRoleRes);

  const legRoleId = createRoleRes.data1.role?.id;
  const tgtRoleId = createRoleRes.data2.role?.id;

  if (legRoleId && tgtRoleId) {
    const getRoleRes = await fetchBoth('/api/admin/roles/:id', {
      method: 'GET',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/roles/${legRoleId}`,
      targetPath: `/api/admin/roles/${tgtRoleId}`
    });
    assertParity('GET /api/admin/roles/:id (Real ID)', getRoleRes);

    const patchRoleRes = await fetchBoth('/api/admin/roles/:id', {
      method: 'PATCH',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/roles/${legRoleId}`,
      targetPath: `/api/admin/roles/${tgtRoleId}`,
      body: { name: 'Updated Seq Role Name' }
    });
    assertParity('PATCH /api/admin/roles/:id (Update Role)', patchRoleRes);

    const putPermRes = await fetchBoth('/api/admin/roles/:id/permissions', {
      method: 'PUT',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/roles/${legRoleId}/permissions`,
      targetPath: `/api/admin/roles/${tgtRoleId}/permissions`,
      body: { permissions: [{ module: 'ADMIN', resource: 'USER', action: 'VIEW' }, { module: 'ADMIN', resource: 'ROLE', action: 'VIEW' }] }
    });
    assertParity('PUT /api/admin/roles/:id/permissions (Set Permissions)', putPermRes);

    const getPermRes = await fetchBoth('/api/admin/roles/:id/permissions', {
      method: 'GET',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/roles/${legRoleId}/permissions`,
      targetPath: `/api/admin/roles/${tgtRoleId}/permissions`
    });
    assertParity('GET /api/admin/roles/:id/permissions (Get Permissions)', getPermRes);

    // Assign role to user
    const assignRoleRes = await fetchBoth('/api/admin/users/:id/roles', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}/roles`,
      targetPath: `/api/admin/users/${tgtUserId}/roles`,
      body: { roleCode }
    });
    assertParity('POST /api/admin/users/:id/roles (Assign Role)', assignRoleRes);

    // Remove role from user
    const removeRoleRes = await fetchBoth('/api/admin/users/:id/roles/:roleCode', {
      method: 'DELETE',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/users/${legUserId}/roles/${roleCode}`,
      targetPath: `/api/admin/users/${tgtUserId}/roles/${roleCode}`
    });
    assertParity('DELETE /api/admin/users/:id/roles/:roleCode (Remove Role)', removeRoleRes);

    const deactRoleRes = await fetchBoth('/api/admin/roles/:id/deactivate', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/roles/${legRoleId}/deactivate`,
      targetPath: `/api/admin/roles/${tgtRoleId}/deactivate`
    });
    assertParity('POST /api/admin/roles/:id/deactivate (Deactivate Role)', deactRoleRes);

    const actRoleRes = await fetchBoth('/api/admin/roles/:id/activate', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/roles/${legRoleId}/activate`,
      targetPath: `/api/admin/roles/${tgtRoleId}/activate`
    });
    assertParity('POST /api/admin/roles/:id/activate (Activate Role)', actRoleRes);
  }

  // CUSTOMER CRUD
  const custCode = `SEQ_CUST_${rand}`;
  const createCustRes = await fetchBoth('/api/admin/customers', {
    method: 'POST',
    legacyToken: adminLegToken,
    targetToken: adminTgtToken,
    body: { code: custCode, name: 'Sequential Customer Ltd', legalName: 'Seq Ltd', currency: 'USD' }
  });
  assertParity('POST /api/admin/customers (Create Customer)', createCustRes);

  const legCustId = createCustRes.data1.customer?.id;
  const tgtCustId = createCustRes.data2.customer?.id;

  if (legCustId && tgtCustId) {
    const getCustRes = await fetchBoth('/api/admin/customers/:id', {
      method: 'GET',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/customers/${legCustId}`,
      targetPath: `/api/admin/customers/${tgtCustId}`
    });
    assertParity('GET /api/admin/customers/:id (Real ID)', getCustRes);

    const patchCustRes = await fetchBoth('/api/admin/customers/:id', {
      method: 'PATCH',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/customers/${legCustId}`,
      targetPath: `/api/admin/customers/${tgtCustId}`,
      body: { name: 'Updated Customer Name' }
    });
    assertParity('PATCH /api/admin/customers/:id (Update Name)', patchCustRes);

    const deactCustRes = await fetchBoth('/api/admin/customers/:id/deactivate', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/customers/${legCustId}/deactivate`,
      targetPath: `/api/admin/customers/${tgtCustId}/deactivate`
    });
    assertParity('POST /api/admin/customers/:id/deactivate (Deactivate Customer)', deactCustRes);

    const actCustRes = await fetchBoth('/api/admin/customers/:id/activate', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/customers/${legCustId}/activate`,
      targetPath: `/api/admin/customers/${tgtCustId}/activate`
    });
    assertParity('POST /api/admin/customers/:id/activate (Activate Customer)', actCustRes);

    const auditCustRes = await fetchBoth('/api/admin/customers/:id/audit', {
      method: 'GET',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/customers/${legCustId}/audit`,
      targetPath: `/api/admin/customers/${tgtCustId}/audit`
    });
    assertParity('GET /api/admin/customers/:id/audit (Audit Entries)', auditCustRes);

    // -------------------------------------------------------------
    // Customer-User Assignment Lifecycle
    // -------------------------------------------------------------
    const assignCuRes = await fetchBoth('/api/admin/customer-users', {
      method: 'POST',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      body: { customerId: legCustId, userAccountId: legUserId },
      targetPath: '/api/admin/customer-users'
    });
    // Target expects target customerId and target userId
    const tgtAssign = await fetch(`${targetBase}/api/admin/customer-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminTgtToken}` },
      body: JSON.stringify({ customerId: tgtCustId, userAccountId: tgtUserId })
    });
    assignCuRes.status2 = tgtAssign.status;
    assignCuRes.data2 = await tgtAssign.json();
    assignCuRes.statusMatch = assignCuRes.status1 === assignCuRes.status2;
    assignCuRes.bodyMatch = deepEqual(normalizePayload(assignCuRes.data1), normalizePayload(assignCuRes.data2));
    assertParity('POST /api/admin/customer-users (Assign User)', assignCuRes);

    const legAssignId = assignCuRes.data1.assignment?.id;
    const tgtAssignId = assignCuRes.data2.assignment?.id;

    if (legAssignId && tgtAssignId) {
      const listCuRes = await fetchBoth(`/api/admin/customer-users?customerId=${legCustId}`, {
        method: 'GET',
        legacyToken: adminLegToken,
        targetToken: adminTgtToken,
        legacyPath: `/api/admin/customer-users?customerId=${legCustId}`,
        targetPath: `/api/admin/customer-users?customerId=${tgtCustId}`
      });
      assertParity('GET /api/admin/customer-users (Filtered by customer)', listCuRes);

      const patchCuRes = await fetchBoth('/api/admin/customer-users/:id', {
        method: 'PATCH',
        legacyToken: adminLegToken,
        targetToken: adminTgtToken,
        legacyPath: `/api/admin/customer-users/${legAssignId}`,
        targetPath: `/api/admin/customer-users/${tgtAssignId}`,
        body: { status: 'INACTIVE' }
      });
      assertParity('PATCH /api/admin/customer-users/:id (Update Assignment Status)', patchCuRes);

      const unassignCuRes = await fetchBoth('/api/admin/customer-users/:id/unassign', {
        method: 'POST',
        legacyToken: adminLegToken,
        targetToken: adminTgtToken,
        legacyPath: `/api/admin/customer-users/${legAssignId}/unassign`,
        targetPath: `/api/admin/customer-users/${tgtAssignId}/unassign`
      });
      assertParity('POST /api/admin/customer-users/:id/unassign (Unassign)', unassignCuRes);
    }

    const delCustRes = await fetchBoth('/api/admin/customers/:id', {
      method: 'DELETE',
      legacyToken: adminLegToken,
      targetToken: adminTgtToken,
      legacyPath: `/api/admin/customers/${legCustId}`,
      targetPath: `/api/admin/customers/${tgtCustId}`
    });
    assertParity('DELETE /api/admin/customers/:id (Hard Delete Customer)', delCustRes);
  }

  // Rate Limiting (429 after threshold)
  console.log('\n5️⃣ Rate Limiting (429) Verification...');
  let hitRateLimit1 = false;
  let hitRateLimit2 = false;
  let rateLimitResp1 = null;
  let rateLimitResp2 = null;

  for (let i = 0; i < 25; i++) {
    const [r1, r2] = await Promise.all([
      fetch(`${legacyBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'rate_test@parity.test', password: 'pwd' }) }),
      fetch(`${targetBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'rate_test@parity.test', password: 'pwd' }) })
    ]);
    if (r1.status === 429) {
      hitRateLimit1 = true;
      rateLimitResp1 = await r1.json().catch(() => ({}));
    }
    if (r2.status === 429) {
      hitRateLimit2 = true;
      rateLimitResp2 = await r2.json().catch(() => ({}));
    }
    if (hitRateLimit1 && hitRateLimit2) break;
  }

  assertParity('Rate Limit Enforcement (429 on excessive logins)', {
    method: 'POST',
    status1: hitRateLimit1 ? 429 : 200,
    status2: hitRateLimit2 ? 429 : 200,
    data1: rateLimitResp1,
    data2: rateLimitResp2,
    statusMatch: hitRateLimit1 === hitRateLimit2 && hitRateLimit1 === true,
    bodyMatch: deepEqual(normalizePayload(rateLimitResp1), normalizePayload(rateLimitResp2))
  });

  await legacyPrisma.$disconnect();
  await targetPrisma.$disconnect();

  const totalPassed = results.filter(r => r.ok).length;
  console.log(`\n======================================================`);
  console.log(` 🏁 Sequential Parity Summary: ${totalPassed}/${results.length} passed.`);
  console.log(`======================================================\n`);

  return { totalPassed, total: results.length, results };
}

if (process.argv[1]?.endsWith('run-full-parity.mjs')) {
  runFullSequentialParity().then(r => process.exit(r.totalPassed === r.total ? 0 : 1)).catch(e => { console.error(e); process.exit(1); });
}
