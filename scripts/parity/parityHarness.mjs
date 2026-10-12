import fs from 'fs';
import path from 'path';

const legacyBase = process.env.LEGACY_URL || 'http://127.0.0.1:3847';
const targetBase = process.env.TARGET_URL || 'http://127.0.0.1:3000';

function getNestedValue(obj, pathStr) {
  return pathStr.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

export const NORMALIZED_FIELDS = [
  'id',
  'userId',
  'roleId',
  'customerId',
  'permissionId',
  'sessionId',
  'createdAt',
  'updatedAt',
  'lastLogin',
  'lastLoginAt',
  'expiresAt',
  'revokedAt',
  'checkedAt',
  'passwordChangedAt',
  'assignedAt',
  'traceId',
  'correlationId'
];

export function normalizePayload(obj, ignoreList = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = JSON.parse(JSON.stringify(obj));

  const CUID_REGEX = /^c[a-z0-9]{24}$/i;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function normalizeRecursive(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        if (typeof o[i] === 'string' && (CUID_REGEX.test(o[i]) || UUID_REGEX.test(o[i]))) {
          o[i] = '<CUID>';
        } else if (typeof o[i] === 'object' && o[i] !== null) {
          normalizeRecursive(o[i]);
        }
      }
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'id' || k.endsWith('Id') || k.endsWith('_id')) {
        if (typeof v === 'string' || typeof v === 'number') {
          o[k] = `<ID_${k}>`;
        }
      } else if (typeof v === 'string' && (CUID_REGEX.test(v) || UUID_REGEX.test(v))) {
        o[k] = '<CUID>';
      } else if (['createdAt', 'updatedAt', 'lastLogin', 'lastLoginAt', 'expiresAt', 'revokedAt', 'checkedAt', 'passwordChangedAt', 'assignedAt'].includes(k)) {
        if (v !== null && v !== undefined) {
          o[k] = '<TIMESTAMP>';
        }
      } else if (['traceId', 'correlationId'].includes(k)) {
        if (v !== null && v !== undefined) {
          o[k] = '<TRACE_ID>';
        }
      } else if (k === 'sessionId') {
        if (v !== null && v !== undefined) {
          o[k] = '<SESSION_ID>';
        }
      } else if (typeof v === 'object' && v !== null) {
        normalizeRecursive(v);
      }
    }
  }

  normalizeRecursive(clone);
  for (const p of ignoreList) {
    const parts = p.split('.');
    let curr = clone;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr) break;
      curr = curr[parts[i]];
    }
    if (curr && parts[parts.length - 1] in curr) {
      delete curr[parts[parts.length - 1]];
    }
  }
  return clone;
}

