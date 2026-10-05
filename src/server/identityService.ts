import jwt from 'jsonwebtoken';
import { getPrisma } from './db';
import { hashPassword, verifyPassword, hashOpaqueToken, randomOpaqueToken } from '../domain/passwordService';
import { deriveLegacyPermissions } from '../domain/rbacCompatibility';
import { permissionCode, PERMISSION_CATALOG, INITIAL_ROLES, SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, RequestActor } from './auth';
import { seedGovernedElandCustomer, seedStandardTestCustomer, reconcileCommercialCustomerMasters } from './customerMigration';

const LOCK_THRESHOLD = Number(process.env.LOGIN_LOCK_THRESHOLD || 5);
const ACCESS_TTL = '1h';
const REFRESH_DAYS = 7;

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw Object.assign(new Error('PostgreSQL is not configured.'), { code: 'DATA_REQUIRED' });
  return prisma;
}

export function toSafeUser(user: {
  id: string;
  username: string;
  email: string;
  fullName: string;
  mobile?: string | null;
  employeeNumber?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  customerId?: string | null;
  userType: string;
  status: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles?: Array<{ role: { code: string; name: string } }>;
  permissionCodes?: string[];
}) {
  const roleCodes = user.roles?.map((r) => r.role.code) || [];
  const codes = user.permissionCodes || [];
  return {
    id: user.id,
    userName: user.username,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    mobile: user.mobile || undefined,
    employeeNumber: user.employeeNumber || undefined,
    jobTitle: user.jobTitle || undefined,
    department: user.department || '',
    customerId: user.customerId || undefined,
    customerCode: user.customerId || undefined,
    userType: user.userType,
    status: user.isLocked ? 'Locked' : user.isActive ? 'Active' : 'Inactive',
    isActive: user.isActive,
    isLocked: user.isLocked,
    failedLoginAttempts: user.failedLoginAttempts,
    lastLogin: user.lastLoginAt?.toISOString(),
    lastLoginAt: user.lastLoginAt,
    role: roleCodes[0] || '',
    roles: roleCodes,
    permissions: deriveLegacyPermissions(codes),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function loadPermissionCodes(userId: string): Promise<string[]> {
  const prisma = requirePrisma();
  const links = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return [
    ...new Set(
      links.flatMap((ur) =>
        ur.role.isActive
          ? ur.role.permissions.filter((p) => p.permission.isActive).map((p) => permissionCode(p.permission))
          : []
      )
    ),
  ];
}

function redactSecrets(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  const banned = /password|token|secret|hash/i;
  if (Array.isArray(value)) return value.map(redactSecrets);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (banned.test(k)) continue;
    out[k] = redactSecrets(v);
  }
  return out;
}

async function writeAudit(params: {
  actor?: RequestActor;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  message?: string;
}) {
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.auditEvent.create({
    data: {
      actorId: params.actor?.id,
      actorName: params.actor?.name || params.actor?.email,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      oldValue: redactSecrets(params.oldValue) as any,
      newValue: redactSecrets(params.newValue) as any,
      message: params.message,
    },
  });
}

export async function issueTokens(user: { id: string; email: string; fullName: string; userType: string; department?: string | null; customerId?: string | null; username: string; isActive?: boolean; isLocked?: boolean; status?: string }) {
  if (user.isActive === false || user.isLocked === true || user.status === 'INACTIVE' || user.status === 'LOCKED') {
    throw Object.assign(new Error('Account is not permitted to start a session.'), { code: 'UNAUTHORIZED', http: 401 });
  }
  const prisma = requirePrisma();
  const permissionCodes = await loadPermissionCodes(user.id);
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
  const roleCodes = roles.map((r) => r.role.code);
  const refreshToken = randomOpaqueToken();
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const payload = {
    sub: user.id,
    sid: session.id,
    name: user.fullName,
    email: user.email,
    username: user.username,
    userType: user.userType,
    role: roleCodes[0],
    roles: roleCodes,
    department: user.department,
    permissions: deriveLegacyPermissions(permissionCodes),
  };
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  const decoded = jwt.decode(accessToken);
  const safe = toSafeUser({
    ...user,
    permissionCodes,
    roles,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'ACTIVE',
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
  });
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    refreshToken,
    user: await withCustomerMasterChrome(user.id, safe, user.customerId),
    claims: decoded,
  };
}

