import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { issue } from '../platform/errors/domainError';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export async function listAlgorithmVersions() {
  const prisma = requirePrisma();
  return prisma.algorithmVersionRegistry.findMany({ orderBy: { code: 'asc' } });
}

export async function listAlgorithmConfigurations() {
  const prisma = requirePrisma();
  return prisma.algorithmConfiguration.findMany({
    include: { parameters: true, algorithmVersion: true },
    orderBy: { configurationVersion: 'asc' },
  });
}

export async function getAlgorithmConfiguration(idOrVersion: string) {
  const prisma = requirePrisma();
  const row = await prisma.algorithmConfiguration.findFirst({
    where: { OR: [{ id: idOrVersion }, { configurationVersion: idOrVersion }] },
    include: { parameters: true, algorithmVersion: true },
  });
  if (!row) throw issue('NOT_FOUND', `Algorithm configuration ${idOrVersion} not found.`);
  return row;
}

export async function activateAlgorithmConfiguration(idOrVersion: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const current = await getAlgorithmConfiguration(idOrVersion);
  if (current.status === 'ACTIVE') return current;
  const now = new Date();
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.algorithmConfiguration.updateMany({
      where: {
        algorithmVersionId: current.algorithmVersionId,
        status: 'ACTIVE',
        id: { not: current.id },
      },
      data: { status: 'SUPERSEDED', effectiveTo: now },
    });
    return tx.algorithmConfiguration.update({
      where: { id: current.id },
      data: {
        status: 'ACTIVE',
        activatedAt: now,
        activatedBy: actor.id || actor.email || null,
        effectiveFrom: current.effectiveFrom ?? now,
      },
      include: { parameters: true, algorithmVersion: true },
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'AlgorithmConfiguration',
    entityId: updated.id,
    action: 'ALGORITHM_CONFIGURATION_ACTIVATED',
    newValue: { configurationVersion: updated.configurationVersion, status: updated.status },
    message: `Algorithm configuration ${updated.configurationVersion} activated`,
  });
  return updated;
}

export async function assertConfigurationNotReferenced(configurationId: string) {
  const prisma = requirePrisma();
  const n = await prisma.containerStudyInputSnapshot.count({ where: { configurationId } });
  if (n > 0) {
    throw issue(
      'CONFLICT',
      'Cannot delete an algorithm configuration referenced by a study snapshot.',
      { configurationId }
    );
  }
}
