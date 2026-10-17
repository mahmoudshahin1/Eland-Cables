// Phase 2a parity: legacy Express (:3847, energya_legacy) vs NestJS (:3000, energya_nest).
// A check passes only when both servers return the same status, that status is the one legacy's
// auth helper prescribes for the persona, and the normalized bodies (including error messages) match.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { seedAuthDatabases } from './seed-auth.mjs';
import { seedMasterDataDatabases } from './seed-master-data.mjs';
import { normalizePayload, deepEqual } from './parityHarness.mjs';
import { isNestRoute } from './nestRoutes.mjs';

const legacyBase = process.env.LEGACY_URL || 'http://127.0.0.1:3847';
const targetBase = process.env.TARGET_URL || 'http://127.0.0.1:3000';
const RESULTS_PATH = 'docs/MIGRATION/phase-2a/parity_results.json';
const PASSWORD = process.env.PARITY_PASSWORD || 'Password123!';
const MAT = '10009487';
const DRUM = 'EWD630-0';

const spawned = [];

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Expected status per legacy auth helper (src/server/masterDataRoutes.ts, masterDataCutoverRoutes.ts,
// v2CableSearchRoutes.ts, src/server/rbac.ts)
// ---------------------------------------------------------------------------
//  public      no guard
//  signedIn    requireSignedIn / requireCatalogActor: 401 anonymous, otherwise allowed
//  masterRead  requireMasterReadAuth / requireMasterRead: 401 anonymous; customers allowed;
//              internal users need one of 7 catalog codes (limited has none -> 403)
//  drum        requireDrumComputeAuth: same gate as masterRead
//  write       requireWriteAuth: 401 anonymous; 403 for customers and for users without CABLE_MASTER CREATE/UPDATE
function expectedStatus(auth, persona, okStatus = 200) {
  if (auth === 'public') return okStatus;
  if (persona === 'anon') return 401;
  if (auth === 'signedIn') return okStatus;
  if (auth === 'masterRead' || auth === 'drum') return persona === 'limited' ? 403 : okStatus;
  if (auth === 'write') return persona === 'admin' || persona === 'writer' ? okStatus : 403;
  throw new Error(`Unknown auth class ${auth}`);
}

const PERSONAS = {
  admin: 'admin@energya.com',
  writer: 'writer@parity.test',
  granular: 'granular@parity.test',
  limited: 'limited@parity.test',
  customer: 'custA@parity.test',
};
const PERSONA_ORDER = ['anon', 'customer', 'limited', 'granular', 'writer', 'admin'];

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
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

/**
 * opts: method, persona, body, expected, binary, legacyPath, nestPath, statusOnly
 * Returns { legacy, nest } raw responses so callers can chain ids.
 */
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
  if (legacy.status !== nest.status) reasons.push('status differs');
  if (opts.expected !== undefined && legacy.status !== opts.expected) reasons.push('legacy status is not the expected one');

  let legacyBody;
  let nestBody;
  if (!opts.statusOnly) {
    const isJson = legacy.json !== undefined || nest.json !== undefined;
    if (opts.binary && legacy.status === 200) {
      if (Buffer.compare(legacy.buf, nest.buf) !== 0) reasons.push(`bytes differ (${legacy.buf.length} vs ${nest.buf.length})`);
      for (const h of ['content-type', 'content-disposition']) {
        if (legacy.headers.get(h) !== nest.headers.get(h)) reasons.push(`${h} differs`);
      }
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
    nestServedBy: nest.servedBy,
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

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------
const PAYLOADS = {
  capacity: {
    drum: { drumCode: DRUM, flange: 630, barrel: 300, innerWidth: 600, outerWidth: 760, capacity: 650 },
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
  },
  candidates: { cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 }, cuttingLengthM: 1000, cableTolerancePercent: 2 },
  optimize: { cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 }, schedule: [{ cuttingLengthM: 1000, requestedDrumCount: 2 }] },
  validate: { cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 }, rows: [] },
};
const SMALL_ATTACHMENT = { kind: 'DATA_SHEET', fileName: 'sample.pdf', mimeType: 'application/pdf', contentBase64: 'JVBERi0xLjQKJcTl8uXr' };

