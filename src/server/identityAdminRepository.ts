import { IdentityStatus, IdentityUserType } from '@prisma/client';
import { hashPassword, hashOpaqueToken, randomOpaqueToken } from '../domain/passwordService';
import { requirePermission } from '../domain/rbacEngine';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { RequestActor } from './auth';
import {
  requirePrisma,
  toSafeUser,
  writeAudit,
  loadPermissionCodes,
  countSystemAdministrators,
  revokeAllSessionsForUser,
} from './identityService';

function actorHasRole(actor: RequestActor, code: string): boolean {
  return (actor.roles || []).includes(code) || actor.role === code;
}

/** Password reset tokens are never returned in production, even if the env flag is set. */
export function includeAdminResetTokenInResponse(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.ADMIN_RESET_TOKEN_IN_RESPONSE
): boolean {
  if (nodeEnv === 'production') {
    if (flag === 'true') {
      console.warn('ADMIN_RESET_TOKEN_IN_RESPONSE is ignored in production; reset tokens are never returned.');
    }
    return false;
  }
  return flag === 'true';
}

export async function listUsers(filter: {
  q?: string;
  status?: string;
  userType?: string;
  department?: string;
  customerId?: string;
  role?: string;
  sort?: string;
  skip?: number;
  take?: number;
}) {
  const prisma = requirePrisma();
  const where: any = {};
  if (filter.q) {
    where.OR = [
      { email: { contains: filter.q, mode: 'insensitive' } },
      { username: { contains: filter.q, mode: 'insensitive' } },
      { fullName: { contains: filter.q, mode: 'insensitive' } },
      { department: { contains: filter.q, mode: 'insensitive' } },
    ];
  }
  if (filter.userType) where.userType = filter.userType;
  if (filter.department) where.department = { contains: filter.department, mode: 'insensitive' };
  if (filter.customerId) where.customerId = filter.customerId;
  if (filter.role) where.roles = { some: { role: { code: filter.role } } };
  if (filter.status === 'LOCKED') where.isLocked = true;
  if (filter.status === 'INACTIVE') where.isActive = false;
  if (filter.status === 'ACTIVE') {
    where.isActive = true;
    where.isLocked = false;
  }
  const take = Math.min(filter.take || 50, 100);
  const skip = filter.skip || 0;
  const orderBy =
    filter.sort === 'lastLoginAt'
      ? { lastLoginAt: 'desc' as const }
      : filter.sort === 'fullName'
        ? { fullName: 'asc' as const }
        : filter.sort === 'email'
          ? { email: 'asc' as const }
          : { createdAt: 'desc' as const };
  const [total, rows] = await Promise.all([
    prisma.userAccount.count({ where }),
    prisma.userAccount.findMany({
      where,
      include: { roles: { include: { role: true } } },
      orderBy,
      skip,
      take,
    }),
  ]);
  const users = [];
  for (const row of rows) {
    const codes = await loadPermissionCodes(row.id);
    users.push(toSafeUser({ ...row, permissionCodes: codes }));
  }
  return { users, total, skip, take };
}

export async function getUserById(id: string) {
  const prisma = requirePrisma();
  const row = await prisma.userAccount.findUnique({
    where: { id },
    include: { roles: { include: { role: true } } },
  });
  if (!row) return null;
  const codes = await loadPermissionCodes(row.id);
  return toSafeUser({ ...row, permissionCodes: codes });
}