export async function loginWithPassword(emailOrUsername: string, password: string, ip?: string) {
  const prisma = requirePrisma();
  const ident = emailOrUsername.trim().toLowerCase();
  const user = await prisma.userAccount.findFirst({
    where: { OR: [{ email: { equals: ident, mode: 'insensitive' } }, { username: { equals: ident, mode: 'insensitive' } }] },
    include: { roles: { include: { role: true } } },
  });

  const fail = async (userId?: string) => {
    if (userId) {
      const updated = await prisma.userAccount.update({
        where: { id: userId },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      if (updated.failedLoginAttempts >= LOCK_THRESHOLD) {
        await prisma.userAccount.update({
          where: { id: userId },
          data: { isLocked: true, status: 'LOCKED' },
        });
        await writeAudit({ entity: 'UserAccount', entityId: userId, action: 'ACCOUNT_LOCKED', message: 'Account locked after failed logins' });
      }
    }
    await writeAudit({
      entity: 'UserAccount',
      entityId: userId || ident,
      action: 'LOGIN_FAILURE',
      message: 'Login failed',
    });
    const err = Object.assign(new Error('Invalid email or password credentials.'), { code: 'UNAUTHORIZED', http: 401 });
    throw err;
  };

  if (!user) await fail();

  if (!user!.isActive || user!.status === 'INACTIVE') {
    await writeAudit({ entity: 'UserAccount', entityId: user!.id, action: 'LOGIN_FAILURE', message: 'Inactive user' });
    throw Object.assign(new Error('Account is inactive.'), { code: 'UNAUTHORIZED', http: 401 });
  }
  if (user!.isLocked || user!.status === 'LOCKED') {
    await writeAudit({ entity: 'UserAccount', entityId: user!.id, action: 'LOGIN_FAILURE', message: 'Locked user' });
    throw Object.assign(new Error('Account is locked.'), { code: 'UNAUTHORIZED', http: 401 });
  }

  const ok = await verifyPassword(password, user!.passwordHash);
  if (!ok) await fail(user!.id);

  const refreshed = await prisma.userAccount.update({
    where: { id: user!.id },
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0 },
    include: { roles: { include: { role: true } } },
  });
  await writeAudit({ entity: 'UserAccount', entityId: user!.id, action: 'LOGIN_SUCCESS', message: ip ? `Login success` : 'Login success' });
  const tokens = await issueTokens(refreshed);
  const me = await getMe(refreshed.id);
  if (me) tokens.user = me;
  return tokens;
}

export async function refreshSession(refreshToken: string) {
  const prisma = requirePrisma();
  const hash = hashOpaqueToken(refreshToken);
  const session = await prisma.userSession.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token.'), { code: 'UNAUTHORIZED', http: 401 });
  }
  if (!session.user.isActive || session.user.isLocked || session.user.status === 'INACTIVE' || session.user.status === 'LOCKED') {
    await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw Object.assign(new Error('Account is not permitted to refresh a session.'), { code: 'UNAUTHORIZED', http: 401 });
  }
  await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return issueTokens(session.user);
}

export async function revokeRefreshToken(refreshToken: string) {
  const prisma = requirePrisma();
  const hash = hashOpaqueToken(refreshToken);
  const session = await prisma.userSession.findUnique({ where: { refreshTokenHash: hash } });
  if (session && !session.revokedAt) {
    await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await writeAudit({ entity: 'UserSession', entityId: session.id, action: 'LOGOUT', message: 'Refresh session revoked' });
  }
}

export async function revokeSessionById(sessionId: string) {
  const prisma = getPrisma();
  if (!prisma || !sessionId) return;
  const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
  if (session && !session.revokedAt) {
    await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await writeAudit({ entity: 'UserSession', entityId: session.id, action: 'LOGOUT', message: 'Access session revoked' });
  }
}

