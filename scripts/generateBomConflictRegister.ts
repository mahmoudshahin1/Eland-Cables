/**
 * Task 04B-13 — regenerate machine-readable BOM conflict register from PostgreSQL.
 * Usage: npx tsx scripts/generateBomConflictRegister.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  buildBomConflictGovernanceRegister,
  summarizeGovernanceRegister,
} from '../src/server/bomConflictGovernanceService';
import { disconnectPrisma } from '../src/server/db';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'data', 'governance');

function toCsv(register: Awaited<ReturnType<typeof buildBomConflictGovernanceRegister>>): string {
  const headers = [
    'conflictId',
    'cableMaterialNumber',
    'rawMaterialCode',
    'weightA',
    'weightB',
    'relativeDelta',
    'uom',
    'occurrenceCount',
    'investigationStatus',
    'classificationLetter',
    'classification',
    'disposition',
    'costingImpact',
    'sourceCableBomLineCount',
  ];
  const lines = register.conflicts.map((r) =>
    [
      r.conflictId,
      r.cableMaterialNumber,
      r.rawMaterialCode,
      r.weightA,
      r.weightB,
      r.relativeDelta ?? '',
      r.uom,
      r.occurrenceCount,
      r.investigationStatus,
      r.classificationLetter,
      r.classification,
      r.disposition,
      r.costingImpact,
      r.sourceCableBomLineCount,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

async function main() {
  const register = await buildBomConflictGovernanceRegister({ generatedBy: 'scripts/generateBomConflictRegister.ts' });
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'bom-conflict-register.json');
  const csvPath = join(outDir, 'bom-conflict-register.csv');
  writeFileSync(jsonPath, `${JSON.stringify(register, null, 2)}\n`, 'utf8');
  writeFileSync(csvPath, `${toCsv(register)}\n`, 'utf8');
  const summary = summarizeGovernanceRegister(register);
  console.log(JSON.stringify({ jsonPath, csvPath, summary }, null, 2));
  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
