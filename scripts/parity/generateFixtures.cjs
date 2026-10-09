const fs = require('fs');

const log = fs.readFileSync('C:/Users/mahmo/.gemini/antigravity-ide/brain/b63e1d4f-f891-4794-bac9-406597961722/.system_generated/tasks/task-682.log', 'utf8');
const routes = [];
let id = 1;

for (const line of log.split('\n')) {
  const match = line.match(/Mapped \{([^,]+), ([^\}]+)\}/);
  if (match) {
    let path = match[1];
    const method = match[2];
    if (path.includes('health') || path.includes('status')) continue; // already in phase0

    // Replace params with dummy values
    path = path.replace(/:id/g, '1')
               .replace(/:materialNumber/g, '123')
               .replace(/:lineId/g, '1')
               .replace(/:roleCode/g, 'ADMIN');

    routes.push({
      id: `endpoint-${id++}`,
      phase: 1,
      method,
      path,
      expectedStatus: 401, 
      ignoreFields: ['timestamp', 'traceId', 'id', 'correlationId']
    });
  }
}

fs.writeFileSync('scripts/parity/fixtures/phase1_all.json', JSON.stringify(routes, null, 2));
console.log(`Generated ${routes.length} fixtures in phase1_all.json`);
