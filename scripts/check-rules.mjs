// Phase 2a rule guard. Exit 1 when any rule below fails.
// (a) nestRoutes.mjs regex containing "platform" must be exactly ^/api/platform/db$
// (b) a file added under energya-backend/src, outside shared/domain, over 300 lines, with no spec
// (c) \bany\b count in energya-backend/src *.ts above scripts/check-rules.baseline.json
// (d) a path changed since ee98586 that is outside the Phase 2a close allowlist
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'scripts', 'check-rules.baseline.json');
const ANY_ROOT = path.join(ROOT, 'energya-backend', 'src');
const SCOPE_BASE = 'ee98586';
const failures = [];

function git(args) {
  return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim();
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

function countAny() {
  let total = 0;
  for (const file of walkTs(ANY_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    total += (text.match(/\bany\b/g) || []).length;
  }
  return total;
}

function regexPatterns(source) {
  const patterns = [];
  const literal = /(?<![\w$])\/((?:\\\/|[^/\n])+)\/[gimsuy]*/g;
  for (const match of source.matchAll(literal)) {
    patterns.push(match[1].replace(/\\\//g, '/'));
  }
  const template = /new RegExp\(\s*`([^`]*)`\s*\)/g;
  for (const match of source.matchAll(template)) {
    patterns.push(match[1].replace(/\$\{SEG\}/g, '[^/]+'));
  }
  return patterns;
}

function checkPlatformRegex() {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'parity', 'nestRoutes.mjs'), 'utf8');
  const allowed = '^/api/platform/db$';
  for (const pattern of regexPatterns(source)) {
    if (!pattern.includes('platform')) continue;
    if (pattern !== allowed) {
      failures.push(`(a) platform regex is not ${allowed}: ${pattern}`);
    }
  }
}

function hasSpec(rel) {
  const base = path.basename(rel, '.ts');
  const specNames = new Set([`${base}.spec.ts`, `${base}.e2e-spec.ts`]);
  const stack = [path.join(ROOT, 'energya-backend')];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (specNames.has(entry.name)) return true;
    }
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
    if (hasSpec(norm)) continue;
    failures.push(`(b) ${norm} has ${lines} lines, no spec, outside shared/domain`);
  }
}

function checkAnyBaseline() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const current = countAny();
  if (current > baseline.anyCount) {
    failures.push(`(c) any count ${current} is above baseline ${baseline.anyCount}`);
  }
}

function allowedPath(rel) {
  const norm = rel.replace(/\\/g, '/');
  if (norm.startsWith('docs/MIGRATION/phase-2a/')) return true;
  return [
    'energya-backend/src/app.module.ts',
    'docs/MIGRATION/MIGRATION_STATUS.md',
    'docs/MIGRATION/REVIEW_PHASE_2A.md',
    'scripts/check-rules.mjs',
    'scripts/check-rules.baseline.json',
  ].includes(norm);
}

function checkScope() {
  const changed = new Set();
  for (const chunk of [
    git(`diff --name-only ${SCOPE_BASE}`),
    git(`diff --name-only --cached ${SCOPE_BASE}`),
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
console.log(`anyCount=${countAny()}`);
