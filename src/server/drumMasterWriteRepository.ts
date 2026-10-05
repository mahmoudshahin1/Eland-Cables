/**
 * Drum Master writes for Task 04 SoT cutover (additive; separate from WIP-heavy masterDataRoutes).
 */

import { DrumMasterRecord } from '../types';
import { appendAudit } from '../platform/audit/auditLogService';
import { resolveDrumEngineeringFields } from '../services/drumMasterService';
import {
  classifyDrumExcelRows,
  committableDrumExcelRows,
  summarizeDrumExcelPreview,
  validateApprovedDrumTemplateHeaders,
} from '../domain/drumMasterExcelImport';
import { getPrisma } from './db';
import { drumFromRow } from './masterDataDto';
import { PersistenceUnavailableError } from './masterDataRepository';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new PersistenceUnavailableError();
  return prisma;
}

function jsonSafe(value: unknown) {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as object);
}

function validateDrumGeometry(input: {
  flange: number;
  barrel: number;
  innerWidth: number;
  outerWidth: number;
}) {
  if (input.innerWidth > input.outerWidth) {
    const err = new Error('Inner Width is greater than Outer Width.');
    (err as Error & { code: string }).code = 'VALIDATION';
    throw err;
  }
  if (input.barrel >= input.flange) {
    const err = new Error('Barrel is greater than or equal to Flange.');
    (err as Error & { code: string }).code = 'VALIDATION';
    throw err;
  }
}

function drumWriteData(drum: DrumMasterRecord) {
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
    status: drum.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    sourceBatch: drum.sourceBatch || null,
  } as const;
}

async function writeDrumAudit(
  entry: {
    actorId?: string;
    actorName?: string;
    entityId: string;
    action: 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE' | 'DRUM_CHANGE';
    oldValue?: unknown;
    newValue?: unknown;
    message?: string;
  }
) {
  appendAudit({
    actorId: entry.actorId,
    actorName: entry.actorName,
    entity: 'DrumMaster',
    entityId: entry.entityId,
    action: entry.action,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
  });
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.auditEvent.create({
    data: {
      actorId: entry.actorId,
      actorName: entry.actorName,
      entity: 'DrumMaster',
      entityId: entry.entityId,
      action: entry.action,
      oldValue: jsonSafe(entry.oldValue),
      newValue: jsonSafe(entry.newValue),
      message: entry.message,
    },
  });
}

export async function getDrum(drumCode: string) {
  const prisma = requirePrisma();
  const row = await prisma.drumMaster.findUnique({ where: { drumCode } });
  return row ? drumFromRow(row) : null;
}