// Read-only and compute routes with their legacy auth class.
const MATRIX_ROUTES = [
  { method: 'GET', path: '/api/master/cables', auth: 'signedIn' },
  { method: 'GET', path: `/api/master/cables/${MAT}`, auth: 'masterRead' },
  { method: 'GET', path: `/api/master/cables/${MAT}/attachments`, auth: 'public' },
  { method: 'GET', path: '/api/master/raw-materials', auth: 'masterRead' },
  { method: 'GET', path: '/api/master/boms', auth: 'masterRead' },
  { method: 'GET', path: '/api/master/drums', auth: 'masterRead' },
  { method: 'GET', path: `/api/master/drums/${DRUM}`, auth: 'masterRead' },
  { method: 'POST', path: '/api/master/drums/capacity', auth: 'drum', body: PAYLOADS.capacity },
  { method: 'POST', path: '/api/master/drums/candidates', auth: 'drum', body: PAYLOADS.candidates },
  { method: 'POST', path: '/api/master/drums/validate', auth: 'drum', body: PAYLOADS.validate },
  { method: 'POST', path: '/api/master/drums/optimize', auth: 'drum', body: PAYLOADS.optimize },
  { method: 'GET', path: '/api/master/reference', auth: 'masterRead' },
  { method: 'GET', path: '/api/master/keys', auth: 'masterRead' },
  { method: 'GET', path: '/api/master/uniqueness', auth: 'masterRead' },
  { method: 'GET', path: '/api/master/sot-status', auth: 'masterRead' },
  { method: 'GET', path: '/api/platform/db', auth: 'public' },
  { method: 'GET', path: '/api/v2/cables/products?page=1&pageSize=10', auth: 'signedIn' },
  { method: 'GET', path: '/api/v2/cables/products/facets', auth: 'signedIn' },
];

// Paths that must not exist on Nest (fabricated aliases removed from Phase 2a).
const MUST_NOT_EXIST_ON_NEST = [
  '/api/master/db',
  '/api/platform/cables',
  `/api/platform/cables/${MAT}`,
  '/api/platform/raw-materials',
  '/api/platform/boms',
  '/api/platform/drums',
  '/api/platform/reference',
  '/api/platform/keys',
  '/api/platform/uniqueness',
];

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
async function sectionPersonaMatrix() {
  console.log('\nA. Persona x route matrix (status + body + error message)');
  for (const route of MATRIX_ROUTES) {
    for (const persona of PERSONA_ORDER) {
      await check(`${persona} ${route.method} ${route.path}`, route.path, {
        method: route.method,
        persona,
        body: route.body,
        expected: expectedStatus(route.auth, persona),
      });
    }
  }
}

async function sectionAttachmentWrites() {
  console.log('\nB. Attachment writes per persona');
  const base = `/api/master/cables/${MAT}/attachments`;
  for (const persona of PERSONA_ORDER) {
    const expected = expectedStatus('write', persona, 201);
    const { legacy, nest } = await check(`${persona} POST ${base}`, base, { method: 'POST', persona, body: SMALL_ATTACHMENT, expected });
    const legId = legacy.json?.attachment?.id;
    const nestId = nest.json?.attachment?.id;
    if (expected !== 201 || !legId || !nestId) continue;

    await check(`anon GET ${base}/:id (download)`, `${base}/:id`, {
      legacyPath: `${base}/${legId}`,
      nestPath: `${base}/${nestId}`,
      binary: true,
      expected: 200,
    });
    for (const denied of ['anon', 'customer', 'limited', 'granular']) {
      await check(`${denied} DELETE ${base}/:id`, `${base}/:id`, {
        method: 'DELETE',
        persona: denied,
        legacyPath: `${base}/${legId}`,
        nestPath: `${base}/${nestId}`,
        expected: expectedStatus('write', denied),
      });
    }
    await check(`${persona} DELETE ${base}/:id`, `${base}/:id`, {
      method: 'DELETE',
      persona,
      legacyPath: `${base}/${legId}`,
      nestPath: `${base}/${nestId}`,
      expected: 200,
    });
  }
  await check('admin GET missing attachment', `${base}/does-not-exist`, { persona: 'admin', binary: true, expected: 404 });
}

