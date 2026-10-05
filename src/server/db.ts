import { PrismaClient } from '@prisma/client';
import { logPlatform } from '../platform/logging/logger';

let prisma: PrismaClient | null | undefined;

export function getPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL) return null;
  if (prisma === undefined) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function checkDatabase(): Promise<{
  ok: boolean;
  postgresql: boolean;
  prisma: boolean;
  error?: string;
}> {
  const client = getPrisma();
  if (!client) {
    return { ok: false, postgresql: false, prisma: false, error: 'DATABASE_URL is not set' };
  }
  try {
    await client.$queryRaw`SELECT 1`;
    return { ok: true, postgresql: true, prisma: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logPlatform('error', 'postgresql.health_failed', { error });
    return { ok: false, postgresql: false, prisma: true, error };
  }
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
