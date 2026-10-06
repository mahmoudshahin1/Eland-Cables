import fs from 'fs';
import path from 'path';

const legacyBase = process.env.LEGACY_URL || 'http://localhost:3847';
const targetBase = process.env.TARGET_URL || 'http://localhost:3000';

function getNestedValue(obj, pathStr) {
  return pathStr.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

function removeIgnored(obj, ignoreList = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = JSON.parse(JSON.stringify(obj));

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

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

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

  const fetchOptions = {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  let legacyRes, legacyJson, legacyStatus, legacyError;
  let targetRes, targetJson, targetStatus, targetError;

  try {
    legacyRes = await fetch(legacyUrl, fetchOptions);
    legacyStatus = legacyRes.status;
    legacyJson = await legacyRes.json().catch(() => ({}));
  } catch (err) {
    legacyError = err.message;
  }

  try {
    targetRes = await fetch(targetUrl, fetchOptions);
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

  const cleanedLegacy = removeIgnored(legacyJson, ignoreFields);
  const cleanedTarget = removeIgnored(targetJson, ignoreFields);

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

export async function runParity(phaseFilter = null) {
  const rootDir = process.cwd();
  const fixturesDir = path.resolve(rootDir, 'scripts/parity/fixtures');

  if (!fs.existsSync(fixturesDir)) {
    console.error(`Fixtures directory not found: ${fixturesDir}`);
    process.exit(1);
  }

  const fixtureFiles = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
  const allFixtures = [];

  for (const f of fixtureFiles) {
    const list = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf-8'));
    allFixtures.push(...list);
  }

  const fixtures = phaseFilter !== null ? allFixtures.filter((f) => f.phase === phaseFilter) : allFixtures;

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