async function sectionFilters() {
  console.log('\nC. Cable list filters and pagination (admin)');
  const qs = [
    '?q=Cu',
    '?family=LV',
    '?family=MV',
    '?voltage=6/10',
    '?conductor=Copper',
    '?cores=1',
    '?diameter=25',
    '?page=1&pageSize=10',
    '?page=2&pageSize=15',
    '?page=3&pageSize=25',
    '?family=LV&cores=1&page=1&pageSize=10',
  ];
  for (const q of qs) await check(`admin GET /api/master/cables${q}`, `/api/master/cables${q}`, { persona: 'admin', expected: 200 });
}

async function sectionBigBinary() {
  console.log('\nD. 5 MB attachment round trip (admin)');
  const base = `/api/master/cables/${MAT}/attachments`;
  const payload = crypto.randomBytes(5 * 1024 * 1024);
  const { legacy, nest } = await check('admin POST 5MB attachment', base, {
    method: 'POST',
    persona: 'admin',
    body: { kind: 'TECHNICAL_OFFER', fileName: 'large_5mb_spec.bin', mimeType: 'application/octet-stream', contentBase64: payload.toString('base64') },
    expected: 201,
  });
  const legId = legacy.json?.attachment?.id;
  const nestId = nest.json?.attachment?.id;
  if (!legId || !nestId) return;
  const dl = await check('anon GET 5MB attachment download', `${base}/:id`, {
    legacyPath: `${base}/${legId}`,
    nestPath: `${base}/${nestId}`,
    binary: true,
    expected: 200,
  });
  const sizeOk = dl.legacy.buf.length === payload.length && Buffer.compare(dl.nest.buf, payload) === 0;
  record({ name: '5MB download equals uploaded bytes', legacyStatus: dl.legacy.status, nestStatus: dl.nest.status, ok: sizeOk, reason: sizeOk ? '' : 'payload mismatch' });
  await check('admin DELETE 5MB attachment', `${base}/:id`, {
    method: 'DELETE',
    persona: 'admin',
    legacyPath: `${base}/${legId}`,
    nestPath: `${base}/${nestId}`,
    expected: 200,
  });
}

async function sectionRemovedAliases() {
  console.log('\nE. Fabricated aliases must not exist on Nest');
  for (const path of MUST_NOT_EXIST_ON_NEST) {
    const res = await send(targetBase, path, { method: 'GET', token: tokens.admin.nest });
    record({ name: `nest GET ${path} is 404`, path, legacyStatus: '-', nestStatus: res.status, expected: 404, ok: res.status === 404 });
  }
}