export async function revokeAllSessionsForUser(userId: string) {
  const prisma = getPrisma();
  if (!prisma) return;
  const result = await prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count > 0) {
    await writeAudit({
      entity: 'UserAccount',
      entityId: userId,
      action: 'REVOKE_SESSIONS',
      newValue: { revokedCount: result.count },
      message: 'All active sessions revoked',
    });
  }
}

async function withCustomerMasterChrome<T extends Record<string, unknown>>(
  userId: string,
  base: T,
  fallbackCustomerId?: string | null
) {
  const prisma = requirePrisma();
  const links = await prisma.customerUser.findMany({
    where: { userAccountId: userId, status: 'ACTIVE' },
    include: { customer: true },
    orderBy: { assignedAt: 'asc' },
  });
  const customer = links[0]?.customer;
  return {
    ...base,
    companyName: customer?.name,
    companyLegalName: customer?.legalName || undefined,
    companyLogoUrl: customer?.companyLogoUrl || undefined,
    companyTagline: customer?.companyTagline || undefined,
    customerMasterIds: links.map((link) => link.customerId),
    customerCode: customer?.code || fallbackCustomerId || undefined,
  };
}

export async function getMe(userId: string) {
  const prisma = requirePrisma();
  const user = await prisma.userAccount.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } }, customerUsers: { where: { status: 'ACTIVE' }, include: { customer: true } } },
  });
  if (!user) return null;
  const codes = await loadPermissionCodes(user.id);
  const safe = toSafeUser({ ...user, permissionCodes: codes });
  return withCustomerMasterChrome(user.id, safe, user.customerId);
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionId?: string
) {
  const prisma = requirePrisma();
  const user = await prisma.userAccount.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error('Invalid or expired session.'), { code: 'UNAUTHORIZED', http: 401 });
  }
  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) {
    throw Object.assign(new Error('Current password is incorrect.'), { code: 'VALIDATION_FAILED', http: 400 });
  }
  if (currentPassword === newPassword) {
    throw Object.assign(new Error('New password must be different from the current password.'), {
      code: 'VALIDATION_FAILED',
      http: 400,
    });
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.userAccount.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0 },
  });
  await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  await writeAudit({
    entity: 'UserAccount',
    entityId: userId,
    action: 'CHANGE_PASSWORD',
    message: 'User changed own password',
  });
  return { success: true };
}

export async function ensureIdentitySeed(): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { module_resource_action: { module: p.module, resource: p.resource, action: p.action } },
      create: { module: p.module, resource: p.resource, action: p.action, description: p.description },
      update: { description: p.description, isActive: true },
    });
  }
  const allPerms = await prisma.permission.findMany();
  for (const roleDef of INITIAL_ROLES) {
    const selected = roleDef.code === SYSTEM_ADMIN_ROLE_CODE
      ? allPerms
      : allPerms.filter((p) => (roleDef.permissionFilter ? roleDef.permissionFilter(p) : false));
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      create: {
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        userType: roleDef.userType,
        isSystem: true,
        isActive: true,
      },
      update: { name: roleDef.name, description: roleDef.description, isSystem: true },
    });
    for (const perm of selected) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }
  }
}

export async function countSystemAdministrators(): Promise<number> {
  const prisma = requirePrisma();
  return prisma.userRole.count({
    where: { role: { code: SYSTEM_ADMIN_ROLE_CODE }, user: { isActive: true, isLocked: false } },
  });
}

export { writeAudit, loadPermissionCodes, LOCK_THRESHOLD, requirePrisma };

/** Development identity bootstrap never runs in production, even if ALLOW_DEV_IDENTITY_SEED is set. */
export const INSECURE_DEFAULT_SEED_PASSWORDS = [
  'Admin@2026!',
  'Sales@2026!',
  'Tech@2026!',
  'Customer@2026!',
  'admin',
  'password',
  '123456',
  'energya_connect_dotnet9_super_secret_jwt_key_2026_x89f!',
];

