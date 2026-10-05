import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listPath = join(root, 'scripts', 'registered-tests.txt');
const files = readFileSync(listPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

if (files.length === 0) {
  console.error('No test files in scripts/registered-tests.txt');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const result = spawnSync(process.execPath, [tsxCli, '--test', '--test-concurrency=1', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});

process.exit(result.status === 0 ? 0 : result.status ?? 1);
