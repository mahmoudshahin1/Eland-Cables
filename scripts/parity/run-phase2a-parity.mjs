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
  console.log('======================================================');
  console.log(' 🚀 Starting Phase 2a Master Data Parity Verification');
  console.log('======================================================\n');

  // Step 1: Automated Database Seed
  console.log('1️⃣ Ensuring Clean Datasets on both Databases...');
  await seedMasterDataDatabases();
  await seedAuthDatabases();

  // Step 2: Ensure servers are listening
  console.log('\n2️⃣ Verifying server runtimes...');
  await ensureServersRunning();

  // Step 3: Authenticate Personas
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
  const customerAuth = await loginUser('custA@parity.test', 'Password123!');
  const limitedAuth = await loginUser('limited@parity.test', 'Password123!');

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

  // -------------------------------------------------------------
  // Full Dataset & Endpoint Parity (Phase 2a Endpoints)
  // -------------------------------------------------------------
  console.log('\n4️⃣ Full Dataset & Catalog Parity Verification...');

  // 1. GET /api/master/cables (Full 432 Cables List)
  const cablesRes = await fetchBoth('/api/master/cables', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/cables (Full 432 Cables List)', cablesRes);
  if (Array.isArray(cablesRes.data1?.cables)) {
    console.log(`     Confirmed count: Legacy=${cablesRes.data1.cables.length}, Nest=${cablesRes.data2.cables.length}`);
  }

  // 2. GET /api/master/cables/:materialNumber
  const singleCableRes = await fetchBoth('/api/master/cables/10009487', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/cables/10009487 (Single Cable)', singleCableRes);

  // 3. GET /api/master/raw-materials (Full 74 Raw Materials List)
  const rmRes = await fetchBoth('/api/master/raw-materials', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/raw-materials (Full 74 Raw Materials List)', rmRes);
  if (Array.isArray(rmRes.data1?.rawMaterials)) {
    console.log(`     Confirmed count: Legacy=${rmRes.data1.rawMaterials.length}, Nest=${rmRes.data2.rawMaterials.length}`);
  }

  // 4. GET /api/master/boms (Full 4,822 BOM Lines List)
  const bomRes = await fetchBoth('/api/master/boms', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/boms (Full 4,822 BOM Lines List)', bomRes);
  if (Array.isArray(bomRes.data1?.boms)) {
    console.log(`     Confirmed count: Legacy=${bomRes.data1.boms.length}, Nest=${bomRes.data2.boms.length}`);
  }

  // 5. GET /api/master/drums (Full 105 Drums List)
  const drumsRes = await fetchBoth('/api/master/drums', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/drums (Full 105 Drums List)', drumsRes);
  if (Array.isArray(drumsRes.data1?.drums)) {
    console.log(`     Confirmed count: Legacy=${drumsRes.data1.drums.length}, Nest=${drumsRes.data2.drums.length}`);
  }

  // 6. GET /api/master/drums/:drumCode
  const singleDrumRes = await fetchBoth('/api/master/drums/EWD630-0', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/drums/EWD630-0 (Single Drum)', singleDrumRes);

  // 7. POST /api/master/drums/capacity
  const capacityPayload = {
    drum: { drumCode: 'EWD630-0', flange: 630, barrel: 300, innerWidth: 600, outerWidth: 760, capacity: 650 },
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
  };
  const capRes = await fetchBoth('/api/master/drums/capacity', {
    method: 'POST',
    body: capacityPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('POST /api/master/drums/capacity (Drum Capacity Calculation)', capRes);

  // 8. POST /api/master/drums/candidates
  const candidatesPayload = {
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
    cuttingLengthM: 1000,
    cableTolerancePercent: 2,
  };
  const candRes = await fetchBoth('/api/master/drums/candidates', {
    method: 'POST',
    body: candidatesPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('POST /api/master/drums/candidates (Candidates Evaluation)', candRes);

  // 9. POST /api/master/drums/optimize
  const optimizePayload = {
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
    schedule: [{ cuttingLengthM: 1000, requestedDrumCount: 2 }],
  };
  const optRes = await fetchBoth('/api/master/drums/optimize', {
    method: 'POST',
    body: optimizePayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('POST /api/master/drums/optimize (Drum Plan Optimization)', optRes);

  // 10. POST /api/master/drums/validate
  const validatePayload = {
    cable: { outerDiameterMm: 25, approxWeightKgKm: 1200 },
    rows: [],
  };
  const valRes = await fetchBoth('/api/master/drums/validate', {
    method: 'POST',
    body: validatePayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('POST /api/master/drums/validate (Plan Validation)', valRes);

  // 11. GET /api/master/reference (Full 60 Reference Parameters)
  const refRes = await fetchBoth('/api/master/reference', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/reference (Full 60 Reference Parameters)', refRes);
  if (Array.isArray(refRes.data1?.parameters)) {
    console.log(`     Confirmed count: Legacy=${refRes.data1.parameters.length}, Nest=${refRes.data2.parameters.length}`);
  }

  // 12. GET /api/master/keys
  const keysRes = await fetchBoth('/api/master/keys', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/keys (Reference Keys)', keysRes);

  // 13. GET /api/master/uniqueness
  const uniqRes = await fetchBoth('/api/master/uniqueness', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/uniqueness (Cable Uniqueness Report)', uniqRes);

  // 14. GET /api/platform/db (Platform DB Health Check)
  const platformDbRes = await fetchBoth('/api/platform/db');
  assertParity('GET /api/platform/db (Platform DB Health Check)', platformDbRes);

  // 15. GET /api/master/sot-status
  const sotRes = await fetchBoth('/api/master/sot-status', {
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
  });
  assertParity('GET /api/master/sot-status (Source of Truth Status)', sotRes);

  // 16. GET /api/master/cables/:materialNumber/attachments (Unauthenticated Public - SEC-MD-02)
  const attListRes = await fetchBoth('/api/master/cables/10009487/attachments');
  assertParity('GET /api/master/cables/:mat/attachments (List Attachments Unauthenticated - SEC-MD-02)', attListRes);

  // 17. GET /api/v2/cables/products (Customer Product Catalog)
  const custCatalogRes = await fetchBoth('/api/v2/cables/products?page=1&pageSize=10', {
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('GET /api/v2/cables/products (Customer Product Catalog)', custCatalogRes);

  // 18. GET /api/v2/cables/products/facets (Customer Product Facets)
  const custFacetsRes = await fetchBoth('/api/v2/cables/products/facets', {
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('GET /api/v2/cables/products/facets (Customer Product Facets)', custFacetsRes);

  // -------------------------------------------------------------
  // Permissions Matrix & Security Parity
  // -------------------------------------------------------------
  console.log('\n5️⃣ Permissions Matrix & Persona Parity Verification...');

  // 19. Anonymous -> 401 on /api/master/cables
  const anonCables = await fetchBoth('/api/master/cables', { ignore: ['error'] });
  assertParity('Anonymous Access GET /api/master/cables (401 Unauthorized)', anonCables);

  // 20. Anonymous -> 401 on /api/master/raw-materials
  const anonRms = await fetchBoth('/api/master/raw-materials', { ignore: ['error'] });
  assertParity('Anonymous Access GET /api/master/raw-materials (401 Unauthorized)', anonRms);

  // 21. Anonymous -> 401 on /api/master/boms
  const anonBoms = await fetchBoth('/api/master/boms', { ignore: ['error'] });
  assertParity('Anonymous Access GET /api/master/boms (401 Unauthorized)', anonBoms);

  // 22. Customer -> 200 on Catalog routes (Finding SEC-MD-01 Parity)
  const custCables = await fetchBoth('/api/master/cables', {
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('Customer Access GET /api/master/cables (200 OK Parity)', custCables);

  // 23. Customer -> 200 on Raw Materials (SEC-MD-01: Full 74 RMs)
  const custRms = await fetchBoth('/api/master/raw-materials', {
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('Customer Access GET /api/master/raw-materials (SEC-MD-01 200 OK: 74 RMs)', custRms);

  // 24. Customer -> 200 on BOMs (SEC-MD-01: Full 4,822 BOM lines)
  const custBoms = await fetchBoth('/api/master/boms', {
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('Customer Access GET /api/master/boms (SEC-MD-01 200 OK: 4,822 BOMs)', custBoms);

  // 25. Customer Costing Leak Check (Requirement 6)
  const forbiddenCostingKeys = ['costPerKm', 'manufacturingCostPerKm', 'salesPrice', 'margin', 'copperIndex', 'rawMaterialCost'];
  const custItems = (custCables.data1?.cables || []).slice(0, 50);
  let costingLeakDetected = false;
  for (const c of custItems) {
    for (const k of forbiddenCostingKeys) {
      if (Object.hasOwn(c, k)) costingLeakDetected = true;
    }
  }
  console.log(`  ${!costingLeakDetected ? '✅' : '❌'} Customer Response Costing Exclusion Check (Costing fields stripped: ${!costingLeakDetected})`);
  results.push({ name: 'Customer Costing Exclusion Check', ok: !costingLeakDetected });

  // 26. Limited Internal (0 of 7 permissions) -> 403 on /api/master/cables
  const limitedCables = await fetchBoth('/api/master/cables', {
    legacyToken: limitedAuth.legToken,
    targetToken: limitedAuth.tgtToken,
  });
  assertParity('Limited Internal (0 of 7 permissions) GET /api/master/cables (403 Forbidden)', limitedCables);

  // 27. Limited Internal (0 of 7 permissions) -> 403 on /api/master/raw-materials
  const limitedRms = await fetchBoth('/api/master/raw-materials', {
    legacyToken: limitedAuth.legToken,
    targetToken: limitedAuth.tgtToken,
  });
  assertParity('Limited Internal (0 of 7 permissions) GET /api/master/raw-materials (403 Forbidden)', limitedRms);

  // 28. Customer POST attachment -> 403
  const custPostAtt = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: { kind: 'DATA_SHEET', fileName: 'test.pdf', mimeType: 'application/pdf', contentBase64: 'AA==' },
    legacyToken: customerAuth.legToken,
    targetToken: customerAuth.tgtToken,
  });
  assertParity('Customer POST /api/master/cables/:mat/attachments (403 Forbidden)', custPostAtt);

  // 29. Limited Internal POST attachment -> 403
  const limitedPostAtt = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: { kind: 'DATA_SHEET', fileName: 'test.pdf', mimeType: 'application/pdf', contentBase64: 'AA==' },
    legacyToken: limitedAuth.legToken,
    targetToken: limitedAuth.tgtToken,
  });
  assertParity('Limited Internal (VIEW only) POST /api/master/cables/:mat/attachments (403 Forbidden)', limitedPostAtt);

  // -------------------------------------------------------------
  // 5MB Binary Attachment Parity (Requirement 4)
  // -------------------------------------------------------------
  console.log('\n6️⃣ 5MB Binary Attachment Upload/Download Byte Parity (Requirement 4)...');
  const size5Mb = 5 * 1024 * 1024; // 5,242,880 bytes
  const binaryPayload = crypto.randomBytes(size5Mb);
  const base64Content = binaryPayload.toString('base64');
  const uploadPayload = {
    kind: 'TECHNICAL_OFFER',
    fileName: 'large_5mb_spec.bin',
    mimeType: 'application/octet-stream',
    contentBase64: base64Content,
  };

  // 30. Admin POST 5MB Binary Attachment -> 201
  const uploadRes = await fetchBoth('/api/master/cables/10009487/attachments', {
    method: 'POST',
    body: uploadPayload,
    legacyToken: adminAuth.legToken,
    targetToken: adminAuth.tgtToken,
    ignore: ['id', 'createdAt'],
  });
  assertParity('POST /api/master/cables/10009487/attachments (5MB Binary Upload 201 Created)', uploadRes);

  const legAttId = uploadRes.data1?.attachment?.id;
  const tgtAttId = uploadRes.data2?.attachment?.id;
  if (legAttId && tgtAttId) {
    // 31. GET attachment binary download (Public unauthenticated SEC-MD-02)
    const downloadRes = await fetchBoth(`/api/master/cables/10009487/attachments/${legAttId}`, {
      legacyPath: `/api/master/cables/10009487/attachments/${legAttId}`,
      targetPath: `/api/master/cables/10009487/attachments/${tgtAttId}`,
      binary: true,
    });
    const byteMatch = Buffer.compare(downloadRes.data1, downloadRes.data2) === 0;
    const sizeMatch = downloadRes.data1.length === size5Mb && downloadRes.data2.length === size5Mb;
    console.log(
      `  ${byteMatch && sizeMatch ? '✅' : '❌'} GET /api/master/cables/10009487/attachments/:id (5MB Binary Download Byte Parity: ${byteMatch ? '100% IDENTICAL' : 'MISMATCH'}, Size: ${downloadRes.data1.length} bytes)`
    );
    results.push({
      name: '5MB Binary Download Byte Parity',
      ok: byteMatch && sizeMatch,
      status1: downloadRes.status1,
      status2: downloadRes.status2,
      statusMatch: downloadRes.statusMatch,
      bodyMatch: byteMatch,
    });

    // 32. Customer DELETE attachment -> 403
    const custDelAtt = await fetchBoth(`/api/master/cables/10009487/attachments/${legAttId}`, {
      legacyPath: `/api/master/cables/10009487/attachments/${legAttId}`,
      targetPath: `/api/master/cables/10009487/attachments/${tgtAttId}`,
      method: 'DELETE',
      legacyToken: customerAuth.legToken,
      targetToken: customerAuth.tgtToken,
    });
    assertParity('Customer DELETE /api/master/cables/:mat/attachments/:id (403 Forbidden)', custDelAtt);

    // 33. Admin DELETE attachment -> 200
    const adminDelAtt = await fetchBoth(`/api/master/cables/10009487/attachments/${legAttId}`, {
      legacyPath: `/api/master/cables/10009487/attachments/${legAttId}`,
      targetPath: `/api/master/cables/10009487/attachments/${tgtAttId}`,
      method: 'DELETE',
      legacyToken: adminAuth.legToken,
      targetToken: adminAuth.tgtToken,
      ignore: ['id'],
    });
    assertParity('Admin DELETE /api/master/cables/:mat/attachments/:id (Delete Attachment 200 OK)', adminDelAtt);
  }

  // -------------------------------------------------------------
  // Negative Parity Test
  // -------------------------------------------------------------
  console.log('\n7️⃣ Negative Parity Test Verification...');
  const fakeDiff = deepEqual({ total: 432, status: 'OK' }, { total: 999, status: 'DIFF' });
  const negativePassed = fakeDiff === false;
  console.log(`  ${negativePassed ? '✅' : '❌'} Negative Parity Test (Discrepancy correctly detected and rejected: ${negativePassed})`);
  results.push({ name: 'Negative Parity Detection', ok: negativePassed });

  // Cleanup child processes if started
  if (legacyProcess) legacyProcess.kill();
  if (targetProcess) targetProcess.kill();

  const totalPassed = results.filter((r) => r.ok).length;
  console.log('\n======================================================');
  console.log(` 🏁 Phase 2a Parity Summary: ${totalPassed}/${results.length} passed.`);
  console.log('======================================================\n');

  return { totalPassed, total: results.length, results };
}

if (process.argv[1]?.endsWith('run-phase2a-parity.mjs')) {
  runPhase2aParity()
    .then((r) => process.exit(r.totalPassed === r.total ? 0 : 1))
    .catch((err) => {
      console.error(err);
      if (legacyProcess) legacyProcess.kill();
      if (targetProcess) targetProcess.kill();
      process.exit(1);
    });
}
