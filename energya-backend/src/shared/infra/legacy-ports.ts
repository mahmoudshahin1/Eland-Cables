import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

/**
 * Nest-side implementations of the legacy helpers that ported domain files import
 * (`src/server/db#getPrisma`, `src/server/identityService#writeAudit`).
 * Ported files must import these instead of reaching into the legacy tree.
 */

let prismaClient: PrismaClient | null = null;

export function registerPrismaClient(client: PrismaClient): void {
  prismaClient = client;
}

export function getPrisma(): PrismaClient | null {
  return prismaClient;
}

function redactSecrets(value: unknown): unknown {
  if (value == null) return value;
  if (typeof (value as any)?.toNumber === 'function') {
    return (value as any).toNumber();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
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

export async function writeAudit(params: {
  actor?: RequestActor;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  message?: string;
}): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.auditEvent.create({
    data: {
      actorId: params.actor?.id,
      actorName: params.actor?.name || params.actor?.email,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      oldValue: redactSecrets(params.oldValue) as Prisma.InputJsonValue | undefined,
      newValue: redactSecrets(params.newValue) as Prisma.InputJsonValue | undefined,
      message: params.message,
    },
  });
}