export async function createDrum(
  input: DrumMasterRecord,
  actor: { id?: string; name?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.drumMaster.findUnique({ where: { drumCode: input.drumCode } });
  if (existing) {
    const err = new Error('Drum code already exists.');
    (err as Error & { code: string }).code = 'DUPLICATE_DRUM_CODE';
    throw err;
  }
  validateDrumGeometry(input);
  const engineering = resolveDrumEngineeringFields(input.capacity, {
    clearanceMm: input.clearanceMm,
    maxLoadKg: input.maxWeight,
    emptyDrumNetWeightKg: input.emptyDrumNetWeightKg,
  });
  const drum: DrumMasterRecord = {
    ...input,
    clearanceMm: engineering.clearanceMm,
    maxWeight: engineering.maxWeight,
    emptyDrumNetWeightKg: engineering.emptyDrumNetWeightKg,
    dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
    capacityUom: 'CONFIGURATION_REQUIRED',
    status: input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
  const created = await prisma.drumMaster.create({
    data: {
      drumCode: drum.drumCode,
      ...drumWriteData(drum),
    },
  });
  await writeDrumAudit({
    actorId: actor.id,
    actorName: actor.name,
    entityId: drum.drumCode,
    action: 'CREATE',
    newValue: created,
    message: `Drum ${drum.drumCode} created`,
  });
  return drumFromRow(created);
}

export async function updateDrum(
  drumCode: string,
  input: Partial<DrumMasterRecord> & { status?: 'ACTIVE' | 'INACTIVE' },
  actor: { id?: string; name?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.drumMaster.findUnique({ where: { drumCode } });
  if (!existing) return null;
  const merged = drumFromRow(existing);
  const next: DrumMasterRecord = {
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
  const updated = await prisma.drumMaster.update({
    where: { drumCode },
    data: drumWriteData(next),
  });
  const action =
    existing.status !== updated.status
      ? updated.status === 'INACTIVE'
        ? 'DEACTIVATE'
        : 'ACTIVATE'
      : 'UPDATE';
  await writeDrumAudit({
    actorId: actor.id,
    actorName: actor.name,
    entityId: drumCode,
    action,
    oldValue: existing,
    newValue: updated,
    message: `Drum ${drumCode} updated`,
  });
  return drumFromRow(updated);
}

export async function updateDrumStatus(
  drumCode: string,
  status: 'ACTIVE' | 'INACTIVE',
  actor: { id?: string; name?: string }
) {
  return updateDrum(drumCode, { status }, actor);
}

export async function previewDrumExcel(rows: Record<string, unknown>[]) {
  const prisma = requirePrisma();
  const existing = (await prisma.drumMaster.findMany({ orderBy: { drumCode: 'asc' } })).map(drumFromRow);
  const headers = validateApprovedDrumTemplateHeaders(rows);
  if (!headers.ok) {
    const err = new Error(
      `Drum Master template is missing required columns: ${headers.missing.join(', ')}.`
    );
    (err as Error & { code: string; missing: string[] }).code = 'INVALID_TEMPLATE_HEADERS';
    (err as Error & { missing: string[] }).missing = headers.missing;
    throw err;
  }
  const previewRows = classifyDrumExcelRows({ rows, existing });
  return { rows: previewRows, summary: summarizeDrumExcelPreview(previewRows), existingCount: existing.length };
}

export async function commitDrumExcel(
  rows: Record<string, unknown>[],
  actor: { id?: string; name?: string; email?: string },
  sourceFile?: string
) {
  const prisma = requirePrisma();
  const headers = validateApprovedDrumTemplateHeaders(rows);
  if (!headers.ok) {
    const err = new Error(
      `Drum Master template is missing required columns: ${headers.missing.join(', ')}.`
    );
    (err as Error & { code: string; missing: string[] }).code = 'INVALID_TEMPLATE_HEADERS';
    (err as Error & { missing: string[] }).missing = headers.missing;
    throw err;
  }
  const existingRows = await prisma.drumMaster.findMany({ orderBy: { drumCode: 'asc' } });
  const existing = existingRows.map(drumFromRow);
  const batchNumber = `DRUM-XLS-${new Date().toISOString().replace(/[:.]/g, '')}`;
  const previewRows = classifyDrumExcelRows({ rows, existing, batchNumber, nowIso: new Date().toISOString() });
  const committable = committableDrumExcelRows(previewRows);
  const created: DrumMasterRecord[] = [];
  const updated: DrumMasterRecord[] = [];
  await prisma.$transaction(async (tx) => {
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
            newValue: jsonSafe(createdRow),
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
          oldValue: jsonSafe(existingRows.find((item) => item.drumCode === uploaded.drumCode)),
          newValue: jsonSafe(updatedRow),
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
        newValue: jsonSafe({
          sourceFile,
          created: created.map((row) => row.drumCode),
          updated: updated.map((row) => row.drumCode),
          unchanged: previewRows.filter((row) => row.status === 'UNCHANGED').map((row) => row.drumCode),
          rejected: previewRows.filter((row) => row.status === 'ERROR').map((row) => row.drumCode),
        }),
        message: `Excel import ${sourceFile || 'upload'}: created ${created.length}, updated ${updated.length}, unchanged ${previewRows.filter((r) => r.status === 'UNCHANGED').length}, rejected ${previewRows.filter((r) => r.status === 'ERROR').length}`,
      },
    });
  });
  for (const row of [...created, ...updated]) {
    appendAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'DrumMaster',
      entityId: row.drumCode,
      action: created.some((item) => item.drumCode === row.drumCode) ? 'CREATE' : 'UPDATE',
      newValue: row,
    });
  }
  return {
    rows: previewRows,
    summary: summarizeDrumExcelPreview(previewRows),
    created,
    updated,
  };
}

export async function deactivateOrDeleteDrum(
  drumCode: string,
  actor: { id?: string; name?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.drumMaster.findUnique({ where: { drumCode } });
  if (!existing) return null;
  const [planLines, packing, snapshotDrums] = await Promise.all([
    prisma.v2DrumPlanLine.count({
      where: { OR: [{ drumCode }, { drumMasterId: existing.id }] },
    }),
    prisma.drumPackingProfile.count({
      where: { OR: [{ drumCode }, { drumMasterId: existing.id }] },
    }),
    prisma.containerStudyInputDrum.count({
      where: { OR: [{ drumCode }, { drumMasterId: existing.id }] },
    }),
  ]);
  const referenced = planLines + packing + snapshotDrums > 0;
  if (referenced) {
    const drum = await updateDrumStatus(drumCode, 'INACTIVE', actor);
    return drum ? { action: 'DEACTIVATED' as const, drum, referenced: true } : null;
  }
  await prisma.$transaction(async (tx) => {
    await tx.drumMaster.delete({ where: { drumCode } });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        entity: 'DrumMaster',
        entityId: drumCode,
        action: 'DEACTIVATE',
        oldValue: jsonSafe(existing),
        message: `Drum ${drumCode} deleted (unreferenced master record)`,
      },
    });
  });
  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    entity: 'DrumMaster',
    entityId: drumCode,
    action: 'DEACTIVATE',
    oldValue: existing,
  });
  return { action: 'DELETED' as const, drum: drumFromRow(existing), referenced: false };
}
