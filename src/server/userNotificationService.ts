/**
 * In-app notifications for the existing header bell.
 * Role fan-out uses UserRole; customer isolation is by userAccountId.
 */

import { getPrisma } from './db';
import type { RequestActor } from './auth';

export interface CreateUserNotificationInput {
  userAccountId?: string | null;
  roleCode?: string | null;
  title: string;
  message: string;
  eventCode: string;
  entityType?: string;
  entityId?: string;
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) {
    const err = new Error('Database is not configured.') as Error & { code: string };
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }
  return prisma;
}

async function fanOutRole(roleCode: string, input: CreateUserNotificationInput) {
  const prisma = requirePrisma();
  const members = await prisma.userRole.findMany({
    where: { role: { code: roleCode } },
    select: { userId: true },
  });
  const ids = [...new Set(members.map((m) => m.userId))];
  if (ids.length === 0) {
    return prisma.userNotification.create({
      data: {
        userAccountId: null,
        roleCode,
        title: input.title,
        message: input.message,
        eventCode: input.eventCode,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  }
  await prisma.userNotification.createMany({
    data: ids.map((userAccountId) => ({
      userAccountId,
      roleCode,
      title: input.title,
      message: input.message,
      eventCode: input.eventCode,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
  return { fannedOut: ids.length, roleCode };
}

export async function createUserNotification(input: CreateUserNotificationInput) {
  const prisma = requirePrisma();
  if (input.roleCode && !input.userAccountId) {
    return fanOutRole(input.roleCode, input);
  }
  return prisma.userNotification.create({
    data: {
      userAccountId: input.userAccountId ?? null,
      roleCode: input.roleCode ?? null,
      title: input.title,
      message: input.message,
      eventCode: input.eventCode,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });
}

export async function listUserNotifications(actor: RequestActor) {
  const prisma = requirePrisma();
  const roleCodes = actor.roles?.filter(Boolean) || (actor.role ? [actor.role] : []);
  if (!actor.id && roleCodes.length === 0) return [];
  const rows = await prisma.userNotification.findMany({
    where: {
      OR: [
        ...(actor.id ? [{ userAccountId: actor.id }] : []),
        ...(roleCodes.length ? [{ roleCode: { in: roleCodes } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows;
}

export async function markNotificationRead(id: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const row = await prisma.userNotification.findUnique({ where: { id } });
  if (!row) {
    const err = new Error('Notification not found.') as Error & { code: string };
    err.code = 'NOT_FOUND';
    throw err;
  }
  const roleCodes = actor.roles || [];
  const owns = (actor.id && row.userAccountId === actor.id) || (row.roleCode && roleCodes.includes(row.roleCode));
  if (!owns && actor.userType !== 'internal') {
    const err = new Error('Notification is outside your scope.') as Error & { code: string };
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return prisma.userNotification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(actor: RequestActor) {
  const prisma = requirePrisma();
  const roleCodes = actor.roles?.filter(Boolean) || (actor.role ? [actor.role] : []);
  await prisma.userNotification.updateMany({
    where: {
      readAt: null,
      OR: [
        ...(actor.id ? [{ userAccountId: actor.id }] : []),
        ...(roleCodes.length ? [{ roleCode: { in: roleCodes } }] : []),
      ],
    },
    data: { readAt: new Date() },
  });
}
