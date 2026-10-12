import fs from 'fs';
import path from 'path';

const endpoints = [
  '/api/auth',
  '/api/admin/users',
  '/api/admin/roles',
  '/api/admin/permissions',
  '/api/admin/security',
  '/api/admin/customers',
  '/api/admin/customer-users',
  '/api/admin/customer-reference-masters'
];

function isPhase1Auth(url) {
  return endpoints.some(ep => url.startsWith(ep));
}

const all = JSON.parse(fs.readFileSync(path.resolve('scripts/parity/fixtures/phase1_all.json'), 'utf8'));

const filtered = all.filter(f => isPhase1Auth(f.path));

const newFixtures = [];
let idCounter = 1;

for (const f of filtered) {
  // We skip fixtures that already have a token or specific id?
  // 1. NO TOKEN
  newFixtures.push({
    ...f,
    id: `P1_AUTH_${idCounter++}_NO_TOKEN`,
    headers: { ...f.headers }
  });

  // 2. INVALID ROLE (403)
  newFixtures.push({
    ...f,
    id: `P1_AUTH_${idCounter++}_LIMITED`,
    headers: { ...f.headers, 'x-parity-user': 'limited@parity.test' }
  });

  // 3. VALID ROLE
  newFixtures.push({
    ...f,
    id: `P1_AUTH_${idCounter++}_ADMIN`,
    headers: { ...f.headers, 'x-parity-user': 'admin@parity.test' }
  });
}

// Special Scenarios
newFixtures.push({
  id: 'P1_SCENARIO_LOGIN_LOCK',
  phase: 1,
  method: 'POST',
  path: '/api/auth/login',
  body: { email: 'admin@parity.test', password: 'wrong' },
  headers: {}
});
newFixtures.push({
  id: 'P1_SCENARIO_CUSTOMER_A',
  phase: 1,
  method: 'GET',
  path: '/api/auth/me',
  headers: { 'x-parity-user': 'custA@parity.test' }
});
newFixtures.push({
  id: 'P1_SCENARIO_CUSTOMER_B',
  phase: 1,
  method: 'GET',
  path: '/api/auth/me',
  headers: { 'x-parity-user': 'custB@parity.test' }
});

fs.writeFileSync(path.resolve('scripts/parity/fixtures/phase1_auth.json'), JSON.stringify(newFixtures, null, 2));
console.log(`Generated ${newFixtures.length} auth fixtures.`);