export function getItemKey(item) {
  if (!item || typeof item !== 'object') return String(item);
  return String(item.code || item.email || item.username || item.name || item.id || JSON.stringify(item));
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => getItemKey(x).localeCompare(getItemKey(y)));
    const sortedB = [...b].sort((x, y) => getItemKey(x).localeCompare(getItemKey(y)));
    for (let i = 0; i < sortedA.length; i++) {
      if (!deepEqual(sortedA[i], sortedB[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!keysB.includes(k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

async function runFixture(fixture) {
  const { id, method, path: reqPath, body, headers, expectedStatus, ignoreFields } = fixture;

  const legacyUrl = `${legacyBase}${reqPath}`;
  const targetUrl = `${targetBase}${reqPath}`;

  let authHeadersLegacy = { ...headers };
  let authHeadersTarget = { ...headers };
  const parityUser = headers && headers['x-parity-user'];
  
  if (parityUser && globalTokens[parityUser]) {
    delete authHeadersLegacy['x-parity-user'];
    delete authHeadersTarget['x-parity-user'];
    authHeadersLegacy['Authorization'] = `Bearer ${globalTokens[parityUser].legacy}`;
    authHeadersTarget['Authorization'] = `Bearer ${globalTokens[parityUser].target}`;
  }

  const methodStr = method ? method.toUpperCase() : 'GET';
  
  const fetchOptionsLegacy = {
    method: methodStr,
    headers: {
      'Content-Type': 'application/json',
      ...authHeadersLegacy,
    },
    ...(body && methodStr !== 'GET' && methodStr !== 'HEAD' ? { body: JSON.stringify(body) } : {}),
  };

  const fetchOptionsTarget = {
    method: methodStr,
    headers: {
      'Content-Type': 'application/json',
      ...authHeadersTarget,
    },
    ...(body && methodStr !== 'GET' && methodStr !== 'HEAD' ? { body: JSON.stringify(body) } : {}),
  };

  let legacyRes, legacyJson, legacyStatus, legacyError;
  let targetRes, targetJson, targetStatus, targetError;

  try {
    legacyRes = await fetch(legacyUrl, fetchOptionsLegacy);
    legacyStatus = legacyRes.status;
    legacyJson = await legacyRes.json().catch(() => ({}));
  } catch (err) {
    legacyError = err.message;
  }

  try {
    targetRes = await fetch(targetUrl, fetchOptionsTarget);
    targetStatus = targetRes.status;
    targetJson = await targetRes.json().catch(() => ({}));
  } catch (err) {
    targetError = err.message;
  }

  if (legacyError || targetError) {
    return {
      id,
      path: reqPath,
      method,
      ok: false,
      reason: `Fetch failed: Legacy(${legacyError || 'ok'}), Target(${targetError || 'ok'})`,
      legacyStatus,
      targetStatus,
      diff: { legacyError, targetError },
    };
  }

  const cleanedLegacy = normalizePayload(legacyJson, ignoreFields);
  const cleanedTarget = normalizePayload(targetJson, ignoreFields);

  const statusMatch = legacyStatus === targetStatus;
  const bodyMatch = deepEqual(cleanedLegacy, cleanedTarget);

  return {
    id,
    path: reqPath,
    method,
    ok: statusMatch && bodyMatch,
    statusMatch,
    legacyStatus,
    targetStatus,
    cleanedLegacy,
    cleanedTarget,
    diff: !bodyMatch ? { legacy: cleanedLegacy, target: cleanedTarget } : null,
  };
}

let globalTokens = {};

export async function runParity(phaseFilter = null) {
  const rootDir = process.cwd();
  const fixturesDir = path.resolve(rootDir, 'scripts/parity/fixtures');

  if (!fs.existsSync(fixturesDir)) {
    console.error(`Fixtures directory not found: ${fixturesDir}`);
    process.exit(1);
  }

  const fixtureFiles = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
  let allFixtures = [];

  for (const f of fixtureFiles) {
    const list = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf-8'));
    allFixtures.push(...list);
  }

  let fixtures = phaseFilter !== null ? allFixtures.filter((f) => f.phase === phaseFilter) : allFixtures;

  // SORT: GETs first, then other POST/PUT, then auth-mutating at the very end
  fixtures.sort((a, b) => {
    const isMutatingAuth = (path) => path.includes('/logout') || path.includes('/change-password') || path.includes('/reset-password');
    const mutA = isMutatingAuth(a.path || '');
    const mutB = isMutatingAuth(b.path || '');
    
    if (mutA && !mutB) return 1;
    if (!mutA && mutB) return -1;
    
    const isGetA = !a.method || a.method.toUpperCase() === 'GET';
    const isGetB = !b.method || b.method.toUpperCase() === 'GET';
    if (isGetA && !isGetB) return -1;
    if (!isGetA && isGetB) return 1;
    return 0;
  });

  console.log(`\n======================================================`);
  console.log(` 🔑 Fetching Authentication Tokens...`);
  
  const usersToLogin = ['admin@parity.test', 'limited@parity.test', 'custA@parity.test', 'custB@parity.test'];
  for (const u of usersToLogin) {
    const loginBody = JSON.stringify({ email: u, password: 'Password123!' });
    const legacyTokenRes = await fetch(`${legacyBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody
    }).then(r => r.json()).catch(() => ({}));

    const targetTokenRes = await fetch(`${targetBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody
    }).then(r => r.json()).catch(() => ({}));
    
    globalTokens[u] = {
      legacy: legacyTokenRes.accessToken || legacyTokenRes.token,
      target: targetTokenRes.accessToken || targetTokenRes.token
    };
    if (!globalTokens[u].target) {
      console.log(`Failed login for ${u} in target:`, targetTokenRes);
    }
    console.log(`   - ${u}: Legacy(${globalTokens[u].legacy ? '✅' : '❌'}), Target(${globalTokens[u].target ? '✅' : '❌'})`);
  }

  console.log(`\n======================================================`);
  console.log(` 🔍 Running Parity Harness: Legacy(${legacyBase}) vs Target(${targetBase})`);
  console.log(` 📋 Total Fixtures: ${fixtures.length}`);
  console.log(`======================================================\n`);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const fix of fixtures) {
    console.log(`Testing [${fix.method}] ${fix.path}...`);
    const res = await runFixture(fix);
    results.push(res);

    if (res.ok) {
      passed++;
      console.log(`  ✅ MATCH (Status: ${res.targetStatus})`);
    } else {
      failed++;
      console.log(`  ❌ MISMATCH: Legacy=${res.legacyStatus}, Target=${res.targetStatus}`);
      if (res.reason) console.log(`     Reason: ${res.reason}`);
      if (res.diff) console.log(`     Diff:`, JSON.stringify(res.diff, null, 2));
    }
  }

  // Generate Markdown report
  let md = `# Parity Report: Phase ${phaseFilter ?? 'All'}\n\n`;
  md += `Date: ${new Date().toISOString()}\n`;
  md += `Legacy: \`${legacyBase}\` | Target: \`${targetBase}\`\n\n`;
  md += `| Test ID | Method | Path | Status Match | Body Match | Overall |\n`;
  md += `|---|---|---|---|---|---|\n`;

  for (const r of results) {
    md += `| \`${r.id}\` | \`${r.method}\` | \`${r.path}\` | ${r.statusMatch ? '✅' : '❌'} (${r.legacyStatus || 'ERR'} vs ${r.targetStatus || 'ERR'}) | ${!r.diff ? '✅' : '❌'} | ${r.ok ? '✅ PASS' : '❌ FAIL'} |\n`;
  }

  md += `\n**Summary:** ${passed}/${results.length} passed (${failed} failed).\n`;

  const reportPath = path.resolve(rootDir, `docs/MIGRATION/PARITY_REPORT_PHASE_${phaseFilter ?? 'ALL'}.md`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, md, 'utf-8');

  console.log(`\nReport written to: ${reportPath}`);
  console.log(`Result: ${passed} passed, ${failed} failed.\n`);

  return { passed, failed, results };
}

if (process.argv[1]?.endsWith('parityHarness.mjs')) {
  const phaseArg = process.argv[2] ? Number(process.argv[2]) : 0;
  runParity(phaseArg).catch((e) => console.error(e));
}
