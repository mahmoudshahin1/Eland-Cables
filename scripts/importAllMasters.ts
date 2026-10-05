/**
 * Import all official master workbooks into PostgreSQL.
 * Order: Raw Materials → Cables → BOMs → Drums.
 * Does not modify source xlsx files. Does not invent prices.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { commitKind, memoryImportStores, sheetToObjects } from '../src/services/importPipelineService';
import {
  listCables,
  listDrums,
  listRawMaterials,
  masterDataReadiness,
  persistImportTransaction,
} from '../src/server/masterDataRepository';
import { disconnectPrisma } from '../src/server/db';

dotenv.config();

function load(path: string) {
  return XLSX.read(fs.readFileSync(path), { type: 'buffer' });
}

function logResult(label: string, result: Awaited<ReturnType<typeof commitKind>>) {
  const b = result.batch;
  console.log(
    JSON.stringify({
      label,
      status: b.status,
      valid: b.successCount,
      errors: b.errorCount,
      warnings: b.warningCount,
      skipped: b.skippedCount,
      duplicates: result.duplicateObservations?.length ?? 0,
      sampleErrors: b.errors.slice(0, 5),
      sampleWarnings: b.warnings?.slice(0, 3),
    })
  );
}

async function main() {
  const actor = { id: 'u-admin-1', name: 'master-data-import' };

  // 1. Raw Materials
  const rmWb = load('data/source/Raw Material List.xlsx');
  const rmRows = sheetToObjects(rmWb);
  const rm = commitKind('raw_materials', rmRows, 'Raw Material List.xlsx', actor.name, {
    persist: false,
    stores: memoryImportStores(),
  });
  logResult('RAW_MATERIAL', rm);
  if (rm.batch.errorCount) process.exit(1);
  await persistImportTransaction({
    kind: 'raw_materials',
    batch: { ...rm.batch, status: 'COMMITTED', successCount: rm.rawMaterials?.length || 0 },
    rawMaterials: rm.rawMaterials,
    actor,
  });

  // 2. Cables
  const cableWb = load('data/source/Energya Cable Master Data.xlsx');
  const cableRows = sheetToObjects(cableWb, 'Cable List');
  const cables = commitKind('cables', cableRows, 'Energya Cable Master Data.xlsx (Cable List)', actor.name, {
    persist: false,
    stores: memoryImportStores(),
  });
  logResult('CABLE', cables);
  if (cables.batch.errorCount) process.exit(1);
  await persistImportTransaction({
    kind: 'cables',
    batch: { ...cables.batch, status: 'COMMITTED', successCount: cables.cables?.length || 0 },
    cables: cables.cables,
    actor,
  });

  const { applyCableMasterFamilyOverlay } = await import('../src/services/cableMasterFamilyOverlay');
  const { getPrisma } = await import('../src/server/db');
  const prisma = getPrisma();
  if (!prisma) throw new Error('DATABASE_URL is not set');
  const familyOverlay = await applyCableMasterFamilyOverlay(prisma);
  console.log(JSON.stringify({ label: 'CABLE_FAMILY_OVERLAY', ...familyOverlay }));

  // 3. BOMs
  const bomRows = sheetToObjects(cableWb, 'Cable Materials');
  const pgCables = await listCables();
  const pgRms = await listRawMaterials();
  const boms = commitKind('boms', bomRows, 'Energya Cable Master Data.xlsx (Cable Materials)', actor.name, {
    persist: false,
    stores: memoryImportStores({ cables: pgCables, rawMaterials: pgRms }),
    enforceForeignKeys: true,
    sourceWorksheet: 'Cable Materials',
  });
  logResult('BOM', boms);
  if (boms.batch.errorCount) process.exit(1);
  await persistImportTransaction({
    kind: 'boms',
    batch: { ...boms.batch, status: 'COMMITTED', successCount: boms.boms?.length || 0 },
    boms: boms.boms,
    duplicateObservations: boms.duplicateObservations,
    actor,
  });

  // 4. Drums
  const drumWb = load('data/source/Drum List.xlsx');
  const drumRows = sheetToObjects(drumWb);
  const drums = commitKind('drums', drumRows, 'Drum List.xlsx', actor.name, {
    persist: false,
    stores: memoryImportStores(),
  });
  logResult('DRUM', drums);
  if (drums.batch.errorCount) process.exit(1);
  await persistImportTransaction({
    kind: 'drums',
    batch: { ...drums.batch, status: 'COMMITTED', successCount: drums.drums?.length || 0 },
    drums: drums.drums,
    actor,
  });

  const readiness = await masterDataReadiness();
  const drumCount = (await listDrums()).length;
  console.log('READINESS', JSON.stringify({ ...readiness, drums: drumCount }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
