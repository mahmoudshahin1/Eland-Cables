/**
 * One-shot official workbook import into PostgreSQL.
 * Does not modify the Excel files. Does not invent prices, dates, or BOM weights.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { commitKind, memoryImportStores, sheetToObjects } from '../src/services/importPipelineService';
import { listCables, listRawMaterials, persistImportTransaction } from '../src/server/masterDataRepository';
import { disconnectPrisma } from '../src/server/db';

dotenv.config();

function load(path: string) {
  return XLSX.read(fs.readFileSync(path), { type: 'buffer' });
}

async function main() {
  const actor = { id: 'u-admin-1', name: 'increment4-onboarding' };
  const rmWb = load('data/source/Raw Material List.xlsx');
  const cableWb = load('data/source/Energya Cable Master Data.xlsx');
  const rmRows = sheetToObjects(rmWb);
  const cableRows = sheetToObjects(cableWb, 'Cable List');
  const bomRows = sheetToObjects(cableWb, 'Cable Materials');

  const rm = commitKind('raw_materials', rmRows, 'Raw Material List.xlsx', actor.name, {
    persist: false,
    stores: memoryImportStores(),
  });
  console.log('RM preview', rm.batch.status, 'valid', rm.rawMaterials?.length, 'err', rm.batch.errorCount, 'warn', rm.batch.warningCount);
  if (rm.batch.errorCount) {
    console.log(rm.batch.errors.slice(0, 5));
    process.exit(1);
  }
  await persistImportTransaction({
    kind: 'raw_materials',
    batch: { ...rm.batch, status: 'COMMITTED', successCount: rm.rawMaterials?.length || 0 },
    rawMaterials: rm.rawMaterials,
    actor,
  });

  const cables = commitKind('cables', cableRows, 'Energya Cable Master Data.xlsx (Cable List)', actor.name, {
    persist: false,
    stores: memoryImportStores(),
  });
  console.log(
    'CABLES preview',
    cables.batch.status,
    'valid',
    cables.cables?.length,
    'err',
    cables.batch.errorCount,
    'warn',
    cables.batch.warningCount,
    'info',
    cables.batch.information?.length
  );
  if (cables.batch.errorCount) {
    console.log(cables.batch.errors.slice(0, 8));
    process.exit(1);
  }
  await persistImportTransaction({
    kind: 'cables',
    batch: { ...cables.batch, status: 'COMMITTED', successCount: cables.cables?.length || 0 },
    cables: cables.cables,
    actor,
  });

  const pgCables = await listCables();
  const pgRms = await listRawMaterials();
  const boms = commitKind('boms', bomRows, 'Energya Cable Master Data.xlsx (Cable Materials)', actor.name, {
    persist: false,
    stores: memoryImportStores({ cables: pgCables, rawMaterials: pgRms }),
    enforceForeignKeys: true,
    sourceWorksheet: 'Cable Materials',
  });
  console.log(
    'BOMS preview',
    boms.batch.status,
    'valid',
    boms.boms?.length,
    'err',
    boms.batch.errorCount,
    'skipped',
    boms.batch.skippedCount,
    'dupGroups',
    boms.duplicateObservations?.length
  );
  if (boms.batch.errorCount) {
    console.log(boms.batch.errors.slice(0, 8));
    process.exit(1);
  }
  await persistImportTransaction({
    kind: 'boms',
    batch: { ...boms.batch, status: 'COMMITTED', successCount: boms.boms?.length || 0 },
    boms: boms.boms,
    duplicateObservations: boms.duplicateObservations,
    actor,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