export async function createUser(
  input: {
    username: string;
    email: string;
    fullName: string;
    password: string;
    userType?: IdentityUserType;
    department?: string;
    jobTitle?: string;
    mobile?: string;
    employeeNumber?: string;
    customerId?: string;
    roleCodes?: string[];
  },
  actor: RequestActor
) {
  requirePermission(actor, 'ADMIN', 'USER', 'CREATE');
  const prisma = requirePrisma();
  const passwordHash = await hashPassword(input.password);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.userAccount.create({
      data: {
        username: input.username.trim(),
        email: input.email.trim().toLowerCase(),
        fullName: input.fullName.trim(),
        passwordHash,
        passwordChangedAt: new Date(),
        userType: input.userType || 'internal',
        department: input.department,
        jobTitle: input.jobTitle,
        mobile: input.mobile,
        employeeNumber: input.employeeNumber,
        customerId: input.customerId,
        createdBy: actor.id,
      },
    });
    const codes = input.roleCodes?.length ? input.roleCodes : input.userType === 'customer' ? ['CUSTOMER_USER'] : ['REPORT_VIEWER'];
    if (codes.includes(SYSTEM_ADMIN_ROLE_CODE) && !actorHasRole(actor, SYSTEM_ADMIN_ROLE_CODE)) {
      throw Object.assign(new Error('Only a SYSTEM_ADMINISTRATOR can grant that role.'), {
        code: 'UNAUTHORIZED',
        http: 403,
      });
    }
    for (const code of codes) {
      const role = await tx.role.findUnique({ where: { code } });
      if (!role || !role.isActive) {
        throw Object.assign(new Error(`Role ${code} is not available.`), { code: 'VALIDATION_FAILED', http: 400 });
      }
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id, assignedBy: actor.id } });
    }
    return user;
  });
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: created.id,
    action: 'CREATE_USER',
    newValue: { email: created.email, username: created.username },
  });
  return getUserById(created.id);
}

export async function updateUser(
  id: string,
  input: {
    fullName?: string;
    mobile?: string;
    employeeNumber?: string;
    jobTitle?: string;
    department?: string;
    customerId?: string | null;
  },
  actor: RequestActor
) {
  requirePermission(actor, 'ADMIN', 'USER', 'UPDATE');
  const prisma = requirePrisma();
  const previous = await prisma.userAccount.findUnique({ where: { id } });
  if (!previous) throw Object.assign(new Error('User not found.'), { code: 'NOT_FOUND', http: 404 });
  const updated = await prisma.userAccount.update({
    where: { id },
    data: {
      fullName: input.fullName ?? previous.fullName,
      mobile: input.mobile !== undefined ? input.mobile : previous.mobile,
      employeeNumber: input.employeeNumber !== undefined ? input.employeeNumber : previous.employeeNumber,
      jobTitle: input.jobTitle !== undefined ? input.jobTitle : previous.jobTitle,
      department: input.department !== undefined ? input.department : previous.department,
      customerId: input.customerId !== undefined ? input.customerId : previous.customerId,
    },
  });
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: id,
    action: 'UPDATE_USER',
    oldValue: { fullName: previous.fullName, department: previous.department },
    newValue: { fullName: updated.fullName, department: updated.department },
  });
  return getUserById(id);
}

async function protectLastAdmin(userId: string) {
  const prisma = requirePrisma();
  const link = await prisma.userRole.findFirst({
    where: { userId, role: { code: SYSTEM_ADMIN_ROLE_CODE } },
  });
  if (!link) return;
  const remaining = await countSystemAdministrators();
  if (remaining <= 1) {
    throw Object.assign(new Error('Cannot remove or disable the last SYSTEM_ADMINISTRATOR.'), {
      code: 'CONFLICT',
      http: 409,
    });
  }
}

export async function setUserActive(id: string, active: boolean, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'USER', 'DEACTIVATE');
  if (!active) await protectLastAdmin(id);
  const prisma = requirePrisma();
  const previous = await prisma.userAccount.findUnique({ where: { id } });
  if (!previous) throw Object.assign(new Error('User not found.'), { code: 'NOT_FOUND', http: 404 });
  await prisma.userAccount.update({
    where: { id },
    data: {
      isActive: active,
      status: active ? (previous.isLocked ? IdentityStatus.LOCKED : IdentityStatus.ACTIVE) : IdentityStatus.INACTIVE,
    },
  });
  if (!active) await revokeAllSessionsForUser(id);
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: id,
    action: active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
    oldValue: { isActive: previous.isActive },
    newValue: { isActive: active },
  });
  return getUserById(id);
}

