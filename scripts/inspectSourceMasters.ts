/**
 * Inspect all source xlsx workbooks: sheets, headers, row counts.
 * Read-only — does not modify files or database.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const SOURCE_DIR = path.resolve('data/source');

function inspectFile(filePath: string) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { name, rowCount: rows.length, headers };
  });
  return { file: path.basename(filePath), sheets };
}

function main() {
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.xlsx'));
  const results = files.map((f) => inspectFile(path.join(SOURCE_DIR, f)));
  console.log(JSON.stringify(results, null, 2));
}

main();