export function validateProductionAdminSeedPassword(password: string | undefined): string {
  if (!password || !password.trim()) {
    throw new Error('ADMIN_SEED_PASSWORD must be explicitly configured in production.');
  }
  const trimmed = password.trim();
  if (INSECURE_DEFAULT_SEED_PASSWORDS.includes(trimmed)) {
    throw new Error('ADMIN_SEED_PASSWORD cannot be set to a default development fallback in production.');
  }
  return trimmed;
}

export function isDevelopmentIdentitySeedAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  allowFlag: string | undefined = process.env.ALLOW_DEV_IDENTITY_SEED
): boolean {
  if (nodeEnv === 'production') {
    if (allowFlag === 'true') {
      console.warn('ALLOW_DEV_IDENTITY_SEED is ignored in production; development identity seed will not run.');
    }
    return false;
  }
  return true;
}

export async function seedProductionAdministrator(adminPassword: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  await ensureIdentitySeed();

  const validatedPassword = validateProductionAdminSeedPassword(adminPassword);
  const email = process.env.ADMIN_SEED_EMAIL || 'admin@energya.com';
  const username = process.env.ADMIN_SEED_USERNAME || 'admin';
  const fullName = process.env.ADMIN_SEED_FULLNAME || 'Production System Administrator';

  const existing = await prisma.userAccount.findUnique({ where: { email } });
  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(validatedPassword);
  const user = await prisma.userAccount.create({
    data: {
      id: 'prod-admin-1',
      email,
      username,
      fullName,
      passwordHash,
      passwordChangedAt: new Date(),
      userType: 'internal',
      department: 'IT & Executive Board',
      createdBy: 'prod-seed',
    },
  });

  const role = await prisma.role.findUnique({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
  if (role) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        assignedBy: 'prod-seed',
      },
    });
  }

  await seedGovernedElandCustomer();
  await reconcileCommercialCustomerMasters();
}

export async function seedDevelopmentUsers(): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  await ensureIdentitySeed();

  const production = process.env.NODE_ENV === 'production';
  if (!isDevelopmentIdentitySeedAllowed()) {
    return;
  }

  const adminPassword = process.env.ADMIN_SEED_PASSWORD;

  const bootstrap: Array<{
    id: string;
    email: string;
    username: string;
    fullName: string;
    password: string;
    userType: 'internal' | 'customer';
    department: string;
    role: string;
    customerId?: string;
    createdBy: string;
  }> = [];

  if (adminPassword) {
    bootstrap.push({
      id: 'dev-admin-1',
      email: 'admin@energya.com',
      username: 'admin@energya.com',
      fullName: 'Development Bootstrap Administrator',
      password: adminPassword,
      userType: 'internal',
      department: 'IT & Executive Board',
      role: 'SYSTEM_ADMINISTRATOR',
      createdBy: 'dev-seed',
    });
  }

  if (!production) {
    bootstrap.push(
      ...(adminPassword
        ? [{ id: 'dev-admin-2', email: 'ehab.maher@energya.com', username: 'ehab.maher@energya.com', fullName: 'Ehab Maher', password: adminPassword, userType: 'internal' as const, department: 'IT Administration', role: 'SYSTEM_ADMINISTRATOR', createdBy: 'dev-seed' }]
        : []),
      { id: 'dev-sales-1', email: 'sales@energya.com', username: 'sales@energya.com', fullName: 'Eng. Mohamed Ahmed', password: 'Sales@2026!', userType: 'internal', department: 'Commercial & Sales', role: 'SALES_MANAGER', createdBy: 'dev-seed' },
      { id: 'dev-sales-2', email: 'm.ahmed@energya.com', username: 'm.ahmed@energya.com', fullName: 'Mohamed Ahmed', password: 'Sales@2026!', userType: 'internal', department: 'Sales & Commercial', role: 'SALES_MANAGER', createdBy: 'dev-seed' },
      { id: 'dev-tech-1', email: 'technical@energya.com', username: 'technical@energya.com', fullName: 'Eng. Tarek Hasan', password: 'Tech@2026!', userType: 'internal', department: 'Technical Office', role: 'TECHNICAL_OFFICE_ENGINEER', createdBy: 'dev-seed' },
      { id: 'dev-cost-1', email: 'k.salem@energya.com', username: 'k.salem@energya.com', fullName: 'Khaled Salem', password: 'Admin@2026!', userType: 'internal', department: 'Costing & Pricing', role: 'COSTING_MANAGER', createdBy: 'dev-seed' },
      { id: 'dev-proc-1', email: 'n.nabil@energya.com', username: 'n.nabil@energya.com', fullName: 'Nader Nabil', password: 'Admin@2026!', userType: 'internal', department: 'Plant Production', role: 'PROCUREMENT_MANAGER', createdBy: 'dev-seed' },
      { id: 'dev-cust-eland', email: 'david.smith@elandcables.com', username: 'eland.cables', fullName: 'Eng. David Smith', password: 'Customer@2026!', userType: 'customer', department: 'Commercial Procurement', role: 'CUSTOMER_USER', customerId: 'c-eland', createdBy: 'dev-seed' }
    );
  }

  for (const d of bootstrap) {
    const existing = await prisma.userAccount.findUnique({ where: { email: d.email } });
    if (existing) continue;
    const passwordHash = await hashPassword(d.password);
    const user = await prisma.userAccount.create({
      data: {
        id: d.id,
        email: d.email,
        username: d.username,
        fullName: d.fullName,
        passwordHash,
        passwordChangedAt: new Date(),
        userType: d.userType,
        department: d.department,
        customerId: d.customerId,
        createdBy: d.createdBy,
      },
    });
    const role = await prisma.role.findUnique({ where: { code: d.role } });
    if (role) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, assignedBy: 'dev-seed' } });
    }
  }
  await seedGovernedElandCustomer();
  await seedStandardTestCustomer();
  await reconcileCommercialCustomerMasters();
}