export async function setUserLocked(id: string, locked: boolean, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'USER', 'LOCK');
  if (locked) await protectLastAdmin(id);
  const prisma = requirePrisma();
  const previous = await prisma.userAccount.findUnique({ where: { id } });
  if (!previous) throw Object.assign(new Error('User not found.'), { code: 'NOT_FOUND', http: 404 });
  await prisma.userAccount.update({
    where: { id },
    data: {
      isLocked: locked,
      status: locked ? IdentityStatus.LOCKED : previous.isActive ? IdentityStatus.ACTIVE : IdentityStatus.INACTIVE,
      failedLoginAttempts: locked ? previous.failedLoginAttempts : 0,
    },
  });
  if (locked) await revokeAllSessionsForUser(id);
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: id,
    action: locked ? 'LOCK_USER' : 'UNLOCK_USER',
    oldValue: { isLocked: previous.isLocked },
    newValue: { isLocked: locked },
  });
  return getUserById(id);
}

export async function issueAdminPasswordReset(id: string, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'USER', 'RESET_PASSWORD');
  const prisma = requirePrisma();
  const user = await prisma.userAccount.findUnique({ where: { id } });
  if (!user) throw Object.assign(new Error('User not found.'), { code: 'NOT_FOUND', http: 404 });
  const token = randomOpaqueToken();
  await prisma.passwordResetTicket.create({
    data: {
      userId: id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdBy: actor.id,
    },
  });
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: id,
    action: 'RESET_PASSWORD',
    message: 'Password reset ticket issued (token not stored in audit).',
  });
  const includeToken = includeAdminResetTokenInResponse();
  return {
    resetIssued: true,
    expiresInMinutes: 60,
    resetToken: includeToken ? token : undefined,
  };
}

export async function consumePasswordReset(token: string, newPassword: string) {
  const prisma = requirePrisma();
  const ticket = await prisma.passwordResetTicket.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
  });
  if (!ticket || ticket.usedAt || ticket.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired password reset token.'), { code: 'VALIDATION_FAILED', http: 400 });
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.userAccount.update({
      where: { id: ticket.userId },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, isLocked: false, status: IdentityStatus.ACTIVE },
    }),
    prisma.passwordResetTicket.update({ where: { id: ticket.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetTicket.updateMany({
      where: { userId: ticket.userId, usedAt: null, id: { not: ticket.id } },
      data: { usedAt: new Date() },
    }),
  ]);
  await revokeAllSessionsForUser(ticket.userId);
  await writeAudit({ entity: 'UserAccount', entityId: ticket.userId, action: 'RESET_PASSWORD', message: 'Password reset completed' });
  return { success: true };
}

export async function assignRole(userId: string, roleCode: string, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'ROLE', 'MANAGE');
  if (actor.id && actor.id === userId) {
    throw Object.assign(new Error('You cannot assign roles to your own account.'), {
      code: 'UNAUTHORIZED',
      http: 403,
    });
  }
  if (roleCode === SYSTEM_ADMIN_ROLE_CODE && !actorHasRole(actor, SYSTEM_ADMIN_ROLE_CODE)) {
    throw Object.assign(new Error('Only a SYSTEM_ADMINISTRATOR can grant that role.'), {
      code: 'UNAUTHORIZED',
      http: 403,
    });
  }
  const prisma = requirePrisma();
  const user = await prisma.userAccount.findUnique({ where: { id: userId } });
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!user || !role) throw Object.assign(new Error('User or role not found.'), { code: 'NOT_FOUND', http: 404 });
  if (!role.isActive) throw Object.assign(new Error('Role is inactive.'), { code: 'VALIDATION_FAILED', http: 400 });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id, assignedBy: actor.id },
    update: {},
  });
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: userId,
    action: 'ASSIGN_ROLE',
    newValue: { roleCode },
  });
  return getUserById(userId);
}

