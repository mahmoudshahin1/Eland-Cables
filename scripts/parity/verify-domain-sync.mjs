import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

function getHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

const filesToCheck = [
  {
    legacy: 'src/domain/drumOptimizationService.ts',
    target: 'energya-backend/src/shared/domain/drumOptimizationService.ts',
  },
  {
    legacy: 'src/domain/drumCapacityCalculator.ts',
    target: 'energya-backend/src/shared/domain/drumCapacityCalculator.ts',
  },
  {
    legacy: 'src/domain/drumOptimizationPresentation.ts',
    target: 'energya-backend/src/shared/domain/drumOptimizationPresentation.ts',
  },
];

console.log('🔍 Verifying Domain Copies Synchronization (SHA-256 Check)...');
let allMatch = true;

for (const pair of filesToCheck) {
  if (!fs.existsSync(pair.legacy)) {
    console.error(`❌ Legacy file missing: ${pair.legacy}`);
    allMatch = false;
    continue;
  }
  if (!fs.existsSync(pair.target)) {
    console.error(`❌ Target file missing: ${pair.target}`);
    allMatch = false;
    continue;
  }

  const hashLegacy = getHash(pair.legacy);
  const hashTarget = getHash(pair.target);

  if (hashLegacy === hashTarget) {
    console.log(`✅ [SYNC OK] ${path.basename(pair.legacy)} (SHA256: ${hashLegacy.slice(0, 12)}...)`);
  } else {
    console.error(`❌ [DESYNC ERROR] ${path.basename(pair.legacy)} mismatch!`);
    console.error(`   Legacy: ${hashLegacy}`);
    console.error(`   Target: ${hashTarget}`);
    allMatch = false;
  }
}

if (!allMatch) {
  console.error('\n🚨 Domain copies are out of sync! Aborting verification.');
  process.exit(1);
} else {
  console.log('✨ All domain copies are 100% byte-for-byte identical.\n');
  process.exit(0);
}
