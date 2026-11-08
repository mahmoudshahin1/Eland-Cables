/**
 * Writes a plain SQL dump of DATABASE_URL into deploy/onprem/db-init.
 * The connection string is passed to pg_dump through the environment and is not printed.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error('DATABASE_URL is not set. Add it to .env. The value is not printed.');
  process.exit(1);
}

let dumpUrl = sourceUrl;
if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(dumpUrl)) {
  dumpUrl = dumpUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  console.log('Database host is local. The dump container will use host.docker.internal.');
} else {
  console.log('Dumping the configured database. Host and credentials are not printed.');
}

const outDir = join('deploy', 'onprem', 'db-init');
const outPath = join(outDir, '01-energya.sql');
mkdirSync(outDir, { recursive: true });
rmSync(outPath, { force: true });

const out = createWriteStream(outPath);
const child = spawn(
  'docker',
  [
    'run',
    '--rm',
    '-e',
    'PGURL',
    'postgres:18-alpine',
    'sh',
    '-c',
    'pg_dump --no-owner --no-acl --dbname "$PGURL"',
  ],
  {
    env: { ...process.env, PGURL: dumpUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }
);

function redact(text) {
  return text.split(dumpUrl).join('[DATABASE_URL]').split(sourceUrl).join('[DATABASE_URL]');
}

let errorText = '';
let received = false;
child.stdout.on('data', (chunk) => {
  if (!received) {
    received = true;
    console.log('Receiving database dump.');
  }
  out.write(chunk);
});
child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  errorText += text;
  process.stderr.write(redact(text));
});

child.on('close', (code) => {
  out.end(() => {
    const safeError = errorText.replace(dumpUrl, '[DATABASE_URL]').replace(sourceUrl, '[DATABASE_URL]');
    if (code !== 0) {
      rmSync(outPath, { force: true });
      console.error(safeError || `pg_dump failed with exit code ${code}`);
      process.exit(code || 1);
    }
    const size = statSync(outPath).size;
    if (size < 100) {
      rmSync(outPath, { force: true });
      console.error('Dump file was empty. Database was not exported.');
      process.exit(1);
    }
    console.log(`Database dump written (${size} bytes). Path: deploy/onprem/db-init/01-energya.sql`);
  });
});
