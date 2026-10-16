const fs = require('fs');
const path = require('path');

const targetFiles = [
  'src/domain/drumOptimizationService.test.ts',
  'src/services/drumOptimizationService.test.ts',
  'src/domain/drumCapacityCalculator.test.ts',
  'src/domain/customerCableCatalog.test.ts',
  'src/server/customerCableCatalog.test.ts',
  'src/server/increment8.bom.test.ts',
  'src/server/masterData.persistence.test.ts',
  'src/domain/drumMasterService.test.ts',
  'src/services/drumMasterService.test.ts',
  'src/domain/rawMaterialClassification.test.ts',
  'src/server/masterDataApiService.test.ts',
];

function analyzeTestFile(relPath) {
  if (!fs.existsSync(relPath)) {
    return { path: relPath, exists: false };
  }
  const content = fs.readFileSync(relPath, 'utf8');
  const lines = content.split('\n');
  const testCases = [];
  lines.forEach((line, idx) => {
    const match = line.match(/^\s*(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (match) {
      testCases.push({ line: idx + 1, name: match[1] });
    }
  });
  return { path: relPath, exists: true, count: testCases.length, tests: testCases };
}

console.log('=== VERIFYING LEGACY TEST FILES ===');
targetFiles.forEach(f => {
  const res = analyzeTestFile(f);
  if (res.exists) {
    console.log(`\nFile: ${res.path} (Total tests: ${res.count})`);
    res.tests.forEach((t, i) => console.log(`  ${i + 1}. [L${t.line}] ${t.name}`));
  }
});
