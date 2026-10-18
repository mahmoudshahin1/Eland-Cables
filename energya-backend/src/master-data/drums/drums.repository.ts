import { Inject, Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service.js';
import { drumFromRow } from '../common/master-data-dto.js';
import { DrumMasterRecord } from '../../types.js';
import { resolveDrumEngineeringFields } from '../../shared/domain/drumMasterService.js';
import {
  classifyDrumExcelRows,
  committableDrumExcelRows,
  summarizeDrumExcelPreview,
  validateApprovedDrumTemplateHeaders,
} from '../../shared/domain/drumMasterExcelImport.js';
import { writeAudit } from '../../shared/infra/legacy-ports.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

function validateDrumGeometry(input: {
  flange: number;
  barrel: number;
  innerWidth: number;
  outerWidth: number;
}) {
  if (input.innerWidth > input.outerWidth) {
    const err = new Error('Inner Width is greater than Outer Width.');
    (err as any).code = 'VALIDATION';
    throw err;
  }
  if (input.barrel >= input.flange) {
    const err = new Error('Barrel is greater than or equal to Flange.');
    (err as any).code = 'VALIDATION';
    throw err;
  }
}

function drumWriteData(drum: any) {
  return {
    drumType: drum.drumType || null,
    description: drum.description || null,
    flange: drum.flange,
    barrel: drum.barrel,
    barrelWidth: drum.barrelWidth ?? null,
    innerWidth: drum.innerWidth,
    outerWidth: drum.outerWidth,
    usableWidth: drum.usableWidth ?? null,
    capacity: drum.capacity,
    maxWeight: drum.maxWeight ?? null,
    clearanceMm: drum.clearanceMm ?? null,
    emptyDrumNetWeightKg: drum.emptyDrumNetWeightKg ?? null,
    capacityUom: 'CONFIGURATION_REQUIRED',
    dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
    status: (drum.status === 'INACTIVE' ? RecordStatus.INACTIVE : RecordStatus.ACTIVE) as RecordStatus,
    sourceBatch: drum.sourceBatch || null,
  };
}

@Injectable()
export class DrumsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listDrums() {
    const rows = await this.prisma.drumMaster.findMany({
      orderBy: { drumCode: 'asc' },
    });
    return rows.map(drumFromRow);
  }

  async getDrum(drumCode: string) {
    const row = await this.prisma.drumMaster.findUnique({
      where: { drumCode },
    });
    return row ? drumFromRow(row) : null;
  }

  async create(input: any, actor: RequestActor) {
    const existing = await this.prisma.drumMaster.findUnique({ where: { drumCode: input.drumCode } });
    if (existing) {
      const err = new Error('Drum code already exists.');
      (err as any).code = 'DUPLICATE_DRUM_CODE';
      throw err;
    }
    validateDrumGeometry(input);
    const engineering = resolveDrumEngineeringFields(input.capacity, {
      clearanceMm: input.clearanceMm,
      maxLoadKg: input.maxWeight,
      emptyDrumNetWeightKg: input.emptyDrumNetWeightKg,
    });
    const drum: any = {
      ...input,
      clearanceMm: engineering.clearanceMm,
      maxWeight: engineering.maxWeight,
      emptyDrumNetWeightKg: engineering.emptyDrumNetWeightKg,
      dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
      capacityUom: 'CONFIGURATION_REQUIRED',
      status: (input.status === 'INACTIVE' ? RecordStatus.INACTIVE : RecordStatus.ACTIVE) as RecordStatus,
    };
    const created = await this.prisma.drumMaster.create({
      data: {
        drumCode: drum.drumCode,
        ...drumWriteData(drum),
      },
    });
    await writeAudit({
      actor,
      entity: 'DrumMaster',
      entityId: drum.drumCode,
      action: 'CREATE',
      newValue: created,
      message: `Drum ${drum.drumCode} created`,
    });
    return drumFromRow(created);
  }

  async update(drumCode: string, input: any, actor: RequestActor) {
    const existing = await this.prisma.drumMaster.findUnique({ where: { drumCode } });
    if (!existing) return null;
    const merged = drumFromRow(existing);
    const next: any = {
      ...merged,
      ...input,
      drumCode,
      flange: input.flange ?? merged.flange,
      barrel: input.barrel ?? merged.barrel,
      innerWidth: input.innerWidth ?? merged.innerWidth,
      outerWidth: input.outerWidth ?? merged.outerWidth,
      capacity: input.capacity ?? merged.capacity,
    };
    validateDrumGeometry(next);
    const engineering = resolveDrumEngineeringFields(next.capacity, {
      clearanceMm: input.clearanceMm !== undefined ? input.clearanceMm : next.clearanceMm,
      maxLoadKg: input.maxWeight !== undefined ? input.maxWeight : next.maxWeight,
      emptyDrumNetWeightKg:
        input.emptyDrumNetWeightKg !== undefined ? input.emptyDrumNetWeightKg : next.emptyDrumNetWeightKg,
    });
    next.clearanceMm = engineering.clearanceMm;
    next.maxWeight = engineering.maxWeight;
    next.emptyDrumNetWeightKg = engineering.emptyDrumNetWeightKg;
    if (input.status) next.status = input.status;
    const updated = await this.prisma.drumMaster.update({
      where: { drumCode },
      data: drumWriteData(next),
    });
    const action =
      existing.status !== updated.status
        ? updated.status === 'INACTIVE'
          ? 'DEACTIVATE'
          : 'ACTIVATE'
        : 'UPDATE';
    await writeAudit({
      actor,
      entity: 'DrumMaster',
      entityId: drumCode,
      action,
      oldValue: existing,
      newValue: updated,
      message: `Drum ${drumCode} updated`,
    });
    return drumFromRow(updated);
  }

  async updateStatus(drumCode: string, status: 'ACTIVE' | 'INACTIVE', actor: RequestActor) {
    return this.update(drumCode, { status }, actor);
  }

  async deactivateOrDelete(drumCode: string, actor: RequestActor) {
    const existing = await this.prisma.drumMaster.findUnique({ where: { drumCode } });
    if (!existing) return null;

    const [planLines, packing, snapshotDrums] = await Promise.all([
      (this.prisma as any).v2DrumPlanLine?.count({
        where: { OR: [{ drumCode }, { drumMasterId: existing.id }] },
      }).catch(() => 0),
      (this.prisma as any).drumPackingProfile?.count({
        where: { OR: [{ drumCode }, { drumMasterId: existing.id }] },
      }).catch(() => 0),
      (this.prisma as any).containerStudyInputDrum?.count({
        where: { OR: [{ drumCode }, { drumMasterId: existing.id }] },
      }).catch(() => 0),
    ]);
    const referenced = (planLines || 0) + (packing || 0) + (snapshotDrums || 0) > 0;
    if (referenced) {
      const drum = await this.updateStatus(drumCode, 'INACTIVE', actor);
      return drum ? { action: 'DEACTIVATED' as const, drum, referenced: true } : null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.drumMaster.delete({ where: { drumCode } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          actorName: actor.name || actor.email,
          entity: 'DrumMaster',
          entityId: drumCode,
          action: 'DEACTIVATE',
          oldValue: existing as any,
          message: `Drum ${drumCode} deleted (unreferenced master record)`,
        },
      });
    });

    return { action: 'DELETED' as const, drum: drumFromRow(existing), referenced: false };
  }

  async previewExcel(rows: Record<string, unknown>[]) {
    const existing = (await this.prisma.drumMaster.findMany({ orderBy: { drumCode: 'asc' } })).map(drumFromRow);
    const headers = validateApprovedDrumTemplateHeaders(rows);
    if (!headers.ok) {
      const err = new Error(
        `Drum Master template is missing required columns: ${headers.missing.join(', ')}.`
      );
      (err as any).code = 'INVALID_TEMPLATE_HEADERS';
      (err as any).missing = headers.missing;
      throw err;
    }
    const previewRows = classifyDrumExcelRows({ rows, existing: existing as any });
    return { rows: previewRows, summary: summarizeDrumExcelPreview(previewRows), existingCount: existing.length };
  }

  async commitExcel(
    rows: Record<string, unknown>[],
    actor: RequestActor,
    sourceFile?: string,
  ) {
    const headers = validateApprovedDrumTemplateHeaders(rows);
    if (!headers.ok) {
      const err = new Error(
        `Drum Master template is missing required columns: ${headers.missing.join(', ')}.`
      );
      (err as any).code = 'INVALID_TEMPLATE_HEADERS';
      (err as any).missing = headers.missing;
      throw err;
    }
    const existingRows = await this.prisma.drumMaster.findMany({ orderBy: { drumCode: 'asc' } });
    const existing = existingRows.map(drumFromRow);
    const batchNumber = `DRUM-XLS-${new Date().toISOString().replace(/[:.]/g, '')}`;
    const previewRows = classifyDrumExcelRows({ rows, existing: existing as any, batchNumber, nowIso: new Date().toISOString() });
    const committable = committableDrumExcelRows(previewRows);
    const created: any[] = [];
    const updated: any[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const row of committable) {
        const uploaded = row.uploaded;
        if (!uploaded) continue;
        validateDrumGeometry(uploaded);
        if (row.status === 'NEW') {
          const createdRow = await tx.drumMaster.create({
            data: { drumCode: uploaded.drumCode, ...drumWriteData(uploaded) },
          });
          await tx.auditEvent.create({
            data: {
              actorId: actor.id,
              actorName: actor.name || actor.email,
              entity: 'DrumMaster',
              entityId: uploaded.drumCode,
              action: 'CREATE',
              newValue: createdRow as any,
              message: `Drum ${uploaded.drumCode} created from Excel${sourceFile ? ` (${sourceFile})` : ''}`,
            },
          });
          created.push(drumFromRow(createdRow));
          continue;
        }
        const updatedRow = await tx.drumMaster.update({
          where: { drumCode: uploaded.drumCode },
          data: drumWriteData(uploaded),
        });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            actorName: actor.name || actor.email,
            entity: 'DrumMaster',
            entityId: uploaded.drumCode,
            action: 'UPDATE',
            oldValue: existingRows.find((item) => item.drumCode === uploaded.drumCode) as any,
            newValue: updatedRow as any,
            message: `Drum ${uploaded.drumCode} updated from Excel${sourceFile ? ` (${sourceFile})` : ''}`,
          },
        });
        updated.push(drumFromRow(updatedRow));
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          actorName: actor.name || actor.email,
          entity: 'DrumMaster',
          entityId: sourceFile || 'drum-excel-import',
          action: 'IMPORT',
          newValue: {
            sourceFile,
            created: created.map((r) => r.drumCode),
            updated: updated.map((r) => r.drumCode),
            unchanged: previewRows.filter((r) => r.status === 'UNCHANGED').map((r) => r.drumCode),
            rejected: previewRows.filter((r) => r.status === 'ERROR').map((r) => r.drumCode),
          } as any,
          message: `Excel import ${sourceFile || 'upload'}: created ${created.length}, updated ${updated.length}, unchanged ${previewRows.filter((r) => r.status === 'UNCHANGED').length}, rejected ${previewRows.filter((r) => r.status === 'ERROR').length}`,
        },
      });
    });

    return {
      rows: previewRows,
      summary: summarizeDrumExcelPreview(previewRows),
      created,
      updated,
    };
  }
}
