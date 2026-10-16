const fs = require('fs');
const content = fs.readFileSync('src/server/masterDataRoutes.ts', 'utf8');
const lines = content.split('\n');

const results = [];
let currentRoute = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const routeMatch = line.match(/(masterDataRouter|platformDbRouter)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/);
  if (routeMatch) {
    currentRoute = {
      lineNum: i + 1,
      router: routeMatch[1],
      method: routeMatch[2].toUpperCase(),
      path: routeMatch[3]
    };
  }
  if (line.includes('requireMasterReadAuth') || line.includes('requireSignedIn') || line.includes('requireDrumComputeAuth') || line.includes('requireWriteAuth') || line.includes('requireImportAuth') || line.includes('requireBomRmAuth')) {
    results.push({
      authLine: i + 1,
      authCall: line.trim(),
      route: currentRoute
    });
  }
}

console.log(JSON.stringify(results, null, 2));
