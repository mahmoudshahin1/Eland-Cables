import { BadRequestException } from '@nestjs/common';
import { expect, describe, it } from 'vitest';
import type { PrismaService } from '../../src/prisma.service.js';
import type { RequestActor } from '../../src/common/interfaces/request-actor.interface.js';
import { DrumsRepository } from '../../src/master-data/drums/drums.repository.js';
import { ExportsRepository, type MasterExportEntity } from '../../src/master-data/exports/exports.repository.js';
import { ImportsRepository } from '../../src/master-data/imports/imports.repository.js';

const repositoryFiles = {
  drums: { repository: DrumsRepository },
  exports: { repository: ExportsRepository },
  imports: { repository: ImportsRepository },
};

void repositoryFiles.drums.repository;
void repositoryFiles.exports.repository;
void repositoryFiles.imports.repository;

const actor: RequestActor = {
  id: 'actor-1',
  email: 'admin@parity.test',
  userType: 'internal',
};

function asPrisma(stub: object): PrismaService {
  return stub as unknown as PrismaService;
}

describe('drums.repository', () => {
  it('rejects a duplicate drum code before writing', async () => {
    const prisma = asPrisma({
      drumMaster: {
        findUnique: async () => ({ drumCode: 'EWD1' }),
        create: async () => {
          throw new Error('create should not run');
        },
      },
    });
    const repo = new DrumsRepository(prisma);
    await expect(repo.create({ drumCode: 'EWD1' }, actor)).rejects.toMatchObject({
      message: 'Drum code already exists.',
      code: 'DUPLICATE_DRUM_CODE',
    });
  });

  it('rejects geometry where the barrel is not smaller than the flange', async () => {
    const prisma = asPrisma({
      drumMaster: {
        findUnique: async () => null,
        create: async () => {
          throw new Error('create should not run');
        },
      },
    });
    const repo = new DrumsRepository(prisma);
    await expect(
      repo.create(
        {
          drumCode: 'EWD2',
          flange: 100,
          barrel: 100,
          innerWidth: 10,
          outerWidth: 20,
          capacity: 1,
        },
        actor,
      ),
    ).rejects.toMatchObject({
      message: 'Barrel is greater than or equal to Flange.',
      code: 'VALIDATION',
    });
  });

  it('returns null when the drum code is not stored', async () => {
    const prisma = asPrisma({
      drumMaster: { findUnique: async () => null },
    });
    const repo = new DrumsRepository(prisma);
    await expect(repo.getDrum('missing')).resolves.toBeNull();
  });
});

describe('exports.repository', () => {
  it('rejects an export entity that is not in the master list', async () => {
    const repo = new ExportsRepository(asPrisma({}));
    await expect(repo.exportEntity(actor, 'nope' as MasterExportEntity)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('builds an empty segments workbook', async () => {
    const repo = new ExportsRepository(
      asPrisma({
        customerSegment: { findMany: async () => [] },
      }),
    );
    const result = await repo.exportEntity(actor, 'segments');
    expect(result.rowCounts).toEqual({ segments: 0 });
    expect(result.filename.startsWith('segments_')).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});

describe('imports.repository', () => {
  it('returns the import history from the batch query', async () => {
    const repo = new ImportsRepository(
      asPrisma({
        importBatch: { findMany: async () => [{ batchNumber: 'B-1' }] },
      }),
    );
    await expect(repo.listImportHistory()).resolves.toEqual([{ batchNumber: 'B-1' }]);
  });

  it('marks a scrap row invalid when the cable material number is missing', async () => {
    const repo = new ImportsRepository(asPrisma({}));
    const preview = await repo.previewCableScrapImport([{}]);
    expect(preview.errorCount).toBe(1);
    expect(preview.validCount).toBe(0);
    expect(preview.rows[0]?.errors[0]?.code).toBe('REQUIRED');
  });

  it('marks a scrap row invalid when Cable Master has no such cable', async () => {
    const repo = new ImportsRepository(
      asPrisma({
        cableMaster: { findUnique: async () => null },
      }),
    );
    const preview = await repo.previewCableScrapImport([
      { 'Cable Material Number': 'NO-SUCH', 'Scrap %': '1' },
    ]);
    expect(preview.errorCount).toBe(1);
    expect(preview.rows[0]?.errors.map((entry) => entry.code)).toContain('CABLE_NOT_FOUND');
  });
});
