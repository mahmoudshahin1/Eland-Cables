// Phase 2a rule guard. Exit 1 when any rule below fails.
// (a) a regex in nestRoutes.mjs that contains "platform" must be exactly ^/api/platform/db$
// (b) a file added under energya-backend/src, outside shared/domain, over 300 lines,
//     whose spec does not import it and does not contain its filename
// (c) code-only \bany\b count above scripts/check-rules.baseline.json
// (d) a path changed since SCOPE_BASE that is outside the Phase 2a allowlist
// (e) nestRoutes.mjs builds a RegExp with new RegExp() or string concatenation
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'scripts', 'check-rules.baseline.json');
const ANY_ROOT = path.join(ROOT, 'energya-backend', 'src');
const failures = [];

function git(args) {
  return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function scopeBase() {
  if (process.env.CHECK_RULES_SCOPE_BASE && process.env.CHECK_RULES_SCOPE_BASE.trim()) {
    return process.env.CHECK_RULES_SCOPE_BASE.trim();
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  if (!baseline.scopeBase) throw new Error('scopeBase missing from ' + BASELINE_PATH);
  return baseline.scopeBase;
}

function walkTs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    if (c === '`') {
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          i += 2;
          let depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            if (depth === 0) {
              i += 1;
              break;
            }
            out += source[i];
            i += 1;
          }
          continue;
        }
        if (source[i] === '`') {
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function countAny() {
  let total = 0;
  for (const file of walkTs(ANY_ROOT)) {
    const code = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
    total += (code.match(/\bany\b/g) || []).length;
  }
  return total;
}

if (process.argv.includes('--print-any')) {
  console.log(String(countAny()));
  process.exit(0);
}

function regexPatterns(source) {
  const patterns = [];
  const literal = /(?<![\w$])\/((?:\\\/|[^/\n])+)\/[gimsuy]*/g;
  for (const match of source.matchAll(literal)) {
    patterns.push(match[1].replace(/\\\//g, '/'));
  }
  return patterns;
}

function checkPlatformRegex() {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'parity', 'nestRoutes.mjs'), 'utf8');
  const allowed = '^/api/platform/db$';
  for (const pattern of regexPatterns(source)) {
    if (!pattern.includes('platform')) continue;
    if (pattern !== allowed) failures.push(`(a) platform regex is not ${allowed}: ${pattern}`);
  }
  if (/new\s+RegExp\s*\(/.test(source)) {
    failures.push('(e) nestRoutes.mjs builds a RegExp with new RegExp()');
  }
  if (/['"`][^'"`\n]*['"`]\s*\+|\+\s*['"`]/.test(source)) {
    failures.push('(e) nestRoutes.mjs builds a route with string concatenation');
  }
}

function specCovers(rel) {
  const base = path.basename(rel, '.ts');
  const specs = walkTs(path.join(ROOT, 'energya-backend')).filter(
    (file) => file.endsWith('.spec.ts') || file.endsWith('.e2e-spec.ts'),
  );
  for (const spec of specs) {
    const text = stripCommentsAndStrings(fs.readFileSync(spec, 'utf8'));
    if (text.includes(base)) return true;
  }
  return false;
}

function checkNewFileSize() {
  const added = git('diff --name-only --diff-filter=A origin/main...HEAD -- energya-backend/src')
    .split(/\r?\n/)
    .filter(Boolean);
  const untracked = git('ls-files --others --exclude-standard -- energya-backend/src')
    .split(/\r?\n/)
    .filter(Boolean);
  for (const rel of [...added, ...untracked]) {
    const norm = rel.replace(/\\/g, '/');
    if (norm.includes('/shared/domain/')) continue;
    if (!norm.endsWith('.ts')) continue;
    const full = path.join(ROOT, norm);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split(/\n/).length;
    if (lines <= 300) continue;
    if (specCovers(norm)) continue;
    failures.push(`(b) ${norm} has ${lines} lines and no spec that names the file`);
  }
}

function checkAnyBaseline() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const current = countAny();
  console.log(`anyCount=${current} baseline=${baseline.anyCount} previousAnyCount=${baseline.previousAnyCount}`);
  if (current > baseline.anyCount) {
    failures.push(`(c) any count ${current} is above baseline ${baseline.anyCount}`);
  }
}

function allowedPath(rel) {
  const norm = rel.replace(/\\/g, '/');
  if (norm.startsWith('docs/MIGRATION/phase-2a/')) return true;
  if (norm.startsWith('docs/MIGRATION/phase-2b/')) return true;
  if (norm.startsWith('energya-backend/src/master-data/')) return true;
  if (norm.startsWith('energya-backend/src/shared/domain/')) return true;
  if (norm.startsWith('energya-backend/src/shared/infra/')) return true;
  if (norm.startsWith('energya-backend/src/common/guards/')) return true;
  if (norm.startsWith('energya-backend/src/common/filters/')) return true;
  return [
    'energya-backend/src/app.module.ts',
    'energya-backend/src/admin-customers/admin-customers.service.ts',
    'energya-backend/src/admin-customers/admin-customers.presenters.ts',
    'energya-backend/src/master-data/cables/cables.module.ts',
    'energya-backend/src/master-data/cables/customer-catalog.repository.ts',
    'energya-backend/src/master-data/cables/customer-catalog.facets.ts',
    'energya-backend/.env.example',
    'scripts/parity/nestRoutes.mjs',
    'scripts/parity/run-phase2a-parity.mjs',
    'scripts/parity/verify-g3-phase2a-coverage.mjs',
    'energya-backend/test/master-data/customerCableCatalog.server.e2e-spec.ts',
    '.env.example',
    'docs/MIGRATION/MIGRATION_STATUS.md',
    'docs/MIGRATION/REVIEW_PHASE_2A.md',
    'docs/MIGRATION/ENDPOINT_INVENTORY.md',
    'scripts/check-rules.mjs',
    'scripts/check-rules.baseline.json',
    'energya-backend/src/auth/jwt-auth.guard.ts',
    'energya-backend/src/types.ts',
    'docs/MIGRATION/REVIEW_PHASE_2B.md',
    'scripts/parity/run-phase2b-parity.mjs',
    'scripts/parity/seed-auth.mjs',
    'scripts/parity/seed-master-data.mjs',
    'energya-backend/test/master-data/phase2bRepositories.spec.ts',
  ].includes(norm);
}

function checkScope() {
  const base = scopeBase();
  const changed = new Set();
  for (const chunk of [
    git(`diff --name-only ${base}`),
    git(`diff --name-only --cached ${base}`),
    git('ls-files --others --exclude-standard'),
  ]) {
    for (const rel of chunk.split(/\r?\n/).filter(Boolean)) changed.add(rel.replace(/\\/g, '/'));
  }
  for (const rel of changed) {
    if (!allowedPath(rel)) failures.push(`(d) outside Phase 2a scope: ${rel}`);
  }
}

checkPlatformRegex();
checkNewFileSize();
checkAnyBaseline();
checkScope();

if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error(`check-rules failed: ${failures.length}`);
  process.exit(1);
}
console.log('check-rules passed');
console.log(`scopeBase=${scopeBase()}`);