export async function removeRole(userId: string, roleCode: string, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'ROLE', 'MANAGE');
  if (actor.id && actor.id === userId) {
    throw Object.assign(new Error('You cannot remove roles from your own account.'), {
      code: 'UNAUTHORIZED',
      http: 403,
    });
  }
  if (roleCode === SYSTEM_ADMIN_ROLE_CODE) await protectLastAdmin(userId);
  const prisma = requirePrisma();
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw Object.assign(new Error('Role not found.'), { code: 'NOT_FOUND', http: 404 });
  await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: userId,
    action: 'REMOVE_ROLE',
    oldValue: { roleCode },
  });
  return getUserById(userId);
}

export async function listRoles() {
  const prisma = requirePrisma();
  const roles = await prisma.role.findMany({
    include: { _count: { select: { users: true, permissions: true } } },
    orderBy: { code: 'asc' },
  });
  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    userType: r.userType,
    isSystem: r.isSystem,
    isActive: r.isActive,
    userCount: r._count.users,
    permissionCount: r._count.permissions,
  }));
}

export async function getRoleDetail(idOrCode: string) {
  const prisma = requirePrisma();
  const role = await prisma.role.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    include: {
      permissions: { include: { permission: true } },
      users: { include: { user: true } },
    },
  });
  if (!role) return null;
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    userType: role.userType,
    isSystem: role.isSystem,
    isActive: role.isActive,
    permissions: role.permissions.map((p) => ({
      module: p.permission.module,
      resource: p.permission.resource,
      action: p.permission.action,
      description: p.permission.description,
    })),
    users: role.users.map((u) => ({ id: u.user.id, email: u.user.email, fullName: u.user.fullName })),
  };
}

export async function createRole(
  input: { code: string; name: string; description?: string; userType?: IdentityUserType },
  actor: RequestActor
) {
  requirePermission(actor, 'ADMIN', 'ROLE', 'CREATE');
  const prisma = requirePrisma();
  const role = await prisma.role.create({
    data: {
      code: input.code.trim().toUpperCase().replace(/\s+/g, '_'),
      name: input.name.trim(),
      description: input.description,
      userType: input.userType || 'internal',
      isSystem: false,
      isActive: true,
    },
  });
  await writeAudit({ actor, entity: 'Role', entityId: role.id, action: 'CREATE_ROLE', newValue: { code: role.code } });
  return getRoleDetail(role.id);
}

export async function updateRole(id: string, input: { name?: string; description?: string }, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'ROLE', 'UPDATE');
  const prisma = requirePrisma();
  const previous = await prisma.role.findUnique({ where: { id } });
  if (!previous) throw Object.assign(new Error('Role not found.'), { code: 'NOT_FOUND', http: 404 });
  await prisma.role.update({
    where: { id },
    data: { name: input.name ?? previous.name, description: input.description ?? previous.description },
  });
  await writeAudit({ actor, entity: 'Role', entityId: id, action: 'UPDATE_ROLE', oldValue: { name: previous.name }, newValue: input });
  return getRoleDetail(id);
}

export async function setRoleActive(id: string, active: boolean, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'ROLE', 'UPDATE');
  const prisma = requirePrisma();
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw Object.assign(new Error('Role not found.'), { code: 'NOT_FOUND', http: 404 });
  if (!active && role.code === SYSTEM_ADMIN_ROLE_CODE) {
    throw Object.assign(new Error('SYSTEM_ADMINISTRATOR cannot be deactivated.'), { code: 'CONFLICT', http: 409 });
  }
  await prisma.role.update({ where: { id }, data: { isActive: active } });
  await writeAudit({
    actor,
    entity: 'Role',
    entityId: id,
    action: active ? 'ACTIVATE_ROLE' : 'DEACTIVATE_ROLE',
    oldValue: { isActive: role.isActive },
    newValue: { isActive: active },
  });
  return getRoleDetail(id);
}