/**
 * Explicit demo-persona bootstrap for public demos (Render, etc.).
 * Never runs unless ALLOW_DEMO_USERS=true or DEMO_SEED=true.
 * Passwords come from DEMO_*_PASSWORD env vars; documented demo passwords are
 * allowed as fallbacks only when this opt-in flag is set.
 */
export function isDemoUserSeedAllowed(
  allowFlag: string | undefined = process.env.ALLOW_DEMO_USERS ?? process.env.DEMO_SEED
): boolean {
  return allowFlag === 'true';
}

export type DemoUserSeedSummary = {
  created: string[];
  skippedExisting: string[];
  passwordReset: string[];
  rolesEnsured: string[];
};

type DemoPersonaDef = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  password: string;
  userType: 'internal' | 'customer';
  department: string;
  role: string;
  customerId?: string;
};

function resolveDemoPersonaPassword(envName: string, documentedFallback: string): string {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  return documentedFallback;
}

export function buildDemoPersonaDefinitions(): DemoPersonaDef[] {
  const salesPassword = resolveDemoPersonaPassword('DEMO_SALES_PASSWORD', 'Sales@2026!');
  const techPassword = resolveDemoPersonaPassword('DEMO_TECH_PASSWORD', 'Tech@2026!');
  const costingPassword = resolveDemoPersonaPassword('DEMO_COSTING_PASSWORD', 'Admin@2026!');
  const procurementPassword =
    process.env.DEMO_PROCUREMENT_PASSWORD?.trim() || costingPassword;
  const customerPassword = resolveDemoPersonaPassword('DEMO_CUSTOMER_PASSWORD', 'Customer@2026!');

  return [
    {
      id: 'demo-sales-1',
      email: 'sales@energya.com',
      username: 'sales@energya.com',
      fullName: 'Eng. Mohamed Ahmed',
      password: salesPassword,
      userType: 'internal',
      department: 'Commercial & Sales',
      role: 'SALES_MANAGER',
    },
    {
      id: 'demo-sales-2',
      email: 'm.ahmed@energya.com',
      username: 'm.ahmed@energya.com',
      fullName: 'Mohamed Ahmed',
      password: salesPassword,
      userType: 'internal',
      department: 'Sales & Commercial',
      role: 'SALES_MANAGER',
    },
    {
      id: 'demo-tech-1',
      email: 'technical@energya.com',
      username: 'technical@energya.com',
      fullName: 'Eng. Tarek Hasan',
      password: techPassword,
      userType: 'internal',
      department: 'Technical Office',
      role: 'TECHNICAL_OFFICE_ENGINEER',
    },
    {
      id: 'demo-cost-1',
      email: 'k.salem@energya.com',
      username: 'k.salem@energya.com',
      fullName: 'Khaled Salem',
      password: costingPassword,
      userType: 'internal',
      department: 'Costing & Pricing',
      role: 'COSTING_MANAGER',
    },
    {
      id: 'demo-proc-1',
      email: 'n.nabil@energya.com',
      username: 'n.nabil@energya.com',
      fullName: 'Nader Nabil',
      password: procurementPassword,
      userType: 'internal',
      department: 'Plant Production',
      role: 'PROCUREMENT_MANAGER',
    },
    {
      id: 'demo-cust-eland',
      email: 'david.smith@elandcables.com',
      username: 'eland.cables',
      fullName: 'Eng. David Smith',
      password: customerPassword,
      userType: 'customer',
      department: 'Commercial Procurement',
      role: 'CUSTOMER_USER',
      customerId: 'c-eland',
    },
  ];
}

