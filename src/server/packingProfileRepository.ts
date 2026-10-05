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

export async function createPackingProfile(
  input: {
    drumCode: string;
    drumMasterId?: string | null;
    description?: string | null;
    packedLengthMm?: number | null;
    packedWidthMm?: number | null;
    packedHeightMm?: number | null;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  if (input.drumMasterId) {
    const drum = await prisma.drumMaster.findUnique({ where: { id: input.drumMasterId } });
    if (!drum) throw issue('NOT_FOUND', 'Drum master not found for packing profile.');
  }
  const profile = await prisma.drumPackingProfile.create({
    data: {
      drumCode: input.drumCode,
      drumMasterId: input.drumMasterId ?? null,
      description: input.description ?? null,
      versions: {
        create: {
          versionNo: 1,
          packedLengthMm: input.packedLengthMm ?? null,
          packedWidthMm: input.packedWidthMm ?? null,
          packedHeightMm: input.packedHeightMm ?? null,
          createdBy: actor.id || actor.email || null,
        },
      },
    },
    include: { versions: true },
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'DrumPackingProfile',
    entityId: profile.id,
    action: 'PACKING_PROFILE_CHANGED',
    newValue: { drumCode: profile.drumCode },
    message: `Packing profile created for ${input.drumCode}`,
  });
  return profile;
}

export async function createPackingProfileVersion(
  profileId: string,
  input: {
    packedLengthMm?: number | null;
    packedWidthMm?: number | null;
    packedHeightMm?: number | null;
  },
  actor: RequestActor
) {
  const prisma = requirePrisma();
  const profile = await prisma.drumPackingProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw issue('NOT_FOUND', 'Packing profile not found.');
  const max = await prisma.drumPackingProfileVersion.aggregate({
    where: { profileId },
    _max: { versionNo: true },
  });
  const versionNo = (max._max.versionNo ?? 0) + 1;
  const now = new Date();
  const version = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.drumPackingProfileVersion.updateMany({
      where: { profileId, isCurrent: true },
      data: { isCurrent: false, status: 'SUPERSEDED', effectiveTo: now },
    });
    return tx.drumPackingProfileVersion.create({
      data: {
        profileId,
        versionNo,
        packedLengthMm: input.packedLengthMm ?? null,
        packedWidthMm: input.packedWidthMm ?? null,
        packedHeightMm: input.packedHeightMm ?? null,
        createdBy: actor.id || actor.email || null,
      },
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'DrumPackingProfile',
    entityId: profileId,
    action: 'PACKING_PROFILE_CHANGED',
    newValue: { versionId: version.id, versionNo },
    message: `Packing profile ${profile.drumCode} version ${versionNo} created`,
  });
  return version;
}

export async function assertPackingProfileVersionNotReferenced(versionId: string) {
  const prisma = requirePrisma();
  const n = await prisma.containerStudyInputDrum.count({ where: { packingProfileVersionId: versionId } });
  if (n > 0) {
    throw issue(
      'CONFLICT',
      'Cannot delete a packing profile version referenced by a study snapshot.',
      { versionId }
    );
  }
}

export async function getPackingProfile(id: string) {
  const prisma = requirePrisma();
  const row = await prisma.drumPackingProfile.findUnique({
    where: { id },
    include: { versions: { orderBy: { versionNo: 'desc' } } },
  });
  if (!row) throw issue('NOT_FOUND', 'Packing profile not found.');
  return row;
}
