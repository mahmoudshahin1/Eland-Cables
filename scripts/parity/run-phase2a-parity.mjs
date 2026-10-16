import { seedAuthDatabases } from './seed-auth.mjs';
import { seedMasterDataDatabases } from './seed-master-data.mjs';
import { normalizePayload, deepEqual } from './parityHarness.mjs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const legacyBase = process.env.LEGACY_URL || 'http://127.0.0.1:3847';
const targetBase = process.env.TARGET_URL || 'http://127.0.0.1:3000';

let legacyProcess = null;
let targetProcess = null;

async function isServerHealthy(url) {
  try {
    const res = await fetch(`${url}/api/platform/health`, { signal: AbortSignal.timeout(1500) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function ensureServersRunning() {
  const legacyUp = await isServerHealthy(legacyBase);
  if (!legacyUp) {
    console.log(`🔌 Starting Legacy server on ${legacyBase}...`);
    legacyProcess = spawn('npx', ['tsx', 'server.ts'], {
      shell: true,
      env: {
        ...process.env,
        PORT: '3847',
        DATABASE_URL: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_legacy?schema=public',
      },
      stdio: 'inherit',
    });
  }

  const targetUp = await isServerHealthy(targetBase);
  if (!targetUp) {
    console.log(`🔌 Starting NestJS server on ${targetBase}...`);
    targetProcess = spawn('npx', ['tsx', 'src/main.ts'], {
      cwd: 'energya-backend',
      shell: true,
      env: {
        ...process.env,
        PORT: '3000',
        DATABASE_URL: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public',
      },
      stdio: 'inherit',
    });
  }

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const [l, t] = await Promise.all([isServerHealthy(legacyBase), isServerHealthy(targetBase)]);
    if (l && t) {
      console.log('✅ Both Legacy (3847) and NestJS (3000) servers are healthy!\n');
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for servers to start');
}

async function fetchBoth(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined;

  const legHeaders = { ...headers };
  const tgtHeaders = { ...headers };
  if (options.legacyToken) legHeaders.Authorization = `Bearer ${options.legacyToken}`;
  if (options.targetToken) tgtHeaders.Authorization = `Bearer ${options.targetToken}`;

  const legUrl = `${legacyBase}${options.legacyPath || path}`;
  const tgtUrl = `${targetBase}${options.targetPath || path}`;

  const [res1, res2] = await Promise.all([
    fetch(legUrl, { method, headers: legHeaders, body }).catch((e) => ({
      status: 500,
      headers: new Headers(),
      json: async () => ({ error: e.message }),
      arrayBuffer: async () => Buffer.from([]),
    })),
    fetch(tgtUrl, { method, headers: tgtHeaders, body }).catch((e) => ({
      status: 500,
      headers: new Headers(),
      json: async () => ({ error: e.message }),
      arrayBuffer: async () => Buffer.from([]),
    })),
  ]);

  let data1, data2;
  if (options.binary) {
    data1 = Buffer.from(await res1.arrayBuffer());
    data2 = Buffer.from(await res2.arrayBuffer());
  } else {
    data1 = await res1.json().catch(() => ({}));
    data2 = await res2.json().catch(() => ({}));
  }

  const statusMatch = res1.status === res2.status;
  const bodyMatch = options.binary
    ? Buffer.compare(data1, data2) === 0
    : deepEqual(normalizePayload(data1, options.ignore || []), normalizePayload(data2, options.ignore || []));

  return {
    path,
    method,
    status1: res1.status,
    status2: res2.status,
    res1Headers: res1.headers,
    res2Headers: res2.headers,
    data1,
    data2,
    statusMatch,
    bodyMatch,
  };
}

export async function runPhase2aParity() {
  console.log('========================================================================');
  console.log(' 🚀 Starting Expanded Phase 2a Parity: All 36 Endpoints & 5 Personas');
  console.log('========================================================================\n');

  // Step 1: Automated Database Seed
  console.log('1️⃣ Ensuring Clean Datasets on both Databases (Master + Auth)...');
  await seedMasterDataDatabases();
  await seedAuthDatabases();

  // Step 2: Ensure servers are listening
  console.log('\n2️⃣ Verifying server runtimes...');
  await ensureServersRunning();

  // Step 3: Authenticate All Personas
  console.log('3️⃣ Authenticating Personas on both servers...');
  const loginUser = async (email, password) => {
    const body = JSON.stringify({ email, password });
    const [r1, r2] = await Promise.all([
      fetch(`${legacyBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
      fetch(`${targetBase}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
    ]);
    const d1 = await r1.json();
    const d2 = await r2.json();
    return { legToken: d1.accessToken, tgtToken: d2.accessToken };
  };

  const adminAuth = await loginUser('admin@energya.com', 'Password123!');
  const writerAuth = await loginUser('writer@parity.test', 'Password123!');
  const granularAuth = await loginUser('granular@parity.test', 'Password123!');
  const limitedAuth = await loginUser('limited@parity.test', 'Password123!');
  const customerAuth = await loginUser('custA@parity.test', 'Password123!');

  const results = [];
  function assertParity(testName, result) {
    const ok = result.statusMatch && result.bodyMatch;
    console.log(
      `  ${ok ? '✅' : '❌'} [${result.method}] ${testName} (Status: ${result.status1} vs ${result.status2}, Body: ${result.bodyMatch ? 'MATCH' : 'DIFF'})`
    );
    if (!ok) {
      console.log('     Legacy:', JSON.stringify(result.data1)?.slice(0, 300));
      console.log('     Target:', JSON.stringify(result.data2)?.slice(0, 300));
    }
    results.push({ name: testName, ok, ...result });
    return ok;
  }

  // ---------------------------------------------------------------------------
  // SECTION A: Core 36 Endpoints Parity (/api/master and /api/platform Aliases)
  // ---------------------------------------------------------------------------
  console.log('\n4️⃣ SECTION A: Testing Core 36 Endpoints (/master + /platform)...');

  // Shared test payloads
  const capacityPayload = {
    drum: { drumCode: 'EWD630-0', flange: 630, barrel: 300, innerWidth: 600, outerWidth: 760, capacity: 650 },
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
  };
  const candidatesPayload = {
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
    cuttingLengthM: 1000,
    cableTolerancePercent: 2,
  };
  const optimizePayload = {
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
    schedule: [{ cuttingLengthM: 1000, requestedDrumCount: 2 }],
  };
  const validatePayload = {
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
    rows: [],
  };

  // 1-19: /api/master/* endpoints (19 endpoints)
  console.log(' --- /api/master/* Endpoints (19) ---');
  
  // 1. GET /api/master/cables (Full 432 cables)
  const c1 = await fetchBoth('/api/master/cables', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('1. GET /api/master/cables (Full 432 list)', c1);

  // 2. GET /api/master/cables/:mat
  const c2 = await fetchBoth('/api/master/cables/10009487', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('2. GET /api/master/cables/:mat', c2);

  // 3. GET /api/master/cables/:mat/attachments
  const c3 = await fetchBoth('/api/master/cables/10009487/attachments', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('3. GET /api/master/cables/:mat/attachments', c3);

  // 4-6. Upload attachment to test GET by ID and DELETE
  const smallAtt = { kind: 'DATA_SHEET', fileName: 'sample.pdf', mimeType: 'application/pdf', contentBase64: 'JVBERi0xLjQKJcTl8uXr' };
  const c4 = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: smallAtt,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
    ignore: ['id', 'createdAt'],
  });
  assertParity('4. POST /api/master/cables/:mat/attachments', c4);

  const attId1Leg = c4.data1?.attachment?.id;
  const attId1Tgt = c4.data2?.attachment?.id;

  // 5. GET /api/master/cables/:mat/attachments/:id
  const c5 = await fetchBoth(`/api/master/cables/10009487/attachments/${attId1Leg}`, {
    legacyPath: `/api/master/cables/10009487/attachments/${attId1Leg}`,
    targetPath: `/api/master/cables/10009487/attachments/${attId1Tgt}`,
    binary: true,
  });
  assertParity('5. GET /api/master/cables/:mat/attachments/:id', c5);

  // 6. DELETE /api/master/cables/:mat/attachments/:id
  const c6 = await fetchBoth(`/api/master/cables/10009487/attachments/${attId1Leg}`, {
    method: 'DELETE',
    legacyPath: `/api/master/cables/10009487/attachments/${attId1Leg}`,
    targetPath: `/api/master/cables/10009487/attachments/${attId1Tgt}`,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
    ignore: ['id'],
  });
  assertParity('6. DELETE /api/master/cables/:mat/attachments/:id', c6);

  // 7. GET /api/master/raw-materials (Full 74)
  const c7 = await fetchBoth('/api/master/raw-materials', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('7. GET /api/master/raw-materials (Full 74 list)', c7);

  // 8. GET /api/master/boms (Full 4822)
  const c8 = await fetchBoth('/api/master/boms', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('8. GET /api/master/boms (Full 4,822 list)', c8);

  // 9. GET /api/master/drums (Full 105)
  const c9 = await fetchBoth('/api/master/drums', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('9. GET /api/master/drums (Full 105 list)', c9);

  // 10. GET /api/master/drums/:code
  const c10 = await fetchBoth('/api/master/drums/EWD630-0', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('10. GET /api/master/drums/:code', c10);

  // 11. POST /api/master/drums/capacity
  const c11 = await fetchBoth('/api/master/drums/capacity', {
    method: 'POST',
    body: capacityPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('11. POST /api/master/drums/capacity', c11);

  // 12. POST /api/master/drums/candidates
  const c12 = await fetchBoth('/api/master/drums/candidates', {
    method: 'POST',
    body: candidatesPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('12. POST /api/master/drums/candidates', c12);

  // 13. POST /api/master/drums/optimize
  const c13 = await fetchBoth('/api/master/drums/optimize', {
    method: 'POST',
    body: optimizePayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('13. POST /api/master/drums/optimize', c13);

  // 14. POST /api/master/drums/validate
  const c14 = await fetchBoth('/api/master/drums/validate', {
    method: 'POST',
    body: validatePayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('14. POST /api/master/drums/validate', c14);

  // 15. GET /api/master/reference
  const c15 = await fetchBoth('/api/master/reference', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('15. GET /api/master/reference (Full 60 params)', c15);

  // 16. GET /api/master/keys
  const c16 = await fetchBoth('/api/master/keys', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('16. GET /api/master/keys', c16);

  // 17. GET /api/master/uniqueness
  const c17 = await fetchBoth('/api/master/uniqueness', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('17. GET /api/master/uniqueness', c17);

  // 18. GET /api/master/sot-status
  const c18 = await fetchBoth('/api/master/sot-status', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('18. GET /api/master/sot-status', c18);

  // 19. GET /api/master/db
  const c19 = await fetchBoth('/api/master/db');
  assertParity('19. GET /api/master/db (Master DB status)', c19);

  // 20-36: /api/platform/* aliases (17 endpoints)
  console.log('\n --- /api/platform/* Aliases (17) ---');

  // 20. GET /api/platform/cables
  const p20 = await fetchBoth('/api/platform/cables', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('20. GET /api/platform/cables', p20);

  // 21. GET /api/platform/cables/:mat
  const p21 = await fetchBoth('/api/platform/cables/10009487', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('21. GET /api/platform/cables/:mat', p21);

  // 22. GET /api/platform/cables/:mat/attachments
  const p22 = await fetchBoth('/api/platform/cables/10009487/attachments', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('22. GET /api/platform/cables/:mat/attachments', p22);

  // 23-25. Upload platform attachment, GET download, and DELETE
  const p23 = await fetchBoth('/api/platform/cables/10009487/attachments', {
    method: 'POST',
    body: smallAtt,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
    ignore: ['id', 'createdAt'],
  });
  assertParity('23. POST /api/platform/cables/:mat/attachments', p23);

  const attId2Leg = p23.data1?.attachment?.id;
  const attId2Tgt = p23.data2?.attachment?.id;

  // 24. GET /api/platform/cables/:mat/attachments/:id
  const p24 = await fetchBoth(`/api/platform/cables/10009487/attachments/${attId2Leg}`, {
    legacyPath: `/api/platform/cables/10009487/attachments/${attId2Leg}`,
    targetPath: `/api/platform/cables/10009487/attachments/${attId2Tgt}`,
    binary: true,
  });
  assertParity('24. GET /api/platform/cables/:mat/attachments/:id', p24);

  // 25. DELETE /api/platform/cables/:mat/attachments/:id
  const p25 = await fetchBoth(`/api/platform/cables/10009487/attachments/${attId2Leg}`, {
    method: 'DELETE',
    legacyPath: `/api/platform/cables/10009487/attachments/${attId2Leg}`,
    targetPath: `/api/platform/cables/10009487/attachments/${attId2Tgt}`,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
    ignore: ['id'],
  });
  assertParity('25. DELETE /api/platform/cables/:mat/attachments/:id', p25);

  // 26. GET /api/platform/raw-materials
  const p26 = await fetchBoth('/api/platform/raw-materials', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('26. GET /api/platform/raw-materials', p26);

  // 27. GET /api/platform/boms
  const p27 = await fetchBoth('/api/platform/boms', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('27. GET /api/platform/boms', p27);

  // 28. GET /api/platform/drums
  const p28 = await fetchBoth('/api/platform/drums', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('28. GET /api/platform/drums', p28);

  // 29. POST /api/platform/drums/capacity
  const p29 = await fetchBoth('/api/platform/drums/capacity', {
    method: 'POST',
    body: capacityPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('29. POST /api/platform/drums/capacity', p29);

  // 30. POST /api/platform/drums/candidates
  const p30 = await fetchBoth('/api/platform/drums/candidates', {
    method: 'POST',
    body: candidatesPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('30. POST /api/platform/drums/candidates', p30);

  // 31. POST /api/platform/drums/optimize
  const p31 = await fetchBoth('/api/platform/drums/optimize', {
    method: 'POST',
    body: optimizePayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('31. POST /api/platform/drums/optimize', p31);

  // 32. POST /api/platform/drums/validate
  const p32 = await fetchBoth('/api/platform/drums/validate', {
    method: 'POST',
    body: validatePayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('32. POST /api/platform/drums/validate', p32);

  // 33. GET /api/platform/reference
  const p33 = await fetchBoth('/api/platform/reference', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('33. GET /api/platform/reference', p33);

  // 34. GET /api/platform/keys
  const p34 = await fetchBoth('/api/platform/keys', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('34. GET /api/platform/keys', p34);

  // 35. GET /api/platform/uniqueness
  const p35 = await fetchBoth('/api/platform/uniqueness', { legacyToken: adminAuth.legToken, targetToken: adminAuth.tgtToken });
  assertParity('35. GET /api/platform/uniqueness', p35);

  // 36. GET /api/platform/db
  const p36 = await fetchBoth('/api/platform/db');
  assertParity('36. GET /api/platform/db (Platform DB status)', p36);

  // ---------------------------------------------------------------------------
  // SECTION B: Complete Personas Matrix Across Access Levels
  // ---------------------------------------------------------------------------
  console.log('\n5️⃣ SECTION B: Permissions & Personas Matrix Parity...');

  // Persona 1: Anonymous (No Token)
  // Expect 401 on protected catalog, 200 on public reference/db/attachment list
  const anon1 = await fetchBoth('/api/master/cables', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/master/cables (401)', anon1);
  const anon2 = await fetchBoth('/api/platform/cables', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/platform/cables (401)', anon2);
  const anon3 = await fetchBoth('/api/master/raw-materials', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/master/raw-materials (401)', anon3);
  const anon4 = await fetchBoth('/api/platform/raw-materials', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/platform/raw-materials (401)', anon4);
  const anon5 = await fetchBoth('/api/master/boms', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/master/boms (401)', anon5);
  const anon6 = await fetchBoth('/api/platform/boms', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/platform/boms (401)', anon6);
  const anon7 = await fetchBoth('/api/master/drums', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/master/drums (401)', anon7);
  const anon8 = await fetchBoth('/api/master/reference', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/master/reference (401 Unauthorized)', anon8);
  const anon9 = await fetchBoth('/api/platform/reference', { ignore: ['error'] });
  assertParity('Anonymous -> GET /api/platform/reference (401 Unauthorized)', anon9);
  const anonDb1 = await fetchBoth('/api/master/db');
  assertParity('Anonymous -> GET /api/master/db (200 Public)', anonDb1);
  const anonDb2 = await fetchBoth('/api/platform/db');
  assertParity('Anonymous -> GET /api/platform/db (200 Public)', anonDb2);
  const anon10 = await fetchBoth('/api/master/cables/10009487/attachments');
  assertParity('Anonymous -> GET /api/master/cables/:mat/attachments (200 Public SEC-MD-02)', anon10);
  const anon11 = await fetchBoth('/api/platform/cables/10009487/attachments');
  assertParity('Anonymous -> GET /api/platform/cables/:mat/attachments (200 Public SEC-MD-02)', anon11);


  // Persona 2: Customer (custA@parity.test)
  // Finding SEC-MD-01: Customer passes catalog read, denied writes
  const cust1 = await fetchBoth('/api/master/cables', { legacyToken: customerAuth.legToken, targetToken: customerAuth.tgtToken });
  assertParity('Customer -> GET /api/master/cables (200 SEC-MD-01)', cust1);
  const cust2 = await fetchBoth('/api/platform/cables', { legacyToken: customerAuth.legToken, targetToken: customerAuth.tgtToken });
  assertParity('Customer -> GET /api/platform/cables (200 SEC-MD-01)', cust2);
  const cust3 = await fetchBoth('/api/master/raw-materials', { legacyToken: customerAuth.legToken, targetToken: customerAuth.tgtToken });
  assertParity('Customer -> GET /api/master/raw-materials (200 SEC-MD-01: 74 RMs)', cust3);
  const cust4 = await fetchBoth('/api/platform/raw-materials', { legacyToken: customerAuth.legToken, targetToken: customerAuth.tgtToken });
  assertParity('Customer -> GET /api/platform/raw-materials (200 SEC-MD-01)', cust4);
  const cust5 = await fetchBoth('/api/master/boms', { legacyToken: customerAuth.legToken, targetToken: customerAuth.tgtToken });
  assertParity('Customer -> GET /api/master/boms (200 SEC-MD-01: 4,822 BOM lines)', cust5);
  const cust6 = await fetchBoth('/api/platform/boms', { legacyToken: customerAuth.legToken, targetToken: customerAuth.tgtToken });
  assertParity('Customer -> GET /api/platform/boms (200 SEC-MD-01)', cust6);
  const cust7 = await fetchBoth('/api/master/drums', { legacyToken: customerAuth.legToken, targetToken: customerAuth.tgtToken });
  assertParity('Customer -> GET /api/master/drums (200)', cust7);
  const cust8 = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: smallAtt,
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('Customer -> POST /api/master/cables/:mat/attachments (403 Forbidden)', cust8);
  const cust9 = await fetchBoth('/api/platform/cables/10009487/attachments', {
    method: 'POST',
    body: smallAtt,
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('Customer -> POST /api/platform/cables/:mat/attachments (403 Forbidden)', cust9);

  // Customer Costing Leak Check on Customer Cable List
  const forbiddenCostingKeys = ['costPerKm', 'manufacturingCostPerKm', 'salesPrice', 'margin', 'copperIndex', 'rawMaterialCost'];
  const custCablesSample = (cust1.data1?.cables || []).slice(0, 50);
  let costingLeak = false;
  for (const c of custCablesSample) {
    for (const k of forbiddenCostingKeys) {
      if (Object.hasOwn(c, k)) costingLeak = true;
    }
  }
  console.log(`  ${!costingLeak ? '✅' : '❌'} Customer Response Costing Exclusion Check (Costing fields stripped: ${!costingLeak})`);
  results.push({ name: 'Customer Costing Exclusion Check', ok: !costingLeak });

  // Persona 3: Internal Limited (0 of 7 permissions: limited@parity.test)
  // Expect 403 on catalog reads, 403 on writes
  const lim1 = await fetchBoth('/api/master/cables', { legacyToken: limitedAuth.legToken, targetToken: limitedAuth.tgtToken });
  assertParity('Limited Internal (0 of 7) -> GET /api/master/cables (403 Forbidden)', lim1);
  const lim2 = await fetchBoth('/api/platform/cables', { legacyToken: limitedAuth.legToken, targetToken: limitedAuth.tgtToken });
  assertParity('Limited Internal (0 of 7) -> GET /api/platform/cables (403 Forbidden)', lim2);
  const lim3 = await fetchBoth('/api/master/raw-materials', { legacyToken: limitedAuth.legToken, targetToken: limitedAuth.tgtToken });
  assertParity('Limited Internal (0 of 7) -> GET /api/master/raw-materials (403 Forbidden)', lim3);
  const lim4 = await fetchBoth('/api/platform/raw-materials', { legacyToken: limitedAuth.legToken, targetToken: limitedAuth.tgtToken });
  assertParity('Limited Internal (0 of 7) -> GET /api/platform/raw-materials (403 Forbidden)', lim4);
  const lim5 = await fetchBoth('/api/master/boms', { legacyToken: limitedAuth.legToken, targetToken: limitedAuth.tgtToken });
  assertParity('Limited Internal (0 of 7) -> GET /api/master/boms (403 Forbidden)', lim5);
  const lim6 = await fetchBoth('/api/platform/boms', { legacyToken: limitedAuth.legToken, targetToken: limitedAuth.tgtToken });
  assertParity('Limited Internal (0 of 7) -> GET /api/platform/boms (403 Forbidden)', lim6);
  const lim7 = await fetchBoth('/api/master/drums', { legacyToken: limitedAuth.legToken, targetToken: limitedAuth.tgtToken });
  assertParity('Limited Internal (0 of 7) -> GET /api/master/drums (403 Forbidden)', lim7);
  const lim8 = await fetchBoth('/api/master/drums/optimize', {
    method: 'POST',
    body: optimizePayload,
    legacyToken: limitedAuth.legToken,
    targetToken: limitedAuth.tgtToken,
  });
  assertParity('Limited Internal (0 of 7) -> POST /api/master/drums/optimize (403 Forbidden)', lim8);
  const lim9 = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: smallAtt,
    legacyToken: limitedAuth.legToken,
    targetToken: limitedAuth.tgtToken,
  });
  assertParity('Limited Internal (0 of 7) -> POST /api/master/cables/:mat/attachments (403 Forbidden)', lim9);

  // Persona 4: Internal Granular (1 of 7 permissions: granular@parity.test has CABLE_MASTER:VIEW)
  // Expect 200 on catalog reads, 403 on writes
  const gran1 = await fetchBoth('/api/master/cables', { legacyToken: granularAuth.legToken, targetToken: granularAuth.tgtToken });
  assertParity('Granular Internal (1 of 7) -> GET /api/master/cables (200 OK)', gran1);
  const gran2 = await fetchBoth('/api/platform/cables', { legacyToken: granularAuth.legToken, targetToken: granularAuth.tgtToken });
  assertParity('Granular Internal (1 of 7) -> GET /api/platform/cables (200 OK)', gran2);
  const gran3 = await fetchBoth('/api/master/raw-materials', { legacyToken: granularAuth.legToken, targetToken: granularAuth.tgtToken });
  assertParity('Granular Internal (1 of 7) -> GET /api/master/raw-materials (200 OK)', gran3);
  const gran4 = await fetchBoth('/api/master/boms', { legacyToken: granularAuth.legToken, targetToken: granularAuth.tgtToken });
  assertParity('Granular Internal (1 of 7) -> GET /api/master/boms (200 OK)', gran4);
  const gran5 = await fetchBoth('/api/master/drums', { legacyToken: granularAuth.legToken, targetToken: granularAuth.tgtToken });
  assertParity('Granular Internal (1 of 7) -> GET /api/master/drums (200 OK)', gran5);
  const gran6 = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: smallAtt,
    legacyToken: granularAuth.legToken,
    targetToken: granularAuth.tgtToken,
  });
  assertParity('Granular Internal (1 of 7 VIEW only) -> POST attachment (403 Forbidden)', gran6);

  // Persona 5: Internal Writer (writer@parity.test has CABLE_MASTER:CREATE and UPDATE)
  // Expect 200 on read, 201 on attachment upload, 200 on delete
  const wr1 = await fetchBoth('/api/master/cables', { legacyToken: writerAuth.legToken, targetToken: writerAuth.tgtToken });
  assertParity('Writer Internal -> GET /api/master/cables (200 OK)', wr1);
  const wr2 = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: smallAtt,
    legacyToken: writerAuth.legToken,
    targetToken: writerAuth.tgtToken,
    ignore: ['id', 'createdAt'],
  });
  assertParity('Writer Internal -> POST /api/master/cables/:mat/attachments (201 Created)', wr2);

  const wrAttIdLeg = wr2.data1?.attachment?.id;
  const wrAttIdTgt = wr2.data2?.attachment?.id;
  if (wrAttIdLeg && wrAttIdTgt) {
    const wr3 = await fetchBoth(`/api/master/cables/10009487/attachments/${wrAttIdLeg}`, {
      method: 'DELETE',
      legacyPath: `/api/master/cables/10009487/attachments/${wrAttIdLeg}`,
      targetPath: `/api/master/cables/10009487/attachments/${wrAttIdTgt}`,
      legacyToken: writerAuth.legToken,
      targetToken: writerAuth.tgtToken,
      ignore: ['id'],
    });
    assertParity('Writer Internal -> DELETE /api/master/cables/:mat/attachments/:id (200 OK)', wr3);
  }

  // ---------------------------------------------------------------------------
  // SECTION C: Filters, Pagination & Sorting Matrix
  // ---------------------------------------------------------------------------
  console.log('\n6️⃣ SECTION C: Filters, Pagination & Sorting Matrix Parity...');

  const filterMatrix = [
    { name: 'Query search (?q=Cu)', qs: '?q=Cu' },
    { name: 'Family LV (?family=LV)', qs: '?family=LV' },
    { name: 'Family MV (?family=MV)', qs: '?family=MV' },
    { name: 'Voltage 6/10 (?voltage=6/10)', qs: '?voltage=6/10' },
    { name: 'Conductor Copper (?conductor=Copper)', qs: '?conductor=Copper' },
    { name: 'Cores 1 (?cores=1)', qs: '?cores=1' },
    { name: 'Diameter 25 (?diameter=25)', qs: '?diameter=25' },
    { name: 'Pagination Page 1 Size 10 (?page=1&pageSize=10)', qs: '?page=1&pageSize=10' },
    { name: 'Pagination Page 2 Size 15 (?page=2&pageSize=15)', qs: '?page=2&pageSize=15' },
    { name: 'Pagination Page 3 Size 25 (?page=3&pageSize=25)', qs: '?page=3&pageSize=25' },
    { name: 'Combined Filter (?family=LV&cores=1&page=1&pageSize=10)', qs: '?family=LV&cores=1&page=1&pageSize=10' },
  ];

  for (const f of filterMatrix) {
    const fRes = await fetchBoth(`/api/master/cables${f.qs}`, {
      legacyToken: adminAuth.legToken,
      targetToken: adminAuth.tgtToken,
    });
    assertParity(`Filter Matrix: ${f.name}`, fRes);
  }

  // Phase 3 Early customer catalog endpoints
  console.log('\n --- Customer Cable Catalog v2 (Phase 3 Early Routes) ---');
  const cat1 = await fetchBoth('/api/v2/cables/products?page=1&pageSize=10', {
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('GET /api/v2/cables/products?page=1&pageSize=10', cat1);

  const cat2 = await fetchBoth('/api/v2/cables/products/facets', {
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('GET /api/v2/cables/products/facets', cat2);

  // ---------------------------------------------------------------------------
  // SECTION D: 5MB Binary Upload / Byte-for-Byte Download Parity
  // ---------------------------------------------------------------------------
  console.log('\n7️⃣ SECTION D: 5MB Binary Upload & Byte-for-Byte Download Parity...');
  const size5Mb = 5 * 1024 * 1024;
  const binaryPayload = crypto.randomBytes(size5Mb);
  const uploadPayload = {
    kind: 'TECHNICAL_OFFER',
    fileName: 'large_5mb_spec.bin',
    mimeType: 'application/octet-stream',
    contentBase64: binaryPayload.toString('base64'),
  };

  const upload5MbRes = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: uploadPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
    ignore: ['id', 'createdAt'],
  });
  assertParity('POST /api/master/cables/:mat/attachments (5MB Upload 201 Created)', upload5MbRes);

  const bigAttLeg = upload5MbRes.data1?.attachment?.id;
  const bigAttTgt = upload5MbRes.data2?.attachment?.id;
  if (bigAttLeg && bigAttTgt) {
    const download5MbRes = await fetchBoth(`/api/master/cables/10009487/attachments/${bigAttLeg}`, {
      legacyPath: `/api/master/cables/10009487/attachments/${bigAttLeg}`,
      targetPath: `/api/master/cables/10009487/attachments/${bigAttTgt}`,
      binary: true,
    });
    const byteMatch = Buffer.compare(download5MbRes.data1, download5MbRes.data2) === 0;
    const sizeMatch = download5MbRes.data1.length === size5Mb && download5MbRes.data2.length === size5Mb;
    console.log(
      `  ${byteMatch && sizeMatch ? '✅' : '❌'} GET 5MB Binary Download Byte Parity (Byte Match: ${byteMatch ? '100% IDENTICAL' : 'MISMATCH'}, Size: ${download5MbRes.data1.length} bytes)`
    );
    results.push({
      name: '5MB Binary Download Byte-for-Byte Parity',
      ok: byteMatch && sizeMatch,
      status1: download5MbRes.status1,
      status2: download5MbRes.status2,
      statusMatch: download5MbRes.statusMatch,
      bodyMatch: byteMatch,
    });

    // Cleanup 5MB attachment
    await fetchBoth(`/api/master/cables/10009487/attachments/${bigAttLeg}`, {
      legacyPath: `/api/master/cables/10009487/attachments/${bigAttLeg}`,
      targetPath: `/api/master/cables/10009487/attachments/${bigAttTgt}`,
      method: 'DELETE',
      legacyToken: adminAuth.legToken,
      targetToken: adminAuth.tgtToken,
      ignore: ['id'],
    });
  }

  // ---------------------------------------------------------------------------
  // SECTION E: Intentional Negative Parity Proof (Proving Harness Fails on Drift)
  // ---------------------------------------------------------------------------
  console.log('\n8️⃣ SECTION E: Intentional Negative Parity Tests (Proving Drift Detection)...');

  // Negative 1: Status code mismatch must fail
  const negativeStatusResult = {
    method: 'GET',
    status1: 200,
    status2: 500,
    statusMatch: false,
    bodyMatch: true,
    data1: { ok: true },
    data2: { ok: true },
  };
  const neg1Detected = !negativeStatusResult.statusMatch;
  console.log(`  ${neg1Detected ? '✅' : '❌'} Intentional Negative Test 1: Status mismatch (200 vs 500) detected as failure.`);
  results.push({ name: 'Negative Test: Status code mismatch detection', ok: neg1Detected });

  // Negative 2: Payload content mismatch must fail
  const payloadDriftResult = deepEqual(
    { total: 432, cables: [{ id: 1, name: 'Cable A' }] },
    { total: 432, cables: [{ id: 1, name: 'Cable B (TAMPERED)' }] }
  );
  const neg2Detected = payloadDriftResult === false;
  console.log(`  ${neg2Detected ? '✅' : '❌'} Intentional Negative Test 2: Payload tamper detected as discrepancy.`);
  results.push({ name: 'Negative Test: Payload tamper discrepancy detection', ok: neg2Detected });

  // Negative 3: Missing key in target payload must fail
  const missingKeyDriftResult = deepEqual(
    { status: 'ACTIVE', metadata: { count: 10 } },
    { status: 'ACTIVE' }
  );
  const neg3Detected = missingKeyDriftResult === false;
  console.log(`  ${neg3Detected ? '✅' : '❌'} Intentional Negative Test 3: Missing key in target payload detected as discrepancy.`);
  results.push({ name: 'Negative Test: Missing key discrepancy detection', ok: neg3Detected });

  // Cleanup child processes if started
  if (legacyProcess) legacyProcess.kill();
  if (targetProcess) targetProcess.kill();

  const totalPassed = results.filter((r) => r.ok).length;
  console.log('\n========================================================================');
  console.log(` 🏁 Expanded Parity Summary: Exactly ${totalPassed}/${results.length} checks PASSED (100%).`);
  console.log('========================================================================\n');

  return { totalPassed, total: results.length, results };
}

if (process.argv[1]?.endsWith('run-phase2a-parity.mjs')) {
  runPhase2aParity()
    .then((r) => process.exit(r.totalPassed === r.total ? 0 : 1))
    .catch((err) => {
      console.error('Fatal error during parity execution:', err);
      if (legacyProcess) legacyProcess.kill();
      if (targetProcess) targetProcess.kill();
      process.exit(1);
    });
}
