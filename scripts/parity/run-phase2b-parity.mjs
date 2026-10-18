// Phase 2b parity: legacy Express (:3847, energya_legacy) vs NestJS (:3000, energya_nest).
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { seedAuthDatabases } from './seed-auth.mjs';
import { seedMasterDataDatabases } from './seed-master-data.mjs';
import { normalizePayload, deepEqual } from './parityHarness.mjs';

const legacyBase = process.env.LEGACY_URL || 'http://127.0.0.1:3847';
const targetBase = process.env.TARGET_URL || 'http://127.0.0.1:3000';
const RESULTS_PATH = 'docs/MIGRATION/phase-2b/parity_results.json';
const PASSWORD = process.env.PARITY_PASSWORD || 'Password123!';
const MAT = '10009487';
const DRUM = 'EWD630-0';

const spawned = [];

async function isServerHealthy(url) {
  try {
    const res = await fetch(`${url}/api/platform/health`, { signal: AbortSignal.timeout(1500) });
    return res.status === 200;
  } catch {
    return false;
  }
}

function startServer(label, args, cwd, port, db) {
  console.log(`Starting ${label} on :${port} (${db})...`);
  const child = spawn('npx', args, {
    cwd,
    shell: true,
    env: { ...process.env, PORT: String(port), DATABASE_URL: `postgresql://energya:energya_dev@127.0.0.1:5432/${db}?schema=public` },
    stdio: 'inherit',
  });
  spawned.push(child);
}

async function ensureServersRunning() {
  if (!(await isServerHealthy(legacyBase))) startServer('legacy', ['tsx', 'server.ts'], '.', 3847, 'energya_legacy');
  if (!(await isServerHealthy(targetBase))) startServer('nest', ['tsx', 'src/main.ts'], 'energya-backend', 3000, 'energya_nest');
  const deadline = Date.now() + Number(process.env.PARITY_BOOT_TIMEOUT_MS || 300_000);
  while (Date.now() < deadline) {
    const [l, t] = await Promise.all([isServerHealthy(legacyBase), isServerHealthy(targetBase)]);
    if (l && t) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for servers to start');
}

function stopSpawned() {
  for (const child of spawned) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  }
}

const PERSONAS = {
  admin: 'admin@energya.com',
  writer: 'writer@parity.test',
  granular: 'granular@parity.test',
  limited: 'limited@parity.test',
  customer: 'custA@parity.test',
};

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}

async function send(base, path, { method, token, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const buf = Buffer.from(await res.arrayBuffer());
    let json;
    try {
      json = JSON.parse(buf.toString('utf8'));
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, buf, json, servedBy: res.headers.get('x-served-by') };
  } catch (err) {
    return { status: 0, headers: new Headers(), buf: Buffer.alloc(0), json: undefined, fetchError: err.message };
  }
}

const results = [];
const tokens = {};

function record(entry) {
  results.push(entry);
  const mark = entry.ok ? 'PASS' : 'FAIL';
  console.log(`  ${mark} ${entry.name} [legacy ${entry.legacyStatus} / nest ${entry.nestStatus}${entry.expected ? ` / expected ${entry.expected}` : ''}]${entry.reason ? ` ${entry.reason}` : ''}`);
  if (!entry.ok && entry.legacyBody !== undefined) {
    console.log(`       legacy: ${JSON.stringify(entry.legacyBody)?.slice(0, 300)}`);
    console.log(`       nest:   ${JSON.stringify(entry.nestBody)?.slice(0, 300)}`);
  }
  return entry;
}

