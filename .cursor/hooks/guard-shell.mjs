#!/usr/bin/env node
// Gate destructive shell commands for the migration workflow.
import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  input = {};
}
const command = String(input.command || '');

const deny = [
  { re: /git\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/i, why: 'force push' },
  { re: /git\s+push\b[^\n]*\b(origin\s+)?(HEAD:)?main\b/i, why: 'push to main' },
];

const ask = [
  { re: /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\b)/i, why: 'DROP/TRUNCATE' },
  { re: /prisma\s+migrate\s+reset/i, why: 'prisma migrate reset' },
  { re: /prisma\s+db\s+push\b[^\n]*--force-reset/i, why: 'prisma db push --force-reset' },
  { re: /git\s+reset\s+--hard/i, why: 'git reset --hard' },
  { re: /git\s+clean\s+-[a-z]*f/i, why: 'git clean' },
  { re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, why: 'rm -rf' },
  { re: /Remove-Item\b[^\n]*-Recurse/i, why: 'Remove-Item -Recurse' },
  { re: /git\s+(branch\s+-D|tag\s+-d|push\s+[^\n]*--delete)/i, why: 'deleting a branch or tag' },
];

const hit = (list) => list.find((r) => r.re.test(command));

const d = hit(deny);
if (d) {
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      user_message: `Blocked by migration rules: ${d.why}.`,
      agent_message: `This command is forbidden by the migration rules (${d.why}). Ask the user instead.`,
    }),
  );
  process.exit(0);
}

const a = hit(ask);
if (a) {
  process.stdout.write(
    JSON.stringify({
      permission: 'ask',
      user_message: `Destructive command (${a.why}). Approve only if you asked for it.`,
      agent_message: `Destructive command detected (${a.why}); explicit user approval is required.`,
    }),
  );
  process.exit(0);
}

process.stdout.write(JSON.stringify({ permission: 'allow' }));
