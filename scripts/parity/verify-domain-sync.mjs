import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

// mode 'exact': byte-for-byte copy.
// mode 'specifiers': identical except the `.js` suffix Node ESM needs on relative module paths.
// mode 'imports': identical after removing import statements (module paths and names may differ).
const filesToCheck = [
  { legacy: 'src/domain/drumOptimizationService.ts', target: 'energya-backend/src/shared/domain/drumOptimizationService.ts', mode: 'specifiers' },
  { legacy: 'src/domain/drumCapacityCalculator.ts', target: 'energya-backend/src/shared/domain/drumCapacityCalculator.ts', mode: 'exact' },
  { legacy: 'src/domain/drumOptimizationPresentation.ts', target: 'energya-backend/src/shared/domain/drumOptimizationPresentation.ts', mode: 'exact' },
  { legacy: 'src/domain/customerCableCatalog.ts', target: 'energya-backend/src/shared/domain/customerCableCatalog.ts', mode: 'specifiers' },
  { legacy: 'src/domain/v2AdvancedCableSearch.ts', target: 'energya-backend/src/shared/domain/v2AdvancedCableSearch.ts', mode: 'exact' },
  { legacy: 'src/platform/masterDataSoT.ts', target: 'energya-backend/src/shared/domain/masterDataSoT.ts', mode: 'exact' },
  { legacy: 'src/domain/rawMaterialClassification.ts', target: 'energya-backend/src/shared/domain/rawMaterialClassification.ts', mode: 'imports' },
  { legacy: 'src/server/rbac.ts', target: 'energya-backend/src/shared/domain/rbac.ts', mode: 'imports' },
  { legacy: 'src/server/customerScope.ts', target: 'energya-backend/src/shared/domain/customerScope.ts', mode: 'imports' },
  { legacy: 'src/domain/permissionCatalog.ts', target: 'energya-backend/src/shared/domain/permission-catalog.ts', mode: 'imports' },
  { legacy: 'src/domain/passwordService.ts', target: 'energya-backend/src/shared/domain/password-service.ts', mode: 'imports' },
];

function stripImports(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*\n/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?[ \t]*\n/gm, '');
}

function stripJsSuffix(text) {
  return text.replace(/\r\n/g, '\n').replace(/(from\s+['"]\.{1,2}\/[^'"]+?)\.js(['"])/g, '$1$2');
}

function digest(filePath, mode) {
  const raw = fs.readFileSync(filePath);
  const content =
    mode === 'imports' ? stripImports(raw.toString('utf8')) : mode === 'specifiers' ? stripJsSuffix(raw.toString('utf8')) : raw;
  return crypto.createHash('sha256').update(content).digest('hex');
}

console.log(`Verifying ${filesToCheck.length} domain copies (SHA-256)...`);
let allMatch = true;

for (const pair of filesToCheck) {
  const missing = [pair.legacy, pair.target].filter((p) => !fs.existsSync(p));
  if (missing.length) {
    for (const p of missing) console.error(`MISSING ${p}`);
    allMatch = false;
    continue;
  }
  const hashLegacy = digest(pair.legacy, pair.mode);
  const hashTarget = digest(pair.target, pair.mode);
  const label = `${path.basename(pair.legacy)} [${pair.mode}]`;
  if (hashLegacy === hashTarget) {
    console.log(`SYNC OK  ${label} ${hashLegacy.slice(0, 12)}`);
  } else {
    console.error(`DESYNC   ${label}\n  legacy: ${hashLegacy}\n  target: ${hashTarget}`);
    allMatch = false;
  }
}

if (!allMatch) {
  console.error('\nDomain copies are out of sync.');
  process.exit(1);
}
console.log('All domain copies in sync.');