async function sectionServedBy() {
  console.log('\nF. Nest responses and the UI proxy table');
  const served = results.filter((r) => r.nestServedBy !== undefined);
  const missing = served.filter((r) => r.nestServedBy !== 'nest');
  record({
    name: `X-Served-By: nest on ${served.length} Nest responses`,
    legacyStatus: '-',
    nestStatus: '-',
    ok: served.length > 0 && missing.length === 0,
    reason: missing.length ? `${missing.length} responses without the header` : '',
  });
  const phase2a = [
    ['GET', '/api/master/cables'],
    ['GET', `/api/master/cables/${MAT}`],
    ['GET', `/api/master/cables/${MAT}/attachments`],
    ['POST', `/api/master/cables/${MAT}/attachments`],
    ['GET', `/api/master/cables/${MAT}/attachments/x`],
    ['DELETE', `/api/master/cables/${MAT}/attachments/x`],
    ['GET', '/api/master/raw-materials'],
    ['GET', '/api/master/boms'],
    ['GET', '/api/master/drums'],
    ['GET', `/api/master/drums/${DRUM}`],
    ['POST', '/api/master/drums/capacity'],
    ['POST', '/api/master/drums/candidates'],
    ['POST', '/api/master/drums/validate'],
    ['POST', '/api/master/drums/optimize'],
    ['GET', '/api/master/reference'],
    ['GET', '/api/master/keys'],
    ['GET', '/api/master/uniqueness'],
    ['GET', '/api/master/sot-status'],
    ['GET', '/api/platform/db'],
  ];
  const notRouted = phase2a.filter(([m, p]) => !isNestRoute(m, p));
  record({
    name: `proxy table routes all ${phase2a.length} Phase 2a routes to Nest`,
    legacyStatus: '-',
    nestStatus: '-',
    ok: phase2a.length === 19 && notRouted.length === 0,
    reason: notRouted.map(([m, p]) => `${m} ${p}`).join(', '),
  });
  const stayOnLegacy = [
    ['POST', '/api/master/cables'],
    ['PUT', `/api/master/cables/${MAT}`],
    ['PUT', '/api/master/raw-materials/RM1'],
    ['POST', '/api/master/drums'],
    ['PUT', `/api/master/drums/${DRUM}`],
    ['DELETE', `/api/master/drums/${DRUM}`],
    ['POST', '/api/master/drums/excel-commit'],
    ['POST', '/api/master/boms/excel-commit'],
    ['GET', '/api/master/raw-material-prices'],
    ['GET', '/api/v2/cables/products/export'],
    ['GET', '/api/master/db'],
  ];
  const leaked = stayOnLegacy.filter(([m, p]) => isNestRoute(m, p));
  record({
    name: `proxy table keeps ${stayOnLegacy.length} unmigrated routes on legacy`,
    legacyStatus: '-',
    nestStatus: '-',
    ok: leaked.length === 0,
    reason: leaked.map(([m, p]) => `${m} ${p}`).join(', '),
  });
}

function sectionNegativeControls() {
  console.log('\nG. Negative controls (the comparison must detect drift)');
  const controls = [
    ['status drift', 200 !== 500],
    ['value drift', !deepEqual({ cables: [{ code: 'A', name: 'Cable A' }] }, { cables: [{ code: 'A', name: 'Cable B' }] })],
    ['missing key', !deepEqual({ status: 'ACTIVE', metadata: { count: 10 } }, { status: 'ACTIVE' })],
    ['error message drift', JSON.stringify(canonical({ error: 'Sign in is required to view drums.' })) !== JSON.stringify(canonical({ error: 'Sign in is required.' }))],
    ['order drift', JSON.stringify(canonical({ rows: [{ code: 'A' }, { code: 'B' }] })) !== JSON.stringify(canonical({ rows: [{ code: 'B' }, { code: 'A' }] }))],
  ];
  for (const [name, detected] of controls) record({ name: `negative control: ${name}`, legacyStatus: '-', nestStatus: '-', ok: detected });
}

// ---------------------------------------------------------------------------
export async function runPhase2aParity() {
  console.log('Phase 2a parity: legacy vs Nest');
  if (process.env.PARITY_SKIP_SEED === '1') {
    console.log('1. Skipping seed (PARITY_SKIP_SEED=1)');
  } else {
    console.log('1. Seeding parity databases (energya_legacy, energya_nest)');
    await seedMasterDataDatabases();
    await seedAuthDatabases();
  }

  console.log('2. Servers');
  await ensureServersRunning();

  console.log('3. Logging in personas');
  for (const persona of Object.keys(PERSONAS)) await login(persona);

  await sectionPersonaMatrix();
  await sectionAttachmentWrites();
  await sectionFilters();
  await sectionBigBinary();
  await sectionRemovedAliases();
  await sectionServedBy();
  sectionNegativeControls();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed}/${results.length} checks passed, ${failed} failed.`);

  fs.mkdirSync('docs/MIGRATION/phase-2a', { recursive: true });
  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), legacyBase, targetBase, passed, failed, total: results.length, results }, null, 2)
  );
  console.log(`Results written to ${RESULTS_PATH}`);
  return { passed, failed, total: results.length };
}

if (process.argv[1]?.endsWith('run-phase2a-parity.mjs')) {
  runPhase2aParity()
    .then((r) => {
      stopSpawned();
      process.exit(r.failed === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error during parity execution:', err);
      stopSpawned();
      process.exit(1);
    });
}