async function check(name, path, opts = {}) {
  const method = opts.method || 'GET';
  const persona = opts.persona || 'anon';
  const tk = tokens[persona] || {};
  const [legacy, nest] = await Promise.all([
    send(legacyBase, opts.legacyPath || path, { method, token: tk.legacy, body: opts.body }),
    send(targetBase, opts.nestPath || path, { method, token: tk.nest, body: opts.body }),
  ]);

  const reasons = [];
  if (legacy.fetchError || nest.fetchError) reasons.push(`fetch error: ${legacy.fetchError || nest.fetchError}`);
  if (legacy.status !== nest.status) reasons.push(`status differs: legacy ${legacy.status} vs nest ${nest.status}`);
  if (opts.expected !== undefined && legacy.status !== opts.expected) reasons.push('legacy status is not the expected one');

  let legacyBody;
  let nestBody;
  if (!opts.statusOnly) {
    const isJson = legacy.json !== undefined || nest.json !== undefined;
    if (opts.binary && legacy.status === 200) {
      if (Buffer.compare(legacy.buf, nest.buf) !== 0) reasons.push(`bytes differ (${legacy.buf.length} vs ${nest.buf.length})`);
    } else if (isJson) {
      legacyBody = canonical(normalizePayload(legacy.json));
      nestBody = canonical(normalizePayload(nest.json));
      if (JSON.stringify(legacyBody) !== JSON.stringify(nestBody)) {
        reasons.push(deepEqual(legacyBody, nestBody) ? 'array order differs' : 'body differs');
      }
    } else if (Buffer.compare(legacy.buf, nest.buf) !== 0) {
      reasons.push('non-JSON body differs');
    }
  }

  record({
    name,
    method,
    path,
    persona,
    expected: opts.expected,
    legacyStatus: legacy.status,
    nestStatus: nest.status,
    ok: reasons.length === 0,
    reason: reasons.join('; '),
    legacyBody: reasons.length ? legacyBody : undefined,
    nestBody: reasons.length ? nestBody : undefined,
  });
  return { legacy, nest };
}

async function login(persona) {
  const body = { email: PERSONAS[persona], password: PASSWORD };
  const [l, n] = await Promise.all([
    send(legacyBase, '/api/auth/login', { method: 'POST', body }),
    send(targetBase, '/api/auth/login', { method: 'POST', body }),
  ]);
  const legacy = l.json?.accessToken;
  const nest = n.json?.accessToken;
  if (!legacy || !nest) throw new Error(`Login failed for ${persona}: legacy ${l.status}, nest ${n.status}`);
  tokens[persona] = { legacy, nest };
}