export async function setRolePermissions(id: string, triples: Array<{ module: string; resource: string; action: string }>, actor: RequestActor) {
  requirePermission(actor, 'ADMIN', 'ROLE', 'MANAGE');
  const prisma = requirePrisma();
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw Object.assign(new Error('Role not found.'), { code: 'NOT_FOUND', http: 404 });
  if (actor.id) {
    const selfAssigned = await prisma.userRole.findFirst({ where: { userId: actor.id, roleId: id } });
    if (selfAssigned) {
      throw Object.assign(new Error('You cannot change permissions on a role assigned to your own account.'), {
        code: 'UNAUTHORIZED',
        http: 403,
      });
    }
  }
  if (role.code === SYSTEM_ADMIN_ROLE_CODE && !actorHasRole(actor, SYSTEM_ADMIN_ROLE_CODE)) {
    throw Object.assign(new Error('Only a SYSTEM_ADMINISTRATOR can change that role.'), {
      code: 'UNAUTHORIZED',
      http: 403,
    });
  }
  const catalog = await prisma.permission.findMany();
  const wanted = triples.map((t) => `${t.module}:${t.resource}:${t.action}`);
  const selected = catalog.filter((p) => wanted.includes(`${p.module}:${p.resource}:${p.action}`));
  if (selected.length !== triples.length) {
    throw Object.assign(new Error('One or more permissions are not in the controlled catalog.'), { code: 'VALIDATION_FAILED', http: 400 });
  }
  const previous = await prisma.rolePermission.findMany({
    where: { roleId: id },
    include: { permission: true },
  });
  const prevCodes = previous.map((p) => `${p.permission.module}:${p.permission.resource}:${p.permission.action}`);
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    for (const perm of selected) {
      await tx.rolePermission.create({ data: { roleId: id, permissionId: perm.id } });
    }
  });
  const added = wanted.filter((c) => !prevCodes.includes(c));
  const removed = prevCodes.filter((c) => !wanted.includes(c));
  if (added.length) {
    await writeAudit({ actor, entity: 'Role', entityId: id, action: 'ASSIGN_PERMISSION', newValue: { permissions: added } });
  }
  if (removed.length) {
    await writeAudit({ actor, entity: 'Role', entityId: id, action: 'REMOVE_PERMISSION', oldValue: { permissions: removed } });
  }
  return getRoleDetail(id);
}

export async function securitySummary() {
  const prisma = requirePrisma();
  const [active, locked, inactive, roles, permissions, recentLogins, failedLogins, adminActions] = await Promise.all([
    prisma.userAccount.count({ where: { isActive: true, isLocked: false } }),
    prisma.userAccount.count({ where: { isLocked: true } }),
    prisma.userAccount.count({ where: { isActive: false } }),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.userAccount.findMany({
      where: { lastLoginAt: { not: null } },
      orderBy: { lastLoginAt: 'desc' },
      take: 8,
      select: { id: true, email: true, fullName: true, lastLoginAt: true },
    }),
    prisma.auditEvent.count({ where: { action: 'LOGIN_FAILURE' } }),
    prisma.auditEvent.findMany({
      where: { action: { in: ['CREATE_USER', 'UPDATE_USER', 'ASSIGN_ROLE', 'LOCK_USER', 'RESET_PASSWORD', 'CREATE_ROLE'] } },
      orderBy: { at: 'desc' },
      take: 15,
    }),
  ]);
  return { activeUsers: active, lockedUsers: locked, inactiveUsers: inactive, roleCount: roles, permissionCount: permissions, recentLogins, failedLoginAttempts: failedLogins, recentAdminActions: adminActions };
}