export async function seedDemoPersonaUsers(options?: {
  resetPasswords?: boolean;
}): Promise<DemoUserSeedSummary> {
  const summary: DemoUserSeedSummary = {
    created: [],
    skippedExisting: [],
    passwordReset: [],
    rolesEnsured: [],
  };

  if (!isDemoUserSeedAllowed()) {
    throw new Error(
      'Demo persona seed refused. Set ALLOW_DEMO_USERS=true or DEMO_SEED=true to create documented demo users.'
    );
  }

  const prisma = getPrisma();
  if (!prisma) {
    throw new Error('DATABASE_URL is required to seed demo persona users.');
  }

  await ensureIdentitySeed();

  const resetPasswords =
    options?.resetPasswords === true || process.env.DEMO_RESET_PASSWORDS === 'true';
  const personas = buildDemoPersonaDefinitions();

  for (const d of personas) {
    const existing = await prisma.userAccount.findUnique({ where: { email: d.email } });
    let userId: string;

    if (!existing) {
      const passwordHash = await hashPassword(d.password);
      const user = await prisma.userAccount.create({
        data: {
          id: d.id,
          email: d.email,
          username: d.username,
          fullName: d.fullName,
          passwordHash,
          passwordChangedAt: new Date(),
          userType: d.userType,
          department: d.department,
          customerId: d.customerId,
          createdBy: 'demo-seed',
          isActive: true,
          status: 'ACTIVE',
          isLocked: false,
          failedLoginAttempts: 0,
        },
      });
      userId = user.id;
      summary.created.push(d.email);
    } else {
      userId = existing.id;
      if (resetPasswords) {
        const passwordHash = await hashPassword(d.password);
        await prisma.userAccount.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            passwordChangedAt: new Date(),
            isActive: true,
            status: 'ACTIVE',
            isLocked: false,
            failedLoginAttempts: 0,
          },
        });
        summary.passwordReset.push(d.email);
      } else {
        summary.skippedExisting.push(d.email);
      }
    }

    const role = await prisma.role.findUnique({ where: { code: d.role } });
    if (role) {
      const existingRole = await prisma.userRole.findFirst({
        where: { userId, roleId: role.id },
      });
      if (!existingRole) {
        await prisma.userRole.create({
          data: { userId, roleId: role.id, assignedBy: 'demo-seed' },
        });
        summary.rolesEnsured.push(`${d.email}:${d.role}`);
      }
    }
  }

  await seedGovernedElandCustomer();
  await seedStandardTestCustomer();
  await reconcileCommercialCustomerMasters();
  return summary;
}