async function run() {
  console.log('--- Phase 2b Parity Suite ---');
  await ensureServersRunning();

  console.log('Seeding databases...');
  await seedAuthDatabases();
  await seedMasterDataDatabases();

  console.log('Logging in personas...');
  for (const p of Object.keys(PERSONAS)) {
    await login(p);
  }

  console.log('\n--- 1. Cables Mutations ---');
  await check('POST cables (anon)', '/api/master/cables', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST cables (limited 403)', '/api/master/cables', { method: 'POST', persona: 'limited', expected: 403, body: { cableCode: MAT } });
  await check('POST cables duplicate (admin 409)', '/api/master/cables', { method: 'POST', persona: 'admin', expected: 409, body: { cableCode: MAT, itemCode: 'IC', customerCode: 'CC', description: 'Desc', outerDiameterMm: 10, approxWeightKgKm: 100 } });
  await check('PUT cables (anon)', `/api/master/cables/${MAT}`, { method: 'PUT', persona: 'anon', expected: 401 });
  await check('PUT cables (limited 403)', `/api/master/cables/${MAT}`, { method: 'PUT', persona: 'limited', expected: 403, body: { description: 'Updated' } });
  await check('PUT cables (admin 200)', `/api/master/cables/${MAT}`, { method: 'PUT', persona: 'admin', expected: 200, body: { description: 'Updated Cable Description' } });

  console.log('\n--- 2. Raw Materials Mutations ---');
  await check('POST raw-materials (anon)', '/api/master/raw-materials', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST raw-materials (limited 403)', '/api/master/raw-materials', { method: 'POST', persona: 'limited', expected: 403, body: { code: 'CR01' } });
  await check('POST raw-materials validation (admin 400)', '/api/master/raw-materials', { method: 'POST', persona: 'admin', expected: 400, body: {} });
  await check('PUT raw-materials (anon)', '/api/master/raw-materials/CR01', { method: 'PUT', persona: 'anon', expected: 401 });
  await check('PUT raw-materials (limited 403)', '/api/master/raw-materials/CR01', { method: 'PUT', persona: 'limited', expected: 403, body: { description: 'CR01 Updated' } });
  await check('PUT raw-materials (admin 200)', '/api/master/raw-materials/CR01', { method: 'PUT', persona: 'admin', expected: 200, body: { description: 'CR01 Updated Desc' } });
  await check('POST raw-materials price blank (admin 400)', '/api/master/raw-materials/CR01/prices', { method: 'POST', persona: 'admin', expected: 400, body: { price: '' } });

  console.log('\n--- 3. Drums Mutations & Import ---');
  await check('POST drums (anon)', '/api/master/drums', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST drums (limited 403)', '/api/master/drums', { method: 'POST', persona: 'limited', expected: 403, body: { drumCode: 'TEST' } });
  await check('PUT drums (anon)', `/api/master/drums/${DRUM}`, { method: 'PUT', persona: 'anon', expected: 401 });
  await check('PUT drums (limited 403)', `/api/master/drums/${DRUM}`, { method: 'PUT', persona: 'limited', expected: 403, body: { flange: 700 } });
  await check('DELETE drums (anon)', `/api/master/drums/${DRUM}`, { method: 'DELETE', persona: 'anon', expected: 401 });
  await check('POST drums/excel-preview (anon)', '/api/master/drums/excel-preview', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST drums/excel-commit (anon)', '/api/master/drums/excel-commit', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST drums/excel-preview empty (admin 400)', '/api/master/drums/excel-preview', { method: 'POST', persona: 'admin', expected: 400, body: { rows: [] } });
  const validDrumRow = {
    'Drum Code': 'DRUM-PREV-01',
    'Flange': 630,
    'Barrel': 300,
    'Inner Width': 600,
    'Outer Width': 760,
    'Capacity': 650,
    'Clearance Mm': 50,
    'Max Load Kg': 2000,
    'Empty Drum Net Weight Kg': 100,
    'Description': 'Test Preview Drum',
  };
  await check('POST drums/excel-preview (admin 200)', '/api/master/drums/excel-preview', { method: 'POST', persona: 'admin', expected: 200, body: { rows: [validDrumRow] } });

  console.log('\n--- 4. BOMs Method-B Excel Commit ---');
  await check('POST boms/excel-commit (anon)', '/api/master/boms/excel-commit', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST boms/excel-commit (limited 403)', '/api/master/boms/excel-commit', { method: 'POST', persona: 'limited', expected: 403, body: {} });
  await check('POST boms/excel-commit (admin 400)', '/api/master/boms/excel-commit', { method: 'POST', persona: 'admin', expected: 400, body: {} });

  console.log('\n--- 5. Market Metals ---');
  await check('GET market-metals/imports (anon)', '/api/master/market-metals/imports', { persona: 'anon', expected: 401 });
  await check('GET market-metals/imports (admin 200)', '/api/master/market-metals/imports', { persona: 'admin', expected: 200 });
  await check('POST market-metals/imports (anon)', '/api/master/market-metals/imports', { method: 'POST', persona: 'anon', expected: 401 });
  await check('GET market-metals/imports/missing (admin 404)', '/api/master/market-metals/imports/missing-id', { persona: 'admin', expected: 404 });
  await check('GET market-metals/imports/missing/image (admin 404)', '/api/master/market-metals/imports/missing-id/image', { persona: 'admin', expected: 404 });
  await check('POST market-metals/imports/missing/approve (admin 404)', '/api/master/market-metals/imports/missing-id/approve', { method: 'POST', persona: 'admin', expected: 404 });
  await check('POST market-metals/imports/missing/publish (admin 404)', '/api/master/market-metals/imports/missing-id/publish', { method: 'POST', persona: 'admin', expected: 404 });
  await check('PATCH market-metals/imports/missing/rows/CU (admin 404)', '/api/master/market-metals/imports/missing-id/rows/CU', { method: 'PATCH', persona: 'admin', expected: 404, body: { manualValue: 9500 } });

  console.log('\n--- 6. Exports ---');
  await check('GET export/cables (anon)', '/api/master/export/cables', { persona: 'anon', expected: 401 });
  await check('GET export/cables (limited 403)', '/api/master/export/cables', { persona: 'limited', expected: 403 });
  await check('GET export/cables (admin 200 binary)', '/api/master/export/cables', { persona: 'admin', expected: 200, statusOnly: true });
  await check('GET export/drums (admin 200 binary)', '/api/master/export/drums', { persona: 'admin', expected: 200, statusOnly: true });
  await check('GET export/raw-materials (admin 200 binary)', '/api/master/export/raw-materials', { persona: 'admin', expected: 200, statusOnly: true });
  await check('GET cable-scrap-template-export (anon)', '/api/master/cable-scrap-template-export', { persona: 'anon', expected: 403 });
  await check('GET cable-scrap-template-export (admin 200 binary)', '/api/master/cable-scrap-template-export', { persona: 'admin', expected: 200, statusOnly: true });
  await check('GET raw-material-prices-export (anon)', '/api/master/raw-material-prices-export', { persona: 'anon', expected: 403 });
  await check('GET raw-material-prices-export (admin 200 binary)', '/api/master/raw-material-prices-export', { persona: 'admin', expected: 200, statusOnly: true });
  await check('GET engineering-mappings-export (anon)', '/api/master/engineering-mappings-export', { persona: 'anon', expected: 403 });
  await check('GET engineering-mappings-export (admin 200 binary)', '/api/master/engineering-mappings-export', { persona: 'admin', expected: 200, statusOnly: true });
  await check('GET bom-conflicts-export (anon)', '/api/master/bom-conflicts-export', { persona: 'anon', expected: 403 });
  await check('GET bom-conflicts-export (admin 200 binary)', '/api/master/bom-conflicts-export', { persona: 'admin', expected: 200, statusOnly: true });
  await check('GET commercial-pricing-rules/export (anon)', '/api/master/commercial-pricing-rules/export', { persona: 'anon', expected: 403 });
  await check('GET commercial-pricing-rules/export (admin 200 binary)', '/api/master/commercial-pricing-rules/export', { persona: 'admin', expected: 200, statusOnly: true });

  console.log('\n--- 7. General & Specialized Imports ---');
  await check('GET imports (anon)', '/api/master/imports', { persona: 'anon', expected: 401 });
  await check('GET imports (admin 200)', '/api/master/imports', { persona: 'admin', expected: 200 });
  await check('POST imports/preview (anon)', '/api/master/imports/preview', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST imports/preview invalid (admin 400)', '/api/master/imports/preview', { method: 'POST', persona: 'admin', expected: 400, body: {} });
  await check('POST imports/commit (anon)', '/api/master/imports/commit', { method: 'POST', persona: 'anon', expected: 401 });
  await check('POST imports/commit invalid (admin 400)', '/api/master/imports/commit', { method: 'POST', persona: 'admin', expected: 400, body: {} });
  await check('POST cable-scrap-import/preview (anon)', '/api/master/cable-scrap-import/preview', { method: 'POST', persona: 'anon', expected: 403 });
  await check('POST cable-scrap-import/preview empty (admin 400)', '/api/master/cable-scrap-import/preview', { method: 'POST', persona: 'admin', expected: 400, body: { rows: [] } });
  await check('POST cable-scrap-import/commit (anon)', '/api/master/cable-scrap-import/commit', { method: 'POST', persona: 'anon', expected: 403 });
  await check('POST cable-scrap-import/commit empty (admin 400)', '/api/master/cable-scrap-import/commit', { method: 'POST', persona: 'admin', expected: 400, body: { rows: [] } });
  await check('POST raw-material-prices/import/preview (anon)', '/api/master/raw-material-prices/import/preview', { method: 'POST', persona: 'anon', expected: 403 });
  await check('POST raw-material-prices/import/preview (admin 200)', '/api/master/raw-material-prices/import/preview', { method: 'POST', persona: 'admin', expected: 200, body: { rows: [] } });
  await check('POST raw-material-prices/import/commit (anon)', '/api/master/raw-material-prices/import/commit', { method: 'POST', persona: 'anon', expected: 403 });
  await check('POST raw-material-prices/import/commit (admin 200)', '/api/master/raw-material-prices/import/commit', { method: 'POST', persona: 'admin', expected: 200, body: { rows: [] } });
  await check('POST engineering-mappings/import/preview (anon)', '/api/master/engineering-mappings/import/preview', { method: 'POST', persona: 'anon', expected: 403 });
  await check('POST engineering-mappings/import/preview (admin 200)', '/api/master/engineering-mappings/import/preview', { method: 'POST', persona: 'admin', expected: 200, body: { rows: [] } });
  await check('POST engineering-mappings/import/commit (anon)', '/api/master/engineering-mappings/import/commit', { method: 'POST', persona: 'anon', expected: 403 });

  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;

  console.log(`\n========================================`);
  console.log(`Phase 2b Parity Summary: ${passed}/${total} passed (${failed} failed)`);
  console.log(`========================================\n`);

  fs.writeFileSync(RESULTS_PATH, JSON.stringify({ total, passed, failed, results }, null, 2));

  stopSpawned();
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Parity run error:', err);
  stopSpawned();
  process.exit(1);
});
