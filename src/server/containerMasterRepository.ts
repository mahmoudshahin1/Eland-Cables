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

export async function listContainerTypes() {
  const prisma = requirePrisma();
  return prisma.containerType.findMany({
    include: { versions: { orderBy: { versionNo: 'desc' } } },
    orderBy: { code: 'asc' },
  });
}

export async function getContainerType(idOrCode: string) {
  const prisma = requirePrisma();
  const row = await prisma.containerType.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    include: { versions: { orderBy: { versionNo: 'desc' } } },
  });
  if (!row) throw issue('NOT_FOUND', `Container type ${idOrCode} not found.`);
  return row;
}

export async function createContainerTypeVersion(
  containerTypeId: string,
  input: {
    parityLabel: string;
    usableLengthMm?: number | null;
    internalWidthMm?: number | null;
    payloadCapacityKg?: number | null;
    dimensionsStatus?: 'PENDING_APPROVAL' | 'APPROVED';
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const type = await getContainerType(containerTypeId);
  const max = await prisma.containerTypeVersion.aggregate({
    where: { containerTypeId: type.id },
    _max: { versionNo: true },
  });
  const versionNo = (max._max.versionNo ?? 0) + 1;
  const now = new Date();
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.containerTypeVersion.updateMany({
      where: { containerTypeId: type.id, isCurrent: true },
      data: { isCurrent: false, status: 'SUPERSEDED', effectiveTo: now },
    });
    return tx.containerTypeVersion.create({
      data: {
        containerTypeId: type.id,
        versionNo,
        parityLabel: input.parityLabel,
        usableLengthMm: input.usableLengthMm ?? null,
        internalWidthMm: input.internalWidthMm ?? null,
        payloadCapacityKg: input.payloadCapacityKg ?? null,
        dimensionsStatus: input.dimensionsStatus ?? 'PENDING_APPROVAL',
        status: 'ACTIVE',
        isCurrent: true,
        effectiveFrom: input.effectiveFrom ?? now,
        effectiveTo: input.effectiveTo ?? null,
        createdBy: actor.id || actor.email || null,
      },
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerType',
    entityId: type.id,
    action: 'CONTAINER_MASTER_CHANGED',
    newValue: { versionId: created.id, versionNo, parityLabel: created.parityLabel },
    message: `Container type ${type.code} version ${versionNo} created`,
  });
  return created;
}

export async function assertContainerTypeVersionNotReferenced(versionId: string) {
  const prisma = requirePrisma();
  const pins = await prisma.containerStudyInputSnapshotContainerPin.count({
    where: { containerTypeVersionId: versionId },
  });
  if (pins > 0) {
    throw issue(
      'CONFLICT',
      'Cannot delete a container type version referenced by a study snapshot. Archive or supersede instead.',
      { versionId }
    );
  }
}

export async function deleteContainerTypeVersion(versionId: string, actor: RequestActor) {
  await assertContainerTypeVersionNotReferenced(versionId);
  const prisma = requirePrisma();
  const version = await prisma.containerTypeVersion.findUnique({ where: { id: versionId } });
  if (!version) throw issue('NOT_FOUND', 'Container type version not found.');
  if (version.isCurrent) {
    throw issue('VALIDATION_FAILED', 'Cannot delete the current container type version. Create a successor first.');
  }
  await prisma.containerTypeVersion.delete({ where: { id: versionId } });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerTypeVersion',
    entityId: versionId,
    action: 'CONTAINER_MASTER_CHANGED',
    message: 'Unreferenced container type version deleted',
  });
}
